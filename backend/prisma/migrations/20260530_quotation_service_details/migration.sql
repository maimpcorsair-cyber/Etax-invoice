-- Add structured service/project quotation details without changing existing
-- general quotation behavior.
ALTER TABLE "quotations"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'general',
ADD COLUMN "serviceDetails" JSONB;
