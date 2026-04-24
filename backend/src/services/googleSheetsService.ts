import { google } from 'googleapis';
import { logger } from '../config/logger';

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
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    const credentials = JSON.parse(serviceAccountKey);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  return new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
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
