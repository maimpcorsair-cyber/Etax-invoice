-- Persistent document intake queue for LINE/PDF/image OCR.
-- Keeps receipt of inbound documents out of Redis so LINE intake remains reliable.

CREATE TABLE IF NOT EXISTS "document_intakes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lineUserId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'line',
    "sourceMessageId" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileBase64" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "ocrResult" JSONB,
    "warnings" JSONB,
    "error" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "purchaseInvoiceId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_intakes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "document_intakes_companyId_status_createdAt_idx"
    ON "document_intakes"("companyId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "document_intakes_sourceMessageId_idx"
    ON "document_intakes"("sourceMessageId");
