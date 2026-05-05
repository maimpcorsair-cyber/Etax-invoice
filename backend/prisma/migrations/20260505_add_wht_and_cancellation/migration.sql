-- 20260505_add_wht_and_cancellation
-- WHT (Withholding Tax / ภาษีหัก ณ ที่จ่าย / 50 ทวิ) + invoice cancellation
-- Applied after: 20260504_rls_remaining_tables
-- Uses DO blocks for full idempotency (works on all PostgreSQL versions)

DO $$ BEGIN
  ALTER TABLE "invoices" ADD COLUMN "whtAmount" Double Precision DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD COLUMN "whtRate" Text;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD COLUMN "whtCertificateId" Text;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "invoices_whtCertificateId_idx" ON "invoices" ("whtCertificateId");

DO $$ BEGIN
  ALTER TABLE "invoices" ADD COLUMN "cancelledAt" Timestamptz;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD COLUMN "cancelledBy" Text;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD COLUMN "cancelReason" Text;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  CREATE TABLE "wht_certificates" (
    "id"                Text        NOT NULL DEFAULT (gen_random_uuid())::text,
    "companyId"         Text        NOT NULL,
    "invoiceId"         Text,
    "certificateNumber" Text        NOT NULL UNIQUE,
    "whtRate"           Text        NOT NULL,
    "whtAmount"         Double Precision NOT NULL,
    "totalAmount"       Double Precision NOT NULL,
    "netAmount"         Double Precision NOT NULL,
    "recipientName"     Text        NOT NULL,
    "recipientTaxId"    Text        NOT NULL,
    "recipientBranch"   Text        NOT NULL DEFAULT '00000',
    "incomeType"        Text,
    "paymentDate"       Timestamptz NOT NULL,
    "pdfUrl"            Text,
    "createdBy"         Text        NOT NULL,
    "createdAt"         Timestamptz NOT NULL DEFAULT now(),
    "updatedAt"         Timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "wht_certificates_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN feature_not_supported THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "wht_certificates_company_rls" ON "wht_certificates"
    FOR ALL USING ("companyId" = current_setting('etax.company_id', true)::text);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "wht_certificates_companyId_idx"           ON "wht_certificates" ("companyId");
CREATE INDEX IF NOT EXISTS "wht_certificates_companyId_createdAt_idx" ON "wht_certificates" ("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "wht_certificates_invoiceId_idx"          ON "wht_certificates" ("invoiceId");
CREATE INDEX IF NOT EXISTS "wht_certificates_certificateNumber_idx"  ON "wht_certificates" ("certificateNumber");

DO $$ BEGIN
  ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_whtCertificateId_fkey"
    FOREIGN KEY ("whtCertificateId")
    REFERENCES "wht_certificates" ("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates"
    ADD CONSTRAINT "wht_certificates_companyId_fkey"
    FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
