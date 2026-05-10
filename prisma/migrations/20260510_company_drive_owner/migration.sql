ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "googleDriveOwnerUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "googleDriveOwnerLinkedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "companies_googleDriveOwnerUserId_idx" ON "companies"("googleDriveOwnerUserId");
