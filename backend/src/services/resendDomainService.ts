/**
 * Thin client for Resend's Domains API — the bits we need to let an SME
 * verify a custom send-as domain and route mail through it.
 *
 * https://resend.com/docs/api-reference/domains/create-domain
 *
 * We deliberately use raw fetch instead of `resend` SDK to avoid pulling
 * in another dep for what's three endpoints. The auth header is the same
 * API key as SMTP_PASS when SMTP_HOST is smtp.resend.com — set
 * RESEND_API_KEY explicitly if you ever switch SMTP providers but want
 * to keep the brand-domain feature on Resend.
 */

import { logger } from '../config/logger';

export interface ResendDnsRecord {
  record: 'SPF' | 'DKIM' | 'DMARC' | string;
  name: string;
  type: 'TXT' | 'MX' | 'CNAME' | string;
  value: string;
  ttl?: number | string;
  status?: 'not_started' | 'pending' | 'verified' | 'failed' | string;
  priority?: number;
}

export interface ResendDomain {
  id: string;
  name: string;
  status: 'not_started' | 'pending' | 'verified' | 'failed' | string;
  records: ResendDnsRecord[];
  region?: string;
  createdAt?: string;
}

export class ResendNotConfiguredError extends Error {
  readonly code = 'RESEND_NOT_CONFIGURED';
  constructor() {
    super('Resend API key is not configured — set RESEND_API_KEY (or SMTP_PASS when SMTP_HOST=smtp.resend.com).');
  }
}

function resendApiKey(): string {
  const explicit = process.env.RESEND_API_KEY?.trim();
  if (explicit) return explicit;
  // Fall back to SMTP_PASS only when SMTP is actually pointed at Resend —
  // otherwise we'd send an unrelated provider's password to Resend.
  if (process.env.SMTP_HOST?.includes('resend.com')) {
    const smtp = process.env.SMTP_PASS?.trim();
    if (smtp) return smtp;
  }
  throw new ResendNotConfiguredError();
}

async function resendFetch<T>(path: string, init: RequestInit): Promise<T> {
  const key = resendApiKey();
  const res = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { message?: string; name?: string };
      if (parsed.message) detail = parsed.message;
    } catch { /* ignore */ }
    throw new Error(`Resend ${init.method ?? 'GET'} ${path} → ${res.status}: ${detail.slice(0, 200)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

/** Domain shape can drift between Resend's create + get + verify responses;
 *  this normalises to our own ResendDomain interface. */
function normalize(raw: Record<string, unknown>): ResendDomain {
  const records = Array.isArray((raw as { records?: unknown }).records)
    ? ((raw as { records: ResendDnsRecord[] }).records)
    : [];
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    status: String(raw.status ?? 'not_started'),
    records,
    region: typeof raw.region === 'string' ? raw.region : undefined,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : undefined,
  };
}

/** Create a domain on Resend. Returns DNS records the customer must add. */
export async function createResendDomain(domain: string, region = 'us-east-1'): Promise<ResendDomain> {
  const data = await resendFetch<Record<string, unknown>>('/domains', {
    method: 'POST',
    body: JSON.stringify({ name: domain, region }),
  });
  logger.info('[resend] domain created', { domain, id: data.id, status: data.status });
  return normalize(data);
}

/** Trigger Resend to re-check the DNS records and update the domain status. */
export async function verifyResendDomain(domainId: string): Promise<ResendDomain> {
  const data = await resendFetch<Record<string, unknown>>(`/domains/${domainId}/verify`, {
    method: 'POST',
  });
  logger.info('[resend] domain verify triggered', { id: domainId, status: data.status });
  return normalize(data);
}

/** Get current status (idempotent) — used both by the "check status" button
 *  and by the route that reads existing domain state on page load. */
export async function getResendDomain(domainId: string): Promise<ResendDomain> {
  const data = await resendFetch<Record<string, unknown>>(`/domains/${domainId}`, {
    method: 'GET',
  });
  return normalize(data);
}

/** Remove a domain from Resend. Call when the SME disconnects their domain
 *  from Billboy so we don't leave abandoned verified-but-unused domains
 *  consuming their Resend quota. */
export async function deleteResendDomain(domainId: string): Promise<void> {
  await resendFetch<unknown>(`/domains/${domainId}`, { method: 'DELETE' });
  logger.info('[resend] domain deleted', { id: domainId });
}
