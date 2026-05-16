import { logger } from '../config/logger';

export interface ThaiSlipQrFields {
  bank: string | null;
  transactionId: string | null;
  reference: string | null;
  amount: number | null;
  paidAt: string | null;
  confidence: number;
  rawQr: string;
}

const BANK_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'KBank', pattern: /kbank|kasikorn|k-?plus|kplus/i },
  { name: 'SCB', pattern: /scb|siam.?commercial/i },
  { name: 'BBL', pattern: /bbl|bangkok.?bank|bualuang/i },
  { name: 'KTB', pattern: /ktb|krungthai|krung.?thai/i },
  { name: 'BAY', pattern: /bay|krungsri/i },
  { name: 'TTB', pattern: /ttb|tmbthanachart/i },
  { name: 'GSB', pattern: /gsb|government.?savings/i },
  { name: 'BAAC', pattern: /baac|ธ\.?ก\.?ส\.?/i },
  { name: 'PromptPay', pattern: /promptpay|พร้อมเพย์/i },
];

const KBANK_VERIFY_HOSTS = [
  'kbank-slipverify.com',
  'kbank.co.th',
  'kasikornbank.com',
  'k-cyberbanking',
];

function detectBank(qr: string): string | null {
  for (const b of BANK_PATTERNS) {
    if (b.pattern.test(qr)) return b.name;
  }
  if (KBANK_VERIFY_HOSTS.some((h) => qr.toLowerCase().includes(h))) return 'KBank';
  return null;
}

function extractKBankSlipId(qr: string): { transactionId: string | null; reference: string | null } {
  // K+ verify QR typical format:
  // https://kbank-slipverify.com/slipverify/?{base64-encoded-or-pipe-delimited-data}
  // The "data" can include sending bank id, sending account, receiving bank id, receiving account,
  // amount, transaction id. We extract the trailing token (highest-entropy) as the slip id.
  try {
    const url = qr.replace(/^.*?https?:\/\//i, 'https://');
    const u = new URL(url);
    // The whole query string holds the encoded payload — use it as reference
    const query = u.search.replace(/^\?/, '');
    if (query) {
      return { transactionId: query.slice(0, 64), reference: query.slice(0, 32) };
    }
  } catch {
    // not a URL
  }
  // Fallback — grab a long alphanumeric token
  const longToken = qr.match(/[A-Z0-9]{14,}/i)?.[0];
  return { transactionId: longToken ?? null, reference: longToken?.slice(0, 24) ?? null };
}

function extractGenericLongToken(qr: string): string | null {
  const m = qr.match(/[A-Z0-9]{12,}/i);
  return m?.[0] ?? null;
}

// EMVCo TLV parser — used by PromptPay QR and some merchant payment QRs.
// Format: <tag (2 digits)><length (2 digits)><value> — repeated.
// Only used as a soft signal; we don't extract amount from PromptPay TLV in this version.
function isEmvTlv(qr: string): boolean {
  // EMVCo QR always starts with "000201" or "000202"
  return /^000[12]02/.test(qr);
}

/**
 * Parse a Thai bank slip QR payload. Returns deterministic fields when the QR matches a known
 * bank slip-verify URL pattern. We do NOT make HTTP calls to bank servers (would require
 * partnership / could be rate-limited). Instead we extract identifiable fields from the QR
 * itself which is enough to:
 *  - identify which bank produced the slip
 *  - get a unique transaction reference for audit + dedup
 * Amount and counterparty still come from image OCR (Typhoon/Gemini).
 */
export function parseThaiSlipQr(qrText: string | null | undefined): ThaiSlipQrFields | null {
  if (!qrText) return null;
  const qr = qrText.trim();
  if (qr.length < 8) return null;

  try {
    const bank = detectBank(qr);
    let transactionId: string | null = null;
    let reference: string | null = null;
    let confidence = 0;

    if (bank === 'KBank' || KBANK_VERIFY_HOSTS.some((h) => qr.toLowerCase().includes(h))) {
      const ids = extractKBankSlipId(qr);
      transactionId = ids.transactionId;
      reference = ids.reference;
      confidence = transactionId ? 0.8 : 0.4;
    } else if (bank && /^https?:\/\//i.test(qr)) {
      // Other bank slip-verify URLs — extract any long token
      transactionId = extractGenericLongToken(qr);
      reference = transactionId?.slice(0, 24) ?? null;
      confidence = transactionId ? 0.7 : 0.3;
    } else if (isEmvTlv(qr)) {
      // PromptPay / EMVCo — has structured info but no transaction record per se
      transactionId = extractGenericLongToken(qr);
      reference = transactionId?.slice(0, 24) ?? null;
      confidence = 0.5;
    } else {
      // Unknown but has a long token — might still be useful for dedup
      transactionId = extractGenericLongToken(qr);
      if (transactionId) {
        reference = transactionId.slice(0, 24);
        confidence = 0.3;
      }
    }

    if (confidence === 0) return null;

    return {
      bank,
      transactionId,
      reference,
      amount: null,
      paidAt: null,
      confidence,
      rawQr: qr.slice(0, 500),
    };
  } catch (err) {
    logger.warn('[Thai slip QR] parse failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
