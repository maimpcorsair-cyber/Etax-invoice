ALTER TABLE "products" ADD COLUMN "product_type" TEXT NOT NULL DEFAULT 'product';
ALTER TABLE "products" ADD COLUMN "category" TEXT;
ALTER TABLE "products" ADD COLUMN "account_code" TEXT;
ALTER TABLE "products" ADD COLUMN "unit_cost" DOUBLE PRECISION;
ALTER TABLE "products" ADD COLUMN "default_wht_rate" TEXT;
ALTER TABLE "products" ADD COLUMN "internal_note" TEXT;

CREATE INDEX "products_companyId_product_type_idx" ON "products"("companyId", "product_type");
CREATE INDEX "products_companyId_category_idx" ON "products"("companyId", "category");
