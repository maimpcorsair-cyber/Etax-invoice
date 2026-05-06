DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingPlan') THEN
    CREATE TYPE "BillingPlan" AS ENUM ('starter', 'business', 'enterprise');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingStatus') THEN
    CREATE TYPE "BillingStatus" AS ENUM ('pending', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SignupStatus') THEN
    CREATE TYPE "SignupStatus" AS ENUM ('pending', 'paid', 'activated', 'expired', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "payments" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "company_subscriptions" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "plan" "BillingPlan" NOT NULL,
  "status" "BillingStatus" NOT NULL DEFAULT 'pending',
  "billingInterval" TEXT NOT NULL DEFAULT 'month',
  "docLimit" INTEGER,
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripePriceId" TEXT,
  "stripeCheckoutSessionId" TEXT,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "coupons" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "discountType" TEXT NOT NULL,
  "discountValue" DOUBLE PRECISION NOT NULL,
  "minSubtotalAmount" DOUBLE PRECISION,
  "maxDiscountAmount" DOUBLE PRECISION,
  "maxRedemptions" INTEGER,
  "redeemedCount" INTEGER NOT NULL DEFAULT 0,
  "stripePromotionCodeId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pending_signups" (
  "id" TEXT NOT NULL,
  "companyNameTh" TEXT NOT NULL,
  "companyNameEn" TEXT,
  "taxId" TEXT NOT NULL,
  "addressTh" TEXT NOT NULL,
  "adminName" TEXT NOT NULL,
  "adminEmail" TEXT NOT NULL,
  "phone" TEXT,
  "plan" "BillingPlan" NOT NULL,
  "paymentMethod" TEXT NOT NULL DEFAULT 'stripe',
  "couponCode" TEXT,
  "subtotalAmount" DOUBLE PRECISION,
  "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalAmount" DOUBLE PRECISION,
  "status" "SignupStatus" NOT NULL DEFAULT 'pending',
  "locale" TEXT NOT NULL DEFAULT 'th',
  "stripeCheckoutSessionId" TEXT,
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripePriceId" TEXT,
  "companyId" TEXT,
  "userId" TEXT,
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pending_signups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "billing_transactions" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "pendingSignupId" TEXT,
  "couponId" TEXT,
  "plan" "BillingPlan" NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "currency" TEXT NOT NULL DEFAULT 'THB',
  "subtotalAmount" DOUBLE PRECISION NOT NULL,
  "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalAmount" DOUBLE PRECISION NOT NULL,
  "couponCode" TEXT,
  "externalReference" TEXT,
  "qrPayload" TEXT,
  "qrImageDataUrl" TEXT,
  "paidAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payments_invoiceId_idx" ON "payments"("invoiceId");

CREATE UNIQUE INDEX IF NOT EXISTS "company_subscriptions_companyId_key" ON "company_subscriptions"("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "company_subscriptions_stripeCustomerId_key" ON "company_subscriptions"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "company_subscriptions_stripeSubscriptionId_key" ON "company_subscriptions"("stripeSubscriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "company_subscriptions_stripeCheckoutSessionId_key" ON "company_subscriptions"("stripeCheckoutSessionId");
CREATE INDEX IF NOT EXISTS "company_subscriptions_plan_idx" ON "company_subscriptions"("plan");
CREATE INDEX IF NOT EXISTS "company_subscriptions_status_idx" ON "company_subscriptions"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "coupons_code_key" ON "coupons"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_stripePromotionCodeId_key" ON "coupons"("stripePromotionCodeId");
CREATE INDEX IF NOT EXISTS "coupons_active_idx" ON "coupons"("active");
CREATE INDEX IF NOT EXISTS "coupons_startsAt_endsAt_idx" ON "coupons"("startsAt", "endsAt");

CREATE UNIQUE INDEX IF NOT EXISTS "pending_signups_stripeCheckoutSessionId_key" ON "pending_signups"("stripeCheckoutSessionId");
CREATE INDEX IF NOT EXISTS "pending_signups_adminEmail_idx" ON "pending_signups"("adminEmail");
CREATE INDEX IF NOT EXISTS "pending_signups_status_idx" ON "pending_signups"("status");
CREATE INDEX IF NOT EXISTS "pending_signups_plan_idx" ON "pending_signups"("plan");

CREATE INDEX IF NOT EXISTS "billing_transactions_companyId_idx" ON "billing_transactions"("companyId");
CREATE INDEX IF NOT EXISTS "billing_transactions_pendingSignupId_idx" ON "billing_transactions"("pendingSignupId");
CREATE INDEX IF NOT EXISTS "billing_transactions_couponId_idx" ON "billing_transactions"("couponId");
CREATE INDEX IF NOT EXISTS "billing_transactions_channel_status_idx" ON "billing_transactions"("channel", "status");
CREATE INDEX IF NOT EXISTS "billing_transactions_plan_createdAt_idx" ON "billing_transactions"("plan", "createdAt");
CREATE INDEX IF NOT EXISTS "billing_transactions_createdAt_idx" ON "billing_transactions"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_invoiceId_fkey') THEN
    ALTER TABLE "payments"
      ADD CONSTRAINT "payments_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_subscriptions_companyId_fkey') THEN
    ALTER TABLE "company_subscriptions"
      ADD CONSTRAINT "company_subscriptions_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_transactions_companyId_fkey') THEN
    ALTER TABLE "billing_transactions"
      ADD CONSTRAINT "billing_transactions_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_transactions_pendingSignupId_fkey') THEN
    ALTER TABLE "billing_transactions"
      ADD CONSTRAINT "billing_transactions_pendingSignupId_fkey"
      FOREIGN KEY ("pendingSignupId") REFERENCES "pending_signups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_transactions_couponId_fkey') THEN
    ALTER TABLE "billing_transactions"
      ADD CONSTRAINT "billing_transactions_couponId_fkey"
      FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
