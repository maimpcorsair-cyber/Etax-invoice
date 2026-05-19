-- Same class of bug as 20260519_invoices_camelcase_to_snake_case: the
-- migration 20260505_add_wht_and_cancellation created the entire
-- wht_certificates table with double-quoted camelCase column names, but
-- the Prisma model maps every field to snake_case via @map. Any call to
-- prisma.whtCertificate.* would 500 in production — feature simply
-- doesn't work yet, which is why the bug was invisible until we audited.
--
-- Idempotent: each rename swallows `undefined_column` so re-running on a
-- DB that's already been migrated is a no-op. Indexes and RLS policies
-- attach by parse tree, not text — PostgreSQL auto-rewires them on
-- ALTER TABLE ... RENAME COLUMN so we don't need to touch the policy
-- or recreate any index here.

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "companyId" TO "company_id";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "invoiceId" TO "invoice_id";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "certificateNumber" TO "certificate_number";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "whtRate" TO "wht_rate";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "whtAmount" TO "wht_amount";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "totalAmount" TO "total_amount";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "netAmount" TO "net_amount";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "recipientName" TO "recipient_name";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "recipientTaxId" TO "recipient_tax_id";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "recipientBranch" TO "recipient_branch";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "incomeType" TO "income_type";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "paymentDate" TO "payment_date";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "pdfUrl" TO "pdf_url";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "createdBy" TO "created_by";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "createdAt" TO "created_at";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "wht_certificates" RENAME COLUMN "updatedAt" TO "updated_at";
EXCEPTION WHEN undefined_column THEN null;
END $$;
