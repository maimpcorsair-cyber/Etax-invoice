-- Step 2: Attachment enums + URL-only model
CREATE TYPE "AttachmentFileType" AS ENUM ('image', 'pdf', 'link');
CREATE TYPE "EvidenceType" AS ENUM ('receipt', 'chat', 'map', 'other');

-- Step 1: Expense voucher system
CREATE TYPE "ExpenseVoucherStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected');

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "expenseLimit" DECIMAL(12,2);

CREATE TABLE IF NOT EXISTS "expense_vouchers" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "companyId"     TEXT NOT NULL,
  "voucherNumber" TEXT NOT NULL,
  "status"        "ExpenseVoucherStatus" NOT NULL DEFAULT 'draft',
  "voucherDate"   TIMESTAMP NOT NULL,
  "description"   TEXT,
  "notes"         TEXT,
  "metadata"      JSONB,
  "totalAmount"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "submittedBy"   TEXT,
  "submittedAt"   TIMESTAMP,
  "approvedBy"    TEXT,
  "approvedAt"    TIMESTAMP,
  "rejectedBy"    TEXT,
  "rejectedAt"    TIMESTAMP,
  "rejectionNote" TEXT,
  "createdBy"     TEXT NOT NULL,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "expense_vouchers_companyId_voucherNumber_key" UNIQUE ("companyId", "voucherNumber"),
  CONSTRAINT "expense_vouchers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "expense_vouchers_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id")
);
CREATE INDEX IF NOT EXISTS "expense_vouchers_companyId_idx" ON "expense_vouchers"("companyId");
CREATE INDEX IF NOT EXISTS "expense_vouchers_companyId_status_idx" ON "expense_vouchers"("companyId","status");
CREATE INDEX IF NOT EXISTS "expense_vouchers_companyId_voucherDate_idx" ON "expense_vouchers"("companyId","voucherDate");
CREATE INDEX IF NOT EXISTS "expense_vouchers_createdBy_idx" ON "expense_vouchers"("createdBy");

-- Step 3: Expense items with WHT
CREATE TABLE IF NOT EXISTS "expense_items" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "voucherId"     TEXT NOT NULL,
  "description"   TEXT NOT NULL,
  "category"      TEXT,
  "amount"        DECIMAL(12,2) NOT NULL,
  "date"          TIMESTAMP NOT NULL,
  "notes"         TEXT,
  "metadata"      JSONB,
  "vendorName"    TEXT,
  "vendorTaxId"   TEXT,
  "whtApplicable" BOOLEAN NOT NULL DEFAULT false,
  "whtRate"       DECIMAL(5,2),
  "whtAmount"     DECIMAL(12,2),
  "netAmount"     DECIMAL(12,2),
  "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "expense_items_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "expense_vouchers"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "expense_items_voucherId_idx" ON "expense_items"("voucherId");

-- Step 2: Attachments (URL-only)
CREATE TABLE IF NOT EXISTS "expense_attachments" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "expenseItemId" TEXT NOT NULL,
  "fileName"      TEXT,
  "fileType"      "AttachmentFileType" NOT NULL DEFAULT 'image',
  "url"           TEXT NOT NULL,
  "evidenceType"  "EvidenceType" NOT NULL DEFAULT 'receipt',
  "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "expense_attachments_expenseItemId_fkey" FOREIGN KEY ("expenseItemId") REFERENCES "expense_items"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "expense_attachments_expenseItemId_idx" ON "expense_attachments"("expenseItemId");

-- Step 5: Approval log
CREATE TABLE IF NOT EXISTS "approval_logs" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "expenseId" TEXT NOT NULL,
  "action"    "ExpenseVoucherStatus" NOT NULL,
  "byUserId"  TEXT NOT NULL,
  "note"      TEXT,
  "timestamp" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "approval_logs_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expense_vouchers"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "approval_logs_expenseId_idx" ON "approval_logs"("expenseId");

-- Step 4: Petty cash
CREATE TABLE IF NOT EXISTS "petty_cash" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "companyId"  TEXT NOT NULL UNIQUE,
  "cashierId"  TEXT,
  "balance"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "petty_cash_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE
);

-- Step 8: Google Drive OAuth per user
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "googleRefreshToken" TEXT,
  ADD COLUMN IF NOT EXISTS "googleDriveLinkedAt" TIMESTAMP;
