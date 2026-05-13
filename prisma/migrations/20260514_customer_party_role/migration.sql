ALTER TABLE "customers"
ADD COLUMN "partyRole" TEXT NOT NULL DEFAULT 'customer';

UPDATE "customers"
SET "partyRole" = 'supplier'
WHERE "useCase" = 'vendor_payee';

CREATE INDEX "customers_companyId_partyRole_idx" ON "customers"("companyId", "partyRole");
