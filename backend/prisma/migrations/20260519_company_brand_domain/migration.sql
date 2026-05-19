-- Per-company "send-as" email domain support.
--
-- When brandDomain is verified, outbound emails go out as
-- `noreply@<brandDomain>` so the recipient sees the customer's brand
-- instead of the platform's default. Verification round-trips through
-- Resend's domains API; brandDomainProviderId holds the Resend domain
-- id so we can re-check status without recreating.
--
-- All columns nullable: existing companies + customers who never opt in
-- keep using the global SMTP_FROM_DEFAULT.
ALTER TABLE "companies"
  ADD COLUMN "brandDomain"           TEXT,
  ADD COLUMN "brandDomainProviderId" TEXT,
  ADD COLUMN "brandDomainStatus"     TEXT,
  ADD COLUMN "brandDomainVerifiedAt" TIMESTAMP(3);
