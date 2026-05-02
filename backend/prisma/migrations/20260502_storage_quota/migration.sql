-- Add storage quota fields to companies
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "storageUsedBytes" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "storageQuotaBytes" BIGINT NOT NULL DEFAULT 524288000;
