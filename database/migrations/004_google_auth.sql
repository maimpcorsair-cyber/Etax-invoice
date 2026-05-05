ALTER TABLE "users"
  ALTER COLUMN "password_hash" DROP NOT NULL;

ALTER TABLE "users"
  ADD COLUMN "googleSub" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_googleSub_key"
  ON "users" ("googleSub");
