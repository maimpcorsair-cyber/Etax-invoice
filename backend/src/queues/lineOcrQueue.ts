import { Queue } from 'bullmq';
import redis from '../config/redis';
import { logger } from '../config/logger';

export const LINE_OCR_QUEUE_NAME = 'line-ocr';

export interface LineOcrJobData {
  intakeId: string;
  lineUserId: string;
  /** LINE groupId or roomId so worker pushes back to the same conversation. */
  pushTarget?: string;
}

export const lineOcrQueue = new Queue<LineOcrJobData>(LINE_OCR_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});

export async function enqueueLineOcrJob(data: LineOcrJobData): Promise<void> {
  try {
    await lineOcrQueue.add('process', data, {
      // Dedup: if LINE retries the webhook (e.g. timeout on the api dyno),
      // we won't OCR the same file twice.
      jobId: `line-ocr:${data.intakeId}`,
    });
  } catch (err) {
    logger.error('[lineOcrQueue] Failed to enqueue OCR job', { err, intakeId: data.intakeId });
    throw err;
  }
}
