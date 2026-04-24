import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:4000';
const PRIMARY_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@siamtech.co.th';
const SECONDARY_ADMIN_EMAIL = process.env.TEST_SECONDARY_ADMIN_EMAIL ?? 'admin+1@demo-etax.co.th';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'Admin@123456';

interface AuthResponse {
  token: string;
  user: {
    id: string;
    companyId: string;
  };
}

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { status: response.status, body };
}

async function login(email: string) {
  const response = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: ADMIN_PASSWORD }),
  });
  assert.equal(response.status, 200, `login should succeed for ${email}`);
  return response.body as AuthResponse;
}

function uniqueDigits(length: number): string {
  return Date.now().toString().slice(-length).padStart(length, '0');
}

test('tenant isolation: another company cannot read or mutate foreign customer/invoice/payment resources', async () => {
  const primary = await login(PRIMARY_ADMIN_EMAIL);
  const secondary = await login(SECONDARY_ADMIN_EMAIL);

  assert.notEqual(
    primary.user.companyId,
    secondary.user.companyId,
    'test requires two admins from different companies',
  );

  const company = await prisma.company.findUnique({
    where: { id: primary.user.companyId },
    select: {
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
  assert.ok(company, 'primary company fixture should exist');

  const { customer, invoice, payment } = await withSystemRlsContext(prisma, async (tx) => {
    const seededCustomer = await tx.customer.create({
      data: {
        companyId: primary.user.companyId,
        nameTh: 'ลูกค้าทดสอบ Tenant Isolation',
        nameEn: 'Tenant Isolation Customer',
        taxId: `6${uniqueDigits(12)}`,
        branchCode: '00000',
        addressTh: 'Bangkok Test Address',
        email: 'tenant-isolation@example.com',
      },
      select: { id: true },
    });

    const seededInvoice = await tx.invoice.create({
      data: {
        companyId: primary.user.companyId,
        invoiceNumber: `IT-ISO-${Date.now()}`,
        type: 'tax_invoice',
        status: 'draft',
        language: 'th',
        invoiceDate: new Date('2026-04-23T00:00:00.000Z'),
        buyerId: seededCustomer.id,
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
        total: 1070,
        createdBy: primary.user.id,
        items: {
          create: [{
            nameTh: 'Tenant Isolation Item',
            nameEn: 'Tenant Isolation Item',
            quantity: 1,
            unit: 'ชิ้น',
            unitPrice: 1000,
            discount: 0,
            vatType: 'vat7',
            amount: 1000,
            vatAmount: 70,
            totalAmount: 1070,
          }],
        },
      },
      select: { id: true },
    });

    const seededPayment = await tx.payment.create({
      data: {
        id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        invoiceId: seededInvoice.id,
        amount: 300,
        method: 'transfer',
        reference: 'ISO-TEST',
        paidAt: new Date('2026-04-23T00:00:00.000Z'),
        createdBy: primary.user.id,
      },
      select: { id: true },
    });

    return { customer: seededCustomer, invoice: seededInvoice, payment: seededPayment };
  }, { role: 'test' });

  const secondaryAuth = { Authorization: `Bearer ${secondary.token}`, 'Content-Type': 'application/json' };
  const primaryAuth = { Authorization: `Bearer ${primary.token}`, 'Content-Type': 'application/json' };

  const { foreignProduct, foreignUser, foreignTemplate } = await withSystemRlsContext(prisma, async (tx) => {
    const seededProduct = await tx.product.create({
      data: {
        companyId: secondary.user.companyId,
        code: `ISO-${uniqueDigits(6)}`,
        nameTh: 'สินค้าข้ามบริษัท',
        nameEn: 'Cross Tenant Product',
        unit: 'ชิ้น',
        unitPrice: 100,
        vatType: 'vat7',
      },
      select: { id: true },
    });

    const seededUser = await tx.user.create({
      data: {
        companyId: secondary.user.companyId,
        email: `tenant-user-${Date.now()}@example.com`,
        name: 'Tenant Foreign User',
        role: 'viewer',
        isActive: true,
      },
      select: { id: true },
    });

    const seededTemplate = await tx.documentTemplate.create({
      data: {
        companyId: secondary.user.companyId,
        type: 'tax_invoice',
        language: 'th',
        name: `Foreign Template ${Date.now()}`,
        htmlTh: '<div>foreign th</div>',
        htmlEn: '<div>foreign en</div>',
        isActive: false,
      },
      select: { id: true },
    });

    return { foreignProduct: seededProduct, foreignUser: seededUser, foreignTemplate: seededTemplate };
  }, { role: 'test' });

  try {
    const getInvoice = await api(`/api/invoices/${invoice.id}`, {
      headers: { Authorization: `Bearer ${secondary.token}` },
    });
    assert.equal(getInvoice.status, 404);

    const previewInvoice = await api(`/api/invoices/${invoice.id}/preview`, {
      headers: { Authorization: `Bearer ${secondary.token}` },
    });
    assert.equal(previewInvoice.status, 404);

    const listPayments = await api(`/api/invoices/${invoice.id}/payments`, {
      headers: { Authorization: `Bearer ${secondary.token}` },
    });
    assert.equal(listPayments.status, 404);

    const addPayment = await api(`/api/invoices/${invoice.id}/payments`, {
      method: 'POST',
      headers: secondaryAuth,
      body: JSON.stringify({
        amount: 100,
        method: 'transfer',
        reference: 'FOREIGN',
        paidAt: '2026-04-24',
      }),
    });
    assert.equal(addPayment.status, 404);

    const deletePayment = await api(`/api/invoices/${invoice.id}/payments/${payment.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${secondary.token}` },
    });
    assert.equal(deletePayment.status, 404);

    const updateCustomer = await api(`/api/customers/${customer.id}`, {
      method: 'PUT',
      headers: secondaryAuth,
      body: JSON.stringify({ nameTh: 'Should Not Update' }),
    });
    assert.equal(updateCustomer.status, 404);

    const deleteCustomer = await api(`/api/customers/${customer.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${secondary.token}` },
    });
    assert.equal(deleteCustomer.status, 404);

    const deleteInvoice = await api(`/api/invoices/${invoice.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${secondary.token}` },
    });
    assert.equal(deleteInvoice.status, 404);

    const updateForeignProduct = await api(`/api/products/${foreignProduct.id}`, {
      method: 'PUT',
      headers: primaryAuth,
      body: JSON.stringify({ nameTh: 'Should Not Update Product' }),
    });
    assert.equal(updateForeignProduct.status, 404);

    const patchForeignUser = await api(`/api/admin/users/${foreignUser.id}`, {
      method: 'PATCH',
      headers: primaryAuth,
      body: JSON.stringify({ name: 'Should Not Update User' }),
    });
    assert.equal(patchForeignUser.status, 404);

    const patchForeignTemplate = await api(`/api/admin/templates/${foreignTemplate.id}`, {
      method: 'PATCH',
      headers: primaryAuth,
      body: JSON.stringify({ name: 'Should Not Update Template' }),
    });
    assert.ok([403, 404].includes(patchForeignTemplate.status));

    const deleteForeignTemplate = await api(`/api/admin/templates/${foreignTemplate.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${primary.token}` },
    });
    assert.ok([403, 404].includes(deleteForeignTemplate.status));
  } finally {
    await withSystemRlsContext(prisma, async (tx) => {
      await tx.documentTemplate.deleteMany({ where: { id: foreignTemplate.id } });
      await tx.user.deleteMany({ where: { id: foreignUser.id } });
      await tx.product.deleteMany({ where: { id: foreignProduct.id } });
      await tx.payment.deleteMany({ where: { id: payment.id } });
      await tx.invoice.deleteMany({ where: { id: invoice.id } });
      await tx.customer.deleteMany({ where: { id: customer.id } });
      return null;
    }, { role: 'test' });
  }
});

test('tenant RLS: customer routes still work for the owning company', async () => {
  const primary = await login(PRIMARY_ADMIN_EMAIL);
  const authHeaders = {
    Authorization: `Bearer ${primary.token}`,
    'Content-Type': 'application/json',
  };

  const taxIdBase = uniqueDigits(12);
  const customerName = `ลูกค้า RLS Happy Path ${Date.now()}`;
  const seededCustomer = await withSystemRlsContext(prisma, (tx) => tx.customer.create({
    data: {
      companyId: primary.user.companyId,
      nameTh: customerName,
      nameEn: 'RLS Happy Path Customer',
      taxId: `7${taxIdBase}`,
      branchCode: '00000',
      addressTh: 'Bangkok Happy Path Address',
      email: 'rls-happy-path@example.com',
    },
    select: { id: true },
  }), { role: 'test' });

  const customerId = seededCustomer.id;

  try {
    const listCustomers = await api(`/api/customers?search=${encodeURIComponent(customerName)}`, {
      headers: { Authorization: `Bearer ${primary.token}` },
    });
    assert.equal(listCustomers.status, 200);
    assert.equal(
      listCustomers.body.data.some((customer: { id: string }) => customer.id === customerId),
      true,
      'owning company should still see its customer',
    );

    const updateCustomer = await api(`/api/customers/${customerId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ nameTh: 'ลูกค้า RLS Updated' }),
    });
    assert.equal(updateCustomer.status, 200);

    const updatedCustomer = await withSystemRlsContext(prisma, (tx) => tx.customer.findUnique({
      where: { id: customerId },
      select: { nameTh: true, isActive: true },
    }), { role: 'test' });
    assert.equal(updatedCustomer?.nameTh, 'ลูกค้า RLS Updated');
    assert.equal(updatedCustomer?.isActive, true);

    const deleteCustomer = await api(`/api/customers/${customerId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${primary.token}` },
    });
    assert.equal(deleteCustomer.status, 200);

    const deletedCustomer = await withSystemRlsContext(prisma, (tx) => tx.customer.findUnique({
      where: { id: customerId },
      select: { isActive: true },
    }), { role: 'test' });
    assert.equal(deletedCustomer?.isActive, false);
  } finally {
    await withSystemRlsContext(prisma, (tx) => tx.customer.deleteMany({ where: { id: customerId } }), { role: 'test' });
  }
});

test('tenant RLS: product and template routes still work for the owning company', async () => {
  const primary = await login(PRIMARY_ADMIN_EMAIL);
  const authHeaders = {
    Authorization: `Bearer ${primary.token}`,
    'Content-Type': 'application/json',
  };

  const productCode = `RLS-${uniqueDigits(6)}`;
  const productName = `สินค้า RLS ${Date.now()}`;
  const seededProduct = await withSystemRlsContext(prisma, (tx) => tx.product.create({
    data: {
      companyId: primary.user.companyId,
      code: productCode,
      nameTh: productName,
      nameEn: 'RLS Product',
      unit: 'ชิ้น',
      unitPrice: 250,
      vatType: 'vat7',
    },
    select: { id: true },
  }), { role: 'test' });
  const productId = seededProduct.id;

  const templateName = `RLS Template ${Date.now()}`;
  const seededTemplate = await withSystemRlsContext(prisma, (tx) => tx.documentTemplate.create({
    data: {
      companyId: primary.user.companyId,
      name: templateName,
      type: 'tax_invoice',
      language: 'th',
      htmlTh: '<div>rls template th</div>',
      htmlEn: '<div>rls template en</div>',
      isActive: false,
    },
    select: { id: true },
  }), { role: 'test' });
  const templateId = seededTemplate.id;

  try {
    const listProducts = await api(`/api/products?search=${encodeURIComponent(productName)}`, {
      headers: { Authorization: `Bearer ${primary.token}` },
    });
    assert.equal(listProducts.status, 200);
    assert.equal(
      listProducts.body.data.some((product: { id: string }) => product.id === productId),
      true,
      'owning company should still see its product',
    );

    const updateProduct = await api(`/api/products/${productId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ nameTh: `${productName} Updated` }),
    });
    assert.equal(updateProduct.status, 200);

    const updatedProduct = await withSystemRlsContext(prisma, (tx) => tx.product.findUnique({
      where: { id: productId },
      select: { nameTh: true },
    }), { role: 'test' });
    assert.equal(updatedProduct?.nameTh, `${productName} Updated`);

    const listTemplates = await api('/api/admin/templates', {
      headers: { Authorization: `Bearer ${primary.token}` },
    });
    assert.ok([200, 403].includes(listTemplates.status));
    if (listTemplates.status === 200) {
      assert.equal(
        listTemplates.body.data.some((template: { id: string }) => template.id === templateId),
        true,
        'owning company should still see its template',
      );

      const updateTemplate = await api(`/api/admin/templates/${templateId}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ name: `${templateName} Updated` }),
      });
      assert.equal(updateTemplate.status, 200);

      const updatedTemplate = await withSystemRlsContext(prisma, (tx) => tx.documentTemplate.findUnique({
        where: { id: templateId },
        select: { name: true },
      }), { role: 'test' });
      assert.equal(updatedTemplate?.name, `${templateName} Updated`);

      const deleteTemplate = await api(`/api/admin/templates/${templateId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${primary.token}` },
      });
      assert.equal(deleteTemplate.status, 200);

      const deletedTemplate = await withSystemRlsContext(prisma, (tx) => tx.documentTemplate.findUnique({
        where: { id: templateId },
        select: { id: true },
      }), { role: 'test' });
      assert.equal(deletedTemplate, null);
    }
  } finally {
    await withSystemRlsContext(prisma, async (tx) => {
      await tx.documentTemplate.deleteMany({ where: { id: templateId } });
      await tx.product.deleteMany({ where: { id: productId } });
      return null;
    }, { role: 'test' });
  }
});
