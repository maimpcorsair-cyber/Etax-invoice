-- Imported marketplace orders (CSV now, connectors later). Unique per
-- (company, channel, external_order_id) prevents double stock decrement on
-- re-upload.
CREATE TABLE "marketplace_orders" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "external_order_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "buyer_name" TEXT,
    "total" DOUBLE PRECISION,
    "items_json" JSONB NOT NULL,
    "stock_applied" BOOLEAN NOT NULL DEFAULT false,
    "unmapped_skus" TEXT[],
    "source" TEXT NOT NULL DEFAULT 'csv',
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_orders_company_id_channel_external_order_id_key"
    ON "marketplace_orders"("company_id", "channel", "external_order_id");
CREATE INDEX "marketplace_orders_company_id_idx" ON "marketplace_orders"("company_id");

ALTER TABLE "marketplace_orders"
    ADD CONSTRAINT "marketplace_orders_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
