-- CreateEnum
CREATE TYPE "RecurringInvoiceStatus" AS ENUM ('active', 'paused', 'ended', 'cancelled');

-- CreateEnum
CREATE TYPE "RecurringInvoiceFrequency" AS ENUM ('weekly', 'monthly', 'quarterly', 'yearly');

-- CreateTable
CREATE TABLE "recurring_invoices" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RecurringInvoiceStatus" NOT NULL DEFAULT 'active',
    "frequency" "RecurringInvoiceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "language" TEXT NOT NULL DEFAULT 'th',
    "invoiceType" "InvoiceType" NOT NULL DEFAULT 'tax_invoice',
    "startDate" TIMESTAMP(3) NOT NULL,
    "nextRunDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "dueDays" INTEGER,
    "maxRuns" INTEGER,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "paymentMethod" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_invoice_items" (
    "id" TEXT NOT NULL,
    "recurringInvoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionTh" TEXT,
    "descriptionEn" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatType" "VatType" NOT NULL DEFAULT 'vat7',

    CONSTRAINT "recurring_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_invoice_runs" (
    "id" TEXT NOT NULL,
    "recurringInvoiceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "error" TEXT,

    CONSTRAINT "recurring_invoice_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_invoices_companyId_idx" ON "recurring_invoices"("companyId");
CREATE INDEX "recurring_invoices_companyId_status_idx" ON "recurring_invoices"("companyId", "status");
CREATE INDEX "recurring_invoices_companyId_nextRunDate_idx" ON "recurring_invoices"("companyId", "nextRunDate");
CREATE INDEX "recurring_invoices_customerId_idx" ON "recurring_invoices"("customerId");
CREATE INDEX "recurring_invoices_createdBy_idx" ON "recurring_invoices"("createdBy");
CREATE INDEX "recurring_invoice_items_recurringInvoiceId_idx" ON "recurring_invoice_items"("recurringInvoiceId");
CREATE UNIQUE INDEX "recurring_invoice_runs_recurringInvoiceId_scheduledFor_key" ON "recurring_invoice_runs"("recurringInvoiceId", "scheduledFor");
CREATE INDEX "recurring_invoice_runs_companyId_scheduledFor_idx" ON "recurring_invoice_runs"("companyId", "scheduledFor");
CREATE INDEX "recurring_invoice_runs_invoiceId_idx" ON "recurring_invoice_runs"("invoiceId");

-- AddForeignKey
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "recurring_invoice_items" ADD CONSTRAINT "recurring_invoice_items_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "recurring_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_invoice_items" ADD CONSTRAINT "recurring_invoice_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "recurring_invoice_runs" ADD CONSTRAINT "recurring_invoice_runs_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "recurring_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_invoice_runs" ADD CONSTRAINT "recurring_invoice_runs_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
