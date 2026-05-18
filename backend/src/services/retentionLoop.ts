import prisma from '../config/database';
import redis from '../config/redis';
import { logger } from '../config/logger';

/**
 * Daily cleanup of tables that grow without bound. Pattern matches the
 * stuck-intake recovery loop: setInterval with a Redis lock so only one
 * web dyno does the work even when multiple are running.
 *
 * Currently purges:
 *  - intake_access_logs older than RETENTION_DAYS (default 90 days)
 *
 * To add another table later: add another statement inside runRetentionTick.
 * Each statement is independently safe-failed so one broken purge doesn't
 * block the next one.
 */

const RETENTION_DAYS = Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? 90);
const RETENTION_INTERVAL_MS = Number(process.env.RETENTION_INTERVAL_MS ?? 24 * 60 * 60 * 1000); // 24h
const RETENTION_LOCK_KEY = 'retention:tick';
const RETENTION_LOCK_TTL_SECONDS = 23 * 60 * 60; // shorter than interval so a missed tick recovers next day

async function runRetentionTick(): Promise<void> {
  // Lock so multi-dyno deploys don't run the same DELETE 3x. Lock TTL is
  // ~23h so if the holder crashes, the next dyno picks it up next cycle
  // rather than waiting indefinitely.
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

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    const deleted = await prisma.intakeAccessLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (deleted.count > 0) {
      logger.info('[retention] purged intake_access_logs', {
        deleted: deleted.count,
        olderThan: cutoff.toISOString(),
        retentionDays: RETENTION_DAYS,
      });
    } else {
      logger.debug('[retention] no intake_access_logs older than cutoff', {
        cutoff: cutoff.toISOString(),
      });
    }
  } catch (err) {
    logger.error('[retention] intake_access_logs purge failed', {
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
    retentionDays: RETENTION_DAYS,
  });
}
