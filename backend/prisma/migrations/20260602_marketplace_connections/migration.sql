-- Per-company marketplace connection registry (status + linked shop + encrypted
-- OAuth tokens). Scaffold for live connectors; no live API until credentials land.
CREATE TABLE "marketplace_connections" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "external_shop_id" TEXT,
    "external_shop_name" TEXT,
    "access_token_enc" TEXT,
    "refresh_token_enc" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketplace_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_connections_company_id_channel_key"
    ON "marketplace_connections"("company_id", "channel");
CREATE INDEX "marketplace_connections_company_id_idx" ON "marketplace_connections"("company_id");

ALTER TABLE "marketplace_connections"
    ADD CONSTRAINT "marketplace_connections_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
