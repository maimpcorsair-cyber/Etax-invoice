-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('sale', 'purchase', 'adjustment_in', 'adjustment_out', 'opening_balance');

-- AlterTable: products → add inventory fields
ALTER TABLE "products"
  ADD COLUMN "track_inventory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "current_stock"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "reorder_point"   DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "products_companyId_track_inventory_idx" ON "products"("companyId", "track_inventory");

-- CreateTable: stock_movements (ledger)
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movements_companyId_productId_idx" ON "stock_movements"("companyId", "productId");
CREATE INDEX "stock_movements_companyId_createdAt_idx" ON "stock_movements"("companyId", "createdAt");
CREATE INDEX "stock_movements_refType_refId_idx" ON "stock_movements"("refType", "refId");

-- AddForeignKey
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
