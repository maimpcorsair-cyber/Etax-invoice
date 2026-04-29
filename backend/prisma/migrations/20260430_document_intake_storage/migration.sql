ALTER TABLE "document_intakes"
  ADD COLUMN IF NOT EXISTS "fileUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "storageKey" TEXT;

