import { google } from 'googleapis';
import { Readable } from 'stream';
import { logger } from '../config/logger';

export function isDriveConfigured(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

function getAuth() {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    const credentials = JSON.parse(serviceAccountKey);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });
  }
  return new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });
}

const FOLDER_PREFIX = 'ETax Expenses';

/**
 * Ensure a folder exists for the company under the root "ETax Expenses" folder.
 * Returns the folderId. Creates hierarchy if missing.
 */
async function ensureCompanyFolder(driveClient: ReturnType<typeof google.drive>, companyName: string): Promise<string> {
  // Find or create root folder
  const rootQuery = await driveClient.files.list({
    q: `name='${FOLDER_PREFIX}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  let rootId: string;
  if (rootQuery.data.files && rootQuery.data.files.length > 0) {
    rootId = rootQuery.data.files[0].id!;
  } else {
    const created = await driveClient.files.create({
      requestBody: { name: FOLDER_PREFIX, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });
    rootId = created.data.id!;
  }

  // Find or create company sub-folder
  const safeName = companyName.replace(/['"\\]/g, '');
  const subQuery = await driveClient.files.list({
    q: `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and '${rootId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  if (subQuery.data.files && subQuery.data.files.length > 0) {
    return subQuery.data.files[0].id!;
  }

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
}

/**
 * Upload a file buffer to Google Drive under the company's folder.
 * Makes it publicly viewable and returns a shareable URL.
 */
export async function uploadToDrive(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string,
  companyName: string,
): Promise<DriveUploadResult> {
  const auth = getAuth();
  const driveClient = google.drive({ version: 'v3', auth });

  const folderId = await ensureCompanyFolder(driveClient, companyName);

  const stream = Readable.from(fileBuffer);

  const res = await driveClient.files.create({
    requestBody: {
      name: originalName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id,name,webViewLink',
  });

  const fileId = res.data.id!;
  const fileName = res.data.name ?? originalName;

  // Make publicly viewable so the URL works without auth
  try {
    await driveClient.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  } catch {
    logger.warn('Could not set Drive file permissions to public', { fileId });
  }

  const url = res.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;

  logger.info('Uploaded file to Google Drive', { fileId, fileName, companyName });

  return { fileId, url, fileName };
}
