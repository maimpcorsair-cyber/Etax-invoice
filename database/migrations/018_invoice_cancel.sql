-- 018_invoice_cancel.sql
-- Invoice cancellation fields + RD cancel support
-- Applied after: 017_wht_certificates.sql

BEGIN;

-- ── Invoice cancellation fields ────────────────────────────────────────────
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "cancelledAt"  Timestamptz,
  ADD COLUMN IF NOT EXISTS "cancelledBy"  Text,
  ADD COLUMN IF NOT EXISTS "cancelReason" Text;

COMMENT ON COLUMN "invoices"."cancelledAt"  IS 'วันเวลาที่ยกเลิกเอกสาร';
COMMENT ON COLUMN "invoices"."cancelledBy"  IS 'userId ของผู้ยกเลิก';
COMMENT ON COLUMN "invoices"."cancelReason" IS 'เหตุผลในการยกเลิก';

COMMIT;