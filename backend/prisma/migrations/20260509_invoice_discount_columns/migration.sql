-- Backfill invoice discount columns expected by the Prisma schema.
-- Some local/prod databases predate the discount fields, while the generated
-- client already selects them for invoice reads and writes.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS "discount" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS "discount" DOUBLE PRECISION NOT NULL DEFAULT 0;
