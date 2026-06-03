import { Queue } from 'bullmq';
import redis from '../config/redis';
import { logger } from '../config/logger';
import { isSheetsConfigured } from '../services/googleSheetsService';

export const MASTER_SHEET_QUEUE_NAME = 'master-sheet-sync';
const SYNC_DELAY_MS = 60_000; // 1 minute debounce

export const masterSheetQueue = new Queue(MASTER_SHEET_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 10 },
  },
});

/**
 * Queue a master sheet sync for a company. Default is debounced by 1 minute
 * (used for write-driven syncs — many invoice/expense changes coalesce into
 * one rebuild). Pass `immediate: true` for user-initiated "sync now" clicks
 * where the user is actively waiting on the result.
 *
 * Uses BullMQ jobId dedup — only one job per company can be queued at a time.
 */
export async function enqueueMasterSheetSync(
  companyId: string,
  options: { immediate?: boolean } = {},
): Promise<boolean> {
  if (!isSheetsConfigured()) return false;
  try {
    await masterSheetQueue.add(
      'sync',
      { companyId },
      {
        jobId: `master-sheet-${companyId}`,
        delay: options.immediate ? 0 : SYNC_DELAY_MS,
      },
    );
    return true;
  } catch (err) {
    logger.warn('[masterSheet] Failed to enqueue sync', { error: err, companyId });
    return false;
  }
}
