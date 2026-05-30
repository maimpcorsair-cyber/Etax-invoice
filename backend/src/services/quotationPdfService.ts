import type { Customer, Quotation, QuotationItem } from '@prisma/client';
import type { PdfInvoiceData } from './pdfService';

export type QuotationPdfRow = Quotation & {
  buyer: Customer;
  items: QuotationItem[];
};

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringField(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function optionalStringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

type ServiceMilestone = {
  title: string;
  amount: number;
  dueDate?: string | null;
  note?: string | null;
};

function serviceDetailsNotes(value: unknown): string[] {
  const details = objectRecord(value);
  const milestones = Array.isArray(details.milestones)
    ? details.milestones.filter((item): item is ServiceMilestone => {
      const row = objectRecord(item);
      return typeof row.title === 'string' && typeof row.amount === 'number';
    })
    : [];
  const lines = [
    optionalStringField(details.scope) ? `ขอบเขตงาน: ${String(details.scope).trim()}` : null,
    optionalStringField(details.deliverables) ? `สิ่งส่งมอบ: ${String(details.deliverables).trim()}` : null,
    optionalStringField(details.exclusions) ? `สิ่งที่ไม่รวมในราคา: ${String(details.exclusions).trim()}` : null,
    optionalStringField(details.duration) ? `ระยะเวลาดำเนินงาน: ${String(details.duration).trim()}` : null,
    optionalStringField(details.warranty) ? `การรับประกัน: ${String(details.warranty).trim()}` : null,
    typeof details.depositPercent === 'number' ? `มัดจำก่อนเริ่มงาน: ${details.depositPercent}%` : null,
    typeof details.revisionRounds === 'number' ? `แก้ไขงานได้: ${details.revisionRounds} รอบ` : null,
    optionalStringField(details.revisionTerms) ? `เงื่อนไขแก้ไขงาน: ${String(details.revisionTerms).trim()}` : null,
    optionalStringField(details.contractDuration) ? `ระยะสัญญา: ${String(details.contractDuration).trim()}` : null,
    optionalStringField(details.billingCycle) ? `รอบเรียกเก็บเงิน: ${String(details.billingCycle).trim()}` : null,
    optionalStringField(details.sla) ? `ระดับการให้บริการ (SLA): ${String(details.sla).trim()}` : null,
    optionalStringField(details.cancellationTerms) ? `เงื่อนไขยกเลิก: ${String(details.cancellationTerms).trim()}` : null,
    typeof details.securityDeposit === 'number' && details.securityDeposit > 0
      ? `เงินประกัน: ${details.securityDeposit.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`
      : null,
    milestones.length > 0 ? 'งวดงาน:' : null,
    ...milestones.map((milestone, index) => {
      const due = milestone.dueDate ? ` | กำหนด ${milestone.dueDate}` : '';
      const note = milestone.note ? ` | ${milestone.note}` : '';
      return `${index + 1}. ${milestone.title}: ${milestone.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท${due}${note}`;
    }),
  ];
  return lines.filter((line): line is string => Boolean(line));
}

function boqSummaryNotes(items: QuotationItem[]): string[] {
  const sections = new Map<string, number>();
  for (const item of items) {
    const title = item.sectionTitle?.trim();
    if (!title) continue;
    sections.set(title, (sections.get(title) ?? 0) + item.amount);
  }
  if (sections.size === 0) return [];
  return [
    'สรุป BOQ ตามหมวดงาน (ก่อน VAT):',
    ...[...sections.entries()].map(([title, total]) => `${title}: ${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`),
  ];
}

export function buildQuotationPdfData(quotation: QuotationPdfRow): PdfInvoiceData {
  const seller = objectRecord(quotation.seller);
  const documentPreferences = objectRecord(seller.documentPreferences);
  const notes = [
    ...(quotation.kind !== 'general' ? serviceDetailsNotes(quotation.serviceDetails) : []),
    ...(quotation.kind === 'boq_contract' ? boqSummaryNotes(quotation.items) : []),
    quotation.notes,
    quotation.deliveryTerms ? `เงื่อนไขการส่งของ: ${quotation.deliveryTerms}` : null,
  ].filter(Boolean).join('\n');

  return {
    invoiceNumber: quotation.quotationNumber,
    invoiceDate: quotation.quotationDate,
    dueDate: quotation.validUntil,
    type: 'quotation',
    language: quotation.language === 'en' || quotation.language === 'both' ? quotation.language : 'th',
    seller: {
      nameTh: stringField(seller.nameTh, '-'),
      nameEn: optionalStringField(seller.nameEn),
      taxId: stringField(seller.taxId, '-'),
      branchCode: stringField(seller.branchCode, '00000'),
      branchNameTh: optionalStringField(seller.branchNameTh),
      addressTh: stringField(seller.addressTh, '-'),
      addressEn: optionalStringField(seller.addressEn),
      phone: optionalStringField(seller.phone),
      email: optionalStringField(seller.email),
      website: optionalStringField(seller.website),
      logoUrl: optionalStringField(seller.logoUrl),
    },
    buyer: {
      nameTh: quotation.buyer.nameTh,
      nameEn: quotation.buyer.nameEn,
      taxId: quotation.buyer.taxId,
      branchCode: quotation.buyer.branchCode ?? '00000',
      addressTh: quotation.buyer.addressTh ?? '-',
      addressEn: quotation.buyer.addressEn,
    },
    items: quotation.items.map((item) => ({
      nameTh: item.sectionTitle ? `${item.sectionTitle} — ${item.nameTh}` : item.nameTh,
      nameEn: item.sectionTitle ? `${item.sectionTitle} — ${item.nameEn ?? item.nameTh}` : item.nameEn,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      vatType: item.vatType,
      amount: item.amount,
      vatAmount: item.vatAmount,
      totalAmount: item.totalAmount,
    })),
    subtotal: quotation.subtotal,
    vatAmount: quotation.vatAmount,
    discountAmount: quotation.discountAmount,
    total: quotation.total,
    notes: notes || null,
    paymentMethod: quotation.paymentTerms,
    templateId: optionalStringField(documentPreferences.templateId),
    templateName: optionalStringField(documentPreferences.templateName),
    showCompanyLogo: true,
    documentMode: 'ordinary',
  };
}
