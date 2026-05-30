-- Optional BOQ grouping for quotation line items. Existing quotations remain
-- unchanged and continue to render as a flat item list.
ALTER TABLE "quotation_items"
ADD COLUMN "section_title" TEXT;
