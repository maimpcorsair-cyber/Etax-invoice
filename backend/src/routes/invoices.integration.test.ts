import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/database';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:4000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@siamtech.co.th';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'Admin@123456';

interface AuthResponse {
  token: string;
  user: {
    id: string;
    companyId: string;
  };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body as T;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForInvoice(
  invoiceId: string,
  predicate: (inv: { rdSubmissionStatus?: string | null; status?: string | null }) => boolean,
  opts?: { timeoutMs?: number; intervalMs?: number },
) {
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const intervalMs = opts?.intervalMs ?? 400;
  const start = Date.now();

  // Poll DB directly: we want deterministic reads unaffected by API caching.
  // The worker updates the invoice record as it progresses.
  while (Date.now() - start < timeoutMs) {
    const inv = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        status: true,
        rdSubmissionStatus: true,
        rdDocId: true,
        rdSubmittedAt: true,
      },
    });
    if (inv && predicate(inv)) return inv;
    await sleep(intervalMs);
  }

  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, rdSubmissionStatus: true, rdDocId: true, rdSubmittedAt: true },
  });
  throw new Error(`Timed out waiting for invoice ${invoiceId}. Last state: ${JSON.stringify(inv)}`);
}

function uniqueDigits(length: number): string {
  return Date.now().toString().slice(-length).padStart(length, '0');
}

test('invoices API: issue receipt and submit RD (mock) flows', async (t) => {
  const auth = await api<AuthResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  const token = auth.token;
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const company = await prisma.company.findUnique({
    where: { id: auth.user.companyId },
    select: {
      id: true,
      nameTh: true,
      nameEn: true,
      taxId: true,
      branchCode: true,
      branchNameTh: true,
      addressTh: true,
      addressEn: true,
      phone: true,
      email: true,
      logoUrl: true,
    },
  });
  assert.ok(company, 'company fixture should exist');

  let customerId: string | null = null;
  const invoiceIdsToCleanup: string[] = [];

  async function cleanup() {
    if (invoiceIdsToCleanup.length) {
      await prisma.invoice.deleteMany({ where: { id: { in: invoiceIdsToCleanup } } });
    }
    if (customerId) {
      await prisma.customer.deleteMany({ where: { id: customerId } });
    }
  }

  await t.test('issue-receipt marks tax invoice paid and creates receipt doc', async () => {
    try {
      const taxId = `8${uniqueDigits(12)}`;
      const customer = await prisma.customer.create({
        data: {
          companyId: auth.user.companyId,
          nameTh: 'ลูกค้าทดสอบ Issue Receipt',
          nameEn: 'Issue Receipt Customer',
          taxId,
          branchCode: '00000',
          addressTh: 'Bangkok Test Address',
          email: 'integration-issue-receipt@example.com',
        },
        select: { id: true },
      });
      customerId = customer.id;

      const total = 1070;
      const taxInvoiceNumber = `IT-RCT-${Date.now()}`;
      const taxInvoice = await prisma.invoice.create({
        data: {
          companyId: auth.user.companyId,
          invoiceNumber: taxInvoiceNumber,
          type: 'tax_invoice',
          status: 'draft',
          language: 'th',
          invoiceDate: new Date('2026-04-23T00:00:00.000Z'),
          buyerId: customer.id,
          seller: {
            nameTh: company!.nameTh,
            nameEn: company!.nameEn,
            taxId: company!.taxId,
            branchCode: company!.branchCode,
            branchNameTh: company!.branchNameTh,
            addressTh: company!.addressTh,
            addressEn: company!.addressEn,
            phone: company!.phone,
            email: company!.email,
            logoUrl: company!.logoUrl,
          },
          subtotal: 1000,
          vatAmount: 70,
          discount: 0,
          total,
          isPaid: false,
          createdBy: auth.user.id,
          items: {
            create: [{
              nameTh: 'Issue Receipt Item',
              nameEn: 'Issue Receipt Item',
              quantity: 1,
              unit: 'ชิ้น',
              unitPrice: 1000,
              discount: 0,
              vatType: 'vat7',
              amount: 1000,
              vatAmount: 70,
              totalAmount: total,
            }],
          },
        },
        select: { id: true },
      });
      invoiceIdsToCleanup.push(taxInvoice.id);

      const result = await api<{
        data: { id: string; type: string; isPaid: boolean; referenceInvoiceId?: string | null; referenceDocNumber?: string | null };
      }>(`/api/invoices/${taxInvoice.id}/issue-receipt`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ paymentMethod: 'transfer', note: 'integration', paidAt: '2026-04-24' }),
      });

      const receiptId = result.data.id;
      invoiceIdsToCleanup.push(receiptId);

      assert.equal(result.data.type, 'receipt');
      assert.equal(result.data.isPaid, true);
      assert.equal(result.data.referenceInvoiceId, taxInvoice.id);

      const updatedTaxInvoice = await prisma.invoice.findUnique({
        where: { id: taxInvoice.id },
        select: { isPaid: true, paidAmount: true },
      });
      assert.equal(updatedTaxInvoice?.isPaid, true);
      assert.equal(updatedTaxInvoice?.paidAmount, total);

      const receipt = await prisma.invoice.findUnique({
        where: { id: receiptId },
        select: {
          type: true,
          isPaid: true,
          referenceInvoiceId: true,
          referenceDocNumber: true,
          total: true,
          rdSubmissionStatus: true,
        },
      });
      assert.equal(receipt?.type, 'receipt');
      assert.equal(receipt?.isPaid, true);
      assert.equal(receipt?.referenceInvoiceId, taxInvoice.id);
      assert.equal(receipt?.referenceDocNumber, taxInvoiceNumber);

      // RD submission for receipt is queued; worker may finish quickly (mock).
      const final = await waitForInvoice(receiptId, (inv) => inv.rdSubmissionStatus === 'success' || inv.rdSubmissionStatus === 'failed', {
        timeoutMs: 20_000,
      });
      assert.equal(final.rdSubmissionStatus, 'success');
      assert.ok(final.rdDocId);
    } finally {
      await cleanup();
    }
  });

  await t.test('submit-rd transitions invoice to submitted with rdDocId', async () => {
    try {
      // Fresh customer per subtest to avoid coupling.
      const taxId = `7${uniqueDigits(12)}`;
      const customer = await prisma.customer.create({
        data: {
          companyId: auth.user.companyId,
          nameTh: 'ลูกค้าทดสอบ Submit RD',
          nameEn: 'Submit RD Customer',
          taxId,
          branchCode: '00000',
          addressTh: 'Bangkok Test Address',
          email: 'integration-submit-rd@example.com',
        },
        select: { id: true },
      });
      customerId = customer.id;

      const total = 1070;
      const invoice = await prisma.invoice.create({
        data: {
          companyId: auth.user.companyId,
          invoiceNumber: `IT-RD-${Date.now()}`,
          type: 'tax_invoice',
          status: 'draft',
          language: 'th',
          invoiceDate: new Date('2026-04-23T00:00:00.000Z'),
          buyerId: customer.id,
          seller: {
            nameTh: company!.nameTh,
            nameEn: company!.nameEn,
            taxId: company!.taxId,
            branchCode: company!.branchCode,
            branchNameTh: company!.branchNameTh,
            addressTh: company!.addressTh,
            addressEn: company!.addressEn,
            phone: company!.phone,
            email: company!.email,
            logoUrl: company!.logoUrl,
          },
          subtotal: 1000,
          vatAmount: 70,
          discount: 0,
          total,
          isPaid: false,
          createdBy: auth.user.id,
          items: {
            create: [{
              nameTh: 'Submit RD Item',
              nameEn: 'Submit RD Item',
              quantity: 1,
              unit: 'ชิ้น',
              unitPrice: 1000,
              discount: 0,
              vatType: 'vat7',
              amount: 1000,
              vatAmount: 70,
              totalAmount: total,
            }],
          },
        },
        select: { id: true },
      });
      invoiceIdsToCleanup.push(invoice.id);

      await api<{ message?: string }>(`/api/invoices/${invoice.id}/submit-rd`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      // queueRdSubmission updates status to approved and rdSubmissionStatus pending immediately.
      const queued = await waitForInvoice(invoice.id, (inv) => inv.rdSubmissionStatus === 'pending' || inv.rdSubmissionStatus === 'in_progress' || inv.rdSubmissionStatus === 'success', {
        timeoutMs: 10_000,
      });
      assert.ok(['pending', 'in_progress', 'success'].includes(queued.rdSubmissionStatus ?? ''), 'invoice should be queued');

      const final = await waitForInvoice(invoice.id, (inv) => inv.rdSubmissionStatus === 'success' || inv.rdSubmissionStatus === 'failed', {
        timeoutMs: 20_000,
      });
      assert.equal(final.rdSubmissionStatus, 'success');
      assert.equal(final.status, 'submitted');
      assert.ok(final.rdDocId);
      assert.ok(final.rdSubmittedAt);
    } finally {
      await cleanup();
    }
  });
});
