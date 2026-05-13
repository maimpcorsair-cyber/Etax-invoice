import { Job, Worker } from 'bullmq';
import redis from '../../config/redis';
import { logger } from '../../config/logger';
import { getRdVatOpenDataSourceCount, syncAllOpenDataCaches } from '../../services/dbdOpenDataService';
import {
  DBD_OPEN_DATA_SYNC_QUEUE_NAME,
  dbdOpenDataSyncQueue,
  type DbdOpenDataSyncJobData,
} from '../dbdOpenDataSyncQueue';

const DEFAULT_CHUNK_SIZE = parseInt(process.env.RD_VAT_SYNC_JOB_CHUNK_SIZE ?? '10000', 10);
const DEFAULT_BATCH_DELAY_MS = parseInt(process.env.RD_VAT_SYNC_BATCH_DELAY_MS ?? '150', 10);
const DEFAULT_DELAY_BETWEEN_JOBS_MS = parseInt(process.env.RD_VAT_SYNC_NEXT_JOB_DELAY_MS ?? '30000', 10);
const DEFAULT_CONTINUE_UNTIL_ROW = parseInt(process.env.RD_VAT_SYNC_CONTINUE_UNTIL_ROW ?? '2000000', 10);
const DEFAULT_LOCK_DURATION_MS = parseInt(process.env.RD_VAT_SYNC_LOCK_DURATION_MS ?? '900000', 10);

function clamp(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.min(Math.max(Math.trunc(value!), min), max);
}

function toSafeJobIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
}

(async () => {
  await dbdOpenDataSyncQueue.add(
    'weekly-open-data-sync',
    {
      triggeredBy: 'cron',
      vatSourceIndex: 0,
      vatStartRow: 0,
      vatMaxRows: clamp(DEFAULT_CHUNK_SIZE, 10000, 1000, 50000),
      vatDelayMs: clamp(DEFAULT_BATCH_DELAY_MS, 150, 0, 5000),
      continueUntilRow: clamp(DEFAULT_CONTINUE_UNTIL_ROW, 2000000, 1, 5000000),
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
    const vatSourceIndex = clamp(job.data.vatSourceIndex, 0, 0, Number.MAX_SAFE_INTEGER);
    const vatStartRow = clamp(job.data.vatStartRow, 0, 0, Number.MAX_SAFE_INTEGER);
    const vatMaxRows = clamp(job.data.vatMaxRows, DEFAULT_CHUNK_SIZE, 1000, 50000);
    const vatDelayMs = clamp(job.data.vatDelayMs, DEFAULT_BATCH_DELAY_MS, 0, 5000);
    const continueUntilRow = job.data.continueUntilRow === undefined
      ? undefined
      : clamp(job.data.continueUntilRow, DEFAULT_CONTINUE_UNTIL_ROW, 1, 5000000);
    const delayBetweenJobsMs = clamp(job.data.delayBetweenJobsMs, DEFAULT_DELAY_BETWEEN_JOBS_MS, 0, 3600000);
    const shouldSyncDbd = vatSourceIndex === 0 && vatStartRow === 0;
    const runId = toSafeJobIdPart(job.data.runId ?? String(job.id ?? job.timestamp ?? Date.now()));

    const result = await syncAllOpenDataCaches(job.data.triggeredBy, {
      dbd: shouldSyncDbd,
      vat: { sourceIndex: vatSourceIndex, startRow: vatStartRow, maxRows: vatMaxRows, delayMs: vatDelayMs },
    });
    logger.info('[DBD Open Data] Sync completed', result);

    const sourceCount = result.vat.sourceCount ?? getRdVatOpenDataSourceCount();
    const currentSourceIndex = result.vat.sourceIndex ?? vatSourceIndex;
    const reachedSourceLimit = continueUntilRow !== undefined && vatStartRow + vatMaxRows >= continueUntilRow;
    const sourceHasMoreRows = result.vat.recordsRead >= vatMaxRows && !reachedSourceLimit;
    const hasNextSource = currentSourceIndex + 1 < sourceCount;
    const shouldContinue = job.data.autoContinue !== false
      && result.vat.status === 'success'
      && (sourceHasMoreRows || (!sourceHasMoreRows && hasNextSource));

    if (shouldContinue) {
      const nextSourceIndex = sourceHasMoreRows ? currentSourceIndex : currentSourceIndex + 1;
      const nextStartRow = sourceHasMoreRows ? vatStartRow + vatMaxRows : 0;
      const parentJobId = toSafeJobIdPart(String(job.id ?? job.timestamp ?? Date.now()));
      const nextJobId = `rd-vat-open-data-sync-${toSafeJobIdPart(job.data.triggeredBy)}-${runId}-${parentJobId}-${nextSourceIndex}-${nextStartRow}`;
      const nextJob = await dbdOpenDataSyncQueue.add(
        'rd-vat-open-data-sync-chunk',
        {
          ...job.data,
          vatSourceIndex: nextSourceIndex,
          vatStartRow: nextStartRow,
          vatMaxRows,
          vatDelayMs,
          continueUntilRow,
          delayBetweenJobsMs,
          autoContinue: true,
          runId,
        },
        {
          delay: delayBetweenJobsMs,
          jobId: nextJobId,
        },
      );
      logger.info('[DBD Open Data] Next RD VAT chunk queued', {
        nextJobId: nextJob.id,
        nextSourceIndex,
        nextStartRow,
        vatMaxRows,
        delayBetweenJobsMs,
        sourceCount,
      });
    }

    return result;
  },
  { connection: redis, concurrency: 1, lockDuration: clamp(DEFAULT_LOCK_DURATION_MS, 900000, 30000, 3600000) },
);

dbdOpenDataSyncWorker.on('failed', (job, err) => {
  logger.error('[DBD Open Data] Worker failed', { error: err.message, jobId: job?.id });
});
