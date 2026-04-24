ALTER TABLE "pending_signups"
  ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS "couponCode" TEXT,
  ADD COLUMN IF NOT EXISTS "subtotalAmount" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalAmount" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "coupons" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "discountType" TEXT NOT NULL,
  "discountValue" DOUBLE PRECISION NOT NULL,
  "minSubtotalAmount" DOUBLE PRECISION,
  "maxDiscountAmount" DOUBLE PRECISION,
  "maxRedemptions" INTEGER,
  "redeemedCount" INTEGER NOT NULL DEFAULT 0,
  "stripePromotionCodeId" TEXT UNIQUE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "coupons_active_idx" ON "coupons"("active");
CREATE INDEX IF NOT EXISTS "coupons_schedule_idx" ON "coupons"("startsAt", "endsAt");

CREATE TABLE IF NOT EXISTS "billing_transactions" (
  "id" TEXT PRIMARY KEY,
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "billing_transactions_company_idx" ON "billing_transactions"("companyId");
CREATE INDEX IF NOT EXISTS "billing_transactions_pending_signup_idx" ON "billing_transactions"("pendingSignupId");
CREATE INDEX IF NOT EXISTS "billing_transactions_coupon_idx" ON "billing_transactions"("couponId");
CREATE INDEX IF NOT EXISTS "billing_transactions_channel_status_idx" ON "billing_transactions"("channel", "status");
CREATE INDEX IF NOT EXISTS "billing_transactions_plan_created_idx" ON "billing_transactions"("plan", "createdAt");
CREATE INDEX IF NOT EXISTS "billing_transactions_created_idx" ON "billing_transactions"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'billing_transactions_company_fkey'
  ) THEN
    ALTER TABLE "billing_transactions"
      ADD CONSTRAINT "billing_transactions_company_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'billing_transactions_pending_signup_fkey'
  ) THEN
    ALTER TABLE "billing_transactions"
      ADD CONSTRAINT "billing_transactions_pending_signup_fkey"
      FOREIGN KEY ("pendingSignupId") REFERENCES "pending_signups"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'billing_transactions_coupon_fkey'
  ) THEN
    ALTER TABLE "billing_transactions"
      ADD CONSTRAINT "billing_transactions_coupon_fkey"
      FOREIGN KEY ("couponId") REFERENCES "coupons"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
