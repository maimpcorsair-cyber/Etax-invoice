-- Customer verification workflow: use case, readiness, and Drive-backed evidence metadata
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "customerKind" TEXT NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS "useCase" TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS "verificationStatus" TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS "vatEvidenceStatus" TEXT NOT NULL DEFAULT 'not_required';

CREATE TABLE IF NOT EXISTS "customer_documents" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "uploadedById" TEXT,
  "documentType" TEXT NOT NULL,
  "requiredFor" TEXT NOT NULL DEFAULT 'general',
  "status" TEXT NOT NULL DEFAULT 'uploaded',
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "driveFileId" TEXT,
  "driveUrl" TEXT,
  "driveFolderId" TEXT,
  "driveFolderUrl" TEXT,
  "driveUserDrive" BOOLEAN NOT NULL DEFAULT false,
  "sensitive" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "customers_companyId_verificationStatus_idx" ON "customers"("companyId", "verificationStatus");
CREATE INDEX IF NOT EXISTS "customers_companyId_useCase_idx" ON "customers"("companyId", "useCase");
CREATE INDEX IF NOT EXISTS "customer_documents_companyId_customerId_idx" ON "customer_documents"("companyId", "customerId");
CREATE INDEX IF NOT EXISTS "customer_documents_companyId_documentType_idx" ON "customer_documents"("companyId", "documentType");
CREATE INDEX IF NOT EXISTS "customer_documents_companyId_status_idx" ON "customer_documents"("companyId", "status");

ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_documents_tenant_policy ON public.customer_documents;
CREATE POLICY customer_documents_tenant_policy
ON public.customer_documents
USING (
  current_setting('app.system_mode', true) = 'on'
  OR "companyId" = current_setting('app.current_company_id', true)
)
WITH CHECK (
  current_setting('app.system_mode', true) = 'on'
  OR "companyId" = current_setting('app.current_company_id', true)
);
