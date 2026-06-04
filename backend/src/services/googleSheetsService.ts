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
import { decryptGoogleRefreshToken } from './googleDriveTokenService';

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

function isGoogleDriveQuotaError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return /storage quota|quota has been exceeded|storageQuotaExceeded/i.test(message);
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
    oauthClient.setCredentials({ refresh_token: decryptGoogleRefreshToken(userRefreshToken) });
    return oauthClient;
  }
  return buildGoogleServiceAccountAuth([
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
  ]);
}

export function isSheetsConfigured(): boolean {
  return isDriveServiceAccountConfigured() || isUserDriveOAuthConfigured();
}

export interface CompanyWorkspaceSheetData {
  period: string;
  companyName: string;
  sharedWithEmails?: Array<string | null | undefined>;
  userRefreshToken?: string | null;
  existingSheetId?: string | null;
  // Drive folder ID of the company's Billboy workspace. When provided,
  // a freshly-created sheet is moved out of My Drive root and into this
  // folder so users can browse to it alongside project files.
  companyFolderId?: string | null;
  tabs: Record<string, Array<Record<string, unknown>>>;
}

export interface CompanyWorkspaceSheetResult {
  url: string;
  sheetId: string;
}

function sheetCell(value: unknown): string | number {
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

// Wrap a URL as a Google Sheets HYPERLINK formula so the cell renders as a
// single-click 📎 icon instead of the raw URL string. Empty input → empty
// cell so audit rows without a file don't render a confusing "📎" link.
// Escapes double quotes inside the URL (rare but happens with encoded args).
export function linkCell(url: string | null | undefined, label = '📎'): string {
  if (!url) return '';
  const safe = url.replace(/"/g, '""');
  return `=HYPERLINK("${safe}","${label}")`;
}

function rowsFromObjects(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>) {
  return [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => sheetCell(row[column.key]))),
  ];
}

export async function exportCompanyWorkspaceToSheets(data: CompanyWorkspaceSheetData): Promise<CompanyWorkspaceSheetResult> {
  const auth = getAuthWithDrive(data.userRefreshToken);
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });
  const title = `${data.companyName} - Billboy Company Workspace ${data.period}`;
  // Renamed tabs to match SME mental model and Thai tax workflow:
  //   ขาย Sales            — was "ภาษีขาย" (output VAT)
  //   ซื้อ Purchases       — was "ภาษีซื้อ" (input VAT); only PurchaseInvoice rows
  //   ค่าใช้จ่ายและเงินสดย่อย — was "ค่าใช้จ่าย"; ExpenseVoucher only (no tax invoice)
  //   ลูกค้า Customers     — split from "รายชื่อและเอกสาร"
  //   คู่ค้า Vendors       — split from "รายชื่อและเอกสาร"
  //   สินค้า/บริการ Products — unchanged
  //   AI Inbox              — renamed from "เอกสารต้องตรวจ"
  //   สรุปโปรเจค Projects   — now populated (was hardcoded [])
  //
  // Every transactional tab gets a clickable Drive Link via HYPERLINK formula
  // (built by linkCell). Project column is already populated per row by the
  // worker; Google Sheets users can apply a filter view on it to scope the
  // whole workbook to a single project — the "subset of master" pattern.
  const sheetDefs = [
    {
      title: 'ขาย Sales',
      rows: rowsFromObjects(data.tabs.outputVat ?? [], [
        { key: 'period', label: 'งวด' },
        { key: 'date', label: 'วันที่' },
        { key: 'buyer', label: 'ลูกค้า' },
        { key: 'documentNo', label: 'เลขเอกสาร' },
        { key: 'project', label: 'โปรเจค' },
        { key: 'status', label: 'สถานะ' },
        { key: 'subtotal', label: 'ก่อน VAT' },
        { key: 'vat', label: 'VAT' },
        { key: 'total', label: 'รวม' },
        { key: 'attachmentLink', label: 'PDF' },
        { key: 'xmlLink', label: 'XML' },
        { key: 'docId', label: 'docId' },
      ]),
    },
    {
      title: 'ซื้อ Purchases',
      rows: rowsFromObjects(data.tabs.inputVat ?? [], [
        { key: 'period', label: 'งวด' },
        { key: 'date', label: 'วันที่' },
        { key: 'supplier', label: 'ผู้ขาย' },
        { key: 'supplierTaxId', label: 'เลขภาษีผู้ขาย' },
        { key: 'documentNo', label: 'เลขเอกสาร' },
        { key: 'project', label: 'โปรเจค' },
        { key: 'category', label: 'หมวด' },
        { key: 'subtotal', label: 'ก่อน VAT' },
        { key: 'vat', label: 'VAT' },
        { key: 'total', label: 'รวม' },
        { key: 'taxStatus', label: 'สถานะภาษี' },
        { key: 'attachmentLink', label: 'ไฟล์' },
        { key: 'docId', label: 'docId' },
      ]),
    },
    {
      title: 'ค่าใช้จ่ายและเงินสดย่อย',
      rows: rowsFromObjects(data.tabs.expenses ?? [], [
        { key: 'period', label: 'งวด' },
        { key: 'date', label: 'วันที่' },
        { key: 'voucherNo', label: 'เลข PV' },
        { key: 'project', label: 'โปรเจค' },
        { key: 'category', label: 'หมวด' },
        { key: 'description', label: 'รายละเอียด' },
        { key: 'amount', label: 'ยอด' },
        { key: 'wht', label: 'WHT' },
        { key: 'status', label: 'สถานะ' },
        { key: 'attachmentLink', label: 'ไฟล์' },
        { key: 'docId', label: 'docId' },
      ]),
    },
    {
      title: 'WHT ภ.ง.ด.3-53',
      rows: rowsFromObjects(data.tabs.wht ?? [], [
        { key: 'period', label: 'งวด' },
        { key: 'certificateNo', label: 'เลข 50ทวิ' },
        { key: 'paymentDate', label: 'วันจ่าย' },
        { key: 'recipient', label: 'ผู้ถูกหัก' },
        { key: 'recipientTaxId', label: 'เลขภาษีผู้ถูกหัก' },
        { key: 'incomeType', label: 'ประเภทเงินได้' },
        { key: 'base', label: 'ฐาน' },
        { key: 'rate', label: 'อัตรา' },
        { key: 'withheld', label: 'ภาษีหัก' },
        { key: 'pndFlag', label: '3/53' },
        { key: 'attachmentLink', label: 'ไฟล์' },
        { key: 'folderLink', label: 'โฟลเดอร์' },
        { key: 'docId', label: 'docId' },
      ]),
    },
    {
      title: 'เงินเดือน ภ.ง.ด.1',
      rows: rowsFromObjects(data.tabs.payroll ?? [], [
        { key: 'period', label: 'งวด' },
        { key: 'payDate', label: 'วันจ่าย' },
        { key: 'employee', label: 'พนักงาน' },
        { key: 'employeeCode', label: 'รหัสพนักงาน' },
        { key: 'gross', label: 'gross' },
        { key: 'wht', label: 'WHT' },
        { key: 'sso', label: 'สปส.' },
        { key: 'pvd', label: 'PVD' },
        { key: 'net', label: 'net' },
        { key: 'status', label: 'สถานะ' },
        { key: 'attachmentLink', label: 'ไฟล์' },
        { key: 'folderLink', label: 'โฟลเดอร์' },
        { key: 'docId', label: 'docId' },
      ]),
    },
    {
      title: 'ภ.พ.30 ที่ยื่นแล้ว',
      rows: rowsFromObjects(data.tabs.vatFilings ?? [], [
        { key: 'period', label: 'งวด' },
        { key: 'filedAt', label: 'วันที่ยื่น' },
        { key: 'rdReference', label: 'เลขที่รับ' },
        { key: 'outputVat', label: 'ภาษีขาย' },
        { key: 'inputVat', label: 'ภาษีซื้อ' },
        { key: 'payable', label: 'ต้องชำระ' },
        { key: 'refundable', label: 'ขอคืน' },
        { key: 'attachmentLink', label: 'ไฟล์' },
        { key: 'folderLink', label: 'โฟลเดอร์' },
        { key: 'docId', label: 'docId' },
      ]),
    },
    {
      title: 'ลูกค้า Customers',
      rows: rowsFromObjects(data.tabs.customers ?? [], [
        { key: 'name', label: 'ชื่อ' },
        { key: 'taxId', label: 'เลขผู้เสียภาษี' },
        { key: 'useCase', label: 'ใช้สำหรับ' },
        { key: 'documentType', label: 'เอกสาร' },
        { key: 'status', label: 'สถานะไฟล์' },
        { key: 'readiness', label: 'ความพร้อม' },
        { key: 'attachmentLink', label: 'ไฟล์' },
        { key: 'folderLink', label: 'โฟลเดอร์' },
      ]),
    },
    {
      title: 'คู่ค้า Vendors',
      rows: rowsFromObjects(data.tabs.vendors ?? [], [
        { key: 'name', label: 'ชื่อ' },
        { key: 'taxId', label: 'เลขผู้เสียภาษี' },
        { key: 'useCase', label: 'ใช้สำหรับ' },
        { key: 'documentType', label: 'เอกสาร' },
        { key: 'status', label: 'สถานะไฟล์' },
        { key: 'readiness', label: 'ความพร้อม' },
        { key: 'attachmentLink', label: 'ไฟล์' },
        { key: 'folderLink', label: 'โฟลเดอร์' },
      ]),
    },
    {
      title: 'สินค้า/บริการ Products',
      rows: rowsFromObjects(data.tabs.products ?? [], [
        { key: 'code', label: 'รหัส' },
        { key: 'nameTh', label: 'ชื่อไทย' },
        { key: 'nameEn', label: 'ชื่ออังกฤษ' },
        { key: 'type', label: 'ประเภท' },
        { key: 'category', label: 'หมวดหมู่' },
        { key: 'unit', label: 'หน่วย' },
        { key: 'unitPrice', label: 'ราคาขาย' },
        { key: 'vat', label: 'VAT' },
        { key: 'unitCost', label: 'ต้นทุน' },
        { key: 'grossMargin', label: 'กำไรขั้นต้น' },
        { key: 'accountCode', label: 'รหัสบัญชีรายได้' },
        { key: 'defaultWhtRate', label: 'WHT เริ่มต้น' },
        { key: 'status', label: 'สถานะ' },
        { key: 'updatedAt', label: 'อัปเดตล่าสุด' },
      ]),
    },
    {
      title: 'AI Inbox',
      rows: rowsFromObjects(data.tabs.missingDocs ?? [], [
        { key: 'date', label: 'วันที่' },
        { key: 'fileName', label: 'ไฟล์' },
        { key: 'project', label: 'โปรเจค' },
        { key: 'source', label: 'ที่มา' },
        { key: 'status', label: 'สถานะ' },
        { key: 'issue', label: 'สิ่งที่ต้องทำ' },
        { key: 'attachmentLink', label: 'เปิด' },
        { key: 'folderLink', label: 'โฟลเดอร์' },
      ]),
    },
    {
      title: 'สรุปโปรเจค Projects',
      rows: rowsFromObjects(data.tabs.projectSummary ?? [], [
        { key: 'project', label: 'โปรเจค' },
        { key: 'status', label: 'สถานะ' },
        { key: 'budget', label: 'งบ' },
        { key: 'revenue', label: 'รายรับ' },
        { key: 'actual', label: 'ใช้จริง' },
        { key: 'balance', label: 'เหลือ' },
        { key: 'forecastProfit', label: 'กำไรคาดการณ์' },
        { key: 'files', label: 'ไฟล์' },
        { key: 'folderLink', label: 'โฟลเดอร์' },
      ]),
    },
  ];

  let spreadsheetId: string;
  let isNew = false;

  if (data.existingSheetId) {
    spreadsheetId = data.existingSheetId;
    // Verify the sheet still exists AND is not trashed; fall through to create
    // a fresh one otherwise. The Sheets API still reads a trashed file (trash
    // is not delete), so without this trashed-check a user who deletes the
    // master sheet keeps getting writes into the trashed copy and the "Open"
    // button reopens the trash. Drive's `trashed` flag is the source of truth.
    try {
      const trashState = await drive.files.get({ fileId: spreadsheetId, fields: 'trashed' });
      if (trashState.data.trashed) {
        throw new Error('workspace sheet is in trash');
      }
      const existing = await sheets.spreadsheets.get({ spreadsheetId, fields: 'spreadsheetId,sheets.properties' });
      const existingTitles = new Set((existing.data.sheets ?? []).map((s) => s.properties?.title));

      // Add any missing tabs
      const missingTabs = sheetDefs.filter((def) => !existingTitles.has(def.title));
      if (missingTabs.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: missingTabs.map((tab) => ({
              addSheet: { properties: { title: tab.title } },
            })),
          },
        });
      }

      // Clear and rewrite each tab
      await Promise.all(sheetDefs.map((sheet) => sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `'${sheet.title}'`,
      })));
      await Promise.all(sheetDefs.map((sheet) => sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheet.title}'!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: sheet.rows },
      })));

      // Backfill: existing tenants whose sheet was created before the
      // "move into company folder" change. Check current parents; if root
      // and we have a folder ID, move it. Idempotent — re-runs are no-ops.
      if (data.companyFolderId) {
        try {
          const meta = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' });
          const parents = meta.data.parents ?? [];
          if (!parents.includes(data.companyFolderId)) {
            await drive.files.update({
              fileId: spreadsheetId,
              addParents: data.companyFolderId,
              removeParents: parents.join(','),
              fields: 'id, parents',
            });
            logger.info('[sheets] moved existing workspace sheet into company folder', { spreadsheetId });
          }
        } catch (err) {
          logger.warn('Failed to relocate existing workspace sheet', { error: err, spreadsheetId });
        }
      }
    } catch (err) {
      logger.warn('Existing workspace sheet not accessible, creating new one', { error: err, existingSheetId: data.existingSheetId });
      data.existingSheetId = null;
    }
  }

  if (!data.existingSheetId) {
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title },
        sheets: sheetDefs.map((sheet, index) => ({ properties: { title: sheet.title, sheetId: index } })),
      },
    });
    spreadsheetId = spreadsheet.data.spreadsheetId!;
    isNew = true;

    await Promise.all(sheetDefs.map((sheet) => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheet.title}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: sheet.rows },
    })));

    // Move the brand-new sheet out of My Drive root into the company's
    // Billboy folder so users can find it next to project files. Without
    // this the spreadsheet sits at root and the only way to reach it is
    // via direct URL (i.e., our "Open Master Sheet" button).
    // Read the actual current parents instead of assuming the alias "root":
    // a fresh sheet's real parent id isn't always the literal "root" token,
    // and removing a non-existent parent makes the whole move fail (leaving
    // the sheet at root). This mirrors the backfill path below.
    if (data.companyFolderId) {
      try {
        const meta = await drive.files.get({ fileId: spreadsheetId!, fields: 'parents' });
        const parents = meta.data.parents ?? [];
        if (!parents.includes(data.companyFolderId)) {
          await drive.files.update({
            fileId: spreadsheetId!,
            addParents: data.companyFolderId,
            removeParents: parents.join(','),
            fields: 'id, parents',
          });
        }
      } catch (err) {
        logger.warn('Failed to move workspace sheet into company folder', { error: err, spreadsheetId, companyFolderId: data.companyFolderId });
      }
    }
  }

  // Refresh sheet metadata to get actual numeric sheetIds for formatting
  const meta = await sheets.spreadsheets.get({ spreadsheetId: spreadsheetId!, fields: 'sheets.properties' });
  const sheetIdMap = new Map(
    (meta.data.sheets ?? []).map((s) => [s.properties?.title ?? '', s.properties?.sheetId ?? 0]),
  );

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId!,
    requestBody: {
      requests: sheetDefs.flatMap((def) => {
        const numericId = sheetIdMap.get(def.title) ?? 0;
        return [
          {
            repeatCell: {
              range: { sheetId: numericId, startRowIndex: 0, endRowIndex: 1 },
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
              properties: { sheetId: numericId, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId: numericId, dimension: 'COLUMNS', startIndex: 0, endIndex: 14 },
            },
          },
        ];
      }),
    },
  });

  // On first creation, flag every tab with a warning-only protected range.
  // Billboy clear-and-rewrites these tabs on every sync, so anything a user
  // hand-types into them is lost. warningOnly never blocks our API writes —
  // it just prompts a human "this may be overwritten" before they edit, which
  // is exactly the guard rail real users need. Best-effort: a failure here
  // must not abort the sync. Only on isNew so re-syncs don't stack duplicates.
  if (isNew) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId!,
      requestBody: {
        requests: sheetDefs.map((def) => ({
          addProtectedRange: {
            protectedRange: {
              range: { sheetId: sheetIdMap.get(def.title) ?? 0 },
              description: 'อัปเดตอัตโนมัติโดย Billboy — อย่าแก้ด้วยมือ ระบบเขียนทับทุกครั้งที่ sync (Auto-synced by Billboy; manual edits are overwritten)',
              warningOnly: true,
            },
          },
        })),
      },
    }).catch((err) => logger.warn('Could not add protected ranges to workspace sheet', { error: err, spreadsheetId }));
  }

  // Only share on first creation to avoid repeated permission calls
  if (isNew) {
    const shareTargets = Array.from(new Set(
      (data.sharedWithEmails ?? [])
        .map((email) => email?.trim().toLowerCase())
        .filter((email): email is string => !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
    ));
    await Promise.all(shareTargets.map(async (email) => {
      try {
        await drive.permissions.create({
          fileId: spreadsheetId!,
          requestBody: { role: 'writer', type: 'user', emailAddress: email },
          sendNotificationEmail: false,
        });
      } catch (err) {
        logger.warn('Could not share company workspace sheet with user', { error: err, email });
      }
    }));
  }

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId!}`;
  logger.info(`Company workspace sheet ${isNew ? 'created' : 'updated'}: ${url} (${data.period})`);
  return { url, sheetId: spreadsheetId! };
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
  costCodes?: Array<{ code: string; name: string; budget: number; actual: number; committed: number; balance: number }>;
  actionNeeded: Array<{ severity: string; type: string; title: string; message: string }>;
  files: Array<{ fileName: string; source: string; kind: string; status: string; taxSafetyStatus?: string; taxSafetyMessage?: string; mimeType: string; fileSize: number; createdAt: Date | string; driveSyncStatus?: string | null; driveUrl?: string | null; driveFolderUrl?: string | null }>;
  purchaseOrders: Array<{ poNumber: string; documentType: string; vendorName?: string | null; vendorTaxId?: string | null; issueDate?: Date | string | null; total?: number | null; status: string; matchedPurchaseCount: number; matchedPaymentCount: number; missing: string[] }>;
  purchases: Array<{ supplierName: string; supplierTaxId: string; invoiceNumber: string; invoiceDate: Date | string; vatType: string; subtotal: number; vatAmount: number; total: number; taxSafetyStatus?: string; taxSafetyMessage?: string; isPaid: boolean; attachmentUrl?: string | null }>;
  sales: Array<{ invoiceNumber: string; buyerName: string; type: string; status: string; invoiceDate: Date | string; subtotal: number; vatAmount: number; total: number; isPaid: boolean }>;
  expenses: Array<{ voucherNumber: string; status: string; voucherDate: Date | string; description: string; workflowType?: string; clearingStatus?: string; paidToName?: string; totalAmount: number; attachmentUrl?: string | null }>;
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
      ['6. Cash advance', 'Request field cash, approve, pay, then clear against receipts/payment proof', 'Approval, transfer slip, receipts, refund/overuse note', 'Expenses / Action Needed'],
      ['7. Expense claim', 'Record small expenses or no-tax documents as Payment Voucher', 'Receipt/photo/chat/map evidence link', 'Expenses'],
      ['8. Audit / filing', 'Review totals, missing documents, and links before filing VAT or closing project', 'Every row should have an attachment/evidence link where possible', 'Overview / Action Needed'],
    ],
    Overview: [['Metric', 'Value'], ...overviewRows],
    'Budget Cost Codes': [
      ['Code', 'Name', 'Budget', 'Actual', 'Committed', 'Balance'],
      ...(input.costCodes ?? []).map((item) => [item.code, item.name, item.budget, item.actual, item.committed, item.balance]),
    ],
    'Action Needed': [['Severity', 'Type', 'Title', 'Message', 'Next action'], ...input.actionNeeded.map((item) => [item.severity, item.type, item.title, item.message, 'Review in Billboy project workspace'])],
    Files: [['File name', 'Source', 'Kind', 'Status', 'Tax safety', 'Tax note', 'Drive sync', 'Open file', 'Open folder', 'MIME type', 'Size bytes', 'Created at'], ...input.files.map((item) => [item.fileName, item.source, item.kind, item.status, item.taxSafetyStatus ?? '', item.taxSafetyMessage ?? '', item.driveSyncStatus ?? '', projectSheetLinkFormula(item.driveUrl), projectSheetLinkFormula(item.driveFolderUrl, 'Folder'), item.mimeType, item.fileSize, asProjectSheetDate(item.createdAt)])],
    Purchases: [['Supplier', 'Supplier tax ID', 'Invoice no.', 'Invoice date', 'VAT type', 'Subtotal', 'VAT', 'Total', 'Tax safety', 'Tax note', 'Paid', 'Attachment'], ...input.purchases.map((item) => [item.supplierName, item.supplierTaxId, item.invoiceNumber, asProjectSheetDate(item.invoiceDate), item.vatType, item.subtotal, item.vatAmount, item.total, item.taxSafetyStatus ?? '', item.taxSafetyMessage ?? '', item.isPaid ? 'Yes' : 'No', projectSheetLinkFormula(item.attachmentUrl)])],
    'PO 3-way': [['PO no.', 'Document type', 'Vendor', 'Vendor tax ID', 'Issue date', 'Total', 'Status', 'Matched purchases', 'Matched payments', 'Missing'], ...input.purchaseOrders.map((item) => [item.poNumber, item.documentType, item.vendorName ?? '', item.vendorTaxId ?? '', item.issueDate ? asProjectSheetDate(item.issueDate) : '', item.total ?? '', item.status, item.matchedPurchaseCount, item.matchedPaymentCount, item.missing.join(', ')])],
    Sales: [['Invoice no.', 'Buyer', 'Type', 'Status', 'Invoice date', 'Subtotal', 'VAT', 'Total', 'Paid'], ...input.sales.map((item) => [item.invoiceNumber, item.buyerName, item.type, item.status, asProjectSheetDate(item.invoiceDate), item.subtotal, item.vatAmount, item.total, item.isPaid ? 'Yes' : 'No'])],
    Expenses: [['Voucher no.', 'Type', 'Status', 'Clearing status', 'Voucher date', 'Pay to', 'Description', 'Total', 'Attachment'], ...input.expenses.map((item) => [item.voucherNumber, item.workflowType === 'cash_advance' ? 'Cash advance' : 'Expense claim', item.status, item.clearingStatus ?? '', asProjectSheetDate(item.voucherDate), item.paidToName ?? '', item.description, item.totalAmount, projectSheetLinkFormula(item.attachmentUrl)])],
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
  const sheetTitles = ['Workflow', 'Overview', 'Budget Cost Codes', 'Action Needed', 'Files', 'PO 3-way', 'Purchases', 'Sales', 'Expenses', 'LINE Groups'];
  let id = input.project.googleSheetId ?? '';
  let created = false;

  if (process.env.PROJECT_SHEETS_USE_DRIVE_UPLOAD !== 'false') {
    try {
      return await uploadProjectWorkbookViaDrive(input, title);
    } catch (err) {
      if (input.userRefreshToken && isDriveServiceAccountConfigured() && (isGoogleDriveQuotaError(err) || isGooglePermissionError(err))) {
        logger.warn('Project workbook upload through user Drive failed; retrying with service account root', {
          error: err,
          projectCode: input.project.code,
        });
        return uploadProjectWorkbookViaDrive({
          ...input,
          userRefreshToken: null,
          project: {
            ...input.project,
            driveFolderId: null,
          },
        }, title);
      }
      throw err;
    }
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
    ['6. Cash advance', 'Request field cash, approve, pay, then clear against receipts/payment proof', 'Approval, transfer slip, receipts, refund/overuse note', 'Expenses / Action Needed'],
    ['7. Expense claim', 'Record small expenses or no-tax documents as Payment Voucher', 'Receipt/photo/chat/map evidence link', 'Expenses'],
    ['8. Audit / filing', 'Review totals, missing documents, and links before filing VAT or closing project', 'Every row should have an attachment/evidence link where possible', 'Overview / Action Needed'],
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
      range: 'Budget Cost Codes!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Code', 'Name', 'Budget', 'Actual', 'Committed', 'Balance'], ...(input.costCodes ?? []).map((item) => [item.code, item.name, item.budget, item.actual, item.committed, item.balance])] },
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
      requestBody: { values: [['Voucher no.', 'Type', 'Status', 'Clearing status', 'Voucher date', 'Pay to', 'Description', 'Total', 'Attachment'], ...input.expenses.map((item) => [item.voucherNumber, item.workflowType === 'cash_advance' ? 'Cash advance' : 'Expense claim', item.status, item.clearingStatus ?? '', asDate(item.voucherDate), item.paidToName ?? '', item.description, item.totalAmount, linkFormula(item.attachmentUrl)])] },
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
