import { Job, Queue, Worker } from 'bullmq';
import redis from '../../config/redis';
import prisma from '../../config/database';
import { withSystemRlsContext } from '../../config/rls';
import { logger } from '../../config/logger';
import {
  getBillingPlanConfig,
  getCancelUrl,
  getStripeClient,
  getSuccessUrl,
} from '../../services/billingService';
import { sendRenewalLinkEmail } from '../../services/emailService';

const QUEUE_NAME = 'billing-renewal-reminders';
const FALLBACK_BILLING_URL = `${(process.env.APP_ORIGIN ?? process.env.FRONTEND_URL ?? 'http://app.localhost:3000').replace(/\/$/, '')}/app/admin`;

export const billingRenewalQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 10 },
  },
});

(async () => {
  await billingRenewalQueue.add(
    'daily-renewal-reminders',
    { triggeredBy: 'cron' },
    {
      repeat: { pattern: '0 9 * * *' },
      jobId: 'billing-renewal-reminders-daily',
    },
  );
  logger.info('[Billing Renewals] Daily reminder cron registered (09:00 every day)');
})();

interface RenewalReminderJobData {
  triggeredBy: 'cron' | 'manual';
}

function daysBetween(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export const billingRenewalWorker = new Worker<RenewalReminderJobData>(
  QUEUE_NAME,
  async (_job: Job<RenewalReminderJobData>) => {
    const stripe = getStripeClient();

    const now = new Date();
    const subscriptions = await withSystemRlsContext(prisma, (tx) => tx.companySubscription.findMany({
      where: {
        status: 'active',
        currentPeriodEnd: { not: null },
        OR: [
          { stripeSubscriptionId: null },
          { cancelAtPeriodEnd: true },
        ],
      },
      include: {
        company: {
          select: {
            id: true,
            nameTh: true,
            email: true,
          },
        },
      },
    }), { role: 'billing-renewal-worker' });

    let reminded = 0;
    let skipped = 0;

    for (const subscription of subscriptions) {
      if (!subscription.currentPeriodEnd || !subscription.company.email) {
        skipped += 1;
        continue;
      }

      const daysUntil = daysBetween(now, subscription.currentPeriodEnd);
      if (![7, 3, 1].includes(daysUntil)) {
        skipped += 1;
        continue;
      }

      const planConfig = getBillingPlanConfig(subscription.plan);
      const totalAmount = (planConfig.monthlyAmount ?? 0) / 100;

      let renewalUrl = FALLBACK_BILLING_URL;
      let expiresAt: Date | null = null;

      if (stripe) {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          success_url: getSuccessUrl(),
          cancel_url: getCancelUrl(),
          customer: subscription.stripeCustomerId ?? undefined,
          customer_email: subscription.company.email ?? undefined,
          customer_creation: subscription.stripeCustomerId ? undefined : 'always',
          payment_method_types: ['card'],
          billing_address_collection: 'required',
          line_items: [
            {
              price_data: {
                currency: 'thb',
                unit_amount: Math.round(totalAmount * 100),
                product_data: {
                  name: `${planConfig.nameEn} renewal`,
                  description: `Renewal for ${subscription.company.nameTh}`,
                },
              },
              quantity: 1,
            },
          ],
          metadata: {
            renewalCompanyId: subscription.companyId,
            plan: subscription.plan,
            paymentMethod: 'stripe',
            subtotalAmount: String(totalAmount),
            discountAmount: '0',
            totalAmount: String(totalAmount),
            couponCode: '',
            automatedReminder: 'true',
            reminderDaysUntil: String(daysUntil),
          },
        });
        renewalUrl = session.url ?? renewalUrl;
        expiresAt = session.expires_at ? new Date(session.expires_at * 1000) : null;
      }

      await sendRenewalLinkEmail({
        companyNameTh: subscription.company.nameTh,
        adminEmail: subscription.company.email,
        planName: planConfig.nameTh,
        renewalUrl,
        expiresAt,
        amountDue: totalAmount,
        paymentMethod: 'stripe',
        locale: 'th',
      });

      reminded += 1;
    }

    logger.info('[Billing Renewals] Reminder cycle completed', { reminded, skipped });
    return { reminded, skipped };
  },
  { connection: redis, concurrency: 1 },
);

billingRenewalWorker.on('completed', (_job, result) => {
  logger.info('[Billing Renewals] Worker completed', result);
});

billingRenewalWorker.on('failed', (job, err) => {
  logger.error('[Billing Renewals] Worker failed', { error: err.message, jobId: job?.id });
});
