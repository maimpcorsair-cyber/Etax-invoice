-- Add LINE OA integration fields and user links.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS "lineNotifyEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "overdueReminderDays" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE IF NOT EXISTS line_user_links (
  id            TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL UNIQUE,
  "lineUserId"  TEXT NOT NULL UNIQUE,
  "displayName" TEXT,
  "pictureUrl"  TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "linkedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "line_user_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "line_user_links_lineUserId_idx" ON line_user_links("lineUserId");
