/**
 * PP.30 Integration Tests
 * Phase 5: Tests for GET /api/pp30, /api/pp30/wht, /api/pp30/export
 *
 * Run: npm test -- src/routes/pp30.integration.test.ts
 */

import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:4000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@siamtech.co.th';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'Admin@123456';

interface AuthResponse { token: string; user: { id: string; companyId: string; email: string; role: string } }
interface ApiResponse { data?: any; period?: string }

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
  console.log(`[API] ${init?.method ?? 'GET'} ${path} → ${response.status}`, JSON.stringify(body).slice(0, 200));
  return body as T;
}

async function adminAuth() {
  return api<AuthResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
}

// Helper: create a customer via direct Prisma (bypasses access policy checks)
async function createCustomer(companyId: string, nameTh: string, taxId: string) {
  return withSystemRlsContext(prisma, (tx) =>
    tx.customer.upsert({
      where: { companyId_taxId_branchCode: { companyId, taxId, branchCode: '00000' } },
      create: { id: 'cust-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), companyId, nameTh, nameEn: nameTh, taxId, branchCode: '00000', addressTh: '123 Test Street', isActive: true },
      update: { nameTh, nameEn: nameTh },
    }), { role: 'system' }
  );
}

// Helper: delete a customer after test
async function deleteCustomer(companyId: string, taxId: string) {
  await withSystemRlsContext(prisma, (tx) =>
    tx.customer.deleteMany({ where: { companyId, taxId, branchCode: '00000' } }),
    { role: 'system' }
  );
}

// Helper: create an approved invoice with items (via Prisma to bypass access policy)
async function createApprovedInvoice(
  companyId: string,
  customerId: string,
  userId: string,
  items: { nameTh: string; quantity: number; unitPrice: number; vatType: string }[],
  options?: { invoiceDate?: string; type?: string }
) {
  const today = options?.invoiceDate ?? new Date().toISOString().split('T')[0];
  const invType = options?.type ?? 'tax_invoice';

  return withSystemRlsContext(prisma, async (tx) => {
    // Calculate amounts (same formula as invoices.ts)
    const calculated = items.map(item => {
      const amount = item.quantity * item.unitPrice;
      const vatAmount = item.vatType === 'vat7' ? amount * 0.07 : 0;
      const totalAmount = amount + vatAmount;
      return { ...item, amount, vatAmount, totalAmount };
    });

    const subtotal = calculated.reduce((s, i) => s + i.amount, 0);
    const vatAmount = calculated.reduce((s, i) => s + i.vatAmount, 0);
    const total = subtotal + vatAmount;

    const invId = 'inv-pp30-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

    const _invoice = await tx.invoice.create({
      data: {
        id: invId,
        companyId,
        invoiceNumber: 'PP30-T-' + Date.now(),
        type: invType as any,
        status: 'approved',
        language: 'th',
        invoiceDate: new Date(today + 'T00:00:00.000Z'),
        dueDate: new Date(today + 'T00:00:00.000Z'),
        buyerId: customerId,
        seller: { nameTh: 'Test Company', taxId: '0105560012345' },
        subtotal,
        vatAmount,
        total,
        isPaid: false,
        createdBy: userId,
      },
    });

    await tx.invoiceItem.createMany({
      data: calculated.map((item, idx) => ({
        id: 'item-pp30-' + Date.now() + '-' + idx,
        invoiceId: invId,
        nameTh: item.nameTh,
        quantity: item.quantity,
        unit: 'unit',
        unitPrice: item.unitPrice,
        vatType: item.vatType as any,
        amount: item.amount,
        vatAmount: item.vatAmount,
        totalAmount: item.totalAmount,
      })),
    });

    return invId;
  }, { role: 'system' });
}

// Helper: create a credit note (T04) and cancel it
async function createCancelledCreditNote(
  companyId: string,
  customerId: string,
  userId: string,
  items: { nameTh: string; quantity: number; unitPrice: number; vatType: string }[],
  originalInvoiceId?: string
) {
  const auth = await adminAuth();
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token };
  const today = new Date().toISOString().split('T')[0];

  const payload = {
    type: 'credit_note',
    invoiceDate: today,
    dueDate: today,
    buyerId: customerId,
    language: 'th',
    referenceInvoiceId: originalInvoiceId ?? null,
    items: items.map((item: { nameTh: string; quantity: number; unitPrice: number; vatType: string }) => ({
      nameTh: item.nameTh,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      vatType: item.vatType,
    })),
  };

  const draft = await api<{ id: string }>('/api/invoices', {
    method: 'POST', headers: h,
    body: JSON.stringify(payload),
  });

  await api('/api/invoices/' + draft.id + '/issue', { method: 'POST', headers: h });
  await api('/api/invoices/' + draft.id + '/cancel', {
    method: 'POST', headers: h,
    body: JSON.stringify({ reason: 'Test cancellation' }),
  });

  return draft.id;
}

// Get system DB access for cleanup
async function getSystemDb() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: 'postgresql://etax_user:etax_secret@localhost:5432/etax_invoice' } },
  });
  return prisma;
}

// Cleanup test data: ALL invoices and invoice items for this company in the current period
// This ensures PP.30 only includes our test data
async function cleanupTestData() {
  const prisma = await getSystemDb();
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = now.getMonth() + 1;
  // First and last day of current month as ISO strings
  const periodStart = new Date(yyyy, mm - 1, 1).toISOString();
  const periodEnd = new Date(yyyy, mm, 0, 23, 59, 59).toISOString();
  try {
    // Delete invoice items for invoices in this period
    await prisma.$executeRaw`DELETE FROM "public"."invoice_items" WHERE "invoiceId" IN (SELECT "id" FROM "public"."invoices" WHERE "companyId" = 'company-001' AND "invoiceDate" >= ${periodStart}::timestamp AND "invoiceDate" <= ${periodEnd}::timestamp)`;
    // Delete ALL invoices for this company in this period
    await prisma.$executeRaw`DELETE FROM "public"."invoices" WHERE "companyId" = 'company-001' AND "invoiceDate" >= ${periodStart}::timestamp AND "invoiceDate" <= ${periodEnd}::timestamp`;
    // Delete ALL purchase invoices for this company in this period
    await prisma.$executeRaw`DELETE FROM "public"."purchase_invoices" WHERE "companyId" = 'company-001' AND "invoiceDate" >= ${periodStart}::date AND "invoiceDate" <= ${periodEnd}::date`;
  } finally {
    await prisma.$disconnect();
  }
}

// TC-PP30-001: Basic PP.30 calculation
test('TC-PP30-001: GET /api/pp30 calculates output/input VAT correctly', async () => {
  // PRE-CLEANUP: Remove any existing test data before creating new data
  await cleanupTestData();

  const auth = await adminAuth();
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token };

  // Create customer
  const customer = await createCustomer(auth.user.companyId, 'PP30 Customer 001', '0105560012345');
  const customerId = (customer as any).id;

  // Create sales invoice: 100,000 + 7% VAT = 107,000
  // Items: 100,000 at vat7 → outputVat = 7,000
  const salesInvId = await createApprovedInvoice(auth.user.companyId, customerId, auth.user.id, [
    { nameTh: 'Product A', quantity: 1, unitPrice: 100000, vatType: 'vat7' },
  ]);

  // Create purchase invoice: 50,000 + 7% VAT = 53,500
  // via purchase invoices API
  const purchasePayload = {
    supplierName: 'Supplier PP30',
    supplierTaxId: '0105560099999',
    invoiceNumber: 'PI-' + Date.now(),
    invoiceDate: new Date().toISOString().split('T')[0],
    subtotal: 50000,
    vatAmount: 3500,
    total: 53500,
    vatType: 'vat7',
    companyId: auth.user.companyId,
  };
  const purchaseResp = await api<{ id: string }>('/api/purchase-invoices', {
    method: 'POST', headers: h,
    body: JSON.stringify(purchasePayload),
  });
  const purchaseInvId = (purchaseResp as any).data?.id ?? (purchaseResp as any).id ?? purchaseResp;

  // Query PP.30
  const yyyy = new Date().getFullYear();
  const mm = new Date().getMonth() + 1;
  const pp30Resp = await api<any>('/api/pp30?year=' + yyyy + '&month=' + mm, { headers: h });
  const pp30 = pp30Resp.data ?? pp30Resp;

  // Verify sales: 100,000 excl VAT, 7,000 VAT
  assert.equal(pp30.sales.outputVat, 7000, 'outputVat should be 7,000');

  // Verify purchases: 50,000 excl VAT, 3,500 VAT
  assert.equal(pp30.purchases.inputVat, 3500, 'inputVat should be 3,500');

  // Verify payable: 7,000 - 3,500 = 3,500
  assert.equal(pp30.summary.vatPayable, 3500, 'vatPayable should be 3,500');

  // Cleanup (customers kept, upsert handles duplicates)
  const prisma = await getSystemDb();
  await (prisma as any).$executeRaw`DELETE FROM "public"."invoice_items" WHERE "invoiceId" = ${salesInvId}`;
  await (prisma as any).$executeRaw`DELETE FROM "public"."invoices" WHERE "id" = ${salesInvId}`;
  await (prisma as any).$executeRaw`DELETE FROM "public"."purchase_invoices" WHERE "id" = ${purchaseInvId}`;
  await prisma.$disconnect();
});

// TC-PP30-002: vatExempt excluded from PP.30 VAT calculation
test('TC-PP30-002: vatExempt items not counted in output VAT', async () => {
  // PRE-CLEANUP: Remove any existing test data before creating new data
  await cleanupTestData();

  const auth = await adminAuth();
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token };

  const customer = await createCustomer(auth.user.companyId, 'PP30 Customer 002', '0105560022345');
  const customerId = (customer as any).id;

  // Create invoice with exempt items: 50,000 vatExempt
  const invId = await createApprovedInvoice(auth.user.companyId, customerId, auth.user.id, [
    { nameTh: 'Exempt Service', quantity: 1, unitPrice: 50000, vatType: 'vatExempt' },
  ]);

  const yyyy = new Date().getFullYear();
  const mm = new Date().getMonth() + 1;
  const pp30Resp = await api<any>('/api/pp30?year=' + yyyy + '&month=' + mm, { headers: h });
  const pp30 = pp30Resp.data ?? pp30Resp;

  // vatExempt items are included in totalExclVat but outputVat = 0
  const exemptEntry = pp30.sales.byVatType.vatExempt;
  assert.ok(exemptEntry, 'vatExempt entry should exist');
  assert.equal(exemptEntry.totalExclVat, 50000, 'totalExclVat includes exempt');
  assert.equal(exemptEntry.vatAmount, 0, 'vatAmount for exempt should be 0');
  assert.equal(pp30.sales.outputVat, 0, 'outputVat should be 0 (no vat7 items)');

  // Cleanup (customers kept, upsert handles duplicates)
  const prisma = await getSystemDb();
  await (prisma as any).$executeRaw`DELETE FROM "public"."invoice_items" WHERE "invoiceId" = ${invId}`;
  await (prisma as any).$executeRaw`DELETE FROM "public"."invoices" WHERE "id" = ${invId}`;
  await prisma.$disconnect();
});

// TC-PP30-003: vatZero excluded from PP.30 VAT calculation
test('TC-PP30-003: vatZero items not counted in output VAT', async () => {
  // PRE-CLEANUP: Remove any existing test data before creating new data
  await cleanupTestData();

  const auth = await adminAuth();
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token };

  const customer = await createCustomer(auth.user.companyId, 'PP30 Customer 003', '0105560032345');
  const customerId = (customer as any).id;

  // Create invoice with zero-rated items: 20,000 vatZero
  const invId = await createApprovedInvoice(auth.user.companyId, customerId, auth.user.id, [
    { nameTh: 'Export Service', quantity: 1, unitPrice: 20000, vatType: 'vatZero' },
  ]);

  const yyyy = new Date().getFullYear();
  const mm = new Date().getMonth() + 1;
  const pp30Resp = await api<any>('/api/pp30?year=' + yyyy + '&month=' + mm, { headers: h });
  const pp30 = pp30Resp.data ?? pp30Resp;

  const zeroEntry = pp30.sales.byVatType.vatZero;
  assert.ok(zeroEntry, 'vatZero entry should exist');
  assert.equal(zeroEntry.totalExclVat, 20000, 'totalExclVat includes zero-rated');
  assert.equal(zeroEntry.vatAmount, 0, 'vatAmount for zero-rated should be 0');
  assert.equal(pp30.sales.outputVat, 0, 'outputVat should be 0 (no vat7 items)');

  // Cleanup (customers kept, upsert handles duplicates)
  const prisma = await getSystemDb();
  await (prisma as any).$executeRaw`DELETE FROM "public"."invoice_items" WHERE "invoiceId" = ${invId}`;
  await (prisma as any).$executeRaw`DELETE FROM "public"."invoices" WHERE "id" = ${invId}`;
  await prisma.$disconnect();
});

// TC-PP30-007: Mixed VAT types in single invoice
test('TC-PP30-007: Invoice with mixed VAT types correctly aggregated', async () => {
  // PRE-CLEANUP: Remove any existing test data before creating new data
  await cleanupTestData();

  const auth = await adminAuth();
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token };

  const customer = await createCustomer(auth.user.companyId, 'PP30 Customer 007', '0105560072345');
  const customerId = (customer as any).id;

  // Single invoice with 3 items: vat7(1,000 + 70 VAT), vatZero(500 + 0 VAT), vatExempt(300 + 0 VAT)
  const invId = await createApprovedInvoice(auth.user.companyId, customerId, auth.user.id, [
    { nameTh: 'Standard Item', quantity: 1, unitPrice: 1000, vatType: 'vat7' },
    { nameTh: 'Export Item', quantity: 1, unitPrice: 500, vatType: 'vatZero' },
    { nameTh: 'Exempt Item', quantity: 1, unitPrice: 300, vatType: 'vatExempt' },
  ]);

  const yyyy = new Date().getFullYear();
  const mm = new Date().getMonth() + 1;
  const pp30Resp = await api<any>('/api/pp30?year=' + yyyy + '&month=' + mm, { headers: h });
  const pp30 = pp30Resp.data ?? pp30Resp;

  // totalExclVat = 1000 + 500 + 300 = 1800
  assert.equal(pp30.sales.totalExclVat, 1800, 'totalExclVat = 1800');

  // outputVat should only include vat7: 70
  assert.equal(pp30.sales.outputVat, 70, 'outputVat = 70 from vat7 item');

  // byVatType check
  assert.equal(pp30.sales.byVatType.vat7.totalExclVat, 1000, 'vat7 excl = 1000');
  assert.equal(pp30.sales.byVatType.vat7.vatAmount, 70, 'vat7 vat = 70');
  assert.equal(pp30.sales.byVatType.vatZero.totalExclVat, 500, 'vatZero excl = 500');
  assert.equal(pp30.sales.byVatType.vatExempt.totalExclVat, 300, 'vatExempt excl = 300');

  // Cleanup (customers kept, upsert handles duplicates)
  const prisma = await getSystemDb();
  await (prisma as any).$executeRaw`DELETE FROM "public"."invoice_items" WHERE "invoiceId" = ${invId}`;
  await (prisma as any).$executeRaw`DELETE FROM "public"."invoices" WHERE "id" = ${invId}`;
  await prisma.$disconnect();
});

// TC-PP30-008: PP.30 at month boundary — previous month's invoice excluded
test('TC-PP30-008: Invoice from previous month not included in current month PP.30', async () => {
  // PRE-CLEANUP: Remove any existing test data before creating new data
  await cleanupTestData();

  const auth = await adminAuth();
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token };

  const customer = await createCustomer(auth.user.companyId, 'PP30 Customer 008', '0105560082345');
  const customerId = (customer as any).id;

  // Create an invoice with last day's date of previous month
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayOfPrevMonth = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0);
  const prevDateStr = lastDayOfPrevMonth.toISOString().split('T')[0]; // e.g. "2026-04-30"

  const prevInvId = await createApprovedInvoice(auth.user.companyId, customerId, auth.user.id, [
    { nameTh: 'Prev Month Item', quantity: 1, unitPrice: 99999, vatType: 'vat7' },
  ], { invoiceDate: prevDateStr, type: 'tax_invoice' });

  // Update the invoice date directly in DB (issue sets it to today)
  const prisma = await getSystemDb();
  await (prisma as any).$executeRaw`
    UPDATE "public"."invoices" SET "invoiceDate" = ${prevDateStr}::date WHERE "id" = ${prevInvId}`;

  // Current month invoice
  const currInvId = await createApprovedInvoice(auth.user.companyId, customerId, auth.user.id, [
    { nameTh: 'Current Month Item', quantity: 1, unitPrice: 11111, vatType: 'vat7' },
  ]);

  const yyyy = now.getFullYear();
  const mm = now.getMonth() + 1;
  const pp30Resp = await api<any>('/api/pp30?year=' + yyyy + '&month=' + mm, { headers: h });
  const pp30 = pp30Resp.data ?? pp30Resp;

  // Only current month invoice should be counted
  assert.equal(pp30.sales.byVatType.vat7.totalExclVat, 11111, 'only current month invoice counted');
  assert.equal(Math.round(pp30.sales.outputVat), 778, 'outputVat = 7% of 11111 (rounded)');

  // Cleanup (reuse prisma connection, customers kept via upsert)
  await (prisma as any).$executeRaw`DELETE FROM "public"."invoice_items" WHERE "invoiceId" = ${prevInvId}`;
  await (prisma as any).$executeRaw`DELETE FROM "public"."invoice_items" WHERE "invoiceId" = ${currInvId}`;
  await (prisma as any).$executeRaw`DELETE FROM "public"."invoices" WHERE "id" = ${prevInvId}`;
  await (prisma as any).$executeRaw`DELETE FROM "public"."invoices" WHERE "id" = ${currInvId}`;
  await prisma.$disconnect();
});

// TC-PP30-005: PP.30 CSV export
test('TC-PP30-005: GET /api/pp30/export returns CSV with correct headers', async () => {
  // PRE-CLEANUP: Remove any existing test data before creating new data
  await cleanupTestData();

  const auth = await adminAuth();

  const yyyy = new Date().getFullYear();
  const mm = new Date().getMonth() + 1;

  const response = await fetch(`${BASE_URL}/api/pp30/export?year=${yyyy}&month=${mm}`, {
    headers: { Authorization: 'Bearer ' + auth.token },
  });

  assert.equal(response.status, 200, 'export should return 200');
  const contentType = response.headers.get('content-type') ?? '';
  assert.ok(contentType.includes('text/csv') || contentType.includes('application/csv') || contentType.includes('text/comma-separated'),
    'content-type should be CSV');
  const disposition = response.headers.get('content-disposition') ?? '';
  assert.ok(disposition.includes('attachment'), 'should have attachment disposition');
  assert.ok(disposition.includes('.csv'), 'should mention .csv');

  const text = await response.text();
  assert.ok(text.includes('Period'), 'CSV should include Period field');
  assert.ok(text.includes('VAT 7%'), 'CSV should include VAT breakdown');
});