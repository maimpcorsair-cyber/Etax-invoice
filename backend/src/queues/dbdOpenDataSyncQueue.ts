import { Queue } from 'bullmq';
import redis from '../config/redis';

export const DBD_OPEN_DATA_SYNC_QUEUE_NAME = 'dbd-open-data-sync';

export interface DbdOpenDataSyncJobData {
  triggeredBy: 'cron' | 'manual' | string;
  vatSourceIndex?: number;
  vatStartRow?: number;
  vatMaxRows?: number;
  vatDelayMs?: number;
  continueUntilRow?: number;
  delayBetweenJobsMs?: number;
  autoContinue?: boolean;
  runId?: string;
}

export const dbdOpenDataSyncQueue = new Queue<DbdOpenDataSyncJobData>(DBD_OPEN_DATA_SYNC_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 20 },
  },
});
