import { google, Auth } from 'googleapis';
import { Readable } from 'stream';
import { logger } from '../config/logger';
import { decryptGoogleRefreshToken } from './googleDriveTokenService';

export function isDriveConfigured(): boolean {
  // Configured if service account OR user OAuth credentials are set
  return isDriveServiceAccountConfigured() || isUserDriveOAuthConfigured();
}

export function isDriveServiceAccountConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

export function isUserDriveOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getDriveRedirectUri(): string {
  return process.env.GOOGLE_DRIVE_REDIRECT_URI ?? `${process.env.API_URL ?? 'http://localhost:4000'}/api/drive/callback`;
}

/** Build OAuth2 client for the Authorization Code flow (per-user Drive). */
export function buildOAuth2Client(): Auth.OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getDriveRedirectUri(),
  );
}

/** Returns the URL the user must visit to grant Drive access. */
export function getDriveAuthUrl(stateToken: string): string {
  const client = buildOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
    state: stateToken,
  });
}

/** Exchange authorization code for tokens. Returns { accessToken, refreshToken }. */
export async function exchangeCodeForTokens(code: string): Promise<{ accessToken: string; refreshToken: string }> {
  const client = buildOAuth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error('No refresh_token returned — ensure prompt=consent was set');
  return { accessToken: tokens.access_token ?? '', refreshToken: tokens.refresh_token };
}

function parseServiceAccountKey() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (key) {
    return JSON.parse(key);
  }
  return null;
}

export function buildGoogleServiceAccountAuth(scopes: string[]) {
  const credentials = parseServiceAccountKey();
  if (credentials) {
    return new google.auth.GoogleAuth({ credentials, scopes });
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Google Drive service account is not configured');
  }
  return new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes,
  });
}

function getServiceAccountAuth() {
  return buildGoogleServiceAccountAuth(['https://www.googleapis.com/auth/drive.file']);
}

const FOLDER_NAME = 'Billboy';

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function sanitizeDriveName(value: string) {
  return value.replace(/['"\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180) || 'Untitled';
}

async function ensureChildFolder(
  driveClient: ReturnType<typeof google.drive>,
  name: string,
  parentId?: string,
): Promise<string> {
  const safeName = sanitizeDriveName(name);
  const escapedName = escapeDriveQuery(safeName);
  const parentClause = parentId ? ` and '${parentId}' in parents` : '';
  const existing = await driveClient.files.list({
    q: `name='${escapedName}' and mimeType='application/vnd.google-apps.folder'${parentClause} and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  if (existing.data.files?.length) return existing.data.files[0].id!;

  const created = await driveClient.files.create({
    requestBody: {
      name: safeName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: 'id',
  });
  return created.data.id!;
}

export type DriveDocumentFolder =
  | '01_PO'
  | '02_Tax_Invoices'
  | '03_Transfer_Slips'
  | '04_Photos'
  | '05_Exports'
  | '99_Other';

export type DriveTaxFolder =
  | 'output_vat'
  | 'input_vat'
  | 'expense_no_vat'
  | 'withholding_tax'
  | 'payroll'
  | 'payment_evidence'
  | 'filed_forms';

export type DriveCustomerDocumentFolder =
  | '01_Registration'
  | '02_VAT'
  | '03_Contracts_Credit'
  | '04_ID_Verification'
  | '05_Bank_Accounts';

export interface DriveUploadOptions {
  companyTaxId?: string | null;
  projectCode?: string | null;
  projectName?: string | null;
  documentFolder?: DriveDocumentFolder | null;
  taxFolder?: DriveTaxFolder | null;
  customerCode?: string | null;
  customerName?: string | null;
  customerDocumentFolder?: DriveCustomerDocumentFolder | null;
  shareAnyone?: boolean;
  shareWithEmails?: string[];
  duplicatePolicy?: 'rename' | 'replace' | 'skip' | 'error';
  /**
   * The TRANSACTION date of the document (invoiceDate, paidAt, etc.) — used
   * for YYYY/MM bucketing under Customers/Projects/Root. Falls back to upload
   * date when the OCR couldn't parse a date. Auditors and accountants both
   * expect documents filed by transaction month, not upload month: a January
   * receipt uploaded in March belongs under 2026/01, not 2026/03.
   *
   * Currently used by getTransactionMonthBucket() for path computation; the
   * actual folder structure change ships in a separate migration commit so
   * existing tenants don't see their files relocate mid-deploy.
   */
  transactionDate?: Date | null;
}

/**
 * Bucket key for transaction-month folders. Returns "YYYY/MM" string. Use
 * the transactionDate when available; fall back to "now" only when OCR
 * couldn't read one (intake fails, OCR mode='other', etc.).
 */
export function getTransactionMonthBucket(date?: Date | null): string {
  const d = date && !Number.isNaN(date.getTime()) ? date : new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}/${mm}`;
}

const THAI_MONTH_FOLDERS = [
  '01_มกราคม',
  '02_กุมภาพันธ์',
  '03_มีนาคม',
  '04_เมษายน',
  '05_พฤษภาคม',
  '06_มิถุนายน',
  '07_กรกฎาคม',
  '08_สิงหาคม',
  '09_กันยายน',
  '10_ตุลาคม',
  '11_พฤศจิกายน',
  '12_ธันวาคม',
];

const TAX_FOLDER_NAMES: Record<DriveTaxFolder, string> = {
  output_vat: '1_ภาษีขาย (Output VAT)',
  input_vat: '2_ภาษีซื้อ (Input VAT)',
  expense_no_vat: '3_ค่าใช้จ่าย (ไม่มี VAT)',
  withholding_tax: '4_หัก ณ ที่จ่าย (ภ.ง.ด.3-53)',
  payroll: '5_เงินเดือน (ภ.ง.ด.1 / สปส.)',
  payment_evidence: '6_สลิป-หลักฐานจ่าย',
  filed_forms: '9_แบบที่ยื่นแล้ว (ภ.พ.30)',
};

function companyFolderName(companyName: string, taxId?: string | null) {
  const safeCompanyName = sanitizeDriveName(companyName);
  const cleanTaxId = taxId?.replace(/\D/g, '');
  return cleanTaxId && cleanTaxId.length === 13 ? `${safeCompanyName} (${cleanTaxId})` : safeCompanyName;
}

async function ensureAuditTaxFolder(
  driveClient: ReturnType<typeof google.drive>,
  companyFolderId: string,
  options: DriveUploadOptions,
): Promise<{ targetFolderId: string; targetFolderUrl: string }> {
  const [year, month] = getTransactionMonthBucket(options.transactionDate).split('/');
  const yearFolder = await ensureChildFolder(driveClient, String(Number(year) + 543), companyFolderId);
  const monthFolderName = THAI_MONTH_FOLDERS[Number(month) - 1] ?? `${month}_ไม่ทราบเดือน`;
  const monthFolder = await ensureChildFolder(driveClient, monthFolderName, yearFolder);
  const taxFolder = await ensureChildFolder(driveClient, TAX_FOLDER_NAMES[options.taxFolder!], monthFolder);
  return { targetFolderId: taxFolder, targetFolderUrl: driveFolderUrl(taxFolder) };
}

function driveFolderUrl(folderId: string) {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

async function ensureProjectFolder(
  driveClient: ReturnType<typeof google.drive>,
  companyName: string,
  options: DriveUploadOptions = {},
): Promise<{ projectFolderId?: string; projectFolderUrl?: string; targetFolderId: string; targetFolderUrl: string }> {
  const rootId = await ensureChildFolder(driveClient, FOLDER_NAME);
  const companyId = await ensureChildFolder(driveClient, companyFolderName(companyName, options.companyTaxId), rootId);

  if (options.taxFolder) {
    const taxFolder = await ensureAuditTaxFolder(driveClient, companyId, options);
    if (options.projectCode || options.projectName) {
      const projectsId = await ensureChildFolder(driveClient, '_โปรเจค', companyId);
      const projectFolderName = sanitizeDriveName(
        [options.projectCode, options.projectName].filter(Boolean).join(' '),
      );
      const projectId = await ensureChildFolder(driveClient, projectFolderName, projectsId);
      return {
        projectFolderId: projectId,
        projectFolderUrl: driveFolderUrl(projectId),
        ...taxFolder,
      };
    }
    return taxFolder;
  }

  if (options.customerName || options.customerCode) {
    const customersId = await ensureChildFolder(driveClient, 'Customers', companyId);
    const customerFolderName = sanitizeDriveName(
      [options.customerCode, options.customerName].filter(Boolean).join(' '),
    );
    const customerId = await ensureChildFolder(driveClient, customerFolderName, customersId);
    const targetId = await ensureChildFolder(driveClient, options.customerDocumentFolder ?? '03_Contracts_Credit', customerId);
    return {
      projectFolderId: customerId,
      projectFolderUrl: driveFolderUrl(customerId),
      targetFolderId: targetId,
      targetFolderUrl: driveFolderUrl(targetId),
    };
  }

  if (!options.projectCode && !options.projectName) {
    return { targetFolderId: companyId, targetFolderUrl: driveFolderUrl(companyId) };
  }

  const projectsId = await ensureChildFolder(driveClient, 'Projects', companyId);
  const projectFolderName = sanitizeDriveName(
    [options.projectCode, options.projectName].filter(Boolean).join(' '),
  );
  const projectId = await ensureChildFolder(driveClient, projectFolderName, projectsId);
  const targetId = await ensureChildFolder(driveClient, options.documentFolder ?? '99_Other', projectId);
  return {
    projectFolderId: projectId,
    projectFolderUrl: driveFolderUrl(projectId),
    targetFolderId: targetId,
    targetFolderUrl: driveFolderUrl(targetId),
  };
}

export interface DriveUploadResult {
  fileId: string;
  url: string;
  fileName: string;
  folderId: string;
  folderUrl: string;
  projectFolderId?: string;
  projectFolderUrl?: string;
  /** Whether the file landed in the user's personal Drive (true) or service account Drive (false) */
  userDrive: boolean;
  duplicate?: {
    policy: 'rename' | 'replace' | 'skip';
    existingFileId?: string;
    existingFileName?: string;
    existingSize?: number | null;
    requestedFileName: string;
  };
}

function uniqueEmails(emails?: string[]) {
  return Array.from(new Set(
    (emails ?? [])
      .map((email) => email.trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
  ));
}

async function shareDriveFileWithEmails(
  driveClient: ReturnType<typeof google.drive>,
  fileId: string,
  emails?: string[],
  role: 'reader' | 'writer' = 'writer',
) {
  const targets = uniqueEmails(emails);
  if (!targets.length) return;

  await Promise.all(targets.map(async (emailAddress) => {
    try {
      await driveClient.permissions.create({
        fileId,
        sendNotificationEmail: false,
        requestBody: { role, type: 'user', emailAddress },
      });
    } catch (err) {
      logger.warn('Could not share Drive file with user', { fileId, emailAddress, error: err });
    }
  }));
}

export async function shareServiceAccountDriveItem(
  fileId: string,
  emails?: string[],
  role: 'reader' | 'writer' = 'writer',
) {
  if (!fileId || !isDriveServiceAccountConfigured()) return;

  const driveClient = google.drive({ version: 'v3', auth: getServiceAccountAuth() as never });
  await shareDriveFileWithEmails(driveClient, fileId, emails, role);
}

function buildDriveAuth(userRefreshToken?: string | null): { auth: Auth.OAuth2Client | Auth.GoogleAuth; userDrive: boolean } {
  if (userRefreshToken && isUserDriveOAuthConfigured()) {
    const oauthClient = buildOAuth2Client();
    oauthClient.setCredentials({ refresh_token: decryptGoogleRefreshToken(userRefreshToken) });
    return { auth: oauthClient, userDrive: true };
  }
  if (!isDriveServiceAccountConfigured()) {
    throw new Error('Google Drive is not configured: connect user Drive or set service account credentials');
  }
  return { auth: getServiceAccountAuth(), userDrive: false };
}

function splitFileName(name: string) {
  const trimmed = sanitizeDriveName(name);
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0 || dot === trimmed.length - 1) return { base: trimmed, ext: '' };
  return { base: trimmed.slice(0, dot), ext: trimmed.slice(dot) };
}

async function findDriveFileByName(
  driveClient: ReturnType<typeof google.drive>,
  folderId: string,
  fileName: string,
) {
  const escapedName = escapeDriveQuery(sanitizeDriveName(fileName));
  const existing = await driveClient.files.list({
    q: `name='${escapedName}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,size,webViewLink)',
    spaces: 'drive',
    pageSize: 10,
  });
  return existing.data.files?.[0] ?? null;
}

async function resolveDriveDuplicate(
  driveClient: ReturnType<typeof google.drive>,
  folderId: string,
  requestedName: string,
  fileSize: number,
  policy: DriveUploadOptions['duplicatePolicy'] = 'rename',
) {
  const safeName = sanitizeDriveName(requestedName);
  const existing = await findDriveFileByName(driveClient, folderId, safeName);
  if (!existing) return { fileName: safeName };

  const duplicate = {
    existingFileId: existing.id ?? undefined,
    existingFileName: existing.name ?? safeName,
    existingSize: existing.size ? Number(existing.size) : null,
    requestedFileName: safeName,
  };

  if (policy === 'error') {
    const sizeText = duplicate.existingSize === fileSize ? 'same size' : `existing size ${duplicate.existingSize ?? 'unknown'}, new size ${fileSize}`;
    throw new Error(`Duplicate Drive file: ${safeName} (${sizeText})`);
  }
  if (policy === 'skip') return { fileName: safeName, existing, duplicate: { policy, ...duplicate } };
  if (policy === 'replace') return { fileName: safeName, existing, duplicate: { policy, ...duplicate } };

  const { base, ext } = splitFileName(safeName);
  for (let index = 2; index <= 200; index += 1) {
    const candidate = `${base} (${index})${ext}`;
    const candidateExists = await findDriveFileByName(driveClient, folderId, candidate);
    if (!candidateExists) {
      return { fileName: candidate, duplicate: { policy: 'rename' as const, ...duplicate } };
    }
  }
  throw new Error(`Could not generate a unique Drive file name for ${safeName}`);
}

export async function ensureProjectDriveFolder(input: {
  companyName: string;
  companyTaxId?: string | null;
  projectCode: string;
  projectName: string;
  userRefreshToken?: string | null;
  shareWithEmails?: string[];
}): Promise<{ folderId: string; folderUrl: string; userDrive: boolean }> {
  const { auth, userDrive } = buildDriveAuth(input.userRefreshToken);
  const driveClient = google.drive({ version: 'v3', auth: auth as never });
  const folder = await ensureProjectFolder(driveClient, input.companyName, {
    companyTaxId: input.companyTaxId,
    projectCode: input.projectCode,
    projectName: input.projectName,
  });
  if (!userDrive) {
    await shareDriveFileWithEmails(
      driveClient,
      folder.projectFolderId ?? folder.targetFolderId,
      input.shareWithEmails,
      'writer',
    );
  }
  return {
    folderId: folder.projectFolderId ?? folder.targetFolderId,
    folderUrl: folder.projectFolderUrl ?? folder.targetFolderUrl,
    userDrive,
  };
}

export async function ensureCompanyDriveFolder(input: {
  companyName: string;
  companyTaxId?: string | null;
  userRefreshToken?: string | null;
  shareWithEmails?: string[];
}): Promise<{ folderId: string; folderUrl: string; userDrive: boolean }> {
  const { auth, userDrive } = buildDriveAuth(input.userRefreshToken);
  const driveClient = google.drive({ version: 'v3', auth: auth as never });
  const folder = await ensureProjectFolder(driveClient, input.companyName, { companyTaxId: input.companyTaxId });
  if (!userDrive) {
    await shareDriveFileWithEmails(driveClient, folder.targetFolderId, input.shareWithEmails, 'writer');
  }
  return {
    folderId: folder.targetFolderId,
    folderUrl: folder.targetFolderUrl,
    userDrive,
  };
}

/**
 * Upload a file to Google Drive.
 * Prefers per-user OAuth (refreshToken) when available; falls back to service account.
 */
export async function uploadToDrive(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string,
  companyName: string,
  userRefreshToken?: string | null,
  options: DriveUploadOptions = {},
): Promise<DriveUploadResult> {
  const { auth, userDrive } = buildDriveAuth(userRefreshToken);
  logger.info(userDrive ? 'Drive upload: using user OAuth token' : 'Drive upload: using service account', { companyName });

  const driveClient = google.drive({ version: 'v3', auth: auth as never });

  const folder = await ensureProjectFolder(driveClient, companyName, options);
  if (!userDrive) {
    if (folder.projectFolderId) {
      await shareDriveFileWithEmails(driveClient, folder.projectFolderId, options.shareWithEmails, 'writer');
    }
    await shareDriveFileWithEmails(driveClient, folder.targetFolderId, options.shareWithEmails, 'writer');
  }

  const duplicateResolution = await resolveDriveDuplicate(
    driveClient,
    folder.targetFolderId,
    originalName,
    fileBuffer.length,
    options.duplicatePolicy ?? 'rename',
  );

  if (duplicateResolution.existing && duplicateResolution.duplicate?.policy === 'skip') {
    const fileId = duplicateResolution.existing.id!;
    return {
      fileId,
      url: duplicateResolution.existing.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
      fileName: duplicateResolution.existing.name ?? duplicateResolution.fileName,
      folderId: folder.targetFolderId,
      folderUrl: folder.targetFolderUrl,
      projectFolderId: folder.projectFolderId,
      projectFolderUrl: folder.projectFolderUrl,
      userDrive,
      duplicate: duplicateResolution.duplicate,
    };
  }

  const writeRequest = {
    media: { mimeType, body: Readable.from(fileBuffer) },
    fields: 'id,name,webViewLink',
  };
  const res = duplicateResolution.existing && duplicateResolution.duplicate?.policy === 'replace'
    ? await driveClient.files.update({
      fileId: duplicateResolution.existing.id!,
      requestBody: { name: duplicateResolution.fileName },
      ...writeRequest,
    })
    : await driveClient.files.create({
      requestBody: { name: duplicateResolution.fileName, parents: [folder.targetFolderId] },
      ...writeRequest,
    });

  const fileId = res.data.id!;
  const fileName = res.data.name ?? originalName;

  if (options.shareAnyone === true) {
    try {
      await driveClient.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' },
      });
    } catch {
      logger.warn('Could not set Drive file to public', { fileId });
    }
  }

  const url = res.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;
  return {
    fileId,
    url,
    fileName,
    folderId: folder.targetFolderId,
    folderUrl: folder.targetFolderUrl,
    projectFolderId: folder.projectFolderId,
    projectFolderUrl: folder.projectFolderUrl,
    userDrive,
    duplicate: duplicateResolution.duplicate,
  };
}
