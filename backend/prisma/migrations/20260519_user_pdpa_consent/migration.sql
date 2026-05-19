-- PDPA consent capture on signup (Section 19 — explicit consent).
-- legalAcceptedAt    : when user accepted ToS/Privacy/DPA bundle
-- legalAcceptedVersion: doc version string (e.g., "2026-05-19")
-- marketingOptInAt   : separate optional consent for marketing emails
ALTER TABLE "users"
  ADD COLUMN "legalAcceptedAt"      TIMESTAMP(3),
  ADD COLUMN "legalAcceptedVersion" TEXT,
  ADD COLUMN "marketingOptInAt"     TIMESTAMP(3);
