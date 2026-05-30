import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuotationPdfData, type QuotationPdfRow } from './quotationPdfService';

test('buildQuotationPdfData forwards quotation template preference from seller snapshot', () => {
  const quotation = {
    id: 'qt-1',
    companyId: 'co-1',
    projectId: null,
    quotationNumber: 'QT-2026-000001',
    status: 'sent',
    language: 'th',
    quotationDate: new Date('2026-05-30T00:00:00Z'),
    validUntil: new Date('2026-06-30T00:00:00Z'),
    buyerId: 'cus-1',
    seller: {
      nameTh: 'บริษัท ตัวอย่าง จำกัด',
      taxId: '0100000000000',
      branchCode: '00000',
      addressTh: 'กรุงเทพมหานคร',
      documentPreferences: { templateId: 'builtin:minimal-sans' },
    },
    subtotal: 1000,
    vatAmount: 70,
    discountAmount: 0,
    total: 1070,
    notes: null,
    paymentTerms: 'ชำระภายใน 30 วัน',
    deliveryTerms: null,
    convertedToInvoiceId: null,
    convertedAt: null,
    pdfUrl: null,
    driveFileId: null,
    driveUrl: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    createdBy: 'usr-1',
    createdAt: new Date('2026-05-30T00:00:00Z'),
    updatedAt: new Date('2026-05-30T00:00:00Z'),
    buyer: {
      id: 'cus-1',
      companyId: 'co-1',
      type: 'juristic',
      partyRole: 'customer',
      nameTh: 'ลูกค้าตัวอย่าง',
      nameEn: null,
      taxId: '0200000000000',
      branchCode: '00000',
      branchNameTh: null,
      branchNameEn: null,
      addressTh: 'กรุงเทพมหานคร',
      addressEn: null,
      phone: null,
      email: null,
      website: null,
      contactPerson: null,
      creditLimit: null,
      creditDays: null,
      createdAt: new Date('2026-05-30T00:00:00Z'),
      updatedAt: new Date('2026-05-30T00:00:00Z'),
    },
    items: [{
      id: 'qti-1',
      quotationId: 'qt-1',
      productId: null,
      nameTh: 'ค่าบริการ',
      nameEn: null,
      descriptionTh: null,
      descriptionEn: null,
      quantity: 1,
      unit: 'รายการ',
      unitPrice: 1000,
      discountAmount: 0,
      vatType: 'vat7',
      amount: 1000,
      vatAmount: 70,
      totalAmount: 1070,
    }],
  } as unknown as QuotationPdfRow;

  const pdfData = buildQuotationPdfData(quotation);

  assert.equal(pdfData.type, 'quotation');
  assert.equal(pdfData.templateId, 'builtin:minimal-sans');
  assert.equal(pdfData.documentMode, 'ordinary');
});
