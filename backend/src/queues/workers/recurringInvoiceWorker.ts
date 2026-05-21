import { Job, Queue, Worker } from 'bullmq';
import redis from '../../config/redis';
import { logger } from '../../config/logger';
import { generateDueRecurringInvoices } from '../../services/recurringInvoiceService';

const QUEUE_NAME = 'recurring-invoices';

export const recurringInvoiceQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 10 },
  },
});

(async () => {
  await recurringInvoiceQueue.add(
    'daily-recurring-invoice-generation',
    { triggeredBy: 'cron' },
    {
      repeat: { pattern: '10 6 * * *' },
      jobId: 'recurring-invoices-daily',
    },
  );
  logger.info('[Recurring Invoices] Daily cron registered (06:10 every day)');
})();

interface RecurringInvoiceJobData {
  triggeredBy: 'cron' | 'manual';
}

export const recurringInvoiceWorker = new Worker<RecurringInvoiceJobData>(
  QUEUE_NAME,
  async (_job: Job<RecurringInvoiceJobData>) => {
    const results = await generateDueRecurringInvoices();
    const generated = results.filter((result) => result.invoiceId).length;
    const failed = results.filter((result) => result.error).length;
    logger.info('[Recurring Invoices] Daily generation completed', {
      scanned: results.length,
      generated,
      failed,
    });
    return { scanned: results.length, generated, failed };
  },
  { connection: redis, concurrency: 1 },
);

recurringInvoiceWorker.on('failed', (job, err) => {
  logger.error('[Recurring Invoices] worker job failed', {
    jobId: job?.id,
    error: err.message,
  });
});
