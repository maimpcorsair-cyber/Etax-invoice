-- Migration 003: Payment tracking, combined invoice type, personalId, reference FK
-- Idempotent - safe to run multiple times

DO $$
BEGIN
  -- 1. Drop and recreate InvoiceType enum with all values
  DROP TYPE IF EXISTS "InvoiceType";
  CREATE TYPE "InvoiceType" AS ENUM ('tax_invoice', 'receipt', 'credit_note', 'debit_note', 'tax_invoice_receipt');
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

DO $$
BEGIN
  -- 2. Add personalId to customers (camelCase for Prisma-managed column)
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS "personalId" TEXT;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$
BEGIN
  -- 3. Add payment tracking columns to invoices (Prisma manages these columns with camelCase)
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "referenceInvoiceId" TEXT;
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "isPaid" BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMPTZ;
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "paidAmount" DOUBLE PRECISION;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$
BEGIN
  -- 4. Add FK constraint for referenceInvoiceId
  ALTER TABLE invoices
    ADD CONSTRAINT "invoices_referenceInvoiceId_fkey"
    FOREIGN KEY ("referenceInvoiceId") REFERENCES invoices(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 5. Create payments table (Prisma manages this with camelCase)
CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY,
  "invoiceId"  TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount       DOUBLE PRECISION NOT NULL,
  method       TEXT NOT NULL,
  reference    TEXT,
  "paidAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note         TEXT,
  "createdBy"  TEXT NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "payments_invoiceId_idx" ON payments("invoiceId");
