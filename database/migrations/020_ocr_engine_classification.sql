-- Phase A+B+C+E: OCR engine classification, benchmarks, cost ledger, payment evidence
-- Run with: gh workflow run db-migrate.yml -f migration=020_ocr_engine_classification.sql -f confirm=YES

-- Payment: bank slip evidence + auto-match score
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "evidenceIntakeId" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "matchScore"       INT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "matchedBy"        TEXT;
CREATE INDEX IF NOT EXISTS "payments_evidenceIntakeId_idx" ON "payments" ("evidenceIntakeId");

-- Company: monthly OCR budget controls
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "ocrMonthlyBudgetThb" DECIMAL(10, 2);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "ocrUsageThisMonth"   DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- OcrBenchmark: per-call accuracy & cost telemetry
CREATE TABLE IF NOT EXISTS "ocr_benchmarks" (
  "id"           TEXT PRIMARY KEY,
  "companyId"    TEXT NOT NULL,
  "intakeId"     TEXT,
  "documentType" TEXT NOT NULL,
  "provider"     TEXT NOT NULL,
  "model"        TEXT NOT NULL,
  "costUsd"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costThb"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "latencyMs"    INT NOT NULL DEFAULT 0,
  "cer"          DOUBLE PRECISION,
  "confidence"   TEXT NOT NULL,
  "accepted"     BOOLEAN,
  "stage"        TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ocr_benchmarks_company_type_provider_idx"
  ON "ocr_benchmarks" ("companyId", "documentType", "provider");
CREATE INDEX IF NOT EXISTS "ocr_benchmarks_company_created_idx"
  ON "ocr_benchmarks" ("companyId", "createdAt");

-- OcrCreditLedger: per-call cost ledger for billing
CREATE TABLE IF NOT EXISTS "ocr_credit_ledger" (
  "id"           TEXT PRIMARY KEY,
  "companyId"    TEXT NOT NULL,
  "intakeId"     TEXT,
  "provider"     TEXT NOT NULL,
  "model"        TEXT NOT NULL,
  "inputTokens"  INT NOT NULL DEFAULT 0,
  "outputTokens" INT NOT NULL DEFAULT 0,
  "costUsd"      DOUBLE PRECISION NOT NULL,
  "costThb"      DOUBLE PRECISION NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ocr_credit_ledger_company_created_idx"
  ON "ocr_credit_ledger" ("companyId", "createdAt");
