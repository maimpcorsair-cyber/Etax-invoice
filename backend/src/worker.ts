import 'dotenv/config';
import { logger } from './config/logger';

async function startWorkers() {
  if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL?.trim()) {
    logger.error('Worker cannot start: REDIS_URL is missing. Set the Upstash rediss:// URL on the Render worker service.');
    process.exitCode = 1;
    return;
  }

  const results = await Promise.allSettled([
    import('./queues/workers/pdfWorker'),
    import('./queues/workers/rdSubmitWorker'),
    import('./queues/workers/rdComplianceWorker'),
    import('./queues/workers/billingRenewalWorker'),
    import('./queues/workers/overdueReminderWorker'),
  ]);

  const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected.length > 0) {
    rejected.forEach((result) => {
      logger.error('Worker failed to load', { error: result.reason });
    });
    process.exitCode = 1;
    return;
  }

  logger.info('e-Tax Invoice workers running');
}

void startWorkers();

process.on('SIGTERM', () => {
  logger.info('Worker process received SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Worker process received SIGINT');
  process.exit(0);
});
