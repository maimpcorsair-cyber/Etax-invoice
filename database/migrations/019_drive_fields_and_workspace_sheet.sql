-- Phase 1 & 3: Invoice Drive fields + Company master sheet fields
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "driveFileId"    TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "driveUrl"       TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "driveXmlFileId" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "driveXmlUrl"    TEXT;

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "googleWorkspaceSheetId"       TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "googleWorkspaceSheetUrl"      TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "googleWorkspaceSheetSyncedAt" TIMESTAMP(3);
