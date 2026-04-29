-- Some production databases already had document_intakes from an earlier deploy.
-- Add the newer linkage columns idempotently so Prisma reads do not fail with P2022.

ALTER TABLE "document_intakes"
  ADD COLUMN IF NOT EXISTS "targetType" TEXT,
  ADD COLUMN IF NOT EXISTS "targetId" TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseInvoiceId" TEXT;

