-- Settlement/payout lines from marketplaces: gross/fee/refund/net so the owner
-- can reconcile sales vs money actually received. externalRef dedupes uploads.
CREATE TABLE "marketplace_settlements" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "external_ref" TEXT NOT NULL,
    "settled_at" TIMESTAMP(3),
    "gross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refund" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjustment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "net" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'csv',
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketplace_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_settlements_company_id_channel_external_ref_key"
    ON "marketplace_settlements"("company_id", "channel", "external_ref");
CREATE INDEX "marketplace_settlements_company_id_idx" ON "marketplace_settlements"("company_id");

ALTER TABLE "marketplace_settlements"
    ADD CONSTRAINT "marketplace_settlements_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
