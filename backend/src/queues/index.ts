import { Queue } from 'bullmq';
import redis from '../config/redis';
import { logger } from '../config/logger';

const connection = redis;

export const invoiceQueue = new Queue('invoice-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export const rdSubmissionQueue = new Queue('rd-submission', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: false,
  },
});

logger.info('BullMQ queues initialized');

export default { invoiceQueue, rdSubmissionQueue };
