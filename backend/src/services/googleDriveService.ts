import { google, Auth } from 'googleapis';
import { Readable } from 'stream';
import { logger } from '../config/logger';

export function isDriveConfigured(): boolean {
  // Configured if service account OR user OAuth credentials are set
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  );
}

export function isUserDriveOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Build OAuth2 client for the Authorization Code flow (per-user Drive). */
export function buildOAuth2Client(): Auth.OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REDIRECT_URI ?? `${process.env.API_URL ?? 'http://localhost:4000'}/api/drive/callback`,
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

function getServiceAccountAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (key) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(key),
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
  }
  return new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
}

const FOLDER_NAME = 'ETax Expenses';

async function ensureFolder(
  driveClient: ReturnType<typeof google.drive>,
  companyName: string,
): Promise<string> {
  const rootQ = await driveClient.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  let rootId: string;
  if (rootQ.data.files?.length) {
    rootId = rootQ.data.files[0].id!;
  } else {
    const f = await driveClient.files.create({
      requestBody: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });
    rootId = f.data.id!;
  }

  const safeName = companyName.replace(/['"\\]/g, '');
  const subQ = await driveClient.files.list({
    q: `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and '${rootId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  if (subQ.data.files?.length) return subQ.data.files[0].id!;

  const sub = await driveClient.files.create({
    requestBody: { name: safeName, mimeType: 'application/vnd.google-apps.folder', parents: [rootId] },
    fields: 'id',
  });
  return sub.data.id!;
}

export interface DriveUploadResult {
  fileId: string;
  url: string;
  fileName: string;
  /** Whether the file landed in the user's personal Drive (true) or service account Drive (false) */
  userDrive: boolean;
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
): Promise<DriveUploadResult> {
  let auth: Auth.OAuth2Client | Auth.GoogleAuth;
  let userDrive = false;

  if (userRefreshToken && isUserDriveOAuthConfigured()) {
    const oauthClient = buildOAuth2Client();
    oauthClient.setCredentials({ refresh_token: userRefreshToken });
    auth = oauthClient;
    userDrive = true;
    logger.info('Drive upload: using user OAuth token', { companyName });
  } else {
    auth = getServiceAccountAuth();
    logger.info('Drive upload: using service account', { companyName });
  }

  const driveClient = google.drive({ version: 'v3', auth: auth as never });

  const folderId = await ensureFolder(driveClient, companyName);

  const res = await driveClient.files.create({
    requestBody: { name: originalName, parents: [folderId] },
    media: { mimeType, body: Readable.from(fileBuffer) },
    fields: 'id,name,webViewLink',
  });

  const fileId = res.data.id!;
  const fileName = res.data.name ?? originalName;

  try {
    await driveClient.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  } catch {
    logger.warn('Could not set Drive file to public', { fileId });
  }

  const url = res.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;
  return { fileId, url, fileName, userDrive };
}
