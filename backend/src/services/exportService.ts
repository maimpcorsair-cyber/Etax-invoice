import ExcelJS from 'exceljs';
import { logger } from '../config/logger';

interface InvoiceRow {
  invoiceNumber: string;
  invoiceDate: Date;
  buyerNameTh: string;
  buyerNameEn?: string | null;
  buyerTaxId: string;
  type: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  status: string;
  rdSubmissionStatus?: string | null;
  rdDocId?: string | null;
  notes?: string | null;
}

const TYPE_LABEL_TH: Record<string, string> = {
  tax_invoice: 'ใบกำกับภาษี',
  receipt: 'ใบเสร็จรับเงิน',
  credit_note: 'ใบลดหนี้',
  debit_note: 'ใบเพิ่มหนี้',
};

const TYPE_LABEL_EN: Record<string, string> = {
  tax_invoice: 'Tax Invoice',
  receipt: 'Receipt',
  credit_note: 'Credit Note',
  debit_note: 'Debit Note',
};

const STATUS_LABEL_TH: Record<string, string> = {
  draft: 'ร่าง',
  pending: 'รอดำเนินการ',
  approved: 'อนุมัติแล้ว',
  submitted: 'ส่งแล้ว',
  rejected: 'ถูกปฏิเสธ',
  cancelled: 'ยกเลิก',
};

const STATUS_LABEL_EN: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  submitted: 'Submitted',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const RD_STATUS_LABEL_TH: Record<string, string> = {
  pending: 'รอส่ง',
  in_progress: 'กำลังส่ง',
  success: 'สำเร็จ',
  failed: 'ล้มเหลว',
  retrying: 'กำลังลองใหม่',
};

function formatDateTh(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear() + 543}`;
}

function formatDateEn(date: Date): string {
  return date.toLocaleDateString('en-GB');
}

function addWorksheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number>>,
) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  for (let i = 1; i <= headers.length; i += 1) {
    const column = sheet.getColumn(i);
    const headerLength = headers[i - 1]?.length ?? 10;
    let maxLength = headerLength;

    column.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value == null ? '' : String(cell.value);
      maxLength = Math.max(maxLength, value.length);
    });

    column.width = Math.min(Math.max(maxLength + 2, 12), 40);
  }

  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true };
    if (rowNumber > 1 && rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      });
    }
  });

  return sheet;
}

export async function generateInvoiceExcel(invoices: InvoiceRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'e-Tax Invoice System';
  workbook.created = new Date();

  const thHeaders = [
    'เลขที่ใบกำกับภาษี',
    'วันที่',
    'ประเภทเอกสาร',
    'ชื่อลูกค้า (ไทย)',
    'ชื่อลูกค้า (อังกฤษ)',
    'เลขผู้เสียภาษีลูกค้า',
    'ยอดก่อน VAT (บาท)',
    'VAT (บาท)',
    'ยอดรวมสุทธิ (บาท)',
    'สถานะ',
    'สถานะ RD',
    'รหัสเอกสาร RD',
    'หมายเหตุ',
  ];

  const thRows = invoices.map((inv) => [
    inv.invoiceNumber,
    formatDateTh(inv.invoiceDate),
    TYPE_LABEL_TH[inv.type] ?? inv.type,
    inv.buyerNameTh,
    inv.buyerNameEn ?? '',
    inv.buyerTaxId,
    inv.subtotal,
    inv.vatAmount,
    inv.total,
    STATUS_LABEL_TH[inv.status] ?? inv.status,
    inv.rdSubmissionStatus ? (RD_STATUS_LABEL_TH[inv.rdSubmissionStatus] ?? inv.rdSubmissionStatus) : '',
    inv.rdDocId ?? '',
    inv.notes ?? '',
  ]);

  const wsTh = addWorksheet(workbook, 'ภาษาไทย', thHeaders, thRows);

  const enHeaders = [
    'Invoice No.',
    'Date',
    'Document Type',
    'Customer Name (TH)',
    'Customer Name (EN)',
    'Customer Tax ID',
    'Subtotal (THB)',
    'VAT (THB)',
    'Grand Total (THB)',
    'Status',
    'RD Status',
    'RD Doc ID',
    'Notes',
  ];

  const enRows = invoices.map((inv) => [
    inv.invoiceNumber,
    formatDateEn(inv.invoiceDate),
    TYPE_LABEL_EN[inv.type] ?? inv.type,
    inv.buyerNameTh,
    inv.buyerNameEn ?? '',
    inv.buyerTaxId,
    inv.subtotal,
    inv.vatAmount,
    inv.total,
    STATUS_LABEL_EN[inv.status] ?? inv.status,
    inv.rdSubmissionStatus ?? '',
    inv.rdDocId ?? '',
    inv.notes ?? '',
  ]);

  const wsEn = addWorksheet(workbook, 'English', enHeaders, enRows);

  for (const sheet of [wsTh, wsEn]) {
    for (const key of ['G', 'H', 'I']) {
      sheet.getColumn(key).numFmt = '#,##0.00';
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  logger.info(`Excel export generated: ${invoices.length} rows`);
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

export async function generateCustomerExcel(customers: {
  nameTh: string;
  nameEn?: string | null;
  taxId: string;
  branchCode: string;
  addressTh: string;
  addressEn?: string | null;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
}[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'e-Tax Invoice System';
  workbook.created = new Date();

  const headers = [
    'ชื่อ (ไทย) / Name (TH)',
    'ชื่อ (อังกฤษ) / Name (EN)',
    'เลขผู้เสียภาษี / Tax ID',
    'สาขา / Branch',
    'ที่อยู่ไทย / Thai Address',
    'ที่อยู่อังกฤษ / English Address',
    'อีเมล / Email',
    'โทร / Phone',
    'สถานะ / Status',
  ];

  const rows = customers.map((customer) => [
    customer.nameTh,
    customer.nameEn ?? '',
    customer.taxId,
    customer.branchCode,
    customer.addressTh,
    customer.addressEn ?? '',
    customer.email ?? '',
    customer.phone ?? '',
    customer.isActive ? 'Active / ใช้งาน' : 'Inactive / ไม่ใช้งาน',
  ]);

  addWorksheet(workbook, 'Customers', headers, rows);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

export async function generateCustomerStatementExcel(params: {
  customerNameTh: string;
  customerNameEn?: string | null;
  generatedAt: Date;
  summary: {
    totalOutstanding: number;
    overdueOutstanding: number;
    currentOutstanding: number;
    totalBilled: number;
    totalCredits: number;
    totalReceived: number;
  };
  aging: {
    current: number;
    days1To30: number;
    days31To60: number;
    days61To90: number;
    days90Plus: number;
  };
  entries: Array<{
    invoiceNumber: string;
    type: string;
    status: string;
    invoiceDate: Date;
    dueDate?: Date | null;
    signedTotal: number;
    paidAmount: number;
    outstandingAmount: number;
    runningBalance: number;
    ageDays: number;
  }>;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'e-Tax Invoice System';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Statement Summary');
  summarySheet.addRow(['Customer (TH)', params.customerNameTh]);
  summarySheet.addRow(['Customer (EN)', params.customerNameEn ?? '']);
  summarySheet.addRow(['Generated At', formatDateEn(params.generatedAt)]);
  summarySheet.addRow([]);
  summarySheet.addRow(['Metric', 'Amount (THB)']);
  summarySheet.addRow(['Total Outstanding', params.summary.totalOutstanding]);
  summarySheet.addRow(['Overdue Outstanding', params.summary.overdueOutstanding]);
  summarySheet.addRow(['Current Outstanding', params.summary.currentOutstanding]);
  summarySheet.addRow(['Total Billed', params.summary.totalBilled]);
  summarySheet.addRow(['Total Credits', params.summary.totalCredits]);
  summarySheet.addRow(['Total Received', params.summary.totalReceived]);
  summarySheet.addRow([]);
  summarySheet.addRow(['Aging Bucket', 'Amount (THB)']);
  summarySheet.addRow(['Current', params.aging.current]);
  summarySheet.addRow(['1-30', params.aging.days1To30]);
  summarySheet.addRow(['31-60', params.aging.days31To60]);
  summarySheet.addRow(['61-90', params.aging.days61To90]);
  summarySheet.addRow(['90+', params.aging.days90Plus]);
  summarySheet.getColumn(1).width = 24;
  summarySheet.getColumn(2).width = 18;
  summarySheet.getColumn(2).numFmt = '#,##0.00';

  for (const rowNumber of [5, 12]) {
    const row = summarySheet.getRow(rowNumber);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1D4ED8' },
    };
  }

  const entryHeaders = [
    'Invoice No.',
    'Type',
    'Status',
    'Invoice Date',
    'Due Date',
    'Document Amount',
    'Paid',
    'Outstanding',
    'Running Balance',
    'Age (days)',
  ];
  const entryRows = params.entries.map((entry) => [
    entry.invoiceNumber,
    TYPE_LABEL_EN[entry.type] ?? entry.type,
    STATUS_LABEL_EN[entry.status] ?? entry.status,
    formatDateEn(entry.invoiceDate),
    entry.dueDate ? formatDateEn(entry.dueDate) : '',
    entry.signedTotal,
    entry.paidAmount,
    entry.outstandingAmount,
    entry.runningBalance,
    entry.ageDays,
  ]);
  const entriesSheet = addWorksheet(workbook, 'Statement Entries', entryHeaders, entryRows);
  for (const key of ['F', 'G', 'H', 'I']) {
    entriesSheet.getColumn(key).numFmt = '#,##0.00';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
