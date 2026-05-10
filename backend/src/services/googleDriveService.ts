import { google, Auth } from 'googleapis';
import { Readable } from 'stream';
import { logger } from '../config/logger';

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
    scope: ['https://www.googleapis.com/auth/drive.file'],
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

export interface DriveUploadOptions {
  projectCode?: string | null;
  projectName?: string | null;
  documentFolder?: DriveDocumentFolder | null;
  shareAnyone?: boolean;
  shareWithEmails?: string[];
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
  const companyId = await ensureChildFolder(driveClient, companyName, rootId);

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
    oauthClient.setCredentials({ refresh_token: userRefreshToken });
    return { auth: oauthClient, userDrive: true };
  }
  if (!isDriveServiceAccountConfigured()) {
    throw new Error('Google Drive is not configured: connect user Drive or set service account credentials');
  }
  return { auth: getServiceAccountAuth(), userDrive: false };
}

export async function ensureProjectDriveFolder(input: {
  companyName: string;
  projectCode: string;
  projectName: string;
  userRefreshToken?: string | null;
  shareWithEmails?: string[];
}): Promise<{ folderId: string; folderUrl: string; userDrive: boolean }> {
  const { auth, userDrive } = buildDriveAuth(input.userRefreshToken);
  const driveClient = google.drive({ version: 'v3', auth: auth as never });
  const folder = await ensureProjectFolder(driveClient, input.companyName, {
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
  let auth: Auth.OAuth2Client | Auth.GoogleAuth;
  let userDrive = false;

  ({ auth, userDrive } = buildDriveAuth(userRefreshToken));
  logger.info(userDrive ? 'Drive upload: using user OAuth token' : 'Drive upload: using service account', { companyName });

  const driveClient = google.drive({ version: 'v3', auth: auth as never });

  const folder = await ensureProjectFolder(driveClient, companyName, options);
  if (!userDrive && folder.projectFolderId) {
    await shareDriveFileWithEmails(driveClient, folder.projectFolderId, options.shareWithEmails, 'writer');
  }

  const res = await driveClient.files.create({
    requestBody: { name: originalName, parents: [folder.targetFolderId] },
    media: { mimeType, body: Readable.from(fileBuffer) },
    fields: 'id,name,webViewLink',
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
  };
}
