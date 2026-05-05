-- 017_wht_certificates.sql
-- WHT (Withholding Tax / ภาษีหัก ณ ที่จ่าย / 50 ทวิ) system
-- Applied after: 016_rls_remaining_tables.sql

BEGIN;

-- ── Invoice WHT fields ───────────────────────────────────────────────────────
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "whtAmount"       Double Precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "whtRate"         Text,  -- "1" | "3" | "5" | null
  ADD COLUMN IF NOT EXISTS "whtCertificateId" Text; -- FK → wht_certificates

CREATE INDEX IF NOT EXISTS "invoices_whtCertificateId_idx" ON "invoices" ("whtCertificateId");

-- ── WHT Certificate table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "wht_certificates" (
  "id"                Text        NOT NULL DEFAULT cuid(),
  "companyId"         Text        NOT NULL,
  "invoiceId"         Text,                                   -- optional: may be standalone
  "certificateNumber" Text        NOT NULL UNIQUE,           -- WHT-{TAXID}-{YYYYMM}-{SEQ}
  "whtRate"           Text        NOT NULL,                   -- "1" | "3" | "5"
  "whtAmount"         Double Precision NOT NULL,
  "totalAmount"       Double Precision NOT NULL,             -- income before WHT
  "netAmount"         Double Precision NOT NULL,             -- after WHT deduction
  "recipientName"     Text        NOT NULL,
  "recipientTaxId"    Text        NOT NULL,
  "recipientBranch"   Text        NOT NULL DEFAULT '00000',
  "incomeType"        Text,                                   -- "1" | "2" | "4" (มาตรา 40)
  "paymentDate"       Timestamptz NOT NULL,
  "pdfUrl"            Text,
  "createdBy"         Text        NOT NULL,
  "createdAt"         Timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         Timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE "wht_certificates" IS 'ใบรับรองหักภาษี ณ ที่จ่าย (Withholding Tax Certificate / 50 ทวิ)';
COMMENT ON COLUMN "wht_certificates"."whtRate"        IS 'อัตราหักภาษี: 1%, 3%, 5%';
COMMENT ON COLUMN "wht_certificates"."incomeType"     IS 'ประเภทเงินได้: 1=ม.40(1)ค่าจ้าง, 2=ม.40(2)ค่าเช่า/ดอกเบี้ย, 4=ม.40(4)(ก)ค่าบริการ';
COMMENT ON COLUMN "wht_certificates"."certificateNumber" IS 'รูปแบบ: WHT-{เลขผู้เสียภาษีของบริษัท}-{YYYYMM}-{SEQ}';

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE "wht_certificates" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wht_certificates_company_rls" ON "wht_certificates"
  FOR ALL USING ("companyId" = current_setting('etax.company_id', true)::text);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "wht_certificates_companyId_idx"           ON "wht_certificates" ("companyId");
CREATE INDEX IF NOT EXISTS "wht_certificates_companyId_createdAt_idx" ON "wht_certificates" ("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "wht_certificates_invoiceId_idx"          ON "wht_certificates" ("invoiceId");
CREATE INDEX IF NOT EXISTS "wht_certificates_certificateNumber_idx"  ON "wht_certificates" ("certificateNumber");

-- ── FK constraints ──────────────────────────────────────────────────────────
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_whtCertificateId_fkey"
    FOREIGN KEY ("whtCertificateId")
    REFERENCES "wht_certificates" ("id")
    ON DELETE SET NULL;

ALTER TABLE "wht_certificates"
  ADD CONSTRAINT "wht_certificates_companyId_fkey"
    FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id")
    ON DELETE Cascade;

COMMIT;
