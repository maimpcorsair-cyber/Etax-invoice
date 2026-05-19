import prisma from '../config/database';
import redis from '../config/redis';
import { logger } from '../config/logger';

/**
 * Daily cleanup of tables that grow without bound. Pattern matches the
 * stuck-intake recovery loop: setInterval with a Redis lock so only one
 * web dyno does the work even when multiple are running.
 *
 * Each table has an independent retention window — pick the shortest
 * window the operations team can live with, since longer = bigger DB
 * cost on Render Postgres. Each purge runs inside its own try/catch so
 * one broken statement doesn't block the next.
 *
 * Defaults below were chosen on a "what's the shortest window that
 * doesn't break a real workflow":
 *  - intake_access_logs: 90 days (audit needs ≥ 30 days typically)
 *  - audit_logs:         365 days (legal/PDPA-friendly default)
 *  - ocr_benchmarks:     60 days (only useful for tuning prompts)
 *  - line_otps:          purged when expired, no grace period
 *  - pending_signups:    7 days for stuck/abandoned drafts
 *  - document_intakes:   30 days for rejected-only (kept ones never purged)
 */

const INTAKE_ACCESS_LOG_DAYS = Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? 90);
const AUDIT_LOG_DAYS = Number(process.env.AUDIT_LOG_FULL_RETENTION_DAYS ?? 365);
const OCR_BENCHMARK_DAYS = Number(process.env.OCR_BENCHMARK_RETENTION_DAYS ?? 60);
const REJECTED_INTAKE_DAYS = Number(process.env.REJECTED_INTAKE_RETENTION_DAYS ?? 30);
const PENDING_SIGNUP_DAYS = Number(process.env.PENDING_SIGNUP_RETENTION_DAYS ?? 7);
const RETENTION_INTERVAL_MS = Number(process.env.RETENTION_INTERVAL_MS ?? 24 * 60 * 60 * 1000); // 24h
const RETENTION_LOCK_KEY = 'retention:tick';
const RETENTION_LOCK_TTL_SECONDS = 23 * 60 * 60;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function safeDelete(label: string, fn: () => Promise<{ count: number }>, context: Record<string, unknown>): Promise<void> {
  try {
    const result = await fn();
    if (result.count > 0) {
      logger.info(`[retention] purged ${label}`, { deleted: result.count, ...context });
    } else {
      logger.debug(`[retention] nothing to purge from ${label}`, context);
    }
  } catch (err) {
    logger.error(`[retention] ${label} purge failed`, {
      error: err instanceof Error ? err.message : String(err),
      ...context,
    });
  }
}

async function runRetentionTick(): Promise<void> {
  let acquired = false;
  try {
    const result = await redis.set(RETENTION_LOCK_KEY, String(Date.now()), 'EX', RETENTION_LOCK_TTL_SECONDS, 'NX');
    acquired = result === 'OK';
  } catch (err) {
    logger.warn('[retention] redis lock acquisition failed; skipping tick', { err });
    return;
  }
  if (!acquired) {
    logger.debug('[retention] another dyno holds the lock; skipping');
    return;
  }

  await safeDelete('intake_access_logs',
    () => prisma.intakeAccessLog.deleteMany({ where: { createdAt: { lt: daysAgo(INTAKE_ACCESS_LOG_DAYS) } } }),
    { olderThan: daysAgo(INTAKE_ACCESS_LOG_DAYS).toISOString(), retentionDays: INTAKE_ACCESS_LOG_DAYS });

  await safeDelete('audit_logs',
    () => prisma.auditLog.deleteMany({ where: { createdAt: { lt: daysAgo(AUDIT_LOG_DAYS) } } }),
    { olderThan: daysAgo(AUDIT_LOG_DAYS).toISOString(), retentionDays: AUDIT_LOG_DAYS });

  await safeDelete('ocr_benchmarks',
    () => prisma.ocrBenchmark.deleteMany({ where: { createdAt: { lt: daysAgo(OCR_BENCHMARK_DAYS) } } }),
    { olderThan: daysAgo(OCR_BENCHMARK_DAYS).toISOString(), retentionDays: OCR_BENCHMARK_DAYS });

  // LINE OTPs are consumed on use, but abandoned flows leave orphans.
  // Drop everything past `expiresAt` — those can never be valid anyway.
  await safeDelete('line_otps_expired',
    () => prisma.lineOtp.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    {});

  // Pending signups that never converted within 7 days are abandoned drafts.
  // Activated ones (status === 'activated') are kept indefinitely for
  // billing reconciliation.
  await safeDelete('pending_signups_abandoned',
    () => prisma.pendingSignup.deleteMany({ where: {
      createdAt: { lt: daysAgo(PENDING_SIGNUP_DAYS) },
      status: { in: ['pending', 'expired', 'failed'] },
    } }),
    { retentionDays: PENDING_SIGNUP_DAYS });

  // Rejected document intakes (user/admin marked rejected) — not useful
  // beyond the audit window. Kept intakes (saved/needs_review/awaiting_*)
  // are never purged because they're still part of an active workflow.
  await safeDelete('document_intakes_rejected',
    () => prisma.documentIntake.deleteMany({ where: {
      createdAt: { lt: daysAgo(REJECTED_INTAKE_DAYS) },
      status: 'rejected',
    } }),
    { retentionDays: REJECTED_INTAKE_DAYS });

  // PDPA Section 33 — companies whose owner requested deletion and whose
  // tax-retention window has elapsed get fully purged. We resolve IDs first
  // so the log captures which tenants were dropped (deleteMany returns
  // count only). Cascade on Company drops dependent tables; if any FK
  // refuses to cascade the safeDelete wrapper will log + continue.
  try {
    const dueCompanies = await prisma.company.findMany({
      where: { hardDeleteScheduledAt: { lte: new Date() } },
      select: { id: true, taxId: true, hardDeleteScheduledAt: true },
      take: 50,
    });
    if (dueCompanies.length > 0) {
      const ids = dueCompanies.map((c) => c.id);
      await safeDelete('companies_hard_delete',
        () => prisma.company.deleteMany({ where: { id: { in: ids } } }),
        {
          ids,
          taxIds: dueCompanies.map((c) => c.taxId),
        });
    }
  } catch (err) {
    logger.error('[retention] companies_hard_delete lookup failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

let loopHandle: NodeJS.Timeout | null = null;

export function startRetentionLoop(): void {
  if (loopHandle) return;
  if (process.env.DISABLE_RETENTION_LOOP === 'true') {
    logger.info('[retention] loop disabled via DISABLE_RETENTION_LOOP');
    return;
  }
  // First tick fires immediately after one interval (24h on first boot). For
  // local dev where the dyno restarts often, that's fine — no rush to delete.
  loopHandle = setInterval(() => {
    void runRetentionTick().catch((err) => {
      logger.error('[retention] tick threw', { err });
    });
  }, RETENTION_INTERVAL_MS);
  if (loopHandle.unref) loopHandle.unref();
  logger.info('[retention] loop started', {
    intervalMs: RETENTION_INTERVAL_MS,
    retentionDays: {
      intakeAccessLog: INTAKE_ACCESS_LOG_DAYS,
      auditLog: AUDIT_LOG_DAYS,
      ocrBenchmark: OCR_BENCHMARK_DAYS,
      rejectedIntake: REJECTED_INTAKE_DAYS,
      pendingSignup: PENDING_SIGNUP_DAYS,
    },
  });
}
