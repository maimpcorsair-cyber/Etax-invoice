import { google } from 'googleapis';
import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { logger } from '../config/logger';
import {
  buildGoogleServiceAccountAuth,
  buildOAuth2Client,
  isDriveServiceAccountConfigured,
  isUserDriveOAuthConfigured,
} from './googleDriveService';

interface InvoiceSheetRow {
  invoiceNumber: string;
  invoiceDate: Date;
  type: string;
  buyerNameTh: string;
  buyerNameEn?: string | null;
  buyerTaxId: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  status: string;
  rdSubmissionStatus?: string | null;
  rdDocId?: string | null;
}

function getAuth() {
  return buildGoogleServiceAccountAuth(['https://www.googleapis.com/auth/spreadsheets']);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB');
}

const TYPE_EN: Record<string, string> = {
  tax_invoice: 'Tax Invoice',
  receipt: 'Receipt',
  credit_note: 'Credit Note',
  debit_note: 'Debit Note',
};

function isGooglePermissionError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : '';
  return code === '403' || /permission|forbidden|caller does not have permission/i.test(message);
}

/**
 * Creates a new Google Spreadsheet with bilingual invoice data.
 * Returns the spreadsheet URL.
 */
export async function exportInvoicesToSheets(
  invoices: InvoiceSheetRow[],
  companyName: string,
): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  const title = `${companyName} - Invoice Export ${new Date().toISOString().split('T')[0]}`;

  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [
        { properties: { title: 'ภาษาไทย', sheetId: 0 } },
        { properties: { title: 'English', sheetId: 1 } },
      ],
    },
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId!;

  const thHeaders = [
    'เลขที่ใบกำกับภาษี', 'วันที่', 'ประเภท', 'ชื่อลูกค้า (ไทย)', 'ชื่อลูกค้า (EN)',
    'เลขผู้เสียภาษี', 'ยอดก่อน VAT', 'VAT', 'ยอดรวม', 'สถานะ', 'สถานะ RD', 'รหัส RD',
  ];

  const enHeaders = [
    'Invoice No.', 'Date', 'Type', 'Customer (TH)', 'Customer (EN)',
    'Tax ID', 'Subtotal (THB)', 'VAT (THB)', 'Total (THB)', 'Status', 'RD Status', 'RD Doc ID',
  ];

  const STATUS_TH: Record<string, string> = {
    draft: 'ร่าง', pending: 'รอ', approved: 'อนุมัติ',
    submitted: 'ส่งแล้ว', rejected: 'ปฏิเสธ', cancelled: 'ยกเลิก',
  };

  const thRows = invoices.map((inv) => [
    inv.invoiceNumber,
    formatDate(inv.invoiceDate),
    TYPE_EN[inv.type] ?? inv.type,
    inv.buyerNameTh,
    inv.buyerNameEn ?? '',
    inv.buyerTaxId,
    inv.subtotal,
    inv.vatAmount,
    inv.total,
    STATUS_TH[inv.status] ?? inv.status,
    inv.rdSubmissionStatus ?? '',
    inv.rdDocId ?? '',
  ]);

  const enRows = invoices.map((inv) => [
    inv.invoiceNumber,
    formatDate(inv.invoiceDate),
    TYPE_EN[inv.type] ?? inv.type,
    inv.buyerNameTh,
    inv.buyerNameEn ?? '',
    inv.buyerTaxId,
    inv.subtotal,
    inv.vatAmount,
    inv.total,
    inv.status,
    inv.rdSubmissionStatus ?? '',
    inv.rdDocId ?? '',
  ]);

  // Write both sheets in parallel
  await Promise.all([
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'ภาษาไทย!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [thHeaders, ...thRows] },
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'English!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [enHeaders, ...enRows] },
    }),
  ]);

  // Format: bold headers + freeze first row for both sheets
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [0, 1].flatMap((sheetId) => [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.114, green: 0.306, blue: 0.847 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
      ]),
    },
  });

  // Make it readable by anyone with the link (view only)
  try {
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  } catch {
    logger.warn('Could not set spreadsheet permissions — sharing with anyone failed');
  }

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  logger.info(`Google Sheets export created: ${url} (${invoices.length} rows)`);
  return url;
}

export interface ExpenseSheetRow {
  voucherNumber: string;
  voucherDate: Date;
  description?: string | null;
  totalAmount: number;
  status: string;
  itemCount: number;
  // item-level (flattened for first item, or summary)
  vendorName?: string | null;
  vendorTaxId?: string | null;
  whtAmount?: number | null;
  netAmount?: number | null;
}

function getAuthWithDrive(userRefreshToken?: string | null) {
  if (userRefreshToken && isUserDriveOAuthConfigured()) {
    const oauthClient = buildOAuth2Client();
    oauthClient.setCredentials({ refresh_token: userRefreshToken });
    return oauthClient;
  }
  return buildGoogleServiceAccountAuth([
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
  ]);
}

export function isSheetsConfigured(): boolean {
  return isDriveServiceAccountConfigured();
}

/**
 * Export expense vouchers to a new Google Sheet.
 * Returns the spreadsheet URL.
 */
export async function exportExpensesToSheets(
  expenses: ExpenseSheetRow[],
  companyName: string,
  dateRange: { from?: string; to?: string },
): Promise<string> {
  const auth = getAuthWithDrive();
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  const label = [dateRange.from, dateRange.to].filter(Boolean).join(' → ') || new Date().toISOString().split('T')[0];
  const title = `${companyName} - Expenses ${label}`;

  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [
        { properties: { title: 'ค่าใช้จ่าย (TH)', sheetId: 0 } },
        { properties: { title: 'Expenses (EN)', sheetId: 1 } },
      ],
    },
  });

  const id = spreadsheet.data.spreadsheetId!;

  const STATUS_TH: Record<string, string> = {
    draft: 'ร่าง',
    submitted: 'ส่งอนุมัติแล้ว',
    approved: 'อนุมัติแล้ว',
    rejected: 'ถูกปฏิเสธ',
  };

  const thHeaders = [
    'เลขที่ใบสำคัญ', 'วันที่', 'รายละเอียด', 'รายการ', 'ผู้ขาย', 'เลขผู้เสียภาษี',
    'ยอดรวม (฿)', 'ภาษีหัก ณ ที่จ่าย (฿)', 'ยอดสุทธิ (฿)', 'สถานะ',
  ];
  const enHeaders = [
    'Voucher No.', 'Date', 'Description', 'Items', 'Vendor', 'Vendor Tax ID',
    'Total (THB)', 'WHT (THB)', 'Net (THB)', 'Status',
  ];

  const rows = expenses.map((e) => [
    e.voucherNumber,
    e.voucherDate instanceof Date ? e.voucherDate.toLocaleDateString('en-GB') : String(e.voucherDate),
    e.description ?? '',
    e.itemCount,
    e.vendorName ?? '',
    e.vendorTaxId ?? '',
    e.totalAmount,
    e.whtAmount ?? '',
    e.netAmount ?? '',
    e.status,
  ]);

  const thRows = rows.map((r) => {
    const copy = [...r];
    copy[9] = STATUS_TH[String(copy[9])] ?? String(copy[9]);
    return copy;
  });

  await Promise.all([
    sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: 'ค่าใช้จ่าย (TH)!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [thHeaders, ...thRows] },
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: 'Expenses (EN)!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [enHeaders, ...rows] },
    }),
  ]);

  // Bold header + freeze + column auto-resize for both sheets
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: [0, 1].flatMap((sheetId) => [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.059, green: 0.463, blue: 0.369 }, // emerald-700
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 10 },
          },
        },
      ]),
    },
  });

  try {
    await drive.permissions.create({
      fileId: id,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  } catch {
    logger.warn('Could not set expense sheet permissions to anyone-reader');
  }

  const url = `https://docs.google.com/spreadsheets/d/${id}`;
  logger.info(`Expense Sheets export created: ${url} (${expenses.length} rows)`);
  return url;
}

export interface ProjectSheetsInput {
  project: {
    code: string;
    name: string;
    customerName?: string | null;
    budgetAmount: number;
    status: string;
    ownerName?: string | null;
    approverName?: string | null;
    driveFolderId?: string | null;
    googleSheetId?: string | null;
  };
  sharedWithEmails?: Array<string | null | undefined>;
  summary: Record<string, string | number>;
  actionNeeded: Array<{ severity: string; type: string; title: string; message: string }>;
  files: Array<{ fileName: string; source: string; kind: string; status: string; taxSafetyStatus?: string; taxSafetyMessage?: string; mimeType: string; fileSize: number; createdAt: Date | string; driveSyncStatus?: string | null; driveUrl?: string | null; driveFolderUrl?: string | null }>;
  purchaseOrders: Array<{ poNumber: string; documentType: string; vendorName?: string | null; vendorTaxId?: string | null; issueDate?: Date | string | null; total?: number | null; status: string; matchedPurchaseCount: number; matchedPaymentCount: number; missing: string[] }>;
  purchases: Array<{ supplierName: string; supplierTaxId: string; invoiceNumber: string; invoiceDate: Date | string; vatType: string; subtotal: number; vatAmount: number; total: number; taxSafetyStatus?: string; taxSafetyMessage?: string; isPaid: boolean; attachmentUrl?: string | null }>;
  sales: Array<{ invoiceNumber: string; buyerName: string; type: string; status: string; invoiceDate: Date | string; subtotal: number; vatAmount: number; total: number; isPaid: boolean }>;
  expenses: Array<{ voucherNumber: string; status: string; voucherDate: Date | string; description: string; totalAmount: number; attachmentUrl?: string | null }>;
  lineGroups: Array<{ groupName: string; linkedAt: Date | string }>;
  userRefreshToken?: string | null;
}

function asProjectSheetDate(value: Date | string) {
  return value instanceof Date ? formatDate(value) : value;
}

function projectSheetLinkFormula(url?: string | null, label = 'Open') {
  return url ? `=HYPERLINK("${String(url).replace(/"/g, '""')}","${label}")` : '';
}

function projectWorkbookValues(input: ProjectSheetsInput) {
  const overviewRows = [
    ['Project code', input.project.code],
    ['Project name', input.project.name],
    ['Customer / site', input.project.customerName ?? ''],
    ['Status', input.project.status],
    ['Owner', input.project.ownerName ?? ''],
    ['Approver', input.project.approverName ?? ''],
    ['Budget', input.project.budgetAmount],
    ...Object.entries(input.summary).map(([key, value]) => [key, value]),
  ];

  return {
    Workflow: [
      ['Step', 'What to record', 'Required evidence', 'Where it appears'],
      ['1. Collect', 'Upload PDF/JPG, LINE files, PO, slips, and receipts into this project', 'Original file link in Google Drive', 'Files'],
      ['2. Classify', 'Mark each document as tax invoice, receipt, payment proof, PO, delivery note, or supporting document', 'Reviewer note and Drive link', 'Action Needed / Files'],
      ['3. Input VAT', 'Confirm valid purchase tax invoices and receipts', 'Tax invoice PDF/JPG link', 'Purchases'],
      ['4. PO 3-way', 'Match PO, supplier invoice, and payment slip', 'PO link, invoice link, payment proof link', 'PO 3-way'],
      ['5. Sales VAT', 'Issue project-related sales invoices', 'Invoice PDF/XML from Billboy', 'Sales'],
      ['6. Expense claim', 'Record small expenses or no-tax documents as Payment Voucher', 'Receipt/photo/chat/map evidence link', 'Expenses'],
      ['7. Audit / filing', 'Review totals, missing documents, and links before filing VAT or closing project', 'Every row should have an attachment/evidence link where possible', 'Overview / Action Needed'],
    ],
    Overview: [['Metric', 'Value'], ...overviewRows],
    'Action Needed': [['Severity', 'Type', 'Title', 'Message', 'Next action'], ...input.actionNeeded.map((item) => [item.severity, item.type, item.title, item.message, 'Review in Billboy project workspace'])],
    Files: [['File name', 'Source', 'Kind', 'Status', 'Tax safety', 'Tax note', 'Drive sync', 'Open file', 'Open folder', 'MIME type', 'Size bytes', 'Created at'], ...input.files.map((item) => [item.fileName, item.source, item.kind, item.status, item.taxSafetyStatus ?? '', item.taxSafetyMessage ?? '', item.driveSyncStatus ?? '', projectSheetLinkFormula(item.driveUrl), projectSheetLinkFormula(item.driveFolderUrl, 'Folder'), item.mimeType, item.fileSize, asProjectSheetDate(item.createdAt)])],
    Purchases: [['Supplier', 'Supplier tax ID', 'Invoice no.', 'Invoice date', 'VAT type', 'Subtotal', 'VAT', 'Total', 'Tax safety', 'Tax note', 'Paid', 'Attachment'], ...input.purchases.map((item) => [item.supplierName, item.supplierTaxId, item.invoiceNumber, asProjectSheetDate(item.invoiceDate), item.vatType, item.subtotal, item.vatAmount, item.total, item.taxSafetyStatus ?? '', item.taxSafetyMessage ?? '', item.isPaid ? 'Yes' : 'No', projectSheetLinkFormula(item.attachmentUrl)])],
    'PO 3-way': [['PO no.', 'Document type', 'Vendor', 'Vendor tax ID', 'Issue date', 'Total', 'Status', 'Matched purchases', 'Matched payments', 'Missing'], ...input.purchaseOrders.map((item) => [item.poNumber, item.documentType, item.vendorName ?? '', item.vendorTaxId ?? '', item.issueDate ? asProjectSheetDate(item.issueDate) : '', item.total ?? '', item.status, item.matchedPurchaseCount, item.matchedPaymentCount, item.missing.join(', ')])],
    Sales: [['Invoice no.', 'Buyer', 'Type', 'Status', 'Invoice date', 'Subtotal', 'VAT', 'Total', 'Paid'], ...input.sales.map((item) => [item.invoiceNumber, item.buyerName, item.type, item.status, asProjectSheetDate(item.invoiceDate), item.subtotal, item.vatAmount, item.total, item.isPaid ? 'Yes' : 'No'])],
    Expenses: [['Voucher no.', 'Status', 'Voucher date', 'Description', 'Total', 'Attachment'], ...input.expenses.map((item) => [item.voucherNumber, item.status, asProjectSheetDate(item.voucherDate), item.description, item.totalAmount, projectSheetLinkFormula(item.attachmentUrl)])],
    'LINE Groups': [['Group name', 'Linked at'], ...input.lineGroups.map((item) => [item.groupName, asProjectSheetDate(item.linkedAt)])],
  };
}

function hyperlinkCellValue(value: string) {
  const match = value.match(/^=HYPERLINK\("((?:[^"]|"")*)","((?:[^"]|"")*)"\)$/);
  if (!match) return value;
  return {
    text: match[2].replace(/""/g, '"'),
    hyperlink: match[1].replace(/""/g, '"'),
  };
}

async function uploadProjectWorkbookViaDrive(input: ProjectSheetsInput, title: string) {
  const auth = getAuthWithDrive(input.userRefreshToken);
  const drive = google.drive({ version: 'v3', auth });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Billboy';
  workbook.created = new Date();
  workbook.modified = new Date();

  const valuesBySheet = projectWorkbookValues(input);
  Object.entries(valuesBySheet).forEach(([sheetName, rows]) => {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    rows.forEach((row) => {
      sheet.addRow(row.map((value) => (typeof value === 'string' ? hyperlinkCellValue(value) : value)));
    });
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    sheet.columns.forEach((column) => {
      let maxLength = 12;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const raw = typeof cell.value === 'object' && cell.value && 'text' in cell.value
          ? String(cell.value.text)
          : String(cell.value ?? '');
        maxLength = Math.max(maxLength, Math.min(raw.length + 2, 48));
      });
      column.width = maxLength;
    });
  });

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const created = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      ...(input.project.driveFolderId ? { parents: [input.project.driveFolderId] } : {}),
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: Readable.from(buffer),
    },
    fields: 'id,webViewLink',
  });

  const id = created.data.id!;
  const shareTargets = Array.from(new Set(
    (input.sharedWithEmails ?? [])
      .map((email) => email?.trim().toLowerCase())
      .filter((email): email is string => !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
  ));
  await Promise.all(shareTargets.map(async (email) => {
    try {
      await drive.permissions.create({
        fileId: id,
        requestBody: { role: 'writer', type: 'user', emailAddress: email },
        sendNotificationEmail: false,
      });
    } catch (err) {
      logger.warn('Could not share project sheet fallback workbook with user', { error: err, email });
    }
  }));

  const url = created.data.webViewLink ?? `https://docs.google.com/spreadsheets/d/${id}`;
  logger.info(`Project Sheets workbook uploaded via Drive conversion: ${url} (${input.project.code})`);
  return { spreadsheetId: id, url, created: true };
}

export async function exportProjectToSheets(input: ProjectSheetsInput): Promise<{ spreadsheetId: string; url: string; created: boolean }> {
  const auth = getAuthWithDrive(input.userRefreshToken);
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });
  const title = `${input.project.code} ${input.project.name} - Billboy Project Workbook`;
  const sheetTitles = ['Workflow', 'Overview', 'Action Needed', 'Files', 'PO 3-way', 'Purchases', 'Sales', 'Expenses', 'LINE Groups'];
  let id = input.project.googleSheetId ?? '';
  let created = false;

  if (process.env.PROJECT_SHEETS_USE_DRIVE_UPLOAD !== 'false') {
    return uploadProjectWorkbookViaDrive(input, title);
  }

  if (id) {
    try {
      await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'spreadsheetId' });
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: id,
        requestBody: {
          requests: [{
            updateSpreadsheetProperties: {
              properties: { title },
              fields: 'title',
            },
          }],
        },
      });
    } catch (err) {
      logger.warn('Existing project workbook is not writable; creating a new one', { error: err, spreadsheetId: id, projectCode: input.project.code });
      id = '';
    }
  }

  if (!id) {
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title },
        sheets: sheetTitles.map((sheetTitle, index) => ({ properties: { title: sheetTitle, sheetId: index } })),
      },
    });
    id = spreadsheet.data.spreadsheetId!;
    created = true;
  } else {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets(properties(sheetId,title))' });
    const existing = new Set((spreadsheet.data.sheets ?? []).map((sheet) => sheet.properties?.title).filter(Boolean));
    const addRequests = sheetTitles
      .filter((sheetTitle) => !existing.has(sheetTitle))
      .map((sheetTitle) => ({ addSheet: { properties: { title: sheetTitle } } }));
    if (addRequests.length) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: addRequests } });
    }
  }

  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets(properties(sheetId,title))' });
  const sheetIds = (sheetMeta.data.sheets ?? [])
    .map((sheet) => sheet.properties?.sheetId)
    .filter((sheetId): sheetId is number => typeof sheetId === 'number');
  await sheets.spreadsheets.values.batchClear({
    spreadsheetId: id,
    requestBody: { ranges: sheetTitles.map((sheetTitle) => `'${sheetTitle}'!A:Z`) },
  }).catch((err) => {
    if (isGooglePermissionError(err) && input.project.googleSheetId) {
      throw new Error(`Existing project workbook is not writable: ${err instanceof Error ? err.message : String(err)}`);
    }
    throw err;
  });

  const asDate = (value: Date | string) => value instanceof Date ? formatDate(value) : value;
  const linkFormula = (url?: string | null, label = 'Open') => (url ? `=HYPERLINK("${String(url).replace(/"/g, '""')}","${label}")` : '');

  const overviewRows = [
    ['Project code', input.project.code],
    ['Project name', input.project.name],
    ['Customer / site', input.project.customerName ?? ''],
    ['Status', input.project.status],
    ['Owner', input.project.ownerName ?? ''],
    ['Approver', input.project.approverName ?? ''],
    ['Budget', input.project.budgetAmount],
    ...Object.entries(input.summary).map(([key, value]) => [key, value]),
  ];

  const workflowRows = [
    ['Step', 'What to record', 'Required evidence', 'Where it appears'],
    ['1. Collect', 'Upload PDF/JPG, LINE files, PO, slips, and receipts into this project', 'Original file link in Google Drive', 'Files'],
    ['2. Classify', 'Mark each document as tax invoice, receipt, payment proof, PO, delivery note, or supporting document', 'Reviewer note and Drive link', 'Action Needed / Files'],
    ['3. Input VAT', 'Confirm valid purchase tax invoices and receipts', 'Tax invoice PDF/JPG link', 'Purchases'],
    ['4. PO 3-way', 'Match PO, supplier invoice, and payment slip', 'PO link, invoice link, payment proof link', 'PO 3-way'],
    ['5. Sales VAT', 'Issue project-related sales invoices', 'Invoice PDF/XML from Billboy', 'Sales'],
    ['6. Expense claim', 'Record small expenses or no-tax documents as Payment Voucher', 'Receipt/photo/chat/map evidence link', 'Expenses'],
    ['7. Audit / filing', 'Review totals, missing documents, and links before filing VAT or closing project', 'Every row should have an attachment/evidence link where possible', 'Overview / Action Needed'],
  ];

  await Promise.all([
    sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: 'Workflow!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: workflowRows },
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: 'Overview!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Metric', 'Value'], ...overviewRows] },
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: 'Action Needed!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Severity', 'Type', 'Title', 'Message', 'Next action'], ...input.actionNeeded.map((item) => [item.severity, item.type, item.title, item.message, 'Review in Billboy project workspace'])] },
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: 'Files!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['File name', 'Source', 'Kind', 'Status', 'Tax safety', 'Tax note', 'Drive sync', 'Open file', 'Open folder', 'MIME type', 'Size bytes', 'Created at'], ...input.files.map((item) => [item.fileName, item.source, item.kind, item.status, item.taxSafetyStatus ?? '', item.taxSafetyMessage ?? '', item.driveSyncStatus ?? '', linkFormula(item.driveUrl), linkFormula(item.driveFolderUrl, 'Folder'), item.mimeType, item.fileSize, asDate(item.createdAt)])] },
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: 'Purchases!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Supplier', 'Supplier tax ID', 'Invoice no.', 'Invoice date', 'VAT type', 'Subtotal', 'VAT', 'Total', 'Tax safety', 'Tax note', 'Paid', 'Attachment'], ...input.purchases.map((item) => [item.supplierName, item.supplierTaxId, item.invoiceNumber, asDate(item.invoiceDate), item.vatType, item.subtotal, item.vatAmount, item.total, item.taxSafetyStatus ?? '', item.taxSafetyMessage ?? '', item.isPaid ? 'Yes' : 'No', linkFormula(item.attachmentUrl)])] },
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: 'PO 3-way!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['PO no.', 'Document type', 'Vendor', 'Vendor tax ID', 'Issue date', 'Total', 'Status', 'Matched purchases', 'Matched payments', 'Missing'], ...input.purchaseOrders.map((item) => [item.poNumber, item.documentType, item.vendorName ?? '', item.vendorTaxId ?? '', item.issueDate ? asDate(item.issueDate) : '', item.total ?? '', item.status, item.matchedPurchaseCount, item.matchedPaymentCount, item.missing.join(', ')])] },
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: 'Sales!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Invoice no.', 'Buyer', 'Type', 'Status', 'Invoice date', 'Subtotal', 'VAT', 'Total', 'Paid'], ...input.sales.map((item) => [item.invoiceNumber, item.buyerName, item.type, item.status, asDate(item.invoiceDate), item.subtotal, item.vatAmount, item.total, item.isPaid ? 'Yes' : 'No'])] },
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: 'Expenses!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Voucher no.', 'Status', 'Voucher date', 'Description', 'Total', 'Attachment'], ...input.expenses.map((item) => [item.voucherNumber, item.status, asDate(item.voucherDate), item.description, item.totalAmount, linkFormula(item.attachmentUrl)])] },
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: 'LINE Groups!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Group name', 'Linked at'], ...input.lineGroups.map((item) => [item.groupName, asDate(item.linkedAt)])] },
    }),
  ]);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: sheetIds.flatMap((sheetId) => [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.059, green: 0.463, blue: 0.369 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 12 },
          },
        },
      ]).flat(),
    },
  });

  if (input.project.driveFolderId) {
    try {
      await drive.files.update({
        fileId: id,
        addParents: input.project.driveFolderId,
        fields: 'id,parents',
      });
    } catch (err) {
      logger.warn('Could not move project sheet into Drive project folder', { error: err, folderId: input.project.driveFolderId });
    }
  }
  const shareTargets = Array.from(new Set(
    (input.sharedWithEmails ?? [])
      .map((email) => email?.trim().toLowerCase())
      .filter((email): email is string => !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
  ));
  await Promise.all(shareTargets.map(async (email) => {
    try {
      await drive.permissions.create({
        fileId: id,
        requestBody: { role: 'writer', type: 'user', emailAddress: email },
        sendNotificationEmail: false,
      });
    } catch (err) {
      logger.warn('Could not share project sheet with user', { error: err, email });
    }
  }));

  const url = `https://docs.google.com/spreadsheets/d/${id}`;
  logger.info(`Project Sheets workbook synced: ${url} (${input.project.code})`);
  return { spreadsheetId: id, url, created };
}

/* ── PP.30 / VAT summary sheet ─────────────────────────────────────────────── */

export interface Pp30SheetData {
  period: string;
  company: { nameTh: string; nameEn: string | null; taxId: string; branchCode: string };
  sales: {
    byVatType: {
      vat7: { totalExclVat: number; vatAmount: number };
      vatZero: { totalExclVat: number; vatAmount: number };
      vatExempt: { totalExclVat: number; vatAmount: number };
    };
    totalExclVat: number;
    outputVat: number;
    totalInclVat: number;
  };
  purchases: {
    byVatType: {
      vat7: { totalExclVat: number; vatAmount: number };
      vatZero: { totalExclVat: number; vatAmount: number };
      vatExempt: { totalExclVat: number; vatAmount: number };
    };
    totalExclVat: number;
    inputVat: number;
    totalInclVat: number;
  };
  summary: {
    totalSalesExclVat: number;
    outputVat: number;
    inputVat: number;
    vatPayable: number;
    vatRefundable: number;
  };
}

export async function exportPp30ToSheets(data: Pp30SheetData): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  const title = `${data.company.nameTh} - PP.30 ${data.period}`;

  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [
        { properties: { title: 'สรุป PP.30', sheetId: 0 } },
        { properties: { title: 'รายละเอียด', sheetId: 1 } },
      ],
    },
  });

  const id = spreadsheet.data.spreadsheetId!;
  const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(n);

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────
  const summaryRows = [
    ['แบบแสดงรายการภาษีมูลค่าษี สินค้าและบริการ ส่งมอบ (PP.30)', '', ''],
    ['', '', ''],
    ['ชื่อผู้ประกอบการ:', data.company.nameTh, data.company.nameEn],
    ['เลขประจำตัวผู้เสียภาษี:', data.company.taxId, `สาขา: ${data.company.branchCode}`],
    ['งวดบัญชี:', data.period, ''],
    ['', '', ''],
    ['รายการ', 'มูลค่าภาษี', ''],
    ['ยอดขายรวม ก่อน VAT', fmt(data.summary.totalSalesExclVat), ''],
    ['ภาษีขาย (Output VAT)', fmt(data.summary.outputVat), ''],
    ['ภาษีซื้อ (Input VAT)', fmt(data.summary.inputVat), ''],
    ['', '', ''],
    ['ภาษีมูลค่าสุทธิ', data.summary.vatPayable > 0 ? fmt(data.summary.vatPayable) : '-', data.summary.vatPayable > 0 ? '(ต้องชำระ)' : ''],
    ['ภาษีมูลค่าขอคืน', data.summary.vatRefundable > 0 ? fmt(data.summary.vatRefundable) : '-', data.summary.vatRefundable > 0 ? '(ขอคืนได้)' : ''],
  ];

  // ── Sheet 2: Detail by VAT type ──────────────────────────────────────────
  const detailRows = [
    ['ประเภท', 'มูลค่าก่อน VAT', 'VAT'],
    ['ยอดขาย VAT 7%', fmt(data.sales.byVatType.vat7.totalExclVat), fmt(data.sales.byVatType.vat7.vatAmount)],
    ['ยอดขาย VAT 0%', fmt(data.sales.byVatType.vatZero.totalExclVat), '-'],
    ['ยอดขาย VAT ยกเว้น', fmt(data.sales.byVatType.vatExempt.totalExclVat), '-'],
    ['รวมยอดขาย', fmt(data.summary.totalSalesExclVat), fmt(data.summary.outputVat)],
    ['', '', ''],
    ['ประเภท', 'มูลค่าก่อน VAT', 'VAT'],
    ['ยอดซื้อ VAT 7%', fmt(data.purchases.byVatType.vat7.totalExclVat), fmt(data.purchases.byVatType.vat7.vatAmount)],
  ];

  await Promise.all([
    sheets.spreadsheets.values.update({
      spreadsheetId: id, range: 'สรุป PP.30!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: summaryRows },
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: id, range: 'รายละเอียด!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: detailRows },
    }),
  ]);

  // Bold + freeze header row on both sheets
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: [0, 1].flatMap((sheetId) => [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.078, green: 0.302, blue: 0.565 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
      ]),
    },
  });

  try {
    await drive.permissions.create({
      fileId: id,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  } catch {
    logger.warn('Could not set PP.30 sheet permissions');
  }

  const url = `https://docs.google.com/spreadsheets/d/${id}`;
  logger.info(`PP.30 Google Sheets export created: ${url}`);
  return url;
}
