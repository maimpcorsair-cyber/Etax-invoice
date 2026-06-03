ALTER TABLE "company_documents"
  ADD COLUMN IF NOT EXISTS "drive_file_id" TEXT,
  ADD COLUMN IF NOT EXISTS "drive_url" TEXT;

ALTER TABLE "company_documents" ALTER COLUMN "s3_key" DROP NOT NULL;
