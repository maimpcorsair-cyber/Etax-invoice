import { Job, Queue, Worker } from 'bullmq';
import redis from '../../config/redis';
import { logger } from '../../config/logger';
import { syncAllOpenDataCaches } from '../../services/dbdOpenDataService';

const QUEUE_NAME = 'dbd-open-data-sync';

interface DbdOpenDataSyncJobData {
  triggeredBy: 'cron' | 'manual';
}

export const dbdOpenDataSyncQueue = new Queue<DbdOpenDataSyncJobData>(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 10 },
  },
});

(async () => {
  await dbdOpenDataSyncQueue.add(
    'weekly-open-data-sync',
    { triggeredBy: 'cron' },
    {
      repeat: { pattern: process.env.DBD_OPEN_DATA_SYNC_CRON ?? '0 3 * * 0' },
      jobId: 'dbd-open-data-sync-weekly',
    },
  );
  logger.info('[DBD Open Data] Weekly sync cron registered');
})();

export const dbdOpenDataSyncWorker = new Worker<DbdOpenDataSyncJobData>(
  QUEUE_NAME,
  async (job: Job<DbdOpenDataSyncJobData>) => {
    const result = await syncAllOpenDataCaches(job.data.triggeredBy);
    logger.info('[DBD Open Data] Sync completed', result);
    return result;
  },
  { connection: redis },
);

dbdOpenDataSyncWorker.on('failed', (job, err) => {
  logger.error('[DBD Open Data] Worker failed', { error: err.message, jobId: job?.id });
});
