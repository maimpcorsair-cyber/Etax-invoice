CREATE TABLE "FcmToken" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "token"     TEXT NOT NULL,
  "platform"  TEXT NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FcmToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FcmToken_token_key" ON "FcmToken"("token");
CREATE INDEX "FcmToken_userId_isActive_idx" ON "FcmToken"("userId", "isActive");
ALTER TABLE "FcmToken" ADD CONSTRAINT "FcmToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
