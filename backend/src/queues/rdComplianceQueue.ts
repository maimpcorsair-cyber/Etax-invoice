import { Queue } from 'bullmq';
import redis from '../config/redis';

export const rdComplianceQueue = new Queue('rd-compliance', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 12 },
    removeOnFail: { count: 6 },
  },
});
