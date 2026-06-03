ALTER TABLE "purchase_invoices"
  ADD COLUMN IF NOT EXISTS "driveFileId" TEXT,
  ADD COLUMN IF NOT EXISTS "driveUrl" TEXT;
