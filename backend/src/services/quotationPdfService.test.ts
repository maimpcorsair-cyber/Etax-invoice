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
    kind: 'service_project',
    serviceDetails: {
      scope: 'ออกแบบเว็บไซต์บริษัท',
      duration: '30 วันหลังได้รับมัดจำ',
      depositPercent: 50,
      revisionRounds: 2,
      revisionTerms: 'เกินจำนวนรอบคิดเพิ่มตามจริง',
      milestones: [{ title: 'ส่งแบบร่าง', amount: 535, dueDate: '2026-06-15', note: null }],
    },
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
  assert.match(pdfData.notes ?? '', /ขอบเขตงาน: ออกแบบเว็บไซต์บริษัท/);
  assert.match(pdfData.notes ?? '', /งวดงาน:/);
});

test('buildQuotationPdfData renders BOQ section subtotals and structured terms', () => {
  const quotation = {
    id: 'qt-boq',
    companyId: 'co-1',
    projectId: null,
    quotationNumber: 'QT-2026-000002',
    status: 'draft',
    language: 'th',
    kind: 'boq_contract',
    serviceDetails: {
      deliverables: 'ติดตั้งระบบไฟพร้อมทดสอบ',
      exclusions: 'ไม่รวมงานแก้ผนัง',
      warranty: 'รับประกันงานติดตั้ง 1 ปี',
    },
    quotationDate: new Date('2026-05-30T00:00:00Z'),
    validUntil: null,
    buyerId: 'cus-1',
    seller: { nameTh: 'บริษัท ตัวอย่าง จำกัด', taxId: '0100000000000', addressTh: 'กรุงเทพมหานคร' },
    subtotal: 1500,
    vatAmount: 105,
    discountAmount: 0,
    total: 1605,
    notes: null,
    paymentTerms: null,
    deliveryTerms: null,
    buyer: {
      nameTh: 'ลูกค้าตัวอย่าง',
      nameEn: null,
      taxId: '0200000000000',
      branchCode: '00000',
      addressTh: 'กรุงเทพมหานคร',
    },
    items: [
      { sectionTitle: 'งานไฟฟ้า', nameTh: 'สายไฟ', nameEn: null, quantity: 1, unit: 'ชุด', unitPrice: 1000, discountAmount: 0, vatType: 'vat7', amount: 1000, vatAmount: 70, totalAmount: 1070 },
      { sectionTitle: 'ค่าแรง', nameTh: 'ติดตั้ง', nameEn: null, quantity: 1, unit: 'งาน', unitPrice: 500, discountAmount: 0, vatType: 'vat7', amount: 500, vatAmount: 35, totalAmount: 535 },
    ],
  } as unknown as QuotationPdfRow;

  const pdfData = buildQuotationPdfData(quotation);

  assert.match(pdfData.notes ?? '', /สิ่งส่งมอบ: ติดตั้งระบบไฟพร้อมทดสอบ/);
  assert.match(pdfData.notes ?? '', /การรับประกัน: รับประกันงานติดตั้ง 1 ปี/);
  assert.match(pdfData.notes ?? '', /สรุป BOQ ตามหมวดงาน \(ก่อน VAT\):/);
  assert.match(pdfData.notes ?? '', /งานไฟฟ้า: 1,000.00 บาท/);
  assert.equal(pdfData.items[0].nameTh, 'งานไฟฟ้า — สายไฟ');
});
