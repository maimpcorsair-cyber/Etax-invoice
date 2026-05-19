-- Per-company .p12 cert storage (replaces the shared FS path that
-- multi-tenant signing accidentally routed every company through).
-- Bytes column maps to Postgres BYTEA. .p12 files are ~5KB so this
-- comfortably fits inline; Postgres will TOAST automatically if some
-- future cert chain gets larger.
ALTER TABLE "companies"
  ADD COLUMN "certificateBlob"       BYTEA,
  ADD COLUMN "certificateUploadedAt" TIMESTAMP(3);
