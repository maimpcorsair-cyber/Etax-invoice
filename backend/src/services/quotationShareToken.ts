import jwt from 'jsonwebtoken';
import { logger } from '../config/logger';

const SHARE_AUDIENCE = 'quotation-share';
const DEFAULT_TTL_HOURS = 24 * 30;

export interface QuotationShareTokenPayload {
  quotationId: string;
  companyId: string;
  exp?: number;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

function resolveTtlSeconds(): number {
  const raw = Number(process.env.QUOTATION_SHARE_TTL_HOURS ?? DEFAULT_TTL_HOURS);
  const hours = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 24 * 90) : DEFAULT_TTL_HOURS;
  return Math.round(hours * 3600);
}

export function signQuotationShareToken(
  payload: Omit<QuotationShareTokenPayload, 'exp'>,
  ttlSeconds = resolveTtlSeconds(),
): string {
  return jwt.sign(payload, getSecret(), {
    audience: SHARE_AUDIENCE,
    expiresIn: ttlSeconds as jwt.SignOptions['expiresIn'],
  });
}

export function verifyQuotationShareToken(token: string): QuotationShareTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret(), { audience: SHARE_AUDIENCE }) as
      & QuotationShareTokenPayload
      & { iat?: number; exp?: number };
    if (!decoded.quotationId || !decoded.companyId) return null;
    return { quotationId: decoded.quotationId, companyId: decoded.companyId, exp: decoded.exp };
  } catch (err) {
    logger.warn('[quotationShareToken] verify failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export function buildQuotationShareUrl(frontendBaseUrl: string, token: string): string {
  const base = frontendBaseUrl.replace(/\/+$/, '');
  return `${base}/share/quotation/${encodeURIComponent(token)}`;
}
