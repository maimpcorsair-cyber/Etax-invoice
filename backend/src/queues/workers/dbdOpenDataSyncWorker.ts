import { Job, Worker } from 'bullmq';
import redis from '../../config/redis';
import { logger } from '../../config/logger';
import { syncAllOpenDataCaches } from '../../services/dbdOpenDataService';
import {
  DBD_OPEN_DATA_SYNC_QUEUE_NAME,
  dbdOpenDataSyncQueue,
  type DbdOpenDataSyncJobData,
} from '../dbdOpenDataSyncQueue';

const DEFAULT_CHUNK_SIZE = parseInt(process.env.RD_VAT_SYNC_JOB_CHUNK_SIZE ?? '10000', 10);
const DEFAULT_BATCH_DELAY_MS = parseInt(process.env.RD_VAT_SYNC_BATCH_DELAY_MS ?? '150', 10);
const DEFAULT_DELAY_BETWEEN_JOBS_MS = parseInt(process.env.RD_VAT_SYNC_NEXT_JOB_DELAY_MS ?? '30000', 10);
const DEFAULT_CONTINUE_UNTIL_ROW = parseInt(process.env.RD_VAT_SYNC_CONTINUE_UNTIL_ROW ?? '400000', 10);

function clamp(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.min(Math.max(Math.trunc(value!), min), max);
}

(async () => {
  await dbdOpenDataSyncQueue.add(
    'weekly-open-data-sync',
    {
      triggeredBy: 'cron',
      vatStartRow: 0,
      vatMaxRows: clamp(DEFAULT_CHUNK_SIZE, 10000, 1000, 50000),
      vatDelayMs: clamp(DEFAULT_BATCH_DELAY_MS, 150, 0, 5000),
      continueUntilRow: clamp(DEFAULT_CONTINUE_UNTIL_ROW, 400000, 1, 1000000),
      delayBetweenJobsMs: clamp(DEFAULT_DELAY_BETWEEN_JOBS_MS, 30000, 0, 3600000),
      autoContinue: true,
    },
    {
      repeat: { pattern: process.env.DBD_OPEN_DATA_SYNC_CRON ?? '0 3 * * 0' },
      jobId: 'dbd-open-data-sync-weekly',
    },
  );
  logger.info('[DBD Open Data] Weekly sync cron registered');
})();

export const dbdOpenDataSyncWorker = new Worker<DbdOpenDataSyncJobData>(
  DBD_OPEN_DATA_SYNC_QUEUE_NAME,
  async (job: Job<DbdOpenDataSyncJobData>) => {
    const vatStartRow = clamp(job.data.vatStartRow, 0, 0, Number.MAX_SAFE_INTEGER);
    const vatMaxRows = clamp(job.data.vatMaxRows, DEFAULT_CHUNK_SIZE, 1000, 50000);
    const vatDelayMs = clamp(job.data.vatDelayMs, DEFAULT_BATCH_DELAY_MS, 0, 5000);
    const continueUntilRow = job.data.continueUntilRow === undefined
      ? undefined
      : clamp(job.data.continueUntilRow, DEFAULT_CONTINUE_UNTIL_ROW, 1, 1000000);
    const delayBetweenJobsMs = clamp(job.data.delayBetweenJobsMs, DEFAULT_DELAY_BETWEEN_JOBS_MS, 0, 3600000);

    const result = await syncAllOpenDataCaches(job.data.triggeredBy, {
      vat: { startRow: vatStartRow, maxRows: vatMaxRows, delayMs: vatDelayMs },
    });
    logger.info('[DBD Open Data] Sync completed', result);

    const shouldContinue = job.data.autoContinue !== false
      && result.vat.status === 'success'
      && result.vat.recordsRead >= vatMaxRows
      && (continueUntilRow === undefined || vatStartRow + vatMaxRows < continueUntilRow);

    if (shouldContinue) {
      const nextStartRow = vatStartRow + vatMaxRows;
      await dbdOpenDataSyncQueue.add(
        'rd-vat-open-data-sync-chunk',
        {
          ...job.data,
          vatStartRow: nextStartRow,
          vatMaxRows,
          vatDelayMs,
          continueUntilRow,
          delayBetweenJobsMs,
          autoContinue: true,
        },
        {
          delay: delayBetweenJobsMs,
          jobId: `rd-vat-open-data-sync-${job.data.triggeredBy}-${nextStartRow}`,
        },
      );
      logger.info('[DBD Open Data] Next RD VAT chunk queued', { nextStartRow, vatMaxRows, delayBetweenJobsMs });
    }

    return result;
  },
  { connection: redis, concurrency: 1 },
);

dbdOpenDataSyncWorker.on('failed', (job, err) => {
  logger.error('[DBD Open Data] Worker failed', { error: err.message, jobId: job?.id });
});
