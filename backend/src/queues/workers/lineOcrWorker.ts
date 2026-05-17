import { Worker, Job } from 'bullmq';
import redis from '../../config/redis';
import { logger } from '../../config/logger';
import { LINE_OCR_QUEUE_NAME, type LineOcrJobData } from '../lineOcrQueue';

const concurrency = Number(process.env.LINE_OCR_CONCURRENCY ?? '3');

export const lineOcrWorker = new Worker<LineOcrJobData>(
  LINE_OCR_QUEUE_NAME,
  async (job: Job<LineOcrJobData>) => {
    const { intakeId, lineUserId, pushTarget } = job.data;
    // Dynamic import: pulling backend/src/routes/line.ts here keeps the
    // queue+worker decoupled from the route module (avoids accidental
    // circular imports + smaller cold-start cost when only the queue is
    // touched).
    const { processIntakeOcrPipeline } = await import('../../routes/line');
    await processIntakeOcrPipeline({ intakeId, lineUserId, pushTarget });
    return { intakeId, ok: true };
  },
  {
    connection: redis,
    concurrency,
  },
);

lineOcrWorker.on('completed', (job) => {
  logger.info('[lineOcrWorker] completed', {
    jobId: job.id,
    intakeId: job.data.intakeId,
    durationMs: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined,
  });
});

lineOcrWorker.on('failed', (job, err) => {
  logger.error('[lineOcrWorker] failed', {
    jobId: job?.id,
    intakeId: job?.data?.intakeId,
    attempts: job?.attemptsMade,
    error: err.message,
  });
});

logger.info('[lineOcrWorker] started', { concurrency });
