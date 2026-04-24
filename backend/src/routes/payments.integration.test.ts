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

interface InvoiceResponse {
  data: {
    id: string;
    total: number;
    isPaid: boolean;
    paidAmount?: number | null;
    paidAt?: string | null;
  };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const bodyText = await response.text();
  const body = bodyText ? JSON.parse(bodyText) : null;

  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return body as T;
}

function uniqueDigits(length: number): string {
  return Date.now().toString().slice(-length).padStart(length, '0');
}

test('payments API recalculates invoice payment state across add/list/delete flow', async (t) => {
  const auth = await api<AuthResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  const token = auth.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

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
  let invoiceId: string | null = null;

  await t.test('create fixture, add two payments, then delete one and verify invoice totals', async () => {
    try {
      const taxId = `9${uniqueDigits(12)}`;
      const customer = await prisma.customer.create({
        data: {
          companyId: auth.user.companyId,
          nameTh: 'ลูกค้าทดสอบ Integration Payment',
          nameEn: 'Integration Payment Customer',
          taxId,
          branchCode: '00000',
          addressTh: 'Bangkok Test Address',
          email: 'integration-payment@example.com',
        },
        select: { id: true },
      });
      customerId = customer.id;

      const total = 1070;
      const invoice = await prisma.invoice.create({
        data: {
          companyId: auth.user.companyId,
          invoiceNumber: `IT-PAY-${Date.now()}`,
          type: 'tax_invoice',
          status: 'draft',
          language: 'th',
          invoiceDate: new Date(),
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
          createdBy: auth.user.id,
          items: {
            create: [{
              nameTh: 'Integration Payment Item',
              nameEn: 'Integration Payment Item',
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
      invoiceId = invoice.id;

      const firstPayment = await api<{
        data: { id: string };
        invoiceIsPaid: boolean;
        invoicePaidAmount: number;
      }>(`/api/invoices/${invoice.id}/payments`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          amount: 400,
          method: 'transfer',
          reference: 'PARTIAL-1',
          paidAt: '2026-04-23',
        }),
      });

      assert.equal(firstPayment.invoiceIsPaid, false);
      assert.equal(firstPayment.invoicePaidAmount, 400);

      const afterFirst = await api<InvoiceResponse>(`/api/invoices/${invoice.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(afterFirst.data.isPaid, false);
      assert.equal(afterFirst.data.paidAmount, 400);
      assert.equal(afterFirst.data.paidAt ?? null, null);

      const secondPayment = await api<{
        data: { id: string };
        invoiceIsPaid: boolean;
        invoicePaidAmount: number;
      }>(`/api/invoices/${invoice.id}/payments`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          amount: 670,
          method: 'transfer',
          reference: 'PARTIAL-2',
          paidAt: '2026-04-24',
        }),
      });

      assert.equal(secondPayment.invoiceIsPaid, true);
      assert.equal(secondPayment.invoicePaidAmount, 1070);

      const payments = await api<{ data: Array<{ id: string; amount: number }> }>(`/api/invoices/${invoice.id}/payments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(payments.data.length, 2);
      assert.deepEqual(
        payments.data.map((payment) => payment.amount).sort((a, b) => a - b),
        [400, 670],
      );

      const afterSecond = await api<InvoiceResponse>(`/api/invoices/${invoice.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(afterSecond.data.isPaid, true);
      assert.equal(afterSecond.data.paidAmount, 1070);
      assert.ok(afterSecond.data.paidAt);

      const deleteResult = await api<{ invoiceIsPaid: boolean; invoicePaidAmount: number }>(
        `/api/invoices/${invoice.id}/payments/${secondPayment.data.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      assert.equal(deleteResult.invoiceIsPaid, false);
      assert.equal(deleteResult.invoicePaidAmount, 400);

      const afterDelete = await api<InvoiceResponse>(`/api/invoices/${invoice.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(afterDelete.data.isPaid, false);
      assert.equal(afterDelete.data.paidAmount, 400);
      assert.equal(afterDelete.data.paidAt ?? null, null);
    } finally {
      if (invoiceId) {
        await prisma.invoice.deleteMany({ where: { id: invoiceId } });
      }
      if (customerId) {
        await prisma.customer.deleteMany({ where: { id: customerId } });
      }
    }
  });
});
