ALTER TABLE "wht_certificates"
  ADD COLUMN IF NOT EXISTS "drive_file_id" TEXT,
  ADD COLUMN IF NOT EXISTS "drive_url" TEXT,
  ADD COLUMN IF NOT EXISTS "drive_folder_id" TEXT,
  ADD COLUMN IF NOT EXISTS "drive_folder_url" TEXT;

ALTER TABLE "payslips"
  ADD COLUMN IF NOT EXISTS "drive_file_id" TEXT,
  ADD COLUMN IF NOT EXISTS "drive_url" TEXT,
  ADD COLUMN IF NOT EXISTS "drive_folder_id" TEXT,
  ADD COLUMN IF NOT EXISTS "drive_folder_url" TEXT;
