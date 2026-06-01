-- Quotation revision chain.
-- Locked quotations are revised by creating a new draft quotation, while the
-- older customer-facing/audit copy remains readable and is hidden from normal
-- active lists by superseded_by_id.
ALTER TABLE "quotations"
  ADD COLUMN "revision_root_id" TEXT,
  ADD COLUMN "revision_no" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "superseded_by_id" TEXT,
  ADD COLUMN "superseded_at" TIMESTAMP(3);

CREATE INDEX "quotations_companyId_revision_root_id_revision_no_idx"
  ON "quotations"("companyId", "revision_root_id", "revision_no");

CREATE INDEX "quotations_companyId_superseded_by_id_idx"
  ON "quotations"("companyId", "superseded_by_id");
