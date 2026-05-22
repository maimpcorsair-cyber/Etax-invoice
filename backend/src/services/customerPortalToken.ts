import jwt from 'jsonwebtoken';
import { logger } from '../config/logger';

// Magic-link + session token for the customer portal. A customer who has
// been issued documents by a Billboy seller can request access via their
// email — we send a token that grants read-only view of THEIR documents
// (invoices, quotations, delivery notes) without forcing them to create
// a full account. Pure HMAC/JWT, no DB row, no password.
//
// The same token is reused as the session token after the customer clicks
// the link. Short TTL keeps the magic link from becoming a long-term
// password lookalike if the email is forwarded.

const PORTAL_AUDIENCE = 'customer-portal';
const DEFAULT_TTL_HOURS = 24 * 14; // 14 days

export interface CustomerPortalTokenPayload {
  customerId: string;
  companyId: string;
  email: string;
  /** Expiry epoch seconds, populated on verify */
  exp?: number;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

function resolveTtlSeconds(): number {
  const raw = Number(process.env.CUSTOMER_PORTAL_TTL_HOURS ?? DEFAULT_TTL_HOURS);
  const hours = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 24 * 60) : DEFAULT_TTL_HOURS;
  return Math.round(hours * 3600);
}

export function signCustomerPortalToken(
  payload: Omit<CustomerPortalTokenPayload, 'exp'>,
  ttlSeconds = resolveTtlSeconds(),
): string {
  return jwt.sign(payload, getSecret(), {
    audience: PORTAL_AUDIENCE,
    expiresIn: ttlSeconds as jwt.SignOptions['expiresIn'],
  });
}

export function verifyCustomerPortalToken(token: string): CustomerPortalTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret(), { audience: PORTAL_AUDIENCE }) as
      & CustomerPortalTokenPayload
      & { iat?: number; exp?: number };
    if (!decoded.customerId || !decoded.companyId || !decoded.email) return null;
    return {
      customerId: decoded.customerId,
      companyId: decoded.companyId,
      email: decoded.email,
      exp: decoded.exp,
    };
  } catch (err) {
    logger.warn('[customerPortalToken] verify failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export function buildCustomerPortalUrl(frontendBaseUrl: string, token: string): string {
  const base = frontendBaseUrl.replace(/\/+$/, '');
  return `${base}/portal/verify?token=${encodeURIComponent(token)}`;
}
