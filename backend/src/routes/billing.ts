import { Prisma } from '@prisma/client';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext, withSystemRlsContext } from '../config/rls';
import { authenticate, requireRole } from '../middleware/auth';
import {
  getBillingPlanConfig,
  getCancelUrl,
  getPlanPriceId,
  getPromptPayTarget,
  getStripeClient,
  getSuccessUrl,
  isBillingConfigured,
  isPromptPayConfigured,
  listBillingPlans,
  listPaymentMethods,
  mapStripeStatus,
  resolveCouponForCheckout,
  type BillingPlanKey,
  type BillingPaymentMethod,
} from '../services/billingService';
import { resolveCompanyAccessPolicy } from '../services/accessPolicyService';
import { buildPromptPayQr } from '../services/promptPayService';
import {
  sendBillingActivationEmail,
  sendBillingPaymentFailedEmail,
  sendRenewalLinkEmail,
} from '../services/emailService';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

function getSubscriptionPeriod(subscription: unknown) {
  const data = subscription as {
    current_period_start?: number;
    current_period_end?: number;
  };

  return {
    currentPeriodStart: data.current_period_start ? new Date(data.current_period_start * 1000) : null,
    currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end * 1000) : null,
  };
}

function getInvoiceSubscriptionId(invoice: unknown) {
  const data = invoice as {
    subscription?: string | { id?: string } | null;
    parent?: {
      subscription_details?: {
        subscription?: string;
      } | null;
    } | null;
  };

  if (typeof data.subscription === 'string') return data.subscription;
  if (typeof data.subscription === 'object' && data.subscription?.id) return data.subscription.id;
  if (data.parent?.subscription_details?.subscription) return data.parent.subscription_details.subscription;
  return null;
}

function addMonths(date: Date, months: number) {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

function getTenantLoginUrl() {
  const appOrigin = process.env.APP_ORIGIN ?? process.env.FRONTEND_URL ?? 'http://app.localhost:3000';
  return `${appOrigin.replace(/\/$/, '')}/login`;
}

function getTenantBillingUrl() {
  return `${getTenantLoginUrl().replace(/\/login$/, '')}/app/admin`;
}

type RenewalSessionInput = {
  companyId: string;
  paymentMethod: 'stripe' | 'stripe_promptpay';
  couponCode?: string | null;
};

async function createRenewalCheckoutSession(input: RenewalSessionInput) {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe billing is not configured');
  }

  const company = await withSystemRlsContext(prisma, (tx) => tx.company.findUnique({
    where: { id: input.companyId },
    include: { subscription: true },
  }), { role: 'owner-renewal' });

  if (!company?.subscription) {
    throw new Error('Company subscription not found');
  }

  const subscription = company.subscription;
  const planConfig = getBillingPlanConfig(subscription.plan as BillingPlanKey);
  const subtotalAmount = (planConfig.monthlyAmount ?? 0) / 100;
  const coupon = await resolveCouponForCheckout({
    couponCode: input.couponCode || null,
    subtotalAmount,
    paymentMethod: input.paymentMethod as BillingPaymentMethod,
  });
  const totalAmount = Number(Math.max(subtotalAmount - (coupon?.discountAmount ?? 0), 0).toFixed(2));

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: getSuccessUrl(),
    cancel_url: getCancelUrl(),
    customer: subscription.stripeCustomerId ?? undefined,
    customer_email: company.email ?? undefined,
    customer_creation: subscription.stripeCustomerId ? undefined : 'always',
    payment_method_types: input.paymentMethod === 'stripe_promptpay' ? ['promptpay'] : ['card'],
    billing_address_collection: 'required',
    line_items: [
      {
        price_data: {
          currency: 'thb',
          unit_amount: Math.round(totalAmount * 100),
          product_data: {
            name: `${planConfig.nameEn} renewal`,
            description: `Renewal for ${company.nameTh}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      renewalCompanyId: company.id,
      plan: subscription.plan,
      paymentMethod: input.paymentMethod,
      subtotalAmount: String(subtotalAmount),
      discountAmount: String(coupon?.discountAmount ?? 0),
      totalAmount: String(totalAmount),
      couponCode: coupon?.code ?? '',
    },
  });

  return {
    company,
    subscription,
    session,
    planConfig,
    subtotalAmount,
    coupon,
    totalAmount,
  };
}

export const billingRouter = Router();
export const stripeWebhookRouter = Router();

const checkoutSchema = z.object({
  plan: z.enum(['starter', 'business']),
  paymentMethod: z.enum(['stripe', 'stripe_promptpay', 'promptpay_qr']).default('stripe'),
  couponCode: z.string().trim().max(50).optional().or(z.literal('')),
  companyNameTh: z.string().trim().min(2).max(200),
  companyNameEn: z.string().trim().max(200).optional().or(z.literal('')),
  taxId: z.string().trim().regex(/^\d{13}$/),
  addressTh: z.string().trim().min(10).max(500),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().trim().email(),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  locale: z.enum(['th', 'en']).default('th'),
});

const freeSignupSchema = z.object({
  companyNameTh: z.string().trim().min(2).max(200),
  companyNameEn: z.string().trim().max(200).optional().or(z.literal('')),
  taxId: z.string().trim().regex(/^\d{13}$/),
  addressTh: z.string().trim().min(10).max(500),
  adminName: z.string().trim().min(2).max(120).optional().or(z.literal('')),
  adminEmail: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  locale: z.enum(['th', 'en']).default('th'),
  googleCredential: z.string().min(1).optional(),
});

const couponSchema = z.object({
  code: z.string().trim().min(3).max(50),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(300).optional().or(z.literal('')),
  discountType: z.enum(['percent', 'fixed']),
  discountValue: z.number().positive(),
  minSubtotalAmount: z.number().min(0).optional(),
  maxDiscountAmount: z.number().min(0).optional(),
  maxRedemptions: z.number().int().positive().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  stripePromotionCodeId: z.string().trim().max(120).optional().or(z.literal('')),
  active: z.boolean().default(true),
});

function issueToken(user: { id: string; companyId: string; role: string; email: string }) {
  return jwt.sign(
    { userId: user.id, companyId: user.companyId, role: user.role, email: user.email },
    process.env.JWT_SECRET!,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as any },
  );
}

async function verifySignupGoogleCredential(credential?: string) {
  if (!credential) {
    return null;
  }
  if (!googleClient || !googleClientId) {
    throw new Error('Google Sign-In is not configured');
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: googleClientId,
  });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw new Error('Invalid Google account');
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name?.trim() || '',
  };
}

async function syncBillingTransactionByReference(
  externalReference: string,
  data: {
    status: string;
    paidAt?: Date | null;
    companyId?: string | null;
  },
) {
  await withSystemRlsContext(prisma, (tx) => tx.billingTransaction.updateMany({
    where: { externalReference },
    data,
  }), { role: 'billing-webhook' });
}

async function upsertBillingTransactionByReference(
  externalReference: string,
  data: {
    companyId?: string | null;
    pendingSignupId?: string | null;
    couponId?: string | null;
    plan: BillingPlanKey;
    channel: string;
    status: string;
    subtotalAmount: number;
    discountAmount?: number;
    totalAmount: number;
    couponCode?: string | null;
    paidAt?: Date | null;
    metadata?: Record<string, unknown>;
  },
) {
  await withSystemRlsContext(prisma, async (tx) => {
    const existing = await tx.billingTransaction.findFirst({
      where: { externalReference },
      select: { id: true },
    });

    if (existing) {
      await tx.billingTransaction.update({
        where: { id: existing.id },
        data: {
          companyId: data.companyId ?? undefined,
          pendingSignupId: data.pendingSignupId ?? undefined,
          couponId: data.couponId ?? undefined,
          plan: data.plan,
          channel: data.channel,
          status: data.status,
          subtotalAmount: data.subtotalAmount,
          discountAmount: data.discountAmount ?? 0,
          totalAmount: data.totalAmount,
          couponCode: data.couponCode ?? null,
          paidAt: data.paidAt ?? null,
          metadata: data.metadata as Prisma.InputJsonValue | undefined,
        },
      });
      return;
    }

    await tx.billingTransaction.create({
      data: {
        companyId: data.companyId ?? null,
        pendingSignupId: data.pendingSignupId ?? null,
        couponId: data.couponId ?? null,
        plan: data.plan,
        channel: data.channel,
        status: data.status,
        subtotalAmount: data.subtotalAmount,
        discountAmount: data.discountAmount ?? 0,
        totalAmount: data.totalAmount,
        couponCode: data.couponCode ?? null,
        externalReference,
        paidAt: data.paidAt ?? null,
        metadata: data.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }, { role: 'billing-webhook' });
}

async function provisionSignupFromPendingSignup(pendingSignupId: string) {
  const pendingSignup = await prisma.pendingSignup.findUnique({
    where: { id: pendingSignupId },
  });

  if (!pendingSignup) {
    throw new Error('Pending signup not found');
  }

  if (pendingSignup.status === 'activated' && pendingSignup.companyId && pendingSignup.userId) {
    return pendingSignup;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: pendingSignup.adminEmail },
  });
  const existingCompany = await prisma.company.findUnique({
    where: { taxId: pendingSignup.taxId },
  });

  let companyId = existingCompany?.id;
  let userId = existingUser?.id;

  if (existingUser && existingCompany && existingUser.companyId !== existingCompany.id) {
    throw new Error('Admin email and tax ID are already linked to different accounts');
  }

  if (!companyId && existingUser) {
    companyId = existingUser.companyId;
  }

  const stripeStatus = mapStripeStatus(pendingSignup.stripeSubscriptionId ? 'active' : null);
  const planConfig = getBillingPlanConfig(pendingSignup.plan as BillingPlanKey);
  const isStripePromptPay = pendingSignup.paymentMethod === 'stripe_promptpay';
  const now = new Date();
  const nextPeriodEnd = new Date(now);
  nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

  await withSystemRlsContext(prisma, async (tx) => {
    let company = companyId
      ? await tx.company.findUnique({ where: { id: companyId } })
      : null;

    if (!company) {
      company = await tx.company.create({
        data: {
          nameTh: pendingSignup.companyNameTh,
          nameEn: pendingSignup.companyNameEn || null,
          taxId: pendingSignup.taxId,
          addressTh: pendingSignup.addressTh,
          email: pendingSignup.adminEmail,
          phone: pendingSignup.phone || null,
        },
      });
      companyId = company.id;
    }

    let user = userId ? await tx.user.findUnique({ where: { id: userId } }) : null;
    if (!user) {
      user = await tx.user.create({
        data: {
          companyId: company.id,
          email: pendingSignup.adminEmail,
          name: pendingSignup.adminName,
          role: 'admin',
          isActive: true,
        },
      });
      userId = user.id;
    }

    await tx.companySubscription.upsert({
      where: { companyId: company.id },
      create: {
        companyId: company.id,
        plan: pendingSignup.plan,
        status: isStripePromptPay ? 'active' : stripeStatus,
        billingInterval: 'month',
        docLimit: planConfig.docLimit,
        stripeCustomerId: pendingSignup.stripeCustomerId ?? null,
        stripeSubscriptionId: pendingSignup.stripeSubscriptionId ?? null,
        stripePriceId: pendingSignup.stripePriceId ?? null,
        stripeCheckoutSessionId: pendingSignup.stripeCheckoutSessionId ?? null,
        currentPeriodStart: isStripePromptPay ? now : undefined,
        currentPeriodEnd: isStripePromptPay ? nextPeriodEnd : undefined,
        activatedAt: now,
      },
      update: {
        plan: pendingSignup.plan,
        status: isStripePromptPay ? 'active' : stripeStatus,
        billingInterval: 'month',
        docLimit: planConfig.docLimit,
        stripeCustomerId: pendingSignup.stripeCustomerId ?? undefined,
        stripeSubscriptionId: pendingSignup.stripeSubscriptionId ?? undefined,
        stripePriceId: pendingSignup.stripePriceId ?? undefined,
        stripeCheckoutSessionId: pendingSignup.stripeCheckoutSessionId ?? undefined,
        currentPeriodStart: isStripePromptPay ? now : undefined,
        currentPeriodEnd: isStripePromptPay ? nextPeriodEnd : undefined,
        activatedAt: now,
      },
    });

    await tx.pendingSignup.update({
      where: { id: pendingSignup.id },
      data: {
        status: 'activated',
        companyId: company.id,
        userId: user.id,
        activatedAt: new Date(),
      },
    });

    await tx.billingTransaction.updateMany({
      where: { pendingSignupId: pendingSignup.id },
      data: {
        companyId: company.id,
        status: 'activated',
        paidAt: new Date(),
      },
    });

    if (pendingSignup.couponCode) {
      await tx.coupon.updateMany({
        where: { code: pendingSignup.couponCode },
        data: { redeemedCount: { increment: 1 } },
      });
    }
  }, { role: 'billing-provisioner' });

  const activatedSignup = await prisma.pendingSignup.findUniqueOrThrow({ where: { id: pendingSignupId } });

  await sendBillingActivationEmail({
    companyNameTh: activatedSignup.companyNameTh,
    adminName: activatedSignup.adminName,
    adminEmail: activatedSignup.adminEmail,
    planName: planConfig.nameTh,
    amountPaid: activatedSignup.totalAmount ?? activatedSignup.subtotalAmount ?? null,
    paymentMethod: activatedSignup.paymentMethod,
    loginUrl: getTenantLoginUrl(),
    locale: activatedSignup.locale === 'en' ? 'en' : 'th',
  });

  return activatedSignup;
}

async function syncSubscriptionFromStripeSubscription(subscriptionId: string) {
  const stripe = getStripeClient();
  if (!stripe) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const period = getSubscriptionPeriod(subscription);
  await withSystemRlsContext(prisma, (tx) => tx.companySubscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: mapStripeStatus(subscription.status),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
      stripePriceId: subscription.items.data[0]?.price.id ?? null,
    },
  }), { role: 'billing-webhook' });
}

stripeWebhookRouter.post('/stripe/webhook', async (req, res) => {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    res.status(503).json({ error: 'Stripe webhook is not configured' });
    return;
  }

  const signature = req.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    res.status(400).json({ error: 'Missing Stripe signature' });
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    res.status(400).json({ error: `Webhook signature verification failed: ${(err as Error).message}` });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const pendingSignupId = session.metadata?.pendingSignupId;
        const renewalCompanyId = session.metadata?.renewalCompanyId;
        if (pendingSignupId) {
          await prisma.pendingSignup.update({
            where: { id: pendingSignupId },
            data: {
              status: 'paid',
              stripeCheckoutSessionId: session.id,
              stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
              stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
            },
          });
          await syncBillingTransactionByReference(session.id, {
            status: 'paid',
            paidAt: new Date(),
          });
          await provisionSignupFromPendingSignup(pendingSignupId);
          if (typeof session.subscription === 'string') {
            await syncSubscriptionFromStripeSubscription(session.subscription);
          }
        }
        if (renewalCompanyId) {
          const subscription = await withSystemRlsContext(prisma, (tx) => tx.companySubscription.findUnique({
            where: { companyId: renewalCompanyId },
          }), { role: 'billing-webhook' });

          if (subscription) {
            const periodStart = subscription.currentPeriodEnd ?? new Date();
            const periodEnd = addMonths(periodStart, 1);

            await withSystemRlsContext(prisma, (tx) => tx.companySubscription.update({
              where: { companyId: renewalCompanyId },
              data: {
                status: 'active',
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
              },
            }), { role: 'billing-webhook' });

            await upsertBillingTransactionByReference(session.id, {
              companyId: renewalCompanyId,
              plan: subscription.plan as BillingPlanKey,
              channel: session.metadata?.paymentMethod === 'stripe_promptpay' ? 'stripe_promptpay' : 'stripe',
              status: 'paid',
              subtotalAmount: Number(session.metadata?.subtotalAmount ?? 0),
              discountAmount: Number(session.metadata?.discountAmount ?? 0),
              totalAmount: Number(session.metadata?.totalAmount ?? 0),
              couponCode: session.metadata?.couponCode || null,
              paidAt: new Date(),
              metadata: {
                renewal: true,
                locale: session.locale,
              },
            });
          }
        }
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object;
        const pendingSignupId = session.metadata?.pendingSignupId;
        if (pendingSignupId) {
          await prisma.pendingSignup.updateMany({
            where: { id: pendingSignupId },
            data: { status: 'expired', stripeCheckoutSessionId: session.id },
          });
          await syncBillingTransactionByReference(session.id, {
            status: 'expired',
          });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const period = getSubscriptionPeriod(subscription);
        await withSystemRlsContext(prisma, (tx) => tx.companySubscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            status: mapStripeStatus(subscription.status),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            currentPeriodStart: period.currentPeriodStart,
            currentPeriodEnd: period.currentPeriodEnd,
            stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : null,
            stripePriceId: subscription.items.data[0]?.price.id ?? null,
          },
        }), { role: 'billing-webhook' });

        await prisma.pendingSignup.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : null,
            stripePriceId: subscription.items.data[0]?.price.id ?? null,
          },
        });
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        const subscriptionId = getInvoiceSubscriptionId(invoice);

        if (subscriptionId) {
          await syncSubscriptionFromStripeSubscription(subscriptionId);

          const subscriptionRecord = await withSystemRlsContext(prisma, (tx) => tx.companySubscription.findFirst({
            where: { stripeSubscriptionId: subscriptionId },
            include: { company: true },
          }), { role: 'billing-webhook' });

          if (subscriptionRecord && typeof invoice.id === 'string') {
            const amountPaid = typeof invoice.amount_paid === 'number' ? invoice.amount_paid / 100 : 0;
            await upsertBillingTransactionByReference(invoice.id, {
              companyId: subscriptionRecord.companyId,
              plan: subscriptionRecord.plan as BillingPlanKey,
              channel: 'stripe',
              status: 'paid',
              subtotalAmount: amountPaid,
              discountAmount: 0,
              totalAmount: amountPaid,
              paidAt: new Date(),
              metadata: {
                recurring: true,
                stripeInvoiceId: invoice.id,
                stripeSubscriptionId: subscriptionId,
              },
            });
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = getInvoiceSubscriptionId(invoice);

        if (subscriptionId) {
          const subscriptionRecord = await withSystemRlsContext(prisma, (tx) => tx.companySubscription.findFirst({
            where: { stripeSubscriptionId: subscriptionId },
            include: { company: true },
          }), { role: 'billing-webhook' });

          await withSystemRlsContext(prisma, (tx) => tx.companySubscription.updateMany({
            where: { stripeSubscriptionId: subscriptionId },
            data: { status: 'past_due' },
          }), { role: 'billing-webhook' });
          if (typeof invoice.id === 'string') {
            const amountDue = typeof invoice.amount_due === 'number' ? invoice.amount_due / 100 : 0;
            await upsertBillingTransactionByReference(invoice.id, {
              companyId: subscriptionRecord?.companyId ?? null,
              plan: (subscriptionRecord?.plan as BillingPlanKey | undefined) ?? 'starter',
              channel: 'stripe',
              status: 'payment_failed',
              subtotalAmount: amountDue,
              discountAmount: 0,
              totalAmount: amountDue,
              metadata: {
                recurring: true,
                stripeInvoiceId: invoice.id,
                stripeSubscriptionId: subscriptionId,
              },
            });
          }

          if (subscriptionRecord?.company?.email) {
            const planConfig = getBillingPlanConfig(subscriptionRecord.plan as BillingPlanKey);
            await sendBillingPaymentFailedEmail({
              companyNameTh: subscriptionRecord.company.nameTh,
              adminEmail: subscriptionRecord.company.email,
              planName: planConfig.nameTh,
              amountDue: typeof invoice.amount_due === 'number' ? invoice.amount_due / 100 : undefined,
              paymentMethod: 'stripe',
              retryUrl: `${getTenantLoginUrl().replace(/\/login$/, '')}/billing`,
              locale: 'th',
            });
          }
        }
        break;
      }
      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'Webhook processing failed' });
  }
});

billingRouter.get('/config', (_req, res) => {
  res.json({
    enabled: isBillingConfigured() || isPromptPayConfigured(),
    currency: 'thb',
    plans: listBillingPlans(),
    paymentMethods: listPaymentMethods(),
  });
});

billingRouter.post('/free-signup', async (req, res) => {
  try {
    const body = freeSignupSchema.parse(req.body);
    const googleAccount = await verifySignupGoogleCredential(body.googleCredential);
    const manualEmail = body.adminEmail?.trim().toLowerCase();
    const manualAdminName = body.adminName?.trim();

    if (!googleAccount && (!manualEmail || !manualAdminName)) {
      res.status(400).json({ error: 'Admin name and email are required when Google Sign-In is not used' });
      return;
    }

    const email = googleAccount?.email ?? manualEmail!;
    const adminName = googleAccount?.name || manualAdminName || email.split('@')[0];

    const [existingUser, existingCompany] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.company.findUnique({ where: { taxId: body.taxId } }),
    ]);

    if (existingUser) {
      res.status(409).json({ error: 'This admin email is already registered in the system' });
      return;
    }
    if (existingCompany) {
      res.status(409).json({ error: 'This tax ID is already registered in the system' });
      return;
    }

    const result = await withSystemRlsContext(prisma, async (tx) => {
      const company = await tx.company.create({
        data: {
          nameTh: body.companyNameTh,
          nameEn: body.companyNameEn || null,
          taxId: body.taxId,
          addressTh: body.addressTh,
          email,
          phone: body.phone || null,
        },
      });

      const user = await tx.user.create({
        data: {
          companyId: company.id,
          email,
          name: adminName,
          googleSub: googleAccount?.sub ?? null,
          role: 'admin',
          isActive: true,
        },
      });

      return { company, user };
    }, { role: 'free-signup' });

    res.status(201).json({
      data: {
        companyId: result.company.id,
        userId: result.user.id,
        plan: 'free',
        status: 'activated',
        loginMethod: 'google',
        token: googleAccount ? issueToken(result.user) : null,
        user: googleAccount
          ? {
              id: result.user.id,
              email: result.user.email,
              name: result.user.name,
              role: result.user.role,
              companyId: result.user.companyId,
              auth: { hasPassword: false, hasGoogle: true },
              company: {
                nameTh: result.company.nameTh,
                nameEn: result.company.nameEn,
                taxId: result.company.taxId,
              },
            }
          : null,
        nextStep: 'Login with the same Google email used during signup',
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: (err as Error).message || 'Failed to create free account' });
  }
});

billingRouter.post('/checkout-session', async (req, res) => {
  try {
    const body = checkoutSchema.parse(req.body);
    const planConfig = getBillingPlanConfig(body.plan);
    const paymentMethod = body.paymentMethod as BillingPaymentMethod;
    const stripe = paymentMethod === 'stripe' ? getStripeClient() : null;
    const priceId = paymentMethod === 'stripe' ? getPlanPriceId(body.plan) : null;

    if ((paymentMethod === 'stripe' || paymentMethod === 'stripe_promptpay') && (!stripe || !planConfig.purchasable)) {
      res.status(400).json({ error: 'Selected plan is not available for Stripe checkout' });
      return;
    }
    if (paymentMethod === 'stripe' && !priceId) {
      res.status(400).json({ error: 'Selected plan is not available for Stripe checkout' });
      return;
    }
    if (paymentMethod === 'promptpay_qr' && !isPromptPayConfigured()) {
      res.status(503).json({ error: 'PromptPay QR is not configured' });
      return;
    }

    const email = body.adminEmail.toLowerCase();
    const subtotalAmount = (planConfig.monthlyAmount ?? 0) / 100;
    const coupon = await resolveCouponForCheckout({
      couponCode: body.couponCode || null,
      subtotalAmount,
      paymentMethod,
    });
    const discountAmount = coupon?.discountAmount ?? 0;
    const totalAmount = Number(Math.max(subtotalAmount - discountAmount, 0).toFixed(2));

    const [existingUser, existingCompany] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.company.findUnique({ where: { taxId: body.taxId } }),
    ]);

    if (existingUser) {
      res.status(409).json({ error: 'This admin email is already registered in the system' });
      return;
    }
    if (existingCompany) {
      res.status(409).json({ error: 'This tax ID is already registered in the system' });
      return;
    }

    const pendingSignup = await prisma.pendingSignup.create({
      data: {
        companyNameTh: body.companyNameTh,
        companyNameEn: body.companyNameEn || null,
        taxId: body.taxId,
        addressTh: body.addressTh,
        adminName: body.adminName,
        adminEmail: email,
        phone: body.phone || null,
        plan: body.plan,
        paymentMethod,
        couponCode: coupon?.code ?? null,
        subtotalAmount,
        discountAmount,
        totalAmount,
        locale: body.locale,
      },
    });

    if (paymentMethod === 'stripe' && stripe && priceId) {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        success_url: getSuccessUrl(),
        cancel_url: getCancelUrl(),
        customer_email: email,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        billing_address_collection: 'required',
        locale: body.locale === 'th' ? 'th' : 'en',
        discounts: coupon?.stripePromotionCodeId ? [{ promotion_code: coupon.stripePromotionCodeId }] : undefined,
        metadata: {
          pendingSignupId: pendingSignup.id,
          plan: body.plan,
          companyNameTh: body.companyNameTh,
          adminEmail: email,
          paymentMethod,
          couponCode: coupon?.code ?? '',
        },
        subscription_data: {
          metadata: {
            pendingSignupId: pendingSignup.id,
            plan: body.plan,
            adminEmail: email,
            paymentMethod,
            couponCode: coupon?.code ?? '',
          },
        },
      });

      await prisma.$transaction(async (tx) => {
        await tx.pendingSignup.update({
          where: { id: pendingSignup.id },
          data: {
            stripeCheckoutSessionId: session.id,
            stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
            stripePriceId: priceId,
          },
        });

        await tx.billingTransaction.create({
          data: {
            pendingSignupId: pendingSignup.id,
            couponId: coupon?.id,
            plan: body.plan,
            channel: 'stripe',
            status: 'pending',
            subtotalAmount,
            discountAmount,
            totalAmount,
            couponCode: coupon?.code,
            externalReference: session.id,
            metadata: {
              locale: body.locale,
              companyNameTh: body.companyNameTh,
              adminEmail: email,
            },
          },
        });
      });

      res.status(201).json({
        data: {
          id: session.id,
          url: session.url,
          paymentMethod,
          amountSummary: {
            subtotalAmount,
            discountAmount,
            totalAmount,
            couponCode: coupon?.code ?? null,
          },
        },
      });
      return;
    }

    if (paymentMethod === 'stripe_promptpay' && stripe) {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        success_url: getSuccessUrl(),
        cancel_url: getCancelUrl(),
        customer_email: email,
        customer_creation: 'always',
        payment_method_types: ['promptpay'],
        billing_address_collection: 'required',
        locale: body.locale === 'th' ? 'th' : 'en',
        line_items: [
          {
            price_data: {
              currency: 'thb',
              unit_amount: Math.round(totalAmount * 100),
              product_data: {
                name: `${planConfig.nameEn} plan`,
                description: `Initial monthly signup for ${body.companyNameTh}`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          pendingSignupId: pendingSignup.id,
          plan: body.plan,
          companyNameTh: body.companyNameTh,
          adminEmail: email,
          paymentMethod,
          couponCode: coupon?.code ?? '',
        },
      });

      await prisma.$transaction(async (tx) => {
        await tx.pendingSignup.update({
          where: { id: pendingSignup.id },
          data: {
            stripeCheckoutSessionId: session.id,
            stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
          },
        });

        await tx.billingTransaction.create({
          data: {
            pendingSignupId: pendingSignup.id,
            couponId: coupon?.id,
            plan: body.plan,
            channel: 'stripe_promptpay',
            status: 'pending',
            subtotalAmount,
            discountAmount,
            totalAmount,
            couponCode: coupon?.code,
            externalReference: session.id,
            metadata: {
              locale: body.locale,
              companyNameTh: body.companyNameTh,
              adminEmail: email,
            },
          },
        });
      });

      res.status(201).json({
        data: {
          id: session.id,
          url: session.url,
          paymentMethod,
          amountSummary: {
            subtotalAmount,
            discountAmount,
            totalAmount,
            couponCode: coupon?.code ?? null,
          },
        },
      });
      return;
    }

    const reference = `PP-${pendingSignup.id.slice(-8).toUpperCase()}`;
    const promptPayId = getPromptPayTarget();
    if (!promptPayId) {
      res.status(503).json({ error: 'PromptPay QR is not configured' });
      return;
    }
    const qr = await buildPromptPayQr(promptPayId, totalAmount, reference);

    const transaction = await prisma.billingTransaction.create({
      data: {
        pendingSignupId: pendingSignup.id,
        couponId: coupon?.id,
        plan: body.plan,
        channel: 'promptpay_qr',
        status: 'awaiting_payment',
        subtotalAmount,
        discountAmount,
        totalAmount,
        couponCode: coupon?.code,
        externalReference: reference,
        qrPayload: qr.payload,
        qrImageDataUrl: qr.imageDataUrl,
        metadata: {
          locale: body.locale,
          companyNameTh: body.companyNameTh,
          adminEmail: email,
        },
      },
    });

    res.status(201).json({
      data: {
        id: transaction.id,
        reference,
        paymentMethod,
        amountSummary: {
          subtotalAmount,
          discountAmount,
          totalAmount,
          couponCode: coupon?.code ?? null,
        },
        promptPay: {
          qrPayload: qr.payload,
          qrImageDataUrl: qr.imageDataUrl,
        },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: (err as Error).message || 'Failed to create checkout session' });
  }
});

billingRouter.get('/checkout-status', async (req, res) => {
  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
  const reference = typeof req.query.reference === 'string' ? req.query.reference : '';
  if (!sessionId && !reference) {
    res.status(400).json({ error: 'session_id or reference is required' });
    return;
  }
  const pendingSignup = await prisma.pendingSignup.findFirst({
    where: sessionId ? { stripeCheckoutSessionId: sessionId } : { transactions: { some: { externalReference: reference } } },
  });

  if (!pendingSignup) {
    res.status(404).json({ error: 'Checkout session not found' });
    return;
  }

  res.json({
    data: {
      status: pendingSignup.status,
      plan: pendingSignup.plan,
      paymentMethod: pendingSignup.paymentMethod,
      couponCode: pendingSignup.couponCode,
      subtotalAmount: pendingSignup.subtotalAmount,
      discountAmount: pendingSignup.discountAmount,
      totalAmount: pendingSignup.totalAmount,
      companyNameTh: pendingSignup.companyNameTh,
      adminEmail: pendingSignup.adminEmail,
      activatedAt: pendingSignup.activatedAt,
      companyId: pendingSignup.companyId,
      loginMethod: 'google',
      nextStep:
        pendingSignup.status === 'activated'
          ? 'Login with the same Google email used during checkout'
          : 'Waiting for payment confirmation',
    },
  });
});

billingRouter.get('/subscription', authenticate, requireRole('super_admin', 'admin'), async (req, res) => {
  const subscription = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
    return tx.companySubscription.findUnique({
      where: { companyId: req.user!.companyId },
    });
  });

  if (!subscription) {
    res.json({ data: null });
    return;
  }

  res.json({ data: subscription });
});

billingRouter.get('/access-policy', authenticate, async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    res.json({ data: policy });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'Failed to load access policy' });
  }
});

billingRouter.post('/portal-session', authenticate, requireRole('super_admin', 'admin'), async (req, res) => {
  const stripe = getStripeClient();
  if (!stripe) {
    res.status(503).json({ error: 'Stripe billing is not configured' });
    return;
  }

  const subscription = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
    return tx.companySubscription.findUnique({
      where: { companyId: req.user!.companyId },
    });
  });
  const policy = await resolveCompanyAccessPolicy(req.user!.companyId);

  if (!policy.canUseBillingPortal) {
    res.status(403).json({ error: 'Upgrade your plan to manage billing in the customer portal' });
    return;
  }

  if (!subscription?.stripeCustomerId) {
    res.status(404).json({ error: 'No Stripe customer found for this company' });
    return;
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${process.env.APP_ORIGIN ?? process.env.FRONTEND_URL ?? 'http://app.localhost:3000'}/app/admin`,
  });

  res.json({ data: { url: session.url } });
});

billingRouter.post('/coupon/preview', async (req, res) => {
  try {
    const payload = z.object({
      plan: z.enum(['starter', 'business']),
      paymentMethod: z.enum(['stripe', 'promptpay_qr']).default('stripe'),
      couponCode: z.string().trim().max(50).optional().or(z.literal('')),
    }).parse(req.body);
    const planConfig = getBillingPlanConfig(payload.plan);
    const subtotalAmount = (planConfig.monthlyAmount ?? 0) / 100;
    const coupon = await resolveCouponForCheckout({
      couponCode: payload.couponCode || null,
      subtotalAmount,
      paymentMethod: payload.paymentMethod as BillingPaymentMethod,
    });

    res.json({
      data: {
        coupon: coupon ? {
          code: coupon.code,
          name: coupon.name,
          discountAmount: coupon.discountAmount,
        } : null,
        subtotalAmount,
        discountAmount: coupon?.discountAmount ?? 0,
        totalAmount: Number(Math.max(subtotalAmount - (coupon?.discountAmount ?? 0), 0).toFixed(2)),
      },
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message || 'Unable to preview coupon' });
  }
});

billingRouter.get('/promptpay/:reference', async (req, res) => {
  const transaction = await prisma.billingTransaction.findFirst({
    where: {
      externalReference: req.params.reference,
      channel: 'promptpay_qr',
    },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      qrImageDataUrl: true,
      qrPayload: true,
      couponCode: true,
    },
  });

  if (!transaction) {
    res.status(404).json({ error: 'PromptPay transaction not found' });
    return;
  }

  res.json({ data: transaction });
});

billingRouter.get('/owner/summary', authenticate, requireRole('super_admin'), async (_req, res) => {
  const [transactions, coupons, pendingSignups] = await Promise.all([
    prisma.billingTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        coupon: { select: { code: true, name: true } },
        pendingSignup: { select: { companyNameTh: true, adminEmail: true, paymentMethod: true, status: true } },
      },
    }),
    prisma.coupon.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    prisma.pendingSignup.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  res.json({ data: { transactions, coupons, pendingSignups } });
});

billingRouter.get('/owner/export/transactions.csv', authenticate, requireRole('super_admin'), async (req, res) => {
  const channel = typeof req.query.channel === 'string' ? req.query.channel : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const from = typeof req.query.from === 'string' ? new Date(req.query.from) : null;
  const to = typeof req.query.to === 'string' ? new Date(req.query.to) : null;

  const transactions = await prisma.billingTransaction.findMany({
    where: {
      ...(channel ? { channel } : {}),
      ...(status ? { status } : {}),
      ...(from || to ? {
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      company: { select: { nameTh: true, taxId: true, email: true } },
      pendingSignup: { select: { companyNameTh: true, adminEmail: true, paymentMethod: true, status: true } },
    },
  });

  const csvRows = [
    ['transaction_id', 'created_at', 'company_name', 'company_tax_id', 'admin_email', 'plan', 'channel', 'status', 'subtotal_amount', 'discount_amount', 'total_amount', 'coupon_code', 'external_reference'],
    ...transactions.map((transaction) => [
      transaction.id,
      transaction.createdAt.toISOString(),
      transaction.company?.nameTh ?? transaction.pendingSignup?.companyNameTh ?? '',
      transaction.company?.taxId ?? '',
      transaction.company?.email ?? transaction.pendingSignup?.adminEmail ?? '',
      transaction.plan,
      transaction.channel,
      transaction.status,
      transaction.subtotalAmount.toFixed(2),
      transaction.discountAmount.toFixed(2),
      transaction.totalAmount.toFixed(2),
      transaction.couponCode ?? '',
      transaction.externalReference ?? '',
    ]),
  ];

  const csv = csvRows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="owner-transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

billingRouter.post('/owner/coupons', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const body = couponSchema.parse(req.body);
    const coupon = await prisma.coupon.create({
      data: {
        code: body.code.toUpperCase(),
        name: body.name,
        description: body.description || null,
        discountType: body.discountType,
        discountValue: body.discountValue,
        minSubtotalAmount: body.minSubtotalAmount,
        maxDiscountAmount: body.maxDiscountAmount,
        maxRedemptions: body.maxRedemptions,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        stripePromotionCodeId: body.stripePromotionCodeId || null,
        active: body.active,
      },
    });
    res.status(201).json({ data: coupon });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: (err as Error).message || 'Failed to create coupon' });
  }
});

billingRouter.patch('/owner/coupons/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const body = couponSchema.partial().parse(req.body);
    const coupon = await prisma.coupon.update({
      where: { id: req.params.id },
      data: {
        code: body.code?.toUpperCase(),
        name: body.name,
        description: body.description === undefined ? undefined : (body.description || null),
        discountType: body.discountType,
        discountValue: body.discountValue,
        minSubtotalAmount: body.minSubtotalAmount,
        maxDiscountAmount: body.maxDiscountAmount,
        maxRedemptions: body.maxRedemptions,
        startsAt: body.startsAt === undefined ? undefined : (body.startsAt ? new Date(body.startsAt) : null),
        endsAt: body.endsAt === undefined ? undefined : (body.endsAt ? new Date(body.endsAt) : null),
        stripePromotionCodeId: body.stripePromotionCodeId === undefined ? undefined : (body.stripePromotionCodeId || null),
        active: body.active,
      },
    });
    res.json({ data: coupon });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: (err as Error).message || 'Failed to update coupon' });
  }
});

billingRouter.post('/owner/transactions/:id/mark-paid', authenticate, requireRole('super_admin'), async (req, res) => {
  const transaction = await prisma.billingTransaction.findUnique({
    where: { id: req.params.id },
    include: { pendingSignup: true },
  });

  if (!transaction?.pendingSignup) {
    res.status(404).json({ error: 'Billing transaction not found' });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.billingTransaction.update({
      where: { id: transaction.id },
      data: { status: 'paid', paidAt: new Date() },
    });

    await tx.pendingSignup.update({
      where: { id: transaction.pendingSignupId! },
      data: { status: 'paid' },
    });
  });

  await provisionSignupFromPendingSignup(transaction.pendingSignupId!);
  res.json({ data: { id: transaction.id, status: 'activated' } });
});

billingRouter.post('/owner/renewals/:companyId/create-session', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const body = z.object({
      paymentMethod: z.enum(['stripe', 'stripe_promptpay']).default('stripe'),
      couponCode: z.string().trim().max(50).optional().or(z.literal('')),
    }).parse(req.body);

    const { company, session, planConfig, coupon, subtotalAmount, totalAmount } = await createRenewalCheckoutSession({
      companyId: req.params.companyId,
      paymentMethod: body.paymentMethod,
      couponCode: body.couponCode || null,
    });

    if (company.email) {
      await sendRenewalLinkEmail({
        companyNameTh: company.nameTh,
        adminEmail: company.email,
        planName: planConfig.nameTh,
        renewalUrl: session.url ?? `${getTenantLoginUrl().replace(/\/login$/, '')}/billing`,
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
        amountDue: totalAmount,
        paymentMethod: body.paymentMethod,
        locale: 'th',
      });
    }

    res.status(201).json({
      data: {
        url: session.url,
        id: session.id,
        paymentMethod: body.paymentMethod,
        amountSummary: {
          subtotalAmount,
          discountAmount: coupon?.discountAmount ?? 0,
          totalAmount,
        },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: (err as Error).message || 'Failed to create renewal checkout session' });
  }
});

billingRouter.post('/owner/renewals/:companyId/send-reminder', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const body = z.object({
      paymentMethod: z.enum(['stripe', 'stripe_promptpay']).default('stripe'),
      couponCode: z.string().trim().max(50).optional().or(z.literal('')),
    }).parse(req.body);

    const company = await withSystemRlsContext(prisma, (tx) => tx.company.findUnique({
      where: { id: req.params.companyId },
      include: { subscription: true },
    }), { role: 'owner-renewal' });

    if (!company?.subscription) {
      res.status(404).json({ error: 'Company subscription not found' });
      return;
    }

    if (!company.email) {
      res.status(400).json({ error: 'Company does not have a billing email configured' });
      return;
    }

    const planConfig = getBillingPlanConfig(company.subscription.plan as BillingPlanKey);
    const totalAmount = (planConfig.monthlyAmount ?? 0) / 100;
    let renewalUrl = getTenantBillingUrl();
    let expiresAt: Date | null = null;

    try {
      const sessionPayload = await createRenewalCheckoutSession({
        companyId: req.params.companyId,
        paymentMethod: body.paymentMethod,
        couponCode: body.couponCode || null,
      });
      renewalUrl = sessionPayload.session.url ?? renewalUrl;
      expiresAt = sessionPayload.session.expires_at ? new Date(sessionPayload.session.expires_at * 1000) : null;
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('Stripe billing is not configured')) {
        throw err;
      }
    }

    await sendRenewalLinkEmail({
      companyNameTh: company.nameTh,
      adminEmail: company.email,
      planName: planConfig.nameTh,
      renewalUrl,
      expiresAt,
      amountDue: totalAmount,
      paymentMethod: body.paymentMethod,
      locale: 'th',
    });

    res.status(201).json({
      data: {
        companyId: company.id,
        email: company.email,
        paymentMethod: body.paymentMethod,
        renewalUrl,
        expiresAt,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: (err as Error).message || 'Failed to send renewal reminder' });
  }
});
