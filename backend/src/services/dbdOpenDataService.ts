import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { readFile } from 'fs/promises';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import type { AuthPayload } from '../middleware/auth';

type RawRow = Record<string, unknown>;
type OpenDataSourceRef = {
  source: string;
  sourceIndex: number;
  sourceCount: number;
  file?: string;
  url?: string;
};

export interface LocalJuristicSuggestion {
  taxId: string;
  nameTh: string | null;
  nameEn: string | null;
  addressTh: string | null;
  addressEn: string | null;
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
  sourceIndex?: number;
  sourceCount?: number;
  recordsRead: number;
  recordsUpserted: number;
  error?: string;
}

interface OpenDataSyncOptions {
  sourceIndex?: number;
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
const DBD_OPENAPI_JURISTIC_LOOKUP_TIMEOUT_MS = parseInt(process.env.DBD_OPENAPI_JURISTIC_LOOKUP_TIMEOUT_MS ?? '5000', 10);
const RD_VAT_PROVINCES_DATA_URL = 'https://data.rd.go.th/datafiles/vat/VAT_TaxpayerAddress_02.csv';

const THAI_CHARACTER_PATTERN = /[\u0E00-\u0E7F]/;
const THAI_ADDRESS_TERMS: Array<[RegExp, string]> = [
  [/กรุงเทพมหานคร|กรุงเทพฯ|กทม\./g, 'Bangkok'],
  [/บริษัท/g, 'Company'],
  [/จำกัด\s*\(มหาชน\)/g, 'Public Company Limited'],
  [/จำกัด/g, 'Co., Ltd.'],
  [/ประเทศไทย/g, 'Thailand'],
  [/สำนักงานใหญ่/g, 'Head Office'],
  [/เลขที่/g, 'No. '],
  [/อาคาร/g, 'Building '],
  [/ชั้นที่|ชั้น/g, 'Floor '],
  [/เลขที่ห้อง/g, 'Room '],
  [/หมู่บ้าน/g, 'Village '],
  [/หมู่/g, 'Moo '],
  [/ซอย/g, 'Soi '],
  [/ถนน/g, 'Road '],
  [/แขวง/g, 'Khwaeng '],
  [/ตำบล/g, 'Tambon '],
  [/เขต/g, 'Khet '],
  [/อำเภอ/g, 'Amphoe '],
  [/จังหวัด/g, 'Changwat '],
  [/อรกานต์/g, 'Orakarn'],
  [/เอสเอสพี\s*ทาวเวอร์/g, 'SSP Tower'],
  [/พระรามที่\s*2/g, 'Rama II'],
  [/บางมด/g, 'Bang Mot'],
  [/จอมทอง/g, 'Chom Thong'],
  [/ชิดลม/g, 'Chit Lom'],
  [/เพลินจิต/g, 'Phloen Chit'],
  [/ลุมพินี/g, 'Lumphini'],
  [/ปทุมวัน/g, 'Pathum Wan'],
  [/คลองเตย/g, 'Khlong Toei'],
  [/ระนอง/g, 'Ranong'],
  [/สุขุมวิท/g, 'Sukhumvit'],
  [/สาทร/g, 'Sathon'],
  [/สีลม/g, 'Si Lom'],
  [/บางรัก/g, 'Bang Rak'],
  [/วัฒนา/g, 'Watthana'],
  [/ห้วยขวาง/g, 'Huai Khwang'],
  [/ดินแดง/g, 'Din Daeng'],
  [/บางนา/g, 'Bang Na'],
  [/ลาดพร้าว/g, 'Lat Phrao'],
  [/จตุจักร/g, 'Chatuchak'],
];

const THAI_ROMANIZATION_BY_CODE: Record<number, string> = {
  0x0e01: 'k', 0x0e02: 'kh', 0x0e03: 'kh', 0x0e04: 'kh', 0x0e05: 'kh', 0x0e06: 'kh', 0x0e07: 'ng',
  0x0e08: 'ch', 0x0e09: 'ch', 0x0e0a: 'ch', 0x0e0b: 's', 0x0e0c: 'ch', 0x0e0d: 'y',
  0x0e0e: 'd', 0x0e0f: 't', 0x0e10: 'th', 0x0e11: 'th', 0x0e12: 'th', 0x0e13: 'n',
  0x0e14: 'd', 0x0e15: 't', 0x0e16: 'th', 0x0e17: 'th', 0x0e18: 'th', 0x0e19: 'n',
  0x0e1a: 'b', 0x0e1b: 'p', 0x0e1c: 'ph', 0x0e1d: 'f', 0x0e1e: 'ph', 0x0e1f: 'f', 0x0e20: 'ph', 0x0e21: 'm',
  0x0e22: 'y', 0x0e23: 'r', 0x0e24: 'rue', 0x0e25: 'l', 0x0e26: 'lue', 0x0e27: 'w', 0x0e28: 's', 0x0e29: 's',
  0x0e2a: 's', 0x0e2b: 'h', 0x0e2c: 'l', 0x0e2d: 'o', 0x0e2e: 'h',
  0x0e30: 'a', 0x0e32: 'a', 0x0e33: 'am', 0x0e34: 'i', 0x0e35: 'i', 0x0e36: 'ue', 0x0e37: 'ue',
  0x0e38: 'u', 0x0e39: 'u', 0x0e40: 'e', 0x0e41: 'ae', 0x0e42: 'o', 0x0e43: 'ai', 0x0e44: 'ai',
};

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

function containsThai(value: string | null | undefined) {
  return Boolean(value && THAI_CHARACTER_PATTERN.test(value));
}

function romanizeThaiText(value: string) {
  return Array.from(value).map((char) => {
    if (!THAI_CHARACTER_PATTERN.test(char)) return char;
    return THAI_ROMANIZATION_BY_CODE[char.charCodeAt(0)] ?? '';
  }).join('');
}

function cleanupEnglishFallback(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .trim();
}

function translateThaiTextFallback(value: string | null | undefined) {
  if (!value) return null;
  let translated = value;
  for (const [pattern, replacement] of THAI_ADDRESS_TERMS) {
    translated = translated.replace(pattern, replacement);
  }

  translated = romanizeThaiText(translated);
  const cleaned = cleanupEnglishFallback(translated);
  return cleaned && /[A-Za-z]/.test(cleaned) ? cleaned : null;
}

function englishNameFallback(nameTh: string | null | undefined) {
  if (!nameTh) return null;
  return translateThaiTextFallback(nameTh);
}

function englishAddressFallback(addressTh: string | null | undefined) {
  if (!addressTh) return null;
  return translateThaiTextFallback(addressTh);
}

function hasBetterThaiAddress(candidate: string | null | undefined, current: string | null | undefined) {
  if (!candidate) return false;
  if (!current) return true;

  const candidateIncomplete = looksLikeIncompleteThaiAddress(candidate);
  const currentIncomplete = looksLikeIncompleteThaiAddress(current);
  if (!candidateIncomplete && currentIncomplete) return true;
  if (candidateIncomplete && !currentIncomplete) return false;
  return candidate.length > current.length + 8;
}

function extractThaiPostcode(address: string | null | undefined) {
  return address?.match(/([0-9๐-๙]{5})\s*$/)?.[1] ?? null;
}

function appendPostcodeIfMissing(address: string | null | undefined, fallback: string | null | undefined) {
  if (!address) return address ?? null;
  if (extractThaiPostcode(address)) return address;
  const postcode = extractThaiPostcode(fallback);
  return postcode ? `${address} ${postcode}` : address;
}

function selectBestThaiAddress(primary: string | null | undefined, fallback: string | null | undefined) {
  const selected = hasBetterThaiAddress(primary, fallback) ? primary : (fallback ?? primary);
  return appendPostcodeIfMissing(selected, selected === primary ? fallback : primary);
}

function looksLikeIncompleteThaiAddress(address: string | null | undefined) {
  if (!address) return true;
  const normalized = address.replace(/\s+/g, ' ').trim();
  if (!normalized) return true;

  const withoutPostcode = normalized.replace(/\s+[0-9๐-๙]{5}\s*$/, '').trim();
  const hasPremiseNumber = /(^|\s)(เลขที่\s*)?[0-9๐-๙]+([/-][0-9๐-๙]+)?/.test(withoutPostcode);
  const hasSpecificLocationMarker = /(ถนน|ซอย|อาคาร|หมู่|ชั้น|เลขที่|แขวง|ตำบล|เขต|อำเภอ)/.test(withoutPostcode);
  const isVeryShort = withoutPostcode.length < 45;

  return !hasPremiseNumber || !hasSpecificLocationMarker || isVeryShort;
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

async function* iterateCsvRowsFromChunks(chunks: AsyncIterable<string>): AsyncGenerator<RawRow> {
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

  for await (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index += 1) {
      const char = chunk[index];
      const next = chunk[index + 1];
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

function getPreferredOpenDataEncoding(kind: 'dbd' | 'vat') {
  return kind === 'vat'
    ? (process.env.RD_VAT_DATA_ENCODING ?? process.env.VAT_OPEN_DATA_ENCODING ?? 'windows-874')
    : (process.env.OPEN_DBD_DATA_ENCODING ?? process.env.DBD_OPEN_DATA_ENCODING ?? 'utf-8');
}

function detectOpenDataEncoding(buffer: Buffer, fallbackEncoding: string) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf-8';
  }
  return fallbackEncoding;
}

function decodeSourceBuffer(buffer: Buffer, kind: 'dbd' | 'vat') {
  const preferredEncoding = detectOpenDataEncoding(buffer, getPreferredOpenDataEncoding(kind));
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  try {
    return new TextDecoder(preferredEncoding).decode(bytes).replace(/\u0000/g, '');
  } catch {
    return buffer.toString('utf8').replace(/\u0000/g, '');
  }
}

function splitSourceList(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Allow simple comma/newline-separated env values without JSON syntax.
  }

  return value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function uniqueSources(values: string[]) {
  return Array.from(new Set(values));
}

function getOpenDataUrls(kind: 'dbd' | 'vat') {
  if (kind === 'dbd') {
    return uniqueSources(splitSourceList(process.env.OPEN_DBD_DATA_URLS ?? process.env.DBD_OPEN_DATA_URLS)
      .concat(splitSourceList(process.env.OPEN_DBD_DATA_URL ?? process.env.DBD_OPEN_DATA_URL)));
  }

  const explicitUrls = splitSourceList(process.env.RD_VAT_DATA_URLS ?? process.env.VAT_OPEN_DATA_URLS);
  if (explicitUrls.length > 0) return uniqueSources(explicitUrls);

  const legacyUrls = splitSourceList(process.env.RD_VAT_DATA_URL ?? process.env.VAT_OPEN_DATA_URL);
  if (legacyUrls.length === 0) return [];

  const includeProvinces = process.env.RD_VAT_INCLUDE_PROVINCES_URL !== 'false';
  return uniqueSources(includeProvinces ? legacyUrls.concat(RD_VAT_PROVINCES_DATA_URL) : legacyUrls);
}

function getOpenDataFiles(kind: 'dbd' | 'vat') {
  return kind === 'dbd'
    ? uniqueSources(splitSourceList(process.env.OPEN_DBD_DATA_FILES ?? process.env.DBD_OPEN_DATA_FILES)
      .concat(splitSourceList(process.env.OPEN_DBD_DATA_FILE ?? process.env.DBD_OPEN_DATA_FILE)))
    : uniqueSources(splitSourceList(process.env.RD_VAT_DATA_FILES ?? process.env.VAT_OPEN_DATA_FILES)
      .concat(splitSourceList(process.env.RD_VAT_DATA_FILE ?? process.env.VAT_OPEN_DATA_FILE)));
}

function describeOpenDataSource(kind: 'dbd' | 'vat', source: string, index: number, count: number) {
  const filename = source.split('/').pop() ?? source;
  const rdVatLabel = filename.toLowerCase().includes('taxpayeraddress_02')
    ? 'rd-vat-provinces'
    : filename.toLowerCase().includes('taxpayeraddress_01')
      ? 'rd-vat-bangkok'
      : 'rd-vat';
  const label = kind === 'vat' ? rdVatLabel : 'open-dbd';
  return `${label}:${index + 1}/${count}:${source}`;
}

export function getRdVatOpenDataSourceCount() {
  return Math.max(getOpenDataFiles('vat').length, getOpenDataUrls('vat').length);
}

function getOpenDataSourceRef(kind: 'dbd' | 'vat', sourceIndex = 0): OpenDataSourceRef | null {
  const files = getOpenDataFiles(kind);
  const urls = getOpenDataUrls(kind);
  const sourceCount = Math.max(files.length, urls.length);

  if (sourceIndex < 0 || sourceIndex >= sourceCount) {
    return null;
  }

  const file = files[sourceIndex];
  const url = urls[sourceIndex];

  if (file?.trim()) {
    return {
      source: describeOpenDataSource(kind, file.trim(), sourceIndex, sourceCount),
      sourceIndex,
      sourceCount,
      file: file.trim(),
    };
  }

  if (url?.trim()) {
    return {
      source: describeOpenDataSource(kind, url.trim(), sourceIndex, sourceCount),
      sourceIndex,
      sourceCount,
      url: url.trim(),
    };
  }

  return null;
}

async function readSourceText(kind: 'dbd' | 'vat', sourceIndex = 0): Promise<{ text: string; source: string; sourceIndex: number; sourceCount: number } | null> {
  const ref = getOpenDataSourceRef(kind, sourceIndex);
  if (!ref) return null;

  if (ref.file) {
    return { ...ref, text: decodeSourceBuffer(await readFile(ref.file), kind) };
  }

  if (ref.url) {
    const res = await fetch(ref.url);
    if (!res.ok) throw new Error(`${kind.toUpperCase()} open data returned ${res.status}`);
    return { ...ref, text: decodeSourceBuffer(Buffer.from(await res.arrayBuffer()), kind) };
  }

  return null;
}

async function* decodeStreamingOpenDataChunks(chunks: AsyncIterable<Buffer>, kind: 'dbd' | 'vat'): AsyncGenerator<string> {
  let decoder: InstanceType<typeof TextDecoder> | null = null;

  for await (const chunk of chunks) {
    if (!decoder) {
      decoder = new TextDecoder(detectOpenDataEncoding(chunk, getPreferredOpenDataEncoding(kind)));
    }
    yield decoder.decode(chunk, { stream: true }).replace(/\u0000/g, '');
  }

  if (!decoder) return;

  const tail = decoder.decode();
  if (tail) yield tail.replace(/\u0000/g, '');
}

async function* readSourceTextChunks(ref: OpenDataSourceRef, kind: 'dbd' | 'vat'): AsyncGenerator<string> {
  async function* fileChunks(): AsyncGenerator<Buffer> {
    if (!ref.file) return;
    for await (const chunk of createReadStream(ref.file)) {
      yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    }
  }

  if (ref.file) {
    yield* decodeStreamingOpenDataChunks(fileChunks(), kind);
    return;
  }

  if (!ref.url) return;

  const res = await fetch(ref.url);
  if (!res.ok) throw new Error(`${kind.toUpperCase()} open data returned ${res.status}`);
  if (!res.body) throw new Error(`${kind.toUpperCase()} open data response did not include a body`);

  const reader = res.body.getReader();
  async function* responseChunks(): AsyncGenerator<Buffer> {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield Buffer.from(value);
    }
  }

  try {
    yield* decodeStreamingOpenDataChunks(responseChunks(), kind);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
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
      NULL::jsonb
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
        "raw" = CASE
          WHEN "juristic_open_data_cache"."source" = 'rd-vat'
          THEN NULL
          ELSE "juristic_open_data_cache"."raw"
        END,
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
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, DBD_OPENAPI_JURISTIC_LOOKUP_TIMEOUT_MS));

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
  const sourceIndex = clampSyncNumber(options.sourceIndex, 0, 0, Number.MAX_SAFE_INTEGER);
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
    const sourceRef = getOpenDataSourceRef('vat', sourceIndex);
    if (!sourceRef) {
      const configuredSourceCount = getRdVatOpenDataSourceCount();
      const result: SyncResult = {
        kind: 'rd_vat',
        status: 'skipped',
        source: null,
        sourceIndex,
        sourceCount: configuredSourceCount,
        recordsRead: 0,
        recordsUpserted: 0,
        error: configuredSourceCount === 0
          ? 'No RD_VAT_DATA_URLS, RD_VAT_DATA_URL, RD_VAT_DATA_FILES, or RD_VAT_DATA_FILE configured'
          : `RD VAT source index ${sourceIndex} is outside configured source count ${configuredSourceCount}`,
      };
      await recordSyncRun({ ...result, triggeredBy, startedAt });
      return result;
    }

    let recordsRead = 0;
    let recordsUpserted = 0;

    const source = sourceRef.source.toLowerCase().endsWith('.json')
      ? await readSourceText('vat', sourceIndex)
      : null;
    if (source && /^\s*[\[{]/.test(source.text)) {
      const rows = parseRows(source.text).slice(startRow, maxRows ? startRow + maxRows : undefined);
      const records = rows.map(normalizeVatRecord).filter((record): record is NormalizedVatRecord => Boolean(record));
      recordsRead = rows.length;
      recordsUpserted = await upsertVatRecords(records);
    } else {
      let batch: NormalizedVatRecord[] = [];
      let rowIndex = 0;
      for await (const row of iterateCsvRowsFromChunks(readSourceTextChunks(sourceRef, 'vat'))) {
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

    const result: SyncResult = {
      kind: 'rd_vat',
      status: 'success',
      source: sourceRef.source,
      sourceIndex: sourceRef.sourceIndex,
      sourceCount: sourceRef.sourceCount,
      recordsRead,
      recordsUpserted,
    };
    await recordSyncRun({ ...result, triggeredBy, startedAt });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : 'RD VAT open data sync failed';
    logger.error('RD VAT open data sync failed', { error: err, sourceIndex });
    const result: SyncResult = {
      kind: 'rd_vat',
      status: 'failed',
      source: null,
      sourceIndex,
      sourceCount: getRdVatOpenDataSourceCount(),
      recordsRead: 0,
      recordsUpserted: 0,
      error,
    };
    await recordSyncRun({ ...result, triggeredBy, startedAt });
    return result;
  }
}

export async function syncAllOpenDataCaches(triggeredBy = 'manual', options: { vat?: OpenDataSyncOptions; dbd?: boolean } = {}) {
  const skippedDbd: SyncResult = {
    kind: 'dbd_juristic',
    status: 'skipped',
    source: null,
    recordsRead: 0,
    recordsUpserted: 0,
    error: 'DBD sync skipped for this chunk',
  };
  const [dbd, vat] = await Promise.all([
    options.dbd === false ? Promise.resolve(skippedDbd) : syncDbdOpenData(triggeredBy),
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
  const addressTh = selectBestThaiAddress(row.addressTh, row.vatAddress);
  return {
    taxId: row.taxId,
    nameTh: row.nameTh,
    nameEn: row.nameEn ?? englishNameFallback(row.nameTh),
    addressTh,
    addressEn: englishAddressFallback(addressTh),
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
  const addressTh = hasBetterThaiAddress(openData?.addressTh, customer.addressTh)
    ? openData!.addressTh!
    : customer.addressTh;
  const nameEn = customer.nameEn ?? openData?.nameEn ?? englishNameFallback(customer.nameTh);
  const addressEn = customer.addressEn ?? openData?.addressEn ?? englishAddressFallback(addressTh);

  return {
    taxId: customer.taxId,
    nameTh: customer.nameTh,
    nameEn,
    addressTh,
    addressEn,
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

export async function lookupLocalJuristicProfile(
  user: AuthPayload,
  taxIdInput: string,
  options: { refresh?: boolean } = {},
): Promise<LocalJuristicLookupResult> {
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
    options.refresh ||
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
