-- Migration: add_purchase_invoices
-- Applied: 2026-04-26
-- Description: Input VAT side — records supplier/vendor invoices for VAT accounting

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierTaxId" TEXT NOT NULL,
    "supplierBranch" TEXT DEFAULT '00000',
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "subtotal" DOUBLE PRECISION NOT NULL,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "vatType" TEXT NOT NULL DEFAULT 'vat7',
    "description" TEXT,
    "category" TEXT,
    "notes" TEXT,
    "pdfUrl" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_invoices_companyId_idx" ON "purchase_invoices"("companyId");

-- CreateIndex
CREATE INDEX "purchase_invoices_companyId_invoiceDate_idx" ON "purchase_invoices"("companyId", "invoiceDate");

-- CreateIndex
CREATE INDEX "purchase_invoices_companyId_vatType_idx" ON "purchase_invoices"("companyId", "vatType");

-- CreateIndex
CREATE INDEX "purchase_invoices_createdBy_idx" ON "purchase_invoices"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_companyId_supplierTaxId_invoiceNumber_key"
    ON "purchase_invoices"("companyId", "supplierTaxId", "invoiceNumber");

-- AddForeignKey
ALTER TABLE "purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
