import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import type { AuthPayload } from '../middleware/auth';

type RawRow = Record<string, unknown>;

export interface LocalJuristicSuggestion {
  taxId: string;
  nameTh: string | null;
  nameEn: string | null;
  addressTh: string | null;
  branchCode: string;
  branchNameTh: string | null;
  branchNameEn: string | null;
  email: string | null;
  phone: string | null;
  contactPerson: string | null;
  status: string | null;
  juristicType: string | null;
  source: 'billboy-verified' | 'open-dbd' | 'rd-vat';
  lastSyncedAt: string | null;
  vatRegistered: boolean;
  vatName: string | null;
  vatAddress: string | null;
  vatLastSyncedAt: string | null;
  verifiedByThisCompany: boolean;
}

export interface LocalJuristicLookupResult {
  profile: LocalJuristicSuggestion | null;
  verifiedProfile: LocalJuristicSuggestion | null;
  openDataProfile: LocalJuristicSuggestion | null;
}

interface NormalizedDbdRecord {
  taxId: string;
  nameTh: string | null;
  nameEn: string | null;
  addressTh: string | null;
  status: string | null;
  juristicType: string | null;
  raw: RawRow;
}

interface NormalizedVatRecord {
  taxId: string;
  vatName: string | null;
  vatAddress: string | null;
  raw: RawRow;
}

interface NormalizedMocJuristicRecord {
  taxId: string;
  nameTh: string | null;
  nameEn: string | null;
  addressTh: string | null;
  status: string | null;
  juristicType: string | null;
  raw: RawRow;
}

interface SyncResult {
  kind: 'dbd_juristic' | 'rd_vat';
  status: 'success' | 'skipped' | 'failed';
  source: string | null;
  recordsRead: number;
  recordsUpserted: number;
  error?: string;
}

interface OpenDataSyncOptions {
  startRow?: number;
  maxRows?: number;
  delayMs?: number;
}

const BATCH_SIZE = parseInt(process.env.DBD_OPEN_DATA_BATCH_SIZE ?? '500', 10);
const SEARCH_LIMIT = 10;
const MOC_JURISTIC_API_URL = process.env.MOC_JURISTIC_API_URL ?? 'https://dataapi.moc.go.th/juristic';
const DBD_OPENAPI_JURISTIC_API_URL = process.env.DBD_OPENAPI_JURISTIC_API_URL ?? 'https://openapi.dbd.go.th/api/v1/juristic_person';
const DBD_OPENAPI_JURISTIC_LOOKUP_ENABLED = process.env.DBD_OPENAPI_JURISTIC_LOOKUP_ENABLED !== 'false';
const MOC_JURISTIC_LOOKUP_TIMEOUT_MS = parseInt(process.env.MOC_JURISTIC_LOOKUP_TIMEOUT_MS ?? '1500', 10);

function normalizeTaxId(value: unknown) {
  if (typeof value === 'number') return String(value).replace(/\D/g, '').padStart(13, '0');
  if (typeof value !== 'string') return '';
  return value.replace(/\D/g, '');
}

function sanitizeOpenDataText(value: string) {
  return value.replace(/\u0000/g, '').trim();
}

function normalizeKey(value: string) {
  return sanitizeOpenDataText(value).toLowerCase().replace(/[\s_\-./\\()[\]:*?"'“”‘’]+/g, '');
}

function normalizedKeyCandidates(value: string) {
  const candidates = [normalizeKey(value)];
  const namespaceIndex = value.lastIndexOf(':');
  if (namespaceIndex >= 0) candidates.push(normalizeKey(value.slice(namespaceIndex + 1)));
  return candidates;
}

function readString(value: unknown) {
  if (typeof value === 'string') {
    const sanitized = sanitizeOpenDataText(value);
    if (sanitized === '-' || sanitized === '–' || sanitized === '—') return null;
    return sanitized || null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function pick(row: RawRow, aliases: string[]) {
  const wanted = new Set(aliases.map(normalizeKey));
  for (const [key, value] of Object.entries(row)) {
    if (normalizedKeyCandidates(key).some((candidate) => wanted.has(candidate))) return readString(value);
  }
  return null;
}

function pickObject(row: RawRow, aliases: string[]): RawRow | null {
  const wanted = new Set(aliases.map(normalizeKey));
  for (const [key, value] of Object.entries(row)) {
    if (!normalizedKeyCandidates(key).some((candidate) => wanted.has(candidate))) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as RawRow;
  }
  return null;
}

function compactJoin(parts: Array<string | null>) {
  const cleaned = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return cleaned.length > 0 ? cleaned.join(' ') : null;
}

function looksLikeIncompleteThaiAddress(address: string | null | undefined) {
  if (!address) return true;
  const normalized = address.replace(/\s+/g, ' ').trim();
  if (!normalized) return true;

  const hasAddressNumber = /[0-9๐-๙]/.test(normalized);
  const hasLocationMarker = /(ถนน|ซอย|อาคาร|หมู่|ชั้น|แขวง|ตำบล|เขต|อำเภอ|จังหวัด|กรุงเทพ)/.test(normalized);
  const isVeryShort = normalized.length < 45;

  return !hasAddressNumber || !hasLocationMarker || isVeryShort;
}

function composeThaiAddress(row: RawRow) {
  return compactJoin([
    pick(row, ['address', 'addressTh', 'Address_TH', 'FullAddress', 'JuristicAddress', 'ที่อยู่', 'ที่ตั้งสำนักงานใหญ่']),
    compactJoin([
      pick(row, ['Building', 'BuildingName', 'ชื่ออาคาร']),
      pick(row, ['RoomNo', 'Room', 'เลขที่ห้อง']),
      pick(row, ['Floor', 'FloorNo', 'ชั้นที่']),
      pick(row, ['Village', 'VillageName', 'ชื่อหมู่บ้าน']),
      pick(row, ['HouseNo', 'house_no', 'เลขที่', 'เลขที่ตั้ง']),
      pick(row, ['Moo', 'หมู่']),
      pick(row, ['Soi', 'ซอย']),
      pick(row, ['Yaek', 'แยก']),
      pick(row, ['Road', 'ถนน']),
    ]),
    pick(row, ['SubDistrict', 'Subdistrict', 'Tambon', 'ตำบล', 'แขวง']),
    pick(row, ['District', 'Amphur', 'อำเภอ', 'เขต']),
    pick(row, ['Province', 'จังหวัด']),
    pick(row, ['Postcode', 'ZipCode', 'รหัสไปรษณีย์']),
  ]);
}

function composeMocThaiAddress(row: RawRow) {
  const addressDetail = row.addressDetail && typeof row.addressDetail === 'object'
    ? row.addressDetail as RawRow
    : row;

  return compactJoin([
    compactJoin([
      pick(addressDetail, ['buildingName']),
      pick(addressDetail, ['roomNo']),
      pick(addressDetail, ['floor']),
      pick(addressDetail, ['villageName']),
      pick(addressDetail, ['houseNumber']),
      pick(addressDetail, ['moo']),
      pick(addressDetail, ['soi']),
      pick(addressDetail, ['street']),
    ]),
    pick(addressDetail, ['subDistrict']),
    pick(addressDetail, ['district']),
    pick(addressDetail, ['province']),
  ]);
}

function composeDbdOpenApiThaiAddress(row: RawRow) {
  const address = pickObject(row, ['OrganizationJuristicAddress', 'JuristicAddress', 'addressDetail']);
  const addressType = address ? pickObject(address, ['AddressType']) ?? address : row;
  const fullAddress = pick(addressType, ['Address', 'FullAddress', 'JuristicAddress']);

  return compactJoin([
    fullAddress,
    fullAddress ? null : compactJoin([
      pick(addressType, ['AddressNo', 'HouseNo']),
      pick(addressType, ['Building']),
      pick(addressType, ['RoomNo']),
      pick(addressType, ['Floor']),
      pick(addressType, ['Village']),
      pick(addressType, ['Moo']),
      pick(addressType, ['Soi']),
      pick(addressType, ['Yaek']),
      pick(addressType, ['Road']),
    ]),
    pickObject(addressType, ['CitySubDivision'])
      ? pick(pickObject(addressType, ['CitySubDivision'])!, ['CitySubDivisionTextTH'])
      : pick(addressType, ['SubDistrict', 'Subdistrict', 'Tambon']),
    pickObject(addressType, ['City'])
      ? pick(pickObject(addressType, ['City'])!, ['CityTextTH'])
      : pick(addressType, ['District', 'Amphur']),
    pickObject(addressType, ['CountrySubDivision'])
      ? pick(pickObject(addressType, ['CountrySubDivision'])!, ['CountrySubDivisionTextTH'])
      : pick(addressType, ['Province']),
    pick(addressType, ['Postcode', 'ZipCode']),
  ]);
}

function compactRawRow(row: RawRow): RawRow {
  return Object.fromEntries(
    Object.entries(row)
      .map(([key, value]) => [key.trim(), readString(value)] as const)
      .filter(([key, value]) => Boolean(key) && Boolean(value))
  );
}

function normalizeDbdRecord(row: RawRow): NormalizedDbdRecord | null {
  const taxId = normalizeTaxId(pick(row, [
    'OrganizationJuristicID',
    'JuristicID',
    'JuristicId',
    'TaxID',
    'TaxId',
    'เลขทะเบียนนิติบุคคล',
    'เลขนิติบุคคล',
    'เลขประจำตัวผู้เสียภาษี',
  ]));
  if (taxId.length !== 13) return null;

  return {
    taxId,
    nameTh: pick(row, ['JuristicName_TH', 'JuristicNameTH', 'JuristicName', 'Name_TH', 'CompanyNameTH', 'ชื่อนิติบุคคล', 'ชื่อไทย', 'ชื่อ']),
    nameEn: pick(row, ['JuristicName_EN', 'JuristicNameEN', 'Name_EN', 'CompanyNameEN', 'ชื่ออังกฤษ']),
    addressTh: composeThaiAddress(row),
    status: pick(row, ['JuristicStatus', 'Status', 'สถานะ', 'สถานะนิติบุคคล']),
    juristicType: pick(row, ['JuristicType', 'JuristicTypeName', 'Type', 'ประเภท', 'ประเภทนิติบุคคล']),
    raw: compactRawRow(row),
  };
}

function normalizeVatRecord(row: RawRow): NormalizedVatRecord | null {
  const taxId = normalizeTaxId(pick(row, [
    'TaxID',
    'TaxId',
    'NID',
    'tin',
    'เลขประจำตัวผู้เสียภาษี',
    'เลขผู้เสียภาษี',
    'เลขผู้เสียภาษีอากร',
  ]));
  if (taxId.length !== 13) return null;

  return {
    taxId,
    vatName: pick(row, ['Name', 'OperatorName', 'VatName', 'ชื่อผู้ประกอบการ', 'ชื่อ']),
    vatAddress: composeThaiAddress(row),
    raw: compactRawRow(row),
  };
}

function normalizeMocJuristicRecord(row: RawRow): NormalizedMocJuristicRecord | null {
  const taxId = normalizeTaxId(pick(row, ['juristicID', 'juristicId', 'juristic_id', 'OrganizationJuristicID']));
  if (taxId.length !== 13) return null;

  return {
    taxId,
    nameTh: pick(row, ['juristicNameTH', 'juristicNameTh', 'OrganizationJuristicNameTH']),
    nameEn: pick(row, ['juristicNameEN', 'juristicNameEn', 'OrganizationJuristicNameEN']),
    addressTh: composeMocThaiAddress(row) ?? composeDbdOpenApiThaiAddress(row),
    status: pick(row, ['juristicStatus', 'OrganizationJuristicStatus']),
    juristicType: pick(row, ['juristicType', 'OrganizationJuristicType']),
    raw: compactRawRow(row),
  };
}

function unwrapJuristicCandidate(row: RawRow): RawRow {
  return pickObject(row, ['OrganizationJuristicPerson', 'JuristicPerson']) ?? row;
}

function findFirstArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  for (const key of ['data', 'items', 'records', 'results', 'ResultList', 'result']) {
    const nested = findFirstArray(record[key]);
    if (nested) return nested;
  }

  for (const nested of Object.values(record)) {
    const found = findFirstArray(nested);
    if (found) return found;
  }
  return null;
}

function csvRowToObject(headers: string[], values: string[]): RawRow {
  const output: RawRow = {};
  headers.forEach((header, index) => {
    output[sanitizeOpenDataText(header)] = sanitizeOpenDataText(values[index] ?? '');
  });
  return output;
}

function parseCsv(text: string): RawRow[] {
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim().replace(/^\uFEFF/, ''));
  return rows.slice(1).map((values) => csvRowToObject(headers, values));
}

function* iterateCsvRows(text: string): Generator<RawRow> {
  let cell = '';
  let row: string[] = [];
  let quoted = false;
  let headers: string[] | null = null;

  const flushRow = function* (): Generator<RawRow> {
    if (!row.some((item) => item.trim())) {
      row = [];
      cell = '';
      return;
    }

    if (!headers) {
      headers = row.map((header) => sanitizeOpenDataText(header).replace(/^\uFEFF/, ''));
    } else {
      yield csvRowToObject(headers, row);
    }
    row = [];
    cell = '';
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      yield* flushRow();
    } else {
      cell += char;
    }
  }

  row.push(cell);
  yield* flushRow();
}

function parseRows(text: string): RawRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    const json = JSON.parse(trimmed) as unknown;
    const array = findFirstArray(json);
    if (!array) return [];
    return array.filter((item): item is RawRow => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  } catch {
    return parseCsv(text);
  }
}

function decodeSourceBuffer(buffer: Buffer, kind: 'dbd' | 'vat') {
  const preferredEncoding = kind === 'vat'
    ? (process.env.RD_VAT_DATA_ENCODING ?? process.env.VAT_OPEN_DATA_ENCODING ?? 'windows-874')
    : (process.env.OPEN_DBD_DATA_ENCODING ?? process.env.DBD_OPEN_DATA_ENCODING ?? 'utf-8');
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  try {
    return new TextDecoder(preferredEncoding).decode(bytes).replace(/\u0000/g, '');
  } catch {
    return buffer.toString('utf8').replace(/\u0000/g, '');
  }
}

async function readSourceText(kind: 'dbd' | 'vat'): Promise<{ text: string; source: string } | null> {
  const url = kind === 'dbd'
    ? process.env.OPEN_DBD_DATA_URL ?? process.env.DBD_OPEN_DATA_URL
    : process.env.RD_VAT_DATA_URL ?? process.env.VAT_OPEN_DATA_URL;
  const file = kind === 'dbd'
    ? process.env.OPEN_DBD_DATA_FILE ?? process.env.DBD_OPEN_DATA_FILE
    : process.env.RD_VAT_DATA_FILE ?? process.env.VAT_OPEN_DATA_FILE;

  if (file?.trim()) {
    return { text: decodeSourceBuffer(await readFile(file.trim()), kind), source: file.trim() };
  }

  if (url?.trim()) {
    const res = await fetch(url.trim());
    if (!res.ok) throw new Error(`${kind.toUpperCase()} open data returned ${res.status}`);
    return { text: decodeSourceBuffer(Buffer.from(await res.arrayBuffer()), kind), source: url.trim() };
  }

  return null;
}

async function recordSyncRun(input: Omit<SyncResult, 'status'> & { status: SyncResult['status']; triggeredBy?: string; startedAt: Date }) {
  try {
    await prisma.dbdOpenDataSyncRun.create({
      data: {
        kind: input.kind,
        status: input.status,
        source: input.source,
        recordsRead: input.recordsRead,
        recordsUpserted: input.recordsUpserted,
        error: input.error,
        triggeredBy: input.triggeredBy,
        startedAt: input.startedAt,
        finishedAt: new Date(),
      },
    });
  } catch (err) {
    logger.error('Failed to record DBD open data sync run', { error: err, kind: input.kind, status: input.status });
  }
}

function clampSyncNumber(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.min(Math.max(Math.trunc(value!), min), max);
}

async function waitForSyncThrottle(delayMs: number) {
  if (delayMs <= 0) return;
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function upsertDbdRecords(records: NormalizedDbdRecord[]) {
  let upserted = 0;
  const now = new Date();

  for (let index = 0; index < records.length; index += BATCH_SIZE) {
    const batch = records.slice(index, index + BATCH_SIZE);
    if (batch.length === 0) continue;

    const values = batch.map((record) => Prisma.sql`(
      ${randomUUID()},
      ${record.taxId},
      ${record.nameTh},
      ${record.nameEn},
      ${record.addressTh},
      ${record.status},
      ${record.juristicType},
      'open-dbd',
      CAST(${JSON.stringify(record.raw)} AS jsonb),
      ${now},
      ${now}
    )`);

    await prisma.$executeRaw`
      INSERT INTO "juristic_open_data_cache"
        ("id", "taxId", "nameTh", "nameEn", "addressTh", "status", "juristicType", "source", "raw", "lastSyncedAt", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("taxId") DO UPDATE SET
        "nameTh" = EXCLUDED."nameTh",
        "nameEn" = EXCLUDED."nameEn",
        "addressTh" = EXCLUDED."addressTh",
        "status" = EXCLUDED."status",
        "juristicType" = EXCLUDED."juristicType",
        "source" = 'open-dbd',
        "raw" = EXCLUDED."raw",
        "lastSyncedAt" = EXCLUDED."lastSyncedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
    upserted += batch.length;
  }

  return upserted;
}

async function upsertVatRecords(records: NormalizedVatRecord[]) {
  let upserted = 0;
  const now = new Date();

  for (let index = 0; index < records.length; index += BATCH_SIZE) {
    const batch = Array.from(new Map(records.slice(index, index + BATCH_SIZE).map((record) => [record.taxId, record])).values());
    if (batch.length === 0) continue;

    const values = batch.map((record) => Prisma.sql`(
      ${randomUUID()},
      ${record.taxId},
      ${record.vatName},
      ${record.vatAddress},
      'rd-vat',
      true,
      ${record.vatName},
      ${record.vatAddress},
      'rd-vat',
      ${now},
      ${now},
      ${now},
      CAST(${JSON.stringify(record.raw)} AS jsonb)
    )`);

    await prisma.$executeRaw`
      INSERT INTO "juristic_open_data_cache"
        ("id", "taxId", "nameTh", "addressTh", "source", "vatRegistered", "vatName", "vatAddress", "vatSource", "vatLastSyncedAt", "lastSyncedAt", "updatedAt", "raw")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("taxId") DO UPDATE SET
        "vatRegistered" = true,
        "vatName" = EXCLUDED."vatName",
        "vatAddress" = EXCLUDED."vatAddress",
        "vatSource" = 'rd-vat',
        "vatLastSyncedAt" = EXCLUDED."vatLastSyncedAt",
        "nameTh" = CASE
          WHEN "juristic_open_data_cache"."source" = 'rd-vat' OR "juristic_open_data_cache"."nameTh" IS NULL
          THEN EXCLUDED."nameTh"
          ELSE "juristic_open_data_cache"."nameTh"
        END,
        "addressTh" = CASE
          WHEN "juristic_open_data_cache"."source" = 'rd-vat' OR "juristic_open_data_cache"."addressTh" IS NULL
          THEN EXCLUDED."addressTh"
          ELSE "juristic_open_data_cache"."addressTh"
        END,
        "raw" = EXCLUDED."raw",
        "lastSyncedAt" = GREATEST("juristic_open_data_cache"."lastSyncedAt", EXCLUDED."lastSyncedAt"),
        "updatedAt" = EXCLUDED."updatedAt"
    `;
    upserted += batch.length;
  }

  return upserted;
}

async function upsertMocJuristicRecord(record: NormalizedMocJuristicRecord) {
  const now = new Date();
  const raw = { moc: record.raw };

  await prisma.$executeRaw`
    INSERT INTO "juristic_open_data_cache"
      ("id", "taxId", "nameTh", "nameEn", "addressTh", "status", "juristicType", "source", "raw", "lastSyncedAt", "updatedAt")
    VALUES (
      ${randomUUID()},
      ${record.taxId},
      ${record.nameTh},
      ${record.nameEn},
      ${record.addressTh},
      ${record.status},
      ${record.juristicType},
      'open-dbd',
      CAST(${JSON.stringify(raw)} AS jsonb),
      ${now},
      ${now}
    )
    ON CONFLICT ("taxId") DO UPDATE SET
      "nameTh" = COALESCE("juristic_open_data_cache"."nameTh", EXCLUDED."nameTh"),
      "nameEn" = COALESCE(EXCLUDED."nameEn", "juristic_open_data_cache"."nameEn"),
      "addressTh" = CASE
        WHEN EXCLUDED."addressTh" IS NULL
        THEN "juristic_open_data_cache"."addressTh"
        WHEN "juristic_open_data_cache"."addressTh" IS NULL
        THEN EXCLUDED."addressTh"
        WHEN LENGTH(EXCLUDED."addressTh") > LENGTH("juristic_open_data_cache"."addressTh")
          AND EXCLUDED."addressTh" ~ '[0-9๐-๙]'
        THEN TRIM(CONCAT(
          EXCLUDED."addressTh",
          CASE
            WHEN "juristic_open_data_cache"."addressTh" ~ '[0-9]{5}$'
              AND EXCLUDED."addressTh" !~ '[0-9]{5}$'
            THEN CONCAT(' ', substring("juristic_open_data_cache"."addressTh" from '([0-9]{5})$'))
            ELSE ''
          END
        ))
        ELSE COALESCE(EXCLUDED."addressTh", "juristic_open_data_cache"."addressTh")
      END,
      "status" = COALESCE(EXCLUDED."status", "juristic_open_data_cache"."status"),
      "juristicType" = COALESCE(EXCLUDED."juristicType", "juristic_open_data_cache"."juristicType"),
      "source" = CASE
        WHEN "juristic_open_data_cache"."source" = 'rd-vat'
        THEN "juristic_open_data_cache"."source"
        ELSE 'open-dbd'
      END,
      "raw" = COALESCE("juristic_open_data_cache"."raw", '{}'::jsonb) || EXCLUDED."raw",
      "lastSyncedAt" = GREATEST("juristic_open_data_cache"."lastSyncedAt", EXCLUDED."lastSyncedAt"),
      "updatedAt" = EXCLUDED."updatedAt"
  `;
}

async function fetchMocJuristicRecord(taxId: string): Promise<NormalizedMocJuristicRecord | null> {
  if (DBD_OPENAPI_JURISTIC_LOOKUP_ENABLED) {
    const dbdOpenApiRecord = await fetchDbdOpenApiJuristicRecord(taxId);
    if (dbdOpenApiRecord) return dbdOpenApiRecord;
  }

  if (process.env.MOC_JURISTIC_LOOKUP_ENABLED !== 'true') return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, MOC_JURISTIC_LOOKUP_TIMEOUT_MS));

  try {
    const url = new URL(MOC_JURISTIC_API_URL);
    url.searchParams.set('juristic_id', taxId);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Billboy/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn('[MOC Open Data] Juristic lookup returned non-OK status', { status: response.status, taxId });
      return null;
    }

    const text = await response.text();
    if (!text.trim()) return null;

    const parsed = JSON.parse(text) as unknown;
    const candidates = findFirstArray(parsed) ?? (parsed && typeof parsed === 'object' ? [parsed] : []);

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const record = normalizeMocJuristicRecord(unwrapJuristicCandidate(candidate as RawRow));
      if (record?.taxId === taxId) return record;
    }
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[MOC Open Data] Juristic lookup failed', { taxId, error: message });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDbdOpenApiJuristicRecord(taxId: string): Promise<NormalizedMocJuristicRecord | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, MOC_JURISTIC_LOOKUP_TIMEOUT_MS));

  try {
    const url = new URL(`${DBD_OPENAPI_JURISTIC_API_URL.replace(/\/$/, '')}/${taxId}`);
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Billboy/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn('[DBD OpenAPI] Juristic lookup returned non-OK status', { status: response.status, taxId });
      return null;
    }

    const text = await response.text();
    if (!text.trim()) return null;

    const parsed = JSON.parse(text) as unknown;
    const candidates = findFirstArray(parsed) ?? (parsed && typeof parsed === 'object' ? [parsed] : []);

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const record = normalizeMocJuristicRecord(unwrapJuristicCandidate(candidate as RawRow));
      if (record?.taxId === taxId) return record;
    }
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[DBD OpenAPI] Juristic lookup failed', { taxId, error: message });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function syncDbdOpenData(triggeredBy = 'manual'): Promise<SyncResult> {
  const startedAt = new Date();
  try {
    const source = await readSourceText('dbd');
    if (!source) {
      const result: SyncResult = { kind: 'dbd_juristic', status: 'skipped', source: null, recordsRead: 0, recordsUpserted: 0, error: 'No OPEN_DBD_DATA_URL or OPEN_DBD_DATA_FILE configured' };
      await recordSyncRun({ ...result, triggeredBy, startedAt });
      return result;
    }

    const rows = parseRows(source.text);
    const records = rows.map(normalizeDbdRecord).filter((record): record is NormalizedDbdRecord => Boolean(record));
    const recordsUpserted = await upsertDbdRecords(records);
    const result: SyncResult = { kind: 'dbd_juristic', status: 'success', source: source.source, recordsRead: rows.length, recordsUpserted };
    await recordSyncRun({ ...result, triggeredBy, startedAt });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : 'DBD open data sync failed';
    logger.error('DBD open data sync failed', { error: err });
    const result: SyncResult = { kind: 'dbd_juristic', status: 'failed', source: null, recordsRead: 0, recordsUpserted: 0, error };
    await recordSyncRun({ ...result, triggeredBy, startedAt });
    return result;
  }
}

export async function syncRdVatOpenData(triggeredBy = 'manual', options: OpenDataSyncOptions = {}): Promise<SyncResult> {
  const startedAt = new Date();
  const startRow = clampSyncNumber(options.startRow, 0, 0, Number.MAX_SAFE_INTEGER);
  const maxRows = options.maxRows === undefined
    ? undefined
    : clampSyncNumber(options.maxRows, 0, 1, 100000);
  const delayMs = clampSyncNumber(
    options.delayMs,
    parseInt(process.env.RD_VAT_SYNC_BATCH_DELAY_MS ?? '0', 10),
    0,
    5000
  );

  try {
    const source = await readSourceText('vat');
    if (!source) {
      const result: SyncResult = { kind: 'rd_vat', status: 'skipped', source: null, recordsRead: 0, recordsUpserted: 0, error: 'No RD_VAT_DATA_URL or RD_VAT_DATA_FILE configured' };
      await recordSyncRun({ ...result, triggeredBy, startedAt });
      return result;
    }

    let recordsRead = 0;
    let recordsUpserted = 0;

    if (/^\s*[\[{]/.test(source.text)) {
      const rows = parseRows(source.text).slice(startRow, maxRows ? startRow + maxRows : undefined);
      const records = rows.map(normalizeVatRecord).filter((record): record is NormalizedVatRecord => Boolean(record));
      recordsRead = rows.length;
      recordsUpserted = await upsertVatRecords(records);
    } else {
      let batch: NormalizedVatRecord[] = [];
      let rowIndex = 0;
      for (const row of iterateCsvRows(source.text)) {
        rowIndex += 1;
        if (rowIndex <= startRow) continue;
        if (maxRows && recordsRead >= maxRows) break;

        recordsRead += 1;
        const record = normalizeVatRecord(row);
        if (!record) continue;
        batch.push(record);

        if (batch.length >= BATCH_SIZE) {
          recordsUpserted += await upsertVatRecords(batch);
          batch = [];
          await waitForSyncThrottle(delayMs);
        }
      }

      if (batch.length > 0) {
        recordsUpserted += await upsertVatRecords(batch);
      }
    }

    const result: SyncResult = { kind: 'rd_vat', status: 'success', source: source.source, recordsRead, recordsUpserted };
    await recordSyncRun({ ...result, triggeredBy, startedAt });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : 'RD VAT open data sync failed';
    logger.error('RD VAT open data sync failed', { error: err });
    const result: SyncResult = { kind: 'rd_vat', status: 'failed', source: null, recordsRead: 0, recordsUpserted: 0, error };
    await recordSyncRun({ ...result, triggeredBy, startedAt });
    return result;
  }
}

export async function syncAllOpenDataCaches(triggeredBy = 'manual', options: { vat?: OpenDataSyncOptions } = {}) {
  const [dbd, vat] = await Promise.all([
    syncDbdOpenData(triggeredBy),
    syncRdVatOpenData(triggeredBy, options.vat),
  ]);
  return { dbd, vat };
}

function fromOpenData(row: {
  taxId: string;
  nameTh: string | null;
  nameEn: string | null;
  addressTh: string | null;
  status: string | null;
  juristicType: string | null;
  source: string;
  lastSyncedAt: Date;
  vatRegistered: boolean;
  vatName: string | null;
  vatAddress: string | null;
  vatLastSyncedAt: Date | null;
}): LocalJuristicSuggestion {
  return {
    taxId: row.taxId,
    nameTh: row.nameTh,
    nameEn: row.nameEn,
    addressTh: row.addressTh,
    branchCode: '00000',
    branchNameTh: null,
    branchNameEn: null,
    email: null,
    phone: null,
    contactPerson: null,
    status: row.status,
    juristicType: row.juristicType,
    source: row.source === 'rd-vat' ? 'rd-vat' : 'open-dbd',
    lastSyncedAt: row.lastSyncedAt.toISOString(),
    vatRegistered: row.vatRegistered,
    vatName: row.vatName,
    vatAddress: row.vatAddress,
    vatLastSyncedAt: row.vatLastSyncedAt?.toISOString() ?? null,
    verifiedByThisCompany: false,
  };
}

function fromCustomer(customer: {
  taxId: string;
  nameTh: string;
  nameEn: string | null;
  addressTh: string;
  branchCode: string | null;
  branchNameTh: string | null;
  branchNameEn: string | null;
  addressEn: string | null;
  email: string | null;
  phone: string | null;
  contactPerson: string | null;
  updatedAt: Date;
}, openData?: LocalJuristicSuggestion | null): LocalJuristicSuggestion {
  return {
    taxId: customer.taxId,
    nameTh: customer.nameTh,
    nameEn: customer.nameEn ?? openData?.nameEn ?? null,
    addressTh: customer.addressTh,
    branchCode: customer.branchCode ?? '00000',
    branchNameTh: customer.branchNameTh,
    branchNameEn: customer.branchNameEn ?? openData?.branchNameEn ?? null,
    email: customer.email,
    phone: customer.phone,
    contactPerson: customer.contactPerson,
    status: openData?.status ?? null,
    juristicType: openData?.juristicType ?? null,
    source: 'billboy-verified',
    lastSyncedAt: openData?.lastSyncedAt ?? customer.updatedAt.toISOString(),
    vatRegistered: openData?.vatRegistered ?? false,
    vatName: openData?.vatName ?? null,
    vatAddress: openData?.vatAddress ?? null,
    vatLastSyncedAt: openData?.vatLastSyncedAt ?? null,
    verifiedByThisCompany: true,
  };
}

export async function lookupLocalJuristicProfile(user: AuthPayload, taxIdInput: string): Promise<LocalJuristicLookupResult> {
  const taxId = normalizeTaxId(taxIdInput);
  if (taxId.length !== 13) throw new Error('Tax ID must be 13 digits');

  const [verified, initialOpenData] = await Promise.all([
    withRlsContext(prisma, tenantRlsContext(user), (tx) => tx.customer.findFirst({
      where: { companyId: user.companyId, isActive: true, taxId },
      orderBy: { updatedAt: 'desc' },
    })),
    prisma.juristicOpenDataCache.findUnique({ where: { taxId } }),
  ]);

  let openData = initialOpenData;
  const shouldTryMocLookup = (
    !openData?.nameEn ||
    !openData?.status ||
    !openData?.juristicType ||
    looksLikeIncompleteThaiAddress(openData?.addressTh)
  );
  if (shouldTryMocLookup) {
    const mocRecord = await fetchMocJuristicRecord(taxId);
    if (mocRecord) {
      await upsertMocJuristicRecord(mocRecord);
      openData = await prisma.juristicOpenDataCache.findUnique({ where: { taxId } });
    }
  }

  const openDataProfile = openData ? fromOpenData(openData) : null;
  const verifiedProfile = verified ? fromCustomer(verified, openDataProfile) : null;
  return {
    profile: verifiedProfile ?? openDataProfile,
    verifiedProfile,
    openDataProfile,
  };
}

export async function searchLocalJuristicProfiles(user: AuthPayload, query: string, limit = SEARCH_LIMIT): Promise<LocalJuristicSuggestion[]> {
  const trimmed = query.trim();
  const taxSearch = normalizeTaxId(trimmed);
  if (trimmed.length < 3 && taxSearch.length < 3) return [];

  const [verified, openData] = await Promise.all([
    withRlsContext(prisma, tenantRlsContext(user), (tx) => tx.customer.findMany({
      where: {
        companyId: user.companyId,
        isActive: true,
        OR: [
          { taxId: { contains: taxSearch || trimmed } },
          { nameTh: { contains: trimmed } },
          { nameEn: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    })),
    prisma.juristicOpenDataCache.findMany({
      where: {
        OR: [
          ...(taxSearch ? [{ taxId: { startsWith: taxSearch } }] : []),
          { nameTh: { contains: trimmed } },
          { nameEn: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ vatRegistered: 'desc' }, { nameTh: 'asc' }],
      take: limit,
    }),
  ]);

  const openDataByTaxId = new Map(openData.map((item) => [item.taxId, fromOpenData(item)]));
  const output: LocalJuristicSuggestion[] = [];
  const seen = new Set<string>();

  for (const customer of verified) {
    const profile = fromCustomer(customer, openDataByTaxId.get(customer.taxId));
    const key = `${profile.taxId}:${profile.branchCode}`;
    if (!seen.has(key)) {
      output.push(profile);
      seen.add(key);
    }
  }

  for (const item of openData) {
    const profile = openDataByTaxId.get(item.taxId) ?? fromOpenData(item);
    const key = `${profile.taxId}:${profile.branchCode}`;
    if (!seen.has(key)) {
      output.push(profile);
      seen.add(key);
    }
    if (output.length >= limit) break;
  }

  return output.slice(0, limit);
}

export async function getOpenDataSyncStatus() {
  const [runs, dbdCount, vatCount] = await Promise.all([
    prisma.dbdOpenDataSyncRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    }),
    prisma.juristicOpenDataCache.count(),
    prisma.juristicOpenDataCache.count({ where: { vatRegistered: true } }),
  ]);

  return { runs, dbdCount, vatCount };
}
