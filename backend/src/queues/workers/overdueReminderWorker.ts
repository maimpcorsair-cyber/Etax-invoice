import { Job, Queue, Worker } from 'bullmq';
import redis from '../../config/redis';
import prisma from '../../config/database';
import { logger } from '../../config/logger';
import {
  sendLineFlexMessage,
  buildOverdueFlexCard,
  OverdueInvoice,
} from '../../services/lineService';

const QUEUE_NAME = 'overdue-reminders';

interface OverdueReminderJobData {
  triggeredBy: 'cron' | 'manual';
}

export const overdueReminderQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 10 },
  },
});

(async () => {
  await overdueReminderQueue.add(
    'daily-overdue-check',
    { triggeredBy: 'cron' },
    {
      repeat: { pattern: '0 8 * * *' },
      jobId: 'overdue-reminder-daily',
    },
  );
  logger.info('[Overdue Reminders] Daily cron registered (08:00 every day)');
})();

export const overdueReminderWorker = new Worker<OverdueReminderJobData>(
  QUEUE_NAME,
  async (_job: Job<OverdueReminderJobData>) => {
    const now = new Date();

    // Find all companies with Line notify enabled
    const companies = await prisma.company.findMany({
      where: { lineNotifyEnabled: true },
      select: { id: true, nameTh: true },
    });

    let notified = 0;
    let skipped = 0;

    for (const company of companies) {
      try {
        // Find admin/super_admin users with LineUserLink
        const usersWithLink = await prisma.user.findMany({
          where: {
            companyId: company.id,
            isActive: true,
            role: { in: ['admin', 'super_admin'] },
            lineUserLink: { isNot: null },
          },
          include: {
            lineUserLink: true,
          },
        });

        if (usersWithLink.length === 0) {
          skipped += 1;
          continue;
        }

        // Query overdue invoices
        const overdueRecords = await prisma.invoice.findMany({
          where: {
            companyId: company.id,
            isPaid: false,
            status: 'approved',
            dueDate: { lt: now },
          },
          include: {
            buyer: { select: { nameTh: true } },
          },
          orderBy: { dueDate: 'asc' },
        });

        if (overdueRecords.length === 0) {
          skipped += 1;
          continue;
        }

        const overdue: OverdueInvoice[] = overdueRecords.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.buyer.nameTh,
          total: inv.total,
          dueDate: inv.dueDate!,
          daysOverdue: Math.floor(
            (now.getTime() - inv.dueDate!.getTime()) / (1000 * 60 * 60 * 24),
          ),
        }));

        const flexCard = buildOverdueFlexCard(overdue);
        const altText = `ใบแจ้งหนี้เกินกำหนด ${overdue.length} รายการ — ${company.nameTh}`;

        for (const user of usersWithLink) {
          const lineUserId = user.lineUserLink?.lineUserId;
          if (!lineUserId || !user.lineUserLink?.isActive) continue;

          await sendLineFlexMessage(lineUserId, altText, flexCard);
        }

        notified += 1;
        logger.info('[Overdue Reminders] Sent notification', {
          companyId: company.id,
          companyName: company.nameTh,
          overdueCount: overdue.length,
          recipients: usersWithLink.length,
        });
      } catch (err) {
        logger.error('[Overdue Reminders] Failed to process company', {
          err,
          companyId: company.id,
        });
        skipped += 1;
      }
    }

    logger.info('[Overdue Reminders] Cycle completed', { notified, skipped });
    return { notified, skipped };
  },
  { connection: redis, concurrency: 1 },
);

overdueReminderWorker.on('completed', (_job, result) => {
  logger.info('[Overdue Reminders] Worker completed', result);
});

overdueReminderWorker.on('failed', (job, err) => {
  logger.error('[Overdue Reminders] Worker failed', { error: err.message, jobId: job?.id });
});
