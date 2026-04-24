CREATE TYPE "BillingPlan" AS ENUM ('starter', 'business', 'enterprise');
CREATE TYPE "BillingStatus" AS ENUM ('pending', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid');
CREATE TYPE "SignupStatus" AS ENUM ('pending', 'paid', 'activated', 'expired', 'failed');

CREATE TABLE "company_subscriptions" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL UNIQUE REFERENCES "companies"("id") ON DELETE CASCADE,
  "plan" "BillingPlan" NOT NULL,
  "status" "BillingStatus" NOT NULL DEFAULT 'pending',
  "billingInterval" TEXT NOT NULL DEFAULT 'month',
  "docLimit" INTEGER,
  "stripeCustomerId" TEXT UNIQUE,
  "stripeSubscriptionId" TEXT UNIQUE,
  "stripePriceId" TEXT,
  "stripeCheckoutSessionId" TEXT UNIQUE,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "company_subscriptions_plan_idx" ON "company_subscriptions"("plan");
CREATE INDEX "company_subscriptions_status_idx" ON "company_subscriptions"("status");

CREATE TABLE "pending_signups" (
  "id" TEXT PRIMARY KEY,
  "companyNameTh" TEXT NOT NULL,
  "companyNameEn" TEXT,
  "taxId" TEXT NOT NULL,
  "addressTh" TEXT NOT NULL,
  "adminName" TEXT NOT NULL,
  "adminEmail" TEXT NOT NULL,
  "phone" TEXT,
  "plan" "BillingPlan" NOT NULL,
  "status" "SignupStatus" NOT NULL DEFAULT 'pending',
  "locale" TEXT NOT NULL DEFAULT 'th',
  "stripeCheckoutSessionId" TEXT UNIQUE,
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripePriceId" TEXT,
  "companyId" TEXT,
  "userId" TEXT,
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "pending_signups_adminEmail_idx" ON "pending_signups"("adminEmail");
CREATE INDEX "pending_signups_status_idx" ON "pending_signups"("status");
CREATE INDEX "pending_signups_plan_idx" ON "pending_signups"("plan");
