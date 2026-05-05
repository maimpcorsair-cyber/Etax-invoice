/**
 * rdApiService.ts
 * ส่งเอกสาร e-Tax Invoice ไปยัง กรมสรรพากร (RD)
 *
 * ─── Environments ───────────────────────────────────────────────────────────
 * sandbox    : https://etax.rd.go.th/etax-api/v3  (test — ไม่มีผลจริง)
 * production : https://etax.rd.go.th/etax-api/v3  (ใช้งานจริง ต้องได้รับอนุมัติ)
 *
 * ─── Authentication (OAuth 2.0 Client Credentials) ──────────────────────────
 * POST /auth/token
 *   Body: { client_id, client_secret, grant_type: "client_credentials" }
 *   Response: { access_token, expires_in, token_type: "Bearer" }
 *
 * ─── Submit Document ─────────────────────────────────────────────────────────
 * POST /document/submit
 *   Header: Authorization: Bearer <access_token>
 *   Body (JSON):
 *   {
 *     "taxId":      "0105560123456",
 *     "branchId":   "00000",
 *     "docType":    "T02",              // T01/T02/T03/T04/T05
 *     "docDate":    "2026-04-20",
 *     "docNum":     "INV-202604-000001",
 *     "netAmt":     100000.00,
 *     "vatAmt":     7000.00,
 *     "totalAmt":   107000.00,
 *     "xmlContent": "<base64-encoded signed XML>",
 *     "pdfContent": "<base64-encoded PDF>",   // optional
 *   }
 *   Response: { docId, status, message }
 *
 * NOTE: RD API requires approval — this service uses SANDBOX mode by default.
 *       Set RD_ENVIRONMENT=production + valid RD_CLIENT_ID/SECRET to go live.
 */

import https from 'https';
import { logger } from '../config/logger';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RDSubmitPayload {
  taxId: string;
  branchId: string;
  docType: string;           // T01 | T02 | T03 | T04 | T05
  docDate: string;           // YYYY-MM-DD
  docNum: string;
  netAmt: number;
  vatAmt: number;
  totalAmt: number;
  xmlContent: string;        // base64 signed XML
  pdfContent?: string;       // base64 PDF (optional)
  buyerTaxId?: string;
  buyerBranchId?: string;
}

export interface RDSubmitResult {
  success: boolean;
  docId?: string;
  rdRefNumber?: string;      // เลขอ้างอิงจาก RD
  status: string;
  message: string;
  submittedAt: string;
  isMock: boolean;
  rawResponse?: unknown;
}

interface RDTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface RDClientConfig {
  environment?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
}

// ── Token cache ───────────────────────────────────────────────────────────────
const _tokenCache = new Map<string, { token: string; expiresAt: number }>();

function getBaseUrl(_environment?: string): string {
  // Both sandbox & production use the same host; sandbox uses test credentials
  return 'https://etax.rd.go.th/etax-api/v3';
}

function httpRequest(options: https.RequestOptions & { body?: string }): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const { body, ...reqOptions } = options;
    const parsed = typeof reqOptions.host === 'string'
      ? { hostname: reqOptions.host, port: reqOptions.port, path: reqOptions.path }
      : reqOptions;

    const req = https.request({ ...reqOptions, ...parsed, rejectUnauthorized: process.env.NODE_ENV === 'production' }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('RD API timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

/** OAuth2 client_credentials flow */
async function getAccessToken(config?: RDClientConfig): Promise<string> {
  const clientId = config?.clientId ?? process.env.RD_CLIENT_ID;
  const clientSecret = config?.clientSecret ?? process.env.RD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('RD_CLIENT_ID and RD_CLIENT_SECRET are not configured');
  }

  const cacheKey = clientId;
  const cached = _tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - 60000) {
    return cached.token;
  }

  const baseUrl = getBaseUrl();
  const parsed = new URL(`${baseUrl}/auth/token`);

  const body = JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' });

  const res = await httpRequest({
    hostname: parsed.hostname,
    port: 443,
    path: parsed.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    body,
  });

  if (res.status !== 200) throw new Error(`RD Auth failed: HTTP ${res.status} — ${res.body}`);

  const data = JSON.parse(res.body) as RDTokenResponse;
  _tokenCache.set(cacheKey, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
  logger.info('RD: access token refreshed');
  return data.access_token;
}

/** Mock submission (sandbox dev — no real RD API keys) */
function mockSubmit(payload: RDSubmitPayload): RDSubmitResult {
  const mockDocId = `MOCK-${payload.docType}-${Date.now().toString(36).toUpperCase()}`;
  logger.warn(`RD: MOCK submission — docNum=${payload.docNum}, docType=${payload.docType}`);
  return {
    success: true,
    docId: mockDocId,
    rdRefNumber: `RD-${Math.floor(Math.random() * 1e9).toString().padStart(10, '0')}`,
    status: 'MOCK_ACCEPTED',
    message: `[SANDBOX MOCK] เอกสาร ${payload.docNum} ได้รับการบันทึกแล้ว (dev mode)`,
    submittedAt: new Date().toISOString(),
    isMock: true,
    rawResponse: payload,
  };
}

/**
 * ส่งเอกสารไปยัง RD
 * - sandbox / no credentials → mock
 * - production + credentials → real API
 */
export async function submitToRD(payload: RDSubmitPayload, config?: RDClientConfig): Promise<RDSubmitResult> {
  const env = config?.environment ?? process.env.RD_ENVIRONMENT ?? 'sandbox';
  const clientId = config?.clientId ?? process.env.RD_CLIENT_ID;
  const clientSecret = config?.clientSecret ?? process.env.RD_CLIENT_SECRET;
  const hasCredentials = !!(clientId && clientSecret);

  // Use mock if: sandbox mode or missing credentials
  if (env !== 'production' || !hasCredentials) {
    logger.info(`RD: using mock submission (env=${env}, hasCredentials=${hasCredentials})`);
    return mockSubmit(payload);
  }

  try {
    const token = await getAccessToken(config);
    const baseUrl = getBaseUrl(env);
    const parsed = new URL(`${baseUrl}/document/submit`);

    const body = JSON.stringify(payload);
    const res = await httpRequest({
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${token}`,
      },
      body,
    });

    const data = JSON.parse(res.body) as { docId?: string; refNo?: string; status?: string; message?: string };

    if (res.status === 200 || res.status === 201) {
      logger.info(`RD: document submitted successfully — docId=${data.docId}`);
      return {
        success: true,
        docId: data.docId,
        rdRefNumber: data.refNo,
        status: data.status ?? 'ACCEPTED',
        message: data.message ?? 'Submitted successfully',
        submittedAt: new Date().toISOString(),
        isMock: false,
        rawResponse: data,
      };
    } else {
      logger.error(`RD: submission failed — HTTP ${res.status}: ${res.body}`);
      return {
        success: false,
        status: `HTTP_${res.status}`,
        message: data.message ?? `HTTP ${res.status}`,
        submittedAt: new Date().toISOString(),
        isMock: false,
        rawResponse: data,
      };
    }
  } catch (err) {
    logger.error(`RD: submission error — ${(err as Error).message}`);
    return {
      success: false,
      status: 'ERROR',
      message: (err as Error).message,
      submittedAt: new Date().toISOString(),
      isMock: false,
    };
  }
}

/** ตรวจสอบสถานะเอกสารที่ส่งไปแล้ว */
export async function checkDocumentStatus(docId: string, config?: RDClientConfig): Promise<{ status: string; message: string }> {
  const env = config?.environment ?? process.env.RD_ENVIRONMENT ?? 'sandbox';
  if (env !== 'production') {
    return { status: 'MOCK_PENDING', message: 'Mock: document is being processed' };
  }

  try {
    const token = await getAccessToken(config);
    const baseUrl = getBaseUrl(env);
    const parsed = new URL(`${baseUrl}/document/status/${docId}`);

    const res = await httpRequest({
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = JSON.parse(res.body) as { status?: string; message?: string };
    return { status: data.status ?? 'UNKNOWN', message: data.message ?? '' };
  } catch (err) {
    return { status: 'ERROR', message: (err as Error).message };
  }
}

// ── Document cancellation ────────────────────────────────────────────────────

export interface RDCancelResult {
  success: boolean;
  message: string;
  isMock: boolean;
  rawResponse?: unknown;
}

/** Mock cancel response (sandbox / dev mode) */
function mockCancel(docId: string, docNum: string): RDCancelResult {
  logger.warn(`RD: MOCK cancel — docId=${docId}, docNum=${docNum}`);
  return {
    success: true,
    message: `[SANDBOX MOCK] ยกเลิกเอกสาร ${docNum} แล้ว (dev mode)`,
    isMock: true,
    rawResponse: { docId, docNum, cancelledAt: new Date().toISOString() },
  };
}

/**
 * ยกเลิกเอกสารที่ส่งไปแล้วที่ กรมสรรพากร
 * POST /document/cancel
 *
 * Flow:
 *  - sandbox / no credentials → mock success
 *  - production + credentials → real POST to RD
 *  - RD call fails → still return { success: false } so caller can decide how to handle
 */
export async function cancelDocumentRD(
  docId: string,
  docNum: string,
  reason: string,
  config?: RDClientConfig,
): Promise<RDCancelResult> {
  const env = config?.environment ?? process.env.RD_ENVIRONMENT ?? 'sandbox';
  const clientId = config?.clientId ?? process.env.RD_CLIENT_ID;
  const clientSecret = config?.clientSecret ?? process.env.RD_CLIENT_SECRET;
  const hasCredentials = !!(clientId && clientSecret);

  if (env !== 'production' || !hasCredentials) {
    return mockCancel(docId, docNum);
  }

  try {
    const token = await getAccessToken(config);
    const baseUrl = getBaseUrl(env);
    const parsed = new URL(`${baseUrl}/document/cancel`);

    const body = JSON.stringify({ docId, docNum, reason });
    const res = await httpRequest({
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${token}`,
      },
      body,
    });

    const data = JSON.parse(res.body) as { success?: boolean; message?: string };

    if (res.status === 200 || res.status === 201) {
      logger.info(`RD: document cancelled — docId=${docId}, docNum=${docNum}`);
      return {
        success: true,
        message: data.message ?? `ยกเลิกเอกสาร ${docNum} ที่กรมสรรพากรแล้ว`,
        isMock: false,
        rawResponse: data,
      };
    } else {
      logger.error(`RD: cancel failed — HTTP ${res.status}: ${res.body}`);
      return {
        success: false,
        message: data.message ?? `HTTP ${res.status}`,
        isMock: false,
        rawResponse: data,
      };
    }
  } catch (err) {
    logger.error(`RD: cancel error — ${(err as Error).message}`);
    return {
      success: false,
      message: (err as Error).message,
      isMock: false,
    };
  }
}
