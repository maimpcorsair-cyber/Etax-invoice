-- CreateEnum
CREATE TYPE "DeliveryNoteStatus" AS ENUM ('draft', 'issued', 'delivered', 'converted', 'cancelled');

-- CreateTable: delivery_notes
CREATE TABLE "delivery_notes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "deliveryNoteNumber" TEXT NOT NULL,
    "status" "DeliveryNoteStatus" NOT NULL DEFAULT 'draft',
    "language" TEXT NOT NULL DEFAULT 'th',
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "expectedDate" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "buyerId" TEXT NOT NULL,
    "seller" JSONB NOT NULL,
    "quotation_id" TEXT,
    "invoice_id" TEXT,
    "shippingAddress" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "vehicleNo" TEXT,
    "trackingNo" TEXT,
    "notes" TEXT,
    "deliveryTerms" TEXT,
    "pdfUrl" TEXT,
    "driveFileId" TEXT,
    "driveUrl" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancel_reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: delivery_note_items
CREATE TABLE "delivery_note_items" (
    "id" TEXT NOT NULL,
    "deliveryNoteId" TEXT NOT NULL,
    "productId" TEXT,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionTh" TEXT,
    "descriptionEn" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "deliveredQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION,
    "vatType" "VatType" NOT NULL DEFAULT 'vat7',
    "amount" DOUBLE PRECISION,

    CONSTRAINT "delivery_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_notes_companyId_deliveryNoteNumber_key" ON "delivery_notes"("companyId", "deliveryNoteNumber");
CREATE INDEX "delivery_notes_companyId_idx" ON "delivery_notes"("companyId");
CREATE INDEX "delivery_notes_companyId_projectId_idx" ON "delivery_notes"("companyId", "projectId");
CREATE INDEX "delivery_notes_companyId_status_idx" ON "delivery_notes"("companyId", "status");
CREATE INDEX "delivery_notes_companyId_deliveryDate_idx" ON "delivery_notes"("companyId", "deliveryDate");
CREATE INDEX "delivery_notes_buyerId_idx" ON "delivery_notes"("buyerId");
CREATE INDEX "delivery_notes_createdBy_idx" ON "delivery_notes"("createdBy");
CREATE INDEX "delivery_notes_quotation_id_idx" ON "delivery_notes"("quotation_id");
CREATE INDEX "delivery_notes_invoice_id_idx" ON "delivery_notes"("invoice_id");
CREATE INDEX "delivery_note_items_deliveryNoteId_idx" ON "delivery_note_items"("deliveryNoteId");

-- AddForeignKey
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_note_items" ADD CONSTRAINT "delivery_note_items_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "delivery_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_note_items" ADD CONSTRAINT "delivery_note_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
