-- Company-wide document footer fine-print (payment terms, electronic-document
-- notice, policies). Presentational only — rendered at the bottom of every
-- issued document. Nullable so existing companies are unaffected.
ALTER TABLE "companies"
  ADD COLUMN "documentFooterNote" TEXT;
