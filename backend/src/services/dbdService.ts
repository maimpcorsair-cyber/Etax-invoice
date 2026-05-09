import { logger } from '../config/logger';

type DbdRawResponse = Record<string, unknown>;

export interface DbdJuristicProfile {
  juristicId: string;
  oldJuristicId: string | null;
  nameTh: string | null;
  nameEn: string | null;
  type: string | null;
  typeName: string | null;
  status: string | null;
  registerDate: string | null;
  registerCapital: number | null;
  paidRegisterCapital: number | null;
  standardId: string | null;
  raw: DbdRawResponse;
}

export interface DbdLookupResult {
  source: 'dga-dbd';
  profile: DbdJuristicProfile | null;
  raw: DbdRawResponse;
}

const DGA_BASE_URL = process.env.DGA_BASE_URL ?? 'https://api.egov.go.th';
const DBD_PROFILE_PATH = process.env.DBD_PROFILE_PATH ?? '/ws/dbd/juristic/v4/profile/information';
const DBD_SEARCH_BY_NAME_PATH = process.env.DBD_SEARCH_BY_NAME_PATH ?? '/ws/dbd/juristic/v4/profile/infobyname';
const DGA_VALIDATE_PATH = process.env.DGA_VALIDATE_PATH ?? '/ws/auth/validate';
const REQUEST_TIMEOUT_MS = Number(process.env.DBD_REQUEST_TIMEOUT_MS ?? 10000);

let cachedToken: { token: string; expiresAt: number } | null = null;

export function isDbdConfigured() {
  return Boolean(process.env.DGA_CONSUMER_KEY && process.env.DGA_CONSUMER_SECRET && process.env.DGA_AGENT_ID);
}

function normalizeJuristicId(value: string) {
  return value.replace(/\D/g, '');
}

function getBaseUrl() {
  return DGA_BASE_URL.replace(/\/+$/, '');
}

function readString(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstResult(raw: DbdRawResponse) {
  const resultList = raw.ResultList;
  if (Array.isArray(resultList) && resultList.length > 0 && typeof resultList[0] === 'object' && resultList[0]) {
    return resultList[0] as Record<string, unknown>;
  }
  return raw;
}

function mapProfile(raw: DbdRawResponse): DbdJuristicProfile | null {
  const item = firstResult(raw);
  const juristicId = readString(item.JuristicID);
  if (!juristicId) return null;

  return {
    juristicId,
    oldJuristicId: readString(item.OldJuristicID),
    nameTh: readString(item.JuristicName_TH) ?? readString(item.JuristicName),
    nameEn: readString(item.JuristicName_EN),
    type: readString(item.JuristicType),
    typeName: readString(item.JuristicTypeName),
    status: readString(item.JuristicStatus),
    registerDate: readString(item.RegisterDate),
    registerCapital: readNumber(item.RegisterCapital),
    paidRegisterCapital: readNumber(item.PaidRegisterCapital),
    standardId: readString(item.StandardID),
    raw,
  };
}

async function fetchJson(url: URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let json: unknown = {};
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { rawText: text };
      }
    }

    if (!res.ok) {
      const message = typeof json === 'object' && json && 'message' in json ? String(json.message) : text;
      throw new Error(`DBD API returned ${res.status}${message ? `: ${message}` : ''}`);
    }

    if (!json || typeof json !== 'object') {
      throw new Error('DBD API returned an invalid response');
    }

    return json as DbdRawResponse;
  } finally {
    clearTimeout(timer);
  }
}

async function getDgaToken() {
  if (!isDbdConfigured()) {
    throw new Error('DBD API is not configured');
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.token;

  const url = new URL(`${getBaseUrl()}${DGA_VALIDATE_PATH}`);
  url.searchParams.set('ConsumerSecret', process.env.DGA_CONSUMER_SECRET!);
  url.searchParams.set('AgentID', process.env.DGA_AGENT_ID!);

  const raw = await fetchJson(url, {
    method: 'GET',
    headers: {
      'Consumer-Key': process.env.DGA_CONSUMER_KEY!,
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    },
  });

  const token = readString(raw.Result) ?? readString(raw.Token) ?? readString(raw.token);
  if (!token) {
    logger.warn('DGA validate response did not include a token', { keys: Object.keys(raw) });
    throw new Error('DGA token response did not include a token');
  }

  cachedToken = { token, expiresAt: now + 55 * 60 * 1000 };
  return token;
}

async function getDbdHeaders() {
  const token = await getDgaToken();
  return {
    'Consumer-Key': process.env.DGA_CONSUMER_KEY!,
    Token: token,
    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
  };
}

export async function lookupDbdJuristicProfile(juristicIdInput: string): Promise<DbdLookupResult> {
  const juristicId = normalizeJuristicId(juristicIdInput);
  if (juristicId.length !== 13) {
    throw new Error('Juristic ID must be 13 digits');
  }

  const url = new URL(`${getBaseUrl()}${DBD_PROFILE_PATH}`);
  url.searchParams.set('JuristicID', juristicId);

  const raw = await fetchJson(url, { method: 'GET', headers: await getDbdHeaders() });
  return { source: 'dga-dbd', profile: mapProfile(raw), raw };
}

export async function searchDbdJuristicByName(name: string): Promise<DbdRawResponse> {
  const normalized = name.trim();
  if (normalized.length < 2) {
    throw new Error('Name must be at least 2 characters');
  }

  const url = new URL(`${getBaseUrl()}${DBD_SEARCH_BY_NAME_PATH}`);
  url.searchParams.set('Name', normalized);

  return fetchJson(url, { method: 'GET', headers: await getDbdHeaders() });
}
