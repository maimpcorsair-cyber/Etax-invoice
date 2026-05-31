-- Optional management / agency fee on quotations (added on top of the item
-- subtotal, before VAT) — common for event / PR / agency quotations.
-- Nullable + additive; existing quotations unaffected.
ALTER TABLE "quotations"
  ADD COLUMN "feePercent" DOUBLE PRECISION,
  ADD COLUMN "feeLabel"   TEXT;
