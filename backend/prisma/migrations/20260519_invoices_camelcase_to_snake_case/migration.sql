-- Rename mis-cased columns on `invoices` so they match the @map directives
-- in schema.prisma. The original migration 20260505_add_wht_and_cancellation
-- added these columns in camelCase (e.g., `whtRate`), but the Prisma model
-- maps them to snake_case (`@map("wht_rate")`). Because no production code
-- had SELECTed these columns until /account/export and /admin/seed-demo-data
-- shipped, the bug went undetected — Prisma was silently asking PostgreSQL
-- for a column it had never created.
--
-- Idempotent via `undefined_column` exception swallow: re-running this is a
-- no-op if the rename already happened (e.g., on a tenant that was set up
-- after the schema was first applied via `prisma db push`).

DO $$ BEGIN
  ALTER TABLE "invoices" RENAME COLUMN "whtRate" TO "wht_rate";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" RENAME COLUMN "whtAmount" TO "wht_amount";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" RENAME COLUMN "whtCertificateId" TO "wht_certificate_id";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" RENAME COLUMN "cancelledAt" TO "cancelled_at";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" RENAME COLUMN "cancelledBy" TO "cancelled_by";
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" RENAME COLUMN "cancelReason" TO "cancel_reason";
EXCEPTION WHEN undefined_column THEN null;
END $$;
