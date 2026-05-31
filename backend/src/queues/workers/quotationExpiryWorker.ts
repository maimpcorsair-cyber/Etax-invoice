import { Job, Queue, Worker } from 'bullmq';
import redis from '../../config/redis';
import { logger } from '../../config/logger';
import { runQuotationExpiry } from '../../services/quotationExpiryService';

const QUEUE_NAME = 'quotation-expiry';

interface QuotationExpiryJobData {
  triggeredBy: 'cron' | 'manual';
}

export const quotationExpiryQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 10 },
  },
});

(async () => {
  await quotationExpiryQueue.add(
    'daily-quotation-expiry',
    { triggeredBy: 'cron' },
    {
      repeat: { pattern: '5 0 * * *' }, // 00:05 every day
      jobId: 'quotation-expiry-daily',
    },
  );
  logger.info('[Quotation Expiry] Daily cron registered (00:05 every day)');
})();

// Core flip logic lives in quotationExpiryService (side-effect-free) so the API
// process can reuse it without importing this worker module.
export const quotationExpiryWorker = new Worker<QuotationExpiryJobData>(
  QUEUE_NAME,
  async (_job: Job<QuotationExpiryJobData>) => {
    const expired = await runQuotationExpiry();
    logger.info('[Quotation Expiry] Cycle completed', { expired });
    return { expired };
  },
  { connection: redis, concurrency: 1 },
);

quotationExpiryWorker.on('completed', (_job, result) => {
  logger.info('[Quotation Expiry] Worker completed', result);
});

quotationExpiryWorker.on('failed', (job, err) => {
  logger.error('[Quotation Expiry] Worker failed', { error: err.message, jobId: job?.id });
});
