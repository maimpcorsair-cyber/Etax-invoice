-- Add Google Drive sync fields to Invoice
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "driveFileId"    TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "driveUrl"       TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "driveXmlFileId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "driveXmlUrl"    TEXT;

-- Add company-level master workspace sheet fields (deduplication)
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "googleWorkspaceSheetId"       TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "googleWorkspaceSheetUrl"      TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "googleWorkspaceSheetSyncedAt" TIMESTAMP(3);
