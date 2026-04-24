-- Migration 003: Payment tracking, combined invoice type, personalId, reference FK

-- 1. Add new InvoiceType value
ALTER TYPE "InvoiceType" ADD VALUE IF NOT EXISTS 'tax_invoice_receipt';

-- 2. Add personalId to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "personalId" TEXT;

-- 3. Add payment tracking + reference FK to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "referenceInvoiceId" TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "isPaid" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "paidAmount" DOUBLE PRECISION;

-- 4. Add FK constraint for referenceInvoiceId
ALTER TABLE invoices
  ADD CONSTRAINT IF NOT EXISTS "invoices_referenceInvoiceId_fkey"
  FOREIGN KEY ("referenceInvoiceId") REFERENCES invoices(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS "invoices_referenceInvoiceId_idx" ON invoices("referenceInvoiceId");

-- 5. Create payments table
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
