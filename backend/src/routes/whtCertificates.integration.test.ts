import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:4000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@siamtech.co.th';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'Admin@123456';

interface AuthResponse {
  token: string;
  user: { id: string; companyId: string; role: string };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const err: any = new Error(`${init?.method ?? 'GET'} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

function uniqueDigits(length: number): string {
  return Date.now().toString().slice(-length).padStart(length, '0');
}

async function adminAuth() {
  return api<AuthResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
}

async function createCustomer(companyId: string, nameTh: string, taxId: string) {
  const id = 'cust-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  return withSystemRlsContext(prisma, (tx) =>
    tx.customer.upsert({
      where: { companyId_taxId_branchCode: { companyId, taxId, branchCode: '00000' } },
      create: { id, companyId, nameTh, nameEn: nameTh, taxId, branchCode: '00000', addressTh: 'test address', isActive: true },
      update: { nameTh, nameEn: nameTh },
    }), { role: 'system' }
  );
}

async function createApprovedInvoice(companyId: string, customerId: string, userId: string, total = 10000) {
  const invNum = 'WHT-T-' + uniqueDigits(6);
  return withSystemRlsContext(prisma, (tx) =>
    tx.invoice.create({
      data: {
        companyId,
        invoiceNumber: invNum,
        type: 'tax_invoice',
        status: 'approved',
        language: 'th',
        invoiceDate: new Date(),
        buyerId: customerId,
        seller: { nameTh: 'บริษัท สยามเทคฯ', taxId: '0105560123456', branchCode: '00000' },
        subtotal: total,
        vatAmount: total * 0.07,
        discountAmount: 0,
        total,
        whtAmount: 0,
        isPaid: false,
        createdBy: userId,
      },
    }), { role: 'system' }
  );
}

function paymentDateStr() {
  return new Date().toISOString().split('T')[0];
}

// TC-WHT-001
test('TC-WHT-001: POST /api/invoices/:id/wht-certificate creates linked WHT cert', async () => {
  const auth = await adminAuth();
  const token = auth.token;
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  const customer = await createCustomer(auth.user.companyId, 'Customer WHT-001', '0105569999001');
  const invoice = await createApprovedInvoice(auth.user.companyId, customer.id, auth.user.id, 10000);

  const cert = await api<any>(
    '/api/invoices/' + invoice.id + '/wht-certificate',
    { method: 'POST', headers: h, body: JSON.stringify({ whtRate: '3', paymentDate: paymentDateStr(), incomeType: '1' }) }
  );
  const certData = cert.data ?? cert;
  assert.ok(certData.id, 'cert created');
  assert.equal(certData.invoiceId, invoice.id, 'linked to invoice');
  assert.equal(certData.whtAmount, 300, '3% of 10000 = 300');
  assert.equal(certData.netAmount, 9700, 'net = 10000 - 300');

  const updated = await withSystemRlsContext(prisma, (tx) =>
    tx.invoice.findUnique({ where: { id: invoice.id }, select: { whtCertificateId: true, whtAmount: true, whtRate: true } }),
    { role: 'system' }
  );
  assert.ok(updated != null, 'invoice found');
  if (updated) {
    assert.ok(updated.whtCertificateId, 'whtCertificateId set');
    assert.equal(updated.whtRate, '3', 'whtRate = 3'); // stored as string in DB
    assert.equal(updated.whtAmount, 300, 'whtAmount = 300');
  }

  // Delete WHT cert first (invoice.whtCertificateId FK), then invoice, then customer
  await withSystemRlsContext(prisma, (tx) => tx.whtCertificate.deleteMany({ where: { invoiceId: invoice.id } }), { role: 'system' });
  // Delete ALL invoices for this customer first (to clear buyerId FK), then the specific invoice
  await withSystemRlsContext(prisma, (tx) => tx.invoice.deleteMany({ where: { buyerId: customer.id } }), { role: 'system' });
  await withSystemRlsContext(prisma, (tx) => tx.customer.deleteMany({ where: { id: customer.id } }), { role: 'system' });
});

// TC-WHT-002
test('TC-WHT-002: POST /api/wht-certificates creates standalone cert', async () => {
  const auth = await adminAuth();
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token };

  const certResp = await api<any>(
    '/api/wht-certificates',
    {
      method: 'POST', headers: h,
      body: JSON.stringify({
        whtRate: '3',
        totalAmount: 50000,
        recipientName: 'Mr. Standalone Test',
        recipientTaxId: '3101100123456',
        recipientBranch: '00000',
        incomeType: '2',
        paymentDate: paymentDateStr(),
      }),
    }
  );
  const cert = certResp.data ?? certResp;

  assert.ok(cert.id, 'standalone cert created');
  assert.ok(cert.certificateNumber != null && cert.certificateNumber.startsWith('WHT-'), 'format WHT-...');

  await withSystemRlsContext(prisma, (tx) => tx.whtCertificate.delete({ where: { id: cert.id } }), { role: 'system' });
});

// TC-WHT-003
test('TC-WHT-003: 1%/3%/5% WHT rates calculated correctly', async () => {
  const auth = await adminAuth();
  const token = auth.token;
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  const baseAmount = 10000;
  const rates = ['1', '3', '5'];
  const invoiceIds: string[] = [];
  const certIds: string[] = [];

  for (let i = 0; i < rates.length; i++) {
    const rate = rates[i];
    const taxId = '0105560000' + rate;
    const customer = await createCustomer(auth.user.companyId, 'Customer WHT-003-' + rate, taxId);
    const invoice = await createApprovedInvoice(auth.user.companyId, customer.id, auth.user.id, baseAmount);
    invoiceIds.push(invoice.id);

    const certResp = await api<any>(
      '/api/invoices/' + invoice.id + '/wht-certificate',
      { method: 'POST', headers: h, body: JSON.stringify({ whtRate: rate, paymentDate: paymentDateStr(), incomeType: '1' }) }
    );
    const cert = certResp.data ?? certResp;
    certIds.push(cert.id);

    const expectedWht = baseAmount * parseInt(rate) / 100;
    const expectedNet = baseAmount - expectedWht;
    assert.equal(cert.whtAmount, expectedWht, 'rate ' + rate + '% whtAmount correct');
    assert.equal(cert.netAmount, expectedNet, 'rate ' + rate + '% netAmount correct');
  }

  // Cleanup: delete certs, then all invoices for these customers, then customers
  for (const certId of certIds) {
    await withSystemRlsContext(prisma, (tx) => tx.whtCertificate.deleteMany({ where: { id: certId } }), { role: 'system' });
  }
  for (const invId of invoiceIds) {
    await withSystemRlsContext(prisma, (tx) => tx.invoice.deleteMany({ where: { id: invId } }), { role: 'system' });
  }
  // Delete all invoices for these customers first (clear buyerId FK), then customers
  const taxIds = ['01055600001', '01055600003', '01055600005'];
  for (const taxId of taxIds) {
    await withSystemRlsContext(prisma, (tx) => tx.invoice.deleteMany({ where: { buyer: { taxId } } }), { role: 'system' });
    await withSystemRlsContext(prisma, (tx) => tx.customer.deleteMany({ where: { taxId } }), { role: 'system' });
  }
});

// TC-WHT-004
test('TC-WHT-004: WHT cert numbers follow WHT-{TAXID}-{YYYYMM}-{NNNN} format', async () => {
  const auth = await adminAuth();
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token };
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');

  // Get company taxId for format
  const company = await withSystemRlsContext(prisma, (tx) =>
    tx.company.findUnique({ where: { id: auth.user.companyId }, select: { taxId: true } }),
    { role: 'system' }
  );
  const prefix = 'WHT-' + (company?.taxId ?? auth.user.companyId) + '-';

  const certIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const certResp = await api<any>(
      '/api/wht-certificates',
      {
        method: 'POST', headers: h,
        body: JSON.stringify({
          whtRate: '1',
          totalAmount: 10000,
          recipientName: 'Recipient ' + i,
          recipientTaxId: '01055' + i + '0000000',
          recipientBranch: '00000',
          incomeType: '1',
          paymentDate: paymentDateStr(),
        }),
      }
    );
    const cert = (certResp as any).data ?? certResp;
    certIds.push(cert.id);
  }

  for (const id of certIds) {
    const certResp = await api<any>('/api/wht-certificates/' + id, { headers: h });
    const cert = certResp.data ?? certResp;
    const num = cert.certificateNumber;
    assert.ok(num.startsWith(prefix), num + ' should start with ' + prefix);
    const parts = num.split('-');
    assert.equal(parts.length, 4, 'four dash-separated parts');
    assert.equal(parts[2], '' + yyyy + mm, 'period part should be ' + yyyy + mm);
  }

  // Sequential: last 4 digits increment
  const certs = await Promise.all(certIds.map(id =>
    api<any>('/api/wht-certificates/' + id, { headers: h })
  ));
  // Unwrap .data if present (some endpoints return { data: [...] }, GET /:id returns { data: cert })
  const numbers = certs.map(c => {
    const cert = (c as any).data ?? c;
    return cert.certificateNumber;
  });
  const seqNums2 = numbers.map(n => parseInt(n.split('-').pop() ?? '0'));

  assert.equal(seqNums2[1] - seqNums2[0], 1, 'second cert is seq+1');
  assert.equal(seqNums2[2] - seqNums2[1], 1, 'third cert is seq+2');

  for (const id of certIds) {
    await withSystemRlsContext(prisma, (tx) => tx.whtCertificate.delete({ where: { id } }), { role: 'system' });
  }
});

// TC-WHT-005
test('TC-WHT-005: POST /api/invoices/:id/wht-certificate on draft → 400', async () => {
  const auth = await adminAuth();
  const token = auth.token;
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  const customer = await createCustomer(auth.user.companyId, 'Customer WHT-005', '0105560000005');
  const invNum = 'WHT-TEST-' + uniqueDigits(6);
  const draftInv = await withSystemRlsContext(prisma, (tx) =>
    tx.invoice.create({
      data: {
        companyId: auth.user.companyId,
        invoiceNumber: invNum,
        type: 'tax_invoice',
        status: 'draft',
        language: 'th',
        invoiceDate: new Date(),
        buyerId: customer.id,
        seller: { nameTh: 'บริษัท สยามเทคฯ', taxId: '0105560123456', branchCode: '00000' },
        subtotal: 5000, vatAmount: 350, discountAmount: 0, total: 5350,
        whtAmount: 0, isPaid: false, createdBy: auth.user.id,
      },
    }), { role: 'system' }
  );

  let err: any = null;
  try {
    await api('/api/invoices/' + draftInv.id + '/wht-certificate', {
      method: 'POST', headers: h,
      body: JSON.stringify({ whtRate: '3', paymentDate: paymentDateStr() }),
    });
  } catch (e) {
    err = e;
  }

  assert.ok(err, 'should throw on draft invoice');
  assert.equal(err.status, 400, 'should be 400');
  assert.ok(err.body?.error?.includes('draft') || err.body?.error?.includes('Cannot'), 'draft error message');

  await withSystemRlsContext(prisma, (tx) => tx.invoice.deleteMany({ where: { id: draftInv.id } }), { role: 'system' });
  await withSystemRlsContext(prisma, (tx) => tx.customer.delete({ where: { id: customer.id } }), { role: 'system' });
});

// TC-WHT-006
test('TC-WHT-006: second WHT cert on same invoice → 409', async () => {
  const auth = await adminAuth();
  const token = auth.token;
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  const customer = await createCustomer(auth.user.companyId, 'Customer WHT-006', '0105560000006');
  const invoice = await createApprovedInvoice(auth.user.companyId, customer.id, auth.user.id, 8000);

  await api<any>(
    '/api/invoices/' + invoice.id + '/wht-certificate',
    { method: 'POST', headers: h, body: JSON.stringify({ whtRate: '1', paymentDate: paymentDateStr() }) }
  );

  let err: any = null;
  try {
    await api('/api/invoices/' + invoice.id + '/wht-certificate', {
      method: 'POST', headers: h,
      body: JSON.stringify({ whtRate: '3', paymentDate: paymentDateStr() }),
    });
  } catch (e) {
    err = e;
  }

  assert.ok(err, 'second cert should throw');
  assert.equal(err.status, 409, 'should be 409');
  assert.ok(err.body?.error?.includes('already') || err.body?.error?.includes('WHT'), 'already-has error');

  // Cleanup: delete WHT cert first, then all invoices for customer, then customer
  await withSystemRlsContext(prisma, (tx) => tx.whtCertificate.deleteMany({ where: { invoiceId: invoice.id } }), { role: 'system' });
  await withSystemRlsContext(prisma, (tx) => tx.invoice.deleteMany({ where: { buyerId: customer.id } }), { role: 'system' });
  await withSystemRlsContext(prisma, (tx) => tx.customer.deleteMany({ where: { id: customer.id } }), { role: 'system' });
});

// TC-WHT-008
test('TC-WHT-008: GET /api/pp30/wht aggregates WHT certs by rate', async () => {
  const auth = await adminAuth();
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token };
  // Clean up ALL existing WHT certs for this company/month to ensure isolated test state
  const yyyy = new Date().getFullYear();
  const mm = new Date().getMonth() + 1;
  const fromDate = new Date(yyyy, mm - 1, 1);
  const toDate = new Date(yyyy, mm, 0, 23, 59, 59, 999);
  const companyId = auth.user.companyId;
  const allExisting = await withSystemRlsContext(prisma, (tx) =>
    tx.whtCertificate.findMany({ where: { companyId, paymentDate: { gte: fromDate, lte: toDate } }, select: { id: true } }),
  { role: 'system' });
  for (const c of allExisting) {
    await withSystemRlsContext(prisma, (tx) => tx.whtCertificate.delete({ where: { id: c.id } }), { role: 'system' });
  }

  const base = 10000;
  const rates = ['1', '3', '5'];
  const certIds: string[] = [];

  for (let i = 0; i < rates.length; i++) {
    const rate = rates[i];
    const certResp = await api<any>(
      '/api/wht-certificates',
      {
        method: 'POST', headers: h,
        body: JSON.stringify({
          whtRate: rate,
          totalAmount: base,
          recipientName: 'Recipient ' + rate,
          recipientTaxId: '01055000000' + rate,
          recipientBranch: '00000',
          incomeType: '1',
          paymentDate: paymentDateStr(),
        }),
      }
    );
    const cert = (certResp as any).data ?? certResp;
    certIds.push(cert.id);
  }

  const resp = await api<any>('/api/pp30/wht?year=' + yyyy + '&month=' + mm, { headers: h });
  const whtData = resp.data ?? resp;
  // Build a map from byRate and verify that the certs created by this test appear correctly
  // byRate entries use string keys matching whtRate ('1', '3', '5')
  const byRateMap = new Map<string, { count: number; totalWithheld: number }>();
  for (const entry of whtData.byRate) {
    byRateMap.set(String(entry.rate), { count: entry.count, totalWithheld: entry.totalWithheld });
  }
  for (const rate of rates) {
    const entry = byRateMap.get(rate);
    assert.ok(entry, 'rate ' + rate + '% present');
    assert.equal(entry.count, 1, 'rate ' + rate + '% count = 1');
    assert.equal(entry.totalWithheld, base * parseInt(rate) / 100, 'rate ' + rate + '% withheld correct');
  }

  for (const id of certIds) {
    await withSystemRlsContext(prisma, (tx) => tx.whtCertificate.delete({ where: { id } }), { role: 'system' });
  }
});

// TC-WHT-010
test('TC-WHT-010: PATCH /api/wht-certificates/:id updates whtAmount and netAmount', async () => {
  const auth = await adminAuth();
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token };

  const certResp = await api<any>(
    '/api/wht-certificates',
    {
      method: 'POST', headers: h,
      body: JSON.stringify({
        whtRate: '3',
        totalAmount: 20000,
        recipientName: 'Mr. Update Test',
        recipientTaxId: '3101100012345',
        recipientBranch: '00000',
        incomeType: '1',
        paymentDate: paymentDateStr(),
      }),
    }
  );
  const cert = (certResp as any).data ?? certResp;

  assert.equal(cert.whtAmount, 600, '3% of 20000 = 600');
  assert.equal(cert.netAmount, 19400, '20000 - 600 = 19400');

  const updatedResp = await api<any>(
    '/api/wht-certificates/' + cert.id,
    { method: 'PATCH', headers: h, body: JSON.stringify({ whtRate: '5' }) }
  );
  const updated = (updatedResp as any).data ?? updatedResp;

  assert.equal(updated.whtAmount, 1000, '5% of 20000 = 1000');
  assert.equal(updated.netAmount, 19000, '20000 - 1000 = 19000');

  await withSystemRlsContext(prisma, (tx) => tx.whtCertificate.delete({ where: { id: cert.id } }), { role: 'system' });
});

// TC-WHT-011
test('TC-WHT-011: DELETE /api/wht-certificates/:id clears invoice.whtCertificateId', async () => {
  const auth = await adminAuth();
  const token = auth.token;
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  const customer = await createCustomer(auth.user.companyId, 'Customer WHT-011', '0105560000011');
  const invoice = await createApprovedInvoice(auth.user.companyId, customer.id, auth.user.id, 15000);

  const certResp = await api<any>(
    '/api/invoices/' + invoice.id + '/wht-certificate',
    { method: 'POST', headers: h, body: JSON.stringify({ whtRate: '3', paymentDate: paymentDateStr(), incomeType: '1' }) }
  );
  const certId = (certResp as any).data?.id ?? (certResp as any).id;

  const linked = await withSystemRlsContext(prisma, (tx) =>
    tx.invoice.findUnique({ where: { id: invoice.id }, select: { whtCertificateId: true } }),
    { role: 'system' }
  );
  assert.ok(linked?.whtCertificateId, 'invoice has whtCertificateId before delete');

  await api('/api/wht-certificates/' + certId, { method: 'DELETE', headers: h });

  const unlinked = await withSystemRlsContext(prisma, (tx) =>
    tx.invoice.findUnique({ where: { id: invoice.id }, select: { whtCertificateId: true, whtAmount: true } }),
    { role: 'system' }
  );
  assert.equal(unlinked?.whtCertificateId, null, 'whtCertificateId cleared');
  assert.equal(unlinked?.whtAmount, 0, 'whtAmount reset to 0');

  // Cleanup: delete all invoices for customer first (clear buyerId FK), then customer
  await withSystemRlsContext(prisma, (tx) => tx.invoice.deleteMany({ where: { buyerId: customer.id } }), { role: 'system' });
  await withSystemRlsContext(prisma, (tx) => tx.customer.deleteMany({ where: { id: customer.id } }), { role: 'system' });
});
