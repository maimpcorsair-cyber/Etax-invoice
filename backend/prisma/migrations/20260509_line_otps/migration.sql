-- CreateTable: line_otps for LINE OTP authentication flow

CREATE TABLE IF NOT EXISTS "line_otps" (
    "id"        TEXT NOT NULL,
    "otp"       TEXT NOT NULL,
    "type"      TEXT NOT NULL DEFAULT 'user',
    "userId"    TEXT,
    "companyId" TEXT NOT NULL,
    "issuedBy"  TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_otps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "line_otps_otp_key" ON "line_otps"("otp");
