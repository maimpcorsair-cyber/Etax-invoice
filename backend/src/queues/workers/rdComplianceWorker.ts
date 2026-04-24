/**
 * rdComplianceWorker.ts
 * BullMQ worker + cron scheduler — RD e-Tax Compliance Monitor
 *
 * Runs automatically on the 10th of every month (5 days before RD's deadline).
 * Checks the previous month's invoices:
 *   - failed    → auto-retry (re-queue to rdSubmissionQueue)
 *   - pending   → warn admin (may be stuck)
 *   - not queued → queue now
 *
 * RD rule: ALL documents (T01–T05) must be submitted by the 15th of the following month.
 * Ref: ประมวลรัษฎากร ม. 86/6, ระเบียบกรมสรรพากร พ.ศ. 2560
 */

import { Worker, Job, Queue } from 'bullmq';
import redis from '../../config/redis';
import prisma from '../../config/database';
import { withSystemRlsContext } from '../../config/rls';
import { rdSubmissionQueue } from '../index';
import { logger } from '../../config/logger';
import nodemailer from 'nodemailer';

const QUEUE_NAME = 'rd-compliance';

// ─── Compliance Queue (for the cron job itself) ───────────────────────────────
export const rdComplianceQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 12 },  // keep 12 runs (1 year)
    removeOnFail: { count: 6 },
  },
});

// ─── Register monthly cron: 09:00 on the 10th of every month ──────────────────
(async () => {
  // BullMQ deduplicates repeating jobs by `name + cron pattern`
  await rdComplianceQueue.add(
    'monthly-rd-compliance-check',
    { triggeredBy: 'cron' },
    {
      repeat: { pattern: '0 9 10 * *' },   // "At 09:00 on day 10 of every month"
      jobId: 'rd-compliance-monthly',       // stable ID to prevent duplicate registration
    },
  );
  logger.info('[RD Compliance] Monthly cron job registered (10th of each month at 09:00)');
})();

// ─── Worker ──────────────────────────────────────────────────────────────────
interface ComplianceJobData {
  triggeredBy: 'cron' | 'manual';
  year?: number;   // override: which year to check (default: last month's year)
  month?: number;  // override: which month to check (default: last month, 1-12)
}

export const rdComplianceWorker = new Worker<ComplianceJobData>(
  QUEUE_NAME,
  async (job: Job<ComplianceJobData>) => {
    const now = new Date();

    // Default: check previous month
    const checkDate = new Date(
      job.data.year  ?? (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()),
      job.data.month ? job.data.month - 1 : (now.getMonth() === 0 ? 11 : now.getMonth() - 1),
      1,
    );

    const monthStart = new Date(checkDate.getFullYear(), checkDate.getMonth(), 1);
    const monthEnd   = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0, 23, 59, 59);
    const monthLabel = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}`;

    logger.info(`[RD Compliance] Checking month ${monthLabel}`, { triggeredBy: job.data.triggeredBy });

    // ─── 1. Find all non-cancelled invoices from that month not yet submitted ──
    const allInvoices = await withSystemRlsContext(prisma, (tx) => tx.invoice.findMany({
      where: {
        invoiceDate: { gte: monthStart, lte: monthEnd },
        status: { not: 'cancelled' },
      },
      select: {
        id: true,
        invoiceNumber: true,
        type: true,
        status: true,
        rdSubmissionStatus: true,
        rdDocId: true,
        companyId: true,
        total: true,
        company: { select: { nameTh: true, email: true } },
      },
    }), { role: 'worker' });

    const submitted  = allInvoices.filter(i => i.rdSubmissionStatus === 'success');
    const failed     = allInvoices.filter(i => i.rdSubmissionStatus === 'failed');
    const stuck      = allInvoices.filter(i => ['pending', 'in_progress', 'retrying'].includes(i.rdSubmissionStatus ?? ''));
    const unqueued   = allInvoices.filter(i =>
      i.rdSubmissionStatus == null && i.status === 'approved',
    );
    // draft invoices that haven't been approved yet (T02/T04/T05 waiting for human approval)
    const unapproved = allInvoices.filter(i =>
      i.rdSubmissionStatus == null && i.status === 'draft',
    );

    logger.info(`[RD Compliance] ${monthLabel} summary`, {
      total: allInvoices.length,
      submitted: submitted.length,
      failed: failed.length,
      stuck: stuck.length,
      unqueued: unqueued.length,
      unapproved: unapproved.length,
    });

    // ─── 2. Auto-retry failed submissions ─────────────────────────────────────
    let retriedCount = 0;
    for (const inv of failed) {
      try {
        await withSystemRlsContext(prisma, (tx) => tx.invoice.update({
          where: { id: inv.id },
          data: { rdSubmissionStatus: 'pending' },
        }), { role: 'worker' });
        await rdSubmissionQueue.add('submit-to-rd', { invoiceId: inv.id }, {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
        });
        retriedCount++;
        logger.info(`[RD Compliance] Auto-retried failed invoice ${inv.invoiceNumber}`);
      } catch (e) {
        logger.error(`[RD Compliance] Failed to retry ${inv.invoiceNumber}`, e);
      }
    }

    // ─── 3. Queue approved invoices that were never queued ────────────────────
    let newlyQueuedCount = 0;
    for (const inv of unqueued) {
      try {
        await withSystemRlsContext(prisma, (tx) => tx.invoice.update({
          where: { id: inv.id },
          data: { rdSubmissionStatus: 'pending' },
        }), { role: 'worker' });
        await rdSubmissionQueue.add('submit-to-rd', { invoiceId: inv.id }, {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
        });
        newlyQueuedCount++;
        logger.info(`[RD Compliance] Queued previously-missed invoice ${inv.invoiceNumber}`);
      } catch (e) {
        logger.error(`[RD Compliance] Failed to queue ${inv.invoiceNumber}`, e);
      }
    }

    // ─── 4. Send alert email if there are issues (grouped per company) ────────
    if (failed.length > 0 || unqueued.length > 0 || unapproved.length > 0) {
      // Group by company
      const byCompany = new Map<string, {
        nameTh: string;
        email: string | null;
        failed: typeof failed;
        unqueued: typeof unqueued;
        unapproved: typeof unapproved;
      }>();

      for (const inv of [...failed, ...unqueued, ...unapproved]) {
        if (!byCompany.has(inv.companyId)) {
          byCompany.set(inv.companyId, {
            nameTh: inv.company.nameTh,
            email: inv.company.email,
            failed: [], unqueued: [], unapproved: [],
          });
        }
        const entry = byCompany.get(inv.companyId)!;
        if (failed.includes(inv))     entry.failed.push(inv);
        if (unqueued.includes(inv))   entry.unqueued.push(inv);
        if (unapproved.includes(inv)) entry.unapproved.push(inv);
      }

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      for (const [, data] of byCompany) {
        if (!data.email) continue;
        const deadlineDate = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 15);
        const deadlineStr  = deadlineDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        const daysLeft     = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        const html = buildComplianceAlertHtml({
          companyName: data.nameTh,
          month: monthLabel,
          deadline: deadlineStr,
          daysLeft,
          failedCount: data.failed.length,
          unqueuedCount: data.unqueued.length,
          unapprovedCount: data.unapproved.length,
          retriedCount,
          newlyQueuedCount,
          failedInvoices: data.failed.map(i => i.invoiceNumber),
          unapprovedInvoices: data.unapproved.map(i => i.invoiceNumber),
        });

        await transporter.sendMail({
          from: `"e-Tax System" <${process.env.SMTP_USER}>`,
          to: data.email,
          subject: `⚠️ แจ้งเตือน RD Compliance เดือน ${monthLabel} — กรุณาดำเนินการก่อนวันที่ 15`,
          html,
        }).catch((e: Error) => logger.warn(`[RD Compliance] Email send failed: ${e.message}`));

        logger.info(`[RD Compliance] Alert email sent to ${data.email}`);
      }
    }

    return {
      month: monthLabel,
      total: allInvoices.length,
      submitted: submitted.length,
      failed: failed.length,
      retriedCount,
      newlyQueuedCount,
      unapproved: unapproved.length,
    };
  },
  { connection: redis, concurrency: 1 },
);

rdComplianceWorker.on('completed', (job, result) => {
  logger.info(`[RD Compliance] Check completed for ${result.month}`, result);
});

rdComplianceWorker.on('failed', (job, err) => {
  logger.error(`[RD Compliance] Check failed`, { error: err.message, jobId: job?.id });
});

// ─── Email Template ───────────────────────────────────────────────────────────
function buildComplianceAlertHtml(opts: {
  companyName: string;
  month: string;
  deadline: string;
  daysLeft: number;
  failedCount: number;
  unqueuedCount: number;
  unapprovedCount: number;
  retriedCount: number;
  newlyQueuedCount: number;
  failedInvoices: string[];
  unapprovedInvoices: string[];
}): string {
  const urgent = opts.daysLeft <= 3;
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet"/>
<style>
  body{font-family:'Sarabun',sans-serif;background:#f3f4f6;margin:0;padding:20px}
  .container{max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .header{background:${urgent ? '#dc2626' : '#d97706'};color:white;padding:24px}
  .header h1{margin:0;font-size:20px}
  .body{padding:24px}
  .alert-box{background:${urgent ? '#fef2f2' : '#fffbeb'};border:1px solid ${urgent ? '#fca5a5' : '#fcd34d'};border-radius:8px;padding:16px;margin-bottom:20px}
  .stat{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px}
  .stat .lbl{color:#6b7280}
  .stat .val{font-weight:600}
  .val-ok{color:#16a34a}
  .val-warn{color:#d97706}
  .val-err{color:#dc2626}
  .invoice-list{font-family:monospace;font-size:12px;background:#f9fafb;padding:8px 12px;border-radius:6px;margin-top:8px}
  .footer{background:#f9fafb;padding:16px;text-align:center;font-size:12px;color:#9ca3af}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${urgent ? '🚨' : '⚠️'} แจ้งเตือน RD Compliance — เดือน ${opts.month}</h1>
    <p style="margin:4px 0 0;opacity:.85;font-size:14px">${opts.companyName}</p>
  </div>
  <div class="body">
    <div class="alert-box">
      <strong>กำหนดส่งกรมสรรพากร: ${opts.deadline}</strong>
      ${opts.daysLeft > 0
        ? `<p style="margin:4px 0 0;font-size:14px">เหลืออีก <strong>${opts.daysLeft} วัน</strong></p>`
        : `<p style="margin:4px 0 0;font-size:14px;color:#dc2626"><strong>เกินกำหนดแล้ว!</strong> กรุณาติดต่อผู้ดูแลระบบ</p>`}
    </div>

    <h3 style="margin:0 0 12px;font-size:16px">สรุปสถานะเดือน ${opts.month}</h3>

    ${opts.failedCount > 0 ? `
    <div class="stat">
      <span class="lbl">❌ ส่งไม่สำเร็จ (auto-retry แล้ว ${opts.retriedCount} ใบ)</span>
      <span class="val val-err">${opts.failedCount} ใบ</span>
    </div>
    ${opts.failedInvoices.length > 0 ? `<div class="invoice-list">${opts.failedInvoices.join(', ')}</div>` : ''}
    ` : ''}

    ${opts.unqueuedCount > 0 ? `
    <div class="stat">
      <span class="lbl">🔄 รออยู่ในคิว (ส่งให้แล้ว ${opts.newlyQueuedCount} ใบ)</span>
      <span class="val val-warn">${opts.unqueuedCount} ใบ</span>
    </div>
    ` : ''}

    ${opts.unapprovedCount > 0 ? `
    <div class="stat">
      <span class="lbl">🕐 รอการอนุมัติก่อนส่ง RD</span>
      <span class="val val-warn">${opts.unapprovedCount} ใบ</span>
    </div>
    ${opts.unapprovedInvoices.length > 0 ? `<div class="invoice-list">${opts.unapprovedInvoices.join(', ')}</div>` : ''}
    ` : ''}

    <p style="margin-top:20px;font-size:14px;color:#374151">
      กรุณาเข้าสู่ระบบและอนุมัติ/ส่งเอกสารให้ครบก่อนวันที่ 15 ของเดือน
      เพื่อให้ถูกต้องตามกฎหมายประมวลรัษฎากร ม. 86/6
    </p>
  </div>
  <div class="footer">
    e-Tax Invoice System · ส่งอัตโนมัติจากระบบตรวจสอบ RD Compliance
  </div>
</div>
</body>
</html>`;
}
