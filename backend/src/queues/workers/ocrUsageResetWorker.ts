import { Job, Queue, Worker } from 'bullmq';
import redis from '../../config/redis';
import prisma from '../../config/database';
import { logger } from '../../config/logger';

const QUEUE_NAME = 'ocr-usage-monthly-reset';

export const ocrUsageResetQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 12 },
    removeOnFail: { count: 12 },
  },
});

(async () => {
  await ocrUsageResetQueue.add(
    'monthly-reset',
    { triggeredBy: 'cron' },
    {
      // Run at 00:05 on the 1st of every month
      repeat: { pattern: '5 0 1 * *' },
      jobId: 'ocr-usage-monthly-reset',
    },
  );
  logger.info('[OCR Usage] Monthly reset cron registered (00:05 on day 1)');
})();

interface ResetJobData {
  triggeredBy: 'cron' | 'manual';
}

export const ocrUsageResetWorker = new Worker<ResetJobData>(
  QUEUE_NAME,
  async (_job: Job<ResetJobData>) => {
    const result = await prisma.company.updateMany({
      data: { ocrUsageThisMonth: 0 },
    });
    logger.info('[OCR Usage] Monthly reset complete', { companiesReset: result.count });
    return { companiesReset: result.count };
  },
  { connection: redis, concurrency: 1 },
);

ocrUsageResetWorker.on('failed', (job, err) => {
  logger.error(`[OCR Usage] Monthly reset job ${job?.id} failed`, { error: err.message });
});
