import jwt from 'jsonwebtoken';
import { logger } from '../config/logger';

// Per-invoice share link. Seller creates a link from the invoice detail
// page, forwards it to the buyer via LINE / email / SMS. The buyer opens
// the URL and sees an unauthenticated read-only page with the invoice
// summary, a "Download PDF" button, and a PromptPay QR (if configured).
//
// Distinct from CustomerPortalToken: that grants access to ALL of a
// customer's documents over 14 days. This grants access to ONE specific
// invoice for 30 days. Different audience claim so the two cannot be
// substituted for each other by accident.

const SHARE_AUDIENCE = 'invoice-share';
const DEFAULT_TTL_HOURS = 24 * 30; // 30 days

export interface InvoiceShareTokenPayload {
  invoiceId: string;
  companyId: string;
  /** Expiry epoch seconds, populated on verify */
  exp?: number;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

function resolveTtlSeconds(): number {
  const raw = Number(process.env.INVOICE_SHARE_TTL_HOURS ?? DEFAULT_TTL_HOURS);
  const hours = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 24 * 90) : DEFAULT_TTL_HOURS;
  return Math.round(hours * 3600);
}

export function signInvoiceShareToken(
  payload: Omit<InvoiceShareTokenPayload, 'exp'>,
  ttlSeconds = resolveTtlSeconds(),
): string {
  return jwt.sign(payload, getSecret(), {
    audience: SHARE_AUDIENCE,
    expiresIn: ttlSeconds as jwt.SignOptions['expiresIn'],
  });
}

export function verifyInvoiceShareToken(token: string): InvoiceShareTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret(), { audience: SHARE_AUDIENCE }) as
      & InvoiceShareTokenPayload
      & { iat?: number; exp?: number };
    if (!decoded.invoiceId || !decoded.companyId) return null;
    return { invoiceId: decoded.invoiceId, companyId: decoded.companyId, exp: decoded.exp };
  } catch (err) {
    logger.warn('[invoiceShareToken] verify failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export function buildInvoiceShareUrl(frontendBaseUrl: string, token: string): string {
  const base = frontendBaseUrl.replace(/\/+$/, '');
  return `${base}/share/invoice/${encodeURIComponent(token)}`;
}
