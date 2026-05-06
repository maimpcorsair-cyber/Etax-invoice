ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "documentBankAccounts" JSONB,
  ADD COLUMN IF NOT EXISTS "documentSignatureProfile" JSONB;
