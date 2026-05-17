import jwt from 'jsonwebtoken';
import { logger } from '../config/logger';

/**
 * Magic-link token for guest LINE users to edit their pending document
 * intake on the web (no login required). The token is signed with the
 * server JWT secret, encodes the intakeId + lineUserId + companyId, and
 * expires after 24h so abandoned links eventually go cold.
 *
 * The token is delivered as a URL param in a LINE Flex card button; the
 * link opens in the LINE in-app browser, which by design has no Google /
 * cookie state — guest mode is the only practical UX.
 */

const INTAKE_EDIT_AUDIENCE = 'intake-edit';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24h

export interface IntakeEditTokenPayload {
  intakeId: string;
  lineUserId: string;
  companyId: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

export function signIntakeEditToken(payload: IntakeEditTokenPayload, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  return jwt.sign(payload, getSecret(), {
    audience: INTAKE_EDIT_AUDIENCE,
    expiresIn: ttlSeconds,
  });
}

export function verifyIntakeEditToken(token: string): IntakeEditTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret(), { audience: INTAKE_EDIT_AUDIENCE }) as IntakeEditTokenPayload & { iat?: number; exp?: number };
    if (!decoded.intakeId || !decoded.lineUserId || !decoded.companyId) return null;
    return {
      intakeId: decoded.intakeId,
      lineUserId: decoded.lineUserId,
      companyId: decoded.companyId,
    };
  } catch (err) {
    logger.warn('[intakeEditToken] verify failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export function buildIntakeEditUrl(frontendBaseUrl: string, token: string): string {
  const base = frontendBaseUrl.replace(/\/+$/, '');
  return `${base}/intake-edit/${token}`;
}
