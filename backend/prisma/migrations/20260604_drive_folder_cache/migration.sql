CREATE TABLE IF NOT EXISTS "drive_folder_cache" (
  "id" TEXT NOT NULL,
  "scope_key" TEXT NOT NULL,
  "parent_key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "drive_folder_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drive_folder_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "drive_folder_cache_scope_parent_name_key"
  ON "drive_folder_cache" ("scope_key", "parent_key", "name");
