CREATE TABLE IF NOT EXISTS "vat_filings" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "filed_at" TIMESTAMP(3) NOT NULL,
  "rd_reference" TEXT,
  "output_vat" DOUBLE PRECISION NOT NULL,
  "input_vat" DOUBLE PRECISION NOT NULL,
  "vat_payable" DOUBLE PRECISION NOT NULL,
  "vat_refundable" DOUBLE PRECISION NOT NULL,
  "total_sales_excl_vat" DOUBLE PRECISION NOT NULL,
  "snapshot" JSONB,
  "drive_file_id" TEXT,
  "drive_url" TEXT,
  "drive_folder_id" TEXT,
  "drive_folder_url" TEXT,
  "filed_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vat_filings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "vat_filings_company_id_period_key"
  ON "vat_filings" ("company_id", "period");

ALTER TABLE "vat_filings"
  ADD CONSTRAINT "vat_filings_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
