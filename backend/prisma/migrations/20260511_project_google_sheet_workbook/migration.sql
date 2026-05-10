ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "googleSheetId" TEXT,
  ADD COLUMN IF NOT EXISTS "googleSheetUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "googleSheetSyncedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "projects_companyId_googleSheetId_idx"
  ON "projects"("companyId", "googleSheetId");
