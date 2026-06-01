-- Reusable company library documents (ภ.พ.20, cert, bank book, profile, catalog).
CREATE TABLE "company_documents" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "docType" TEXT NOT NULL DEFAULT 'other',
    "label" TEXT,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "s3_key" TEXT NOT NULL,
    "attach_by_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "company_documents_company_id_idx" ON "company_documents"("company_id");

ALTER TABLE "company_documents"
    ADD CONSTRAINT "company_documents_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Quotation → attached company-document references (text array of CompanyDocument ids).
ALTER TABLE "quotations" ADD COLUMN "attachment_document_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
