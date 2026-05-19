-- Storage primacy: S3 becomes the system of record for customer documents
-- and expense attachments. Drive remains an optional mirror so customers
-- can collaborate on their own files, but app-side correctness no longer
-- depends on Drive being reachable.
--
-- For customer_documents: add s3Key + s3Url alongside existing drive*
-- columns. Existing rows keep their driveUrl as the only URL until the
-- next time the file is touched (next upload writes both copies).
--
-- For expense_attachments: keep `url` (already required), but add s3Key
-- for signed-URL regeneration and driveUrl as the optional mirror.
ALTER TABLE "customer_documents"
  ADD COLUMN "s3Key" TEXT,
  ADD COLUMN "s3Url" TEXT;

ALTER TABLE "expense_attachments"
  ADD COLUMN "s3Key"    TEXT,
  ADD COLUMN "driveUrl" TEXT;
