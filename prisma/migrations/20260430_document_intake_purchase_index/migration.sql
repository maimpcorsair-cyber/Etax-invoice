CREATE INDEX IF NOT EXISTS "document_intakes_companyId_purchaseInvoiceId_idx"
  ON "document_intakes" ("companyId", "purchaseInvoiceId");
