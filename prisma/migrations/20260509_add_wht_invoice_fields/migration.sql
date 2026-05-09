-- Migration: add WHT certificate model and missing Invoice fields
-- Safe: additive only (new table, new columns, new indexes)

-- 1. Add missing columns to invoices table
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "wht_rate" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "wht_amount" DOUBLE PRECISION;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "wht_certificate_id" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "cancelled_by" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT;

-- 2. Create wht_certificates table
CREATE TABLE IF NOT EXISTS "wht_certificates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "certificate_number" TEXT NOT NULL,
    "wht_rate" TEXT NOT NULL,
    "wht_amount" DOUBLE PRECISION NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "net_amount" DOUBLE PRECISION NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "recipient_tax_id" TEXT NOT NULL,
    "recipient_branch" TEXT NOT NULL DEFAULT '00000',
    "income_type" TEXT,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "pdf_url" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wht_certificates_pkey" PRIMARY KEY ("id")
);

-- 3. Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "wht_certificates_company_id_certificate_number_key"
    ON "wht_certificates"("company_id", "certificate_number");

-- 4. Indexes
CREATE INDEX IF NOT EXISTS "wht_certificates_company_id_idx"
    ON "wht_certificates"("company_id");

CREATE INDEX IF NOT EXISTS "wht_certificates_company_id_payment_date_idx"
    ON "wht_certificates"("company_id", "payment_date");

-- 5. Foreign keys
ALTER TABLE "wht_certificates"
    ADD CONSTRAINT "wht_certificates_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wht_certificates"
    ADD CONSTRAINT "wht_certificates_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
