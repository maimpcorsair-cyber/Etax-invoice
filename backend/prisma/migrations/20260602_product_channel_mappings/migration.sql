-- Map internal Product SKUs to per-channel SKUs (Shopee/Lazada/TikTok/…),
-- the foundation for multi-channel stock sync.
CREATE TABLE "product_channel_mappings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "external_sku" TEXT NOT NULL,
    "external_product_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_channel_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_channel_mappings_company_id_channel_external_sku_key"
    ON "product_channel_mappings"("company_id", "channel", "external_sku");
CREATE INDEX "product_channel_mappings_company_id_idx" ON "product_channel_mappings"("company_id");
CREATE INDEX "product_channel_mappings_product_id_idx" ON "product_channel_mappings"("product_id");

ALTER TABLE "product_channel_mappings"
    ADD CONSTRAINT "product_channel_mappings_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_channel_mappings"
    ADD CONSTRAINT "product_channel_mappings_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
