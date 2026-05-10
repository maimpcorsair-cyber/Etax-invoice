ALTER TABLE "document_intakes"
  ADD COLUMN IF NOT EXISTS "driveFileId" TEXT,
  ADD COLUMN IF NOT EXISTS "driveUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT,
  ADD COLUMN IF NOT EXISTS "driveFolderUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "driveSyncStatus" TEXT NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS "driveSyncError" TEXT,
  ADD COLUMN IF NOT EXISTS "driveSyncedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "driveUserDrive" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT,
  ADD COLUMN IF NOT EXISTS "driveFolderUrl" TEXT;

CREATE INDEX IF NOT EXISTS "document_intakes_companyId_driveSyncStatus_idx"
  ON "document_intakes"("companyId", "driveSyncStatus");
