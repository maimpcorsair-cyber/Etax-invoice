// Mirror of backend/src/config/sentryScrub.ts — duplicated because the
// frontend can't import from backend. Keep these in sync when patterns
// change.

const TAX_ID_RE = /\b\d{13}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const THAI_PHONE_RE = /\b(?:\+?66|0)\d{8,9}\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-]+/g;

const REDACTIONS: Array<[RegExp, string]> = [
  [TAX_ID_RE, '[REDACTED-TAX-ID]'],
  [EMAIL_RE, '[REDACTED-EMAIL]'],
  [THAI_PHONE_RE, '[REDACTED-PHONE]'],
  [BEARER_RE, 'Bearer [REDACTED]'],
];

function scrubString(input: string): string {
  let out = input;
  for (const [re, replacement] of REDACTIONS) {
    out = out.replace(re, replacement);
  }
  return out;
}

function walk(value: unknown): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'data' || k === 'body') {
        out[k] = '[REDACTED-REQUEST-BODY]';
        continue;
      }
      out[k] = walk(v);
    }
    return out;
  }
  return value;
}

export function scrubSentryEvent<T extends Record<string, unknown>>(event: T): T {
  return walk(event) as T;
}
