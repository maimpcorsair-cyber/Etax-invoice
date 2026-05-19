// Redact PII from Sentry event payloads before they ship. Privacy Policy
// promises we don't expose tax IDs, NRICs, or contact info to monitoring,
// and the easiest way to keep that promise is to never let the data reach
// Sentry in the first place. Matches the same patterns frontend/backend
// loggers should treat as sensitive.

const TAX_ID_RE = /\b\d{13}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const THAI_PHONE_RE = /\b(?:\+?66|0)\d{8,9}\b/g;
// Authorization / cookie / bearer-token leaks in stack messages.
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-]+/g;

const REDACTIONS: Array<[RegExp, string]> = [
  [TAX_ID_RE, '[REDACTED-TAX-ID]'],
  [EMAIL_RE, '[REDACTED-EMAIL]'],
  [THAI_PHONE_RE, '[REDACTED-PHONE]'],
  [BEARER_RE, 'Bearer [REDACTED]'],
];

export function scrubString(input: string): string {
  let out = input;
  for (const [re, replacement] of REDACTIONS) {
    out = out.replace(re, replacement);
  }
  return out;
}

// Walk a Sentry event tree and redact every user-visible string field. We
// keep the structure (stack frames, breadcrumbs) so the stack trace stays
// useful, but rewrite each string value so PII never lands in the dashboard.
export function scrubSentryEvent<T extends Record<string, unknown>>(event: T): T {
  return walk(event) as T;
}

function walk(value: unknown): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // Drop request bodies entirely — they routinely carry the exact PII
      // we want to keep out of monitoring. Keep headers/URL for debugging.
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
