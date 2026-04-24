import Stripe from 'stripe';
import prisma from '../config/database';

export type BillingPlanKey = 'starter' | 'business' | 'enterprise';
export type BillingPaymentMethod = 'stripe' | 'stripe_promptpay' | 'promptpay_qr';
export type ResolvedCoupon = {
  id: string;
  code: string;
  name: string;
  discountType: string;
  discountValue: number;
  stripePromotionCodeId: string | null;
  discountAmount: number;
};

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getAppOrigin() {
  return trimTrailingSlash(
    process.env.APP_ORIGIN
      ?? process.env.FRONTEND_URL
      ?? 'http://app.localhost:3000',
  );
}

export function getPromptPayTarget() {
  if (process.env.PROMPTPAY_ID) {
    return process.env.PROMPTPAY_ID;
  }

  if (process.env.NODE_ENV !== 'production') {
    return '0812345678';
  }

  return null;
}

type PlanDefinition = {
  key: BillingPlanKey;
  nameTh: string;
  nameEn: string;
  priceDisplayTh: string;
  priceDisplayEn: string;
  docLimit: number | null;
  monthlyAmount: number | null;
  stripePriceEnv?: string;
  purchasable: boolean;
};

const planDefinitions: Record<BillingPlanKey, PlanDefinition> = {
  starter: {
    key: 'starter',
    nameTh: 'Starter',
    nameEn: 'Starter',
    priceDisplayTh: '990',
    priceDisplayEn: '990',
    docLimit: 100,
    monthlyAmount: 99000,
    stripePriceEnv: 'STRIPE_PRICE_STARTER_MONTHLY',
    purchasable: true,
  },
  business: {
    key: 'business',
    nameTh: 'Business',
    nameEn: 'Business',
    priceDisplayTh: '2,490',
    priceDisplayEn: '2,490',
    docLimit: 500,
    monthlyAmount: 249000,
    stripePriceEnv: 'STRIPE_PRICE_BUSINESS_MONTHLY',
    purchasable: true,
  },
  enterprise: {
    key: 'enterprise',
    nameTh: 'Enterprise',
    nameEn: 'Enterprise',
    priceDisplayTh: 'ติดต่อเรา',
    priceDisplayEn: 'Contact us',
    docLimit: null,
    monthlyAmount: null,
    purchasable: false,
  },
};

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-08-27.basil',
    });
  }
  return stripeClient;
}

export function getBillingPlanConfig(plan: BillingPlanKey) {
  return planDefinitions[plan];
}

export function listBillingPlans() {
  return Object.values(planDefinitions).map((plan) => ({
    ...plan,
    stripePriceId: plan.stripePriceEnv ? process.env[plan.stripePriceEnv] ?? null : null,
    isConfigured: plan.purchasable ? !!(plan.stripePriceEnv && process.env[plan.stripePriceEnv]) : true,
  }));
}

export function isBillingConfigured() {
  const stripe = getStripeClient();
  if (!stripe) return false;
  return ['starter', 'business'].every((planKey) => {
    const plan = getBillingPlanConfig(planKey as BillingPlanKey);
    return !!(plan.stripePriceEnv && process.env[plan.stripePriceEnv]);
  });
}

export function isPromptPayConfigured() {
  return !!getPromptPayTarget();
}

export function listPaymentMethods() {
  return [
    {
      key: 'stripe',
      label: 'Stripe',
      enabled: isBillingConfigured(),
      supportsOnlineConfirmation: true,
      supportsCoupons: true,
    },
    {
      key: 'stripe_promptpay',
      label: 'Stripe PromptPay',
      enabled: isBillingConfigured(),
      supportsOnlineConfirmation: true,
      supportsCoupons: true,
    },
    {
      key: 'promptpay_qr',
      label: 'Manual PromptPay QR',
      enabled: isPromptPayConfigured(),
      supportsOnlineConfirmation: false,
      supportsCoupons: true,
    },
  ];
}

export function getPlanPriceId(plan: BillingPlanKey) {
  const config = getBillingPlanConfig(plan);
  if (!config.stripePriceEnv) return null;
  return process.env[config.stripePriceEnv] ?? null;
}

export async function resolveCouponForCheckout({
  couponCode,
  subtotalAmount,
  paymentMethod,
}: {
  couponCode?: string | null;
  subtotalAmount: number;
  paymentMethod: BillingPaymentMethod;
}): Promise<ResolvedCoupon | null> {
  if (!couponCode) {
    return null;
  }

  const code = couponCode.trim().toUpperCase();
  if (!code) {
    return null;
  }

  const coupon = await prisma.coupon.findUnique({
    where: { code },
  });

  if (!coupon || !coupon.active) {
    throw new Error('Coupon code is invalid or inactive');
  }

  const now = new Date();
  if ((coupon.startsAt && coupon.startsAt > now) || (coupon.endsAt && coupon.endsAt < now)) {
    throw new Error('Coupon code is not active at this time');
  }

  if (coupon.maxRedemptions && coupon.redeemedCount >= coupon.maxRedemptions) {
    throw new Error('Coupon code has reached its redemption limit');
  }

  if (coupon.minSubtotalAmount && subtotalAmount < coupon.minSubtotalAmount) {
    throw new Error(`Coupon requires a minimum subtotal of ${coupon.minSubtotalAmount.toFixed(2)}`);
  }

  let discountAmount = coupon.discountType === 'fixed'
    ? coupon.discountValue
    : subtotalAmount * (coupon.discountValue / 100);

  if (coupon.maxDiscountAmount) {
    discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
  }

  discountAmount = Math.min(discountAmount, subtotalAmount);
  discountAmount = Number(discountAmount.toFixed(2));

  if (paymentMethod === 'stripe' && !coupon.stripePromotionCodeId) {
    throw new Error('This coupon is only available for PromptPay checkout');
  }

  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    stripePromotionCodeId: coupon.stripePromotionCodeId,
    discountAmount,
  };
}

export function mapStripeStatus(
  status?: Stripe.Subscription.Status | null,
):
  | 'pending'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'unpaid' {
  switch (status) {
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'incomplete':
      return 'incomplete';
    case 'incomplete_expired':
      return 'incomplete_expired';
    case 'trialing':
      return 'trialing';
    case 'unpaid':
      return 'unpaid';
    default:
      return 'pending';
  }
}

export function getSuccessUrl() {
  return `${getAppOrigin()}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
}

export function getCancelUrl() {
  return `${getAppOrigin()}/billing/cancel`;
}
