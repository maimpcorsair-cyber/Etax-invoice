CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS "juristic_open_data_cache" (
  "id" TEXT NOT NULL,
  "taxId" TEXT NOT NULL,
  "nameTh" TEXT,
  "nameEn" TEXT,
  "addressTh" TEXT,
  "status" TEXT,
  "juristicType" TEXT,
  "source" TEXT NOT NULL DEFAULT 'open-dbd',
  "raw" JSONB,
  "vatRegistered" BOOLEAN NOT NULL DEFAULT false,
  "vatName" TEXT,
  "vatAddress" TEXT,
  "vatSource" TEXT,
  "vatLastSyncedAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "juristic_open_data_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "juristic_open_data_cache_taxId_key"
  ON "juristic_open_data_cache"("taxId");

CREATE INDEX IF NOT EXISTS "juristic_open_data_cache_taxId_idx"
  ON "juristic_open_data_cache"("taxId");

CREATE INDEX IF NOT EXISTS "juristic_open_data_cache_status_idx"
  ON "juristic_open_data_cache"("status");

CREATE INDEX IF NOT EXISTS "juristic_open_data_cache_nameTh_trgm_idx"
  ON "juristic_open_data_cache" USING GIN ("nameTh" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "juristic_open_data_cache_nameEn_trgm_idx"
  ON "juristic_open_data_cache" USING GIN ("nameEn" gin_trgm_ops);

CREATE TABLE IF NOT EXISTS "dbd_open_data_sync_runs" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "source" TEXT,
  "recordsRead" INTEGER NOT NULL DEFAULT 0,
  "recordsUpserted" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "triggeredBy" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "dbd_open_data_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "dbd_open_data_sync_runs_kind_startedAt_idx"
  ON "dbd_open_data_sync_runs"("kind", "startedAt");

CREATE INDEX IF NOT EXISTS "dbd_open_data_sync_runs_status_startedAt_idx"
  ON "dbd_open_data_sync_runs"("status", "startedAt");
