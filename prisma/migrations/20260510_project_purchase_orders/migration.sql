CREATE TABLE IF NOT EXISTS "project_purchase_orders" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "documentIntakeId" TEXT,
  "poNumber" TEXT NOT NULL,
  "documentType" TEXT NOT NULL DEFAULT 'purchase_order',
  "vendorName" TEXT,
  "vendorTaxId" TEXT,
  "issueDate" TIMESTAMP(3),
  "expectedDate" TIMESTAMP(3),
  "subtotal" DOUBLE PRECISION,
  "vatAmount" DOUBLE PRECISION,
  "total" DOUBLE PRECISION,
  "currency" TEXT NOT NULL DEFAULT 'THB',
  "status" TEXT NOT NULL DEFAULT 'open',
  "source" TEXT NOT NULL DEFAULT 'document_intake',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_purchase_orders_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_purchase_orders_companyId_fkey') THEN
    ALTER TABLE "project_purchase_orders"
      ADD CONSTRAINT "project_purchase_orders_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_purchase_orders_projectId_fkey') THEN
    ALTER TABLE "project_purchase_orders"
      ADD CONSTRAINT "project_purchase_orders_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_purchase_orders_documentIntakeId_fkey') THEN
    ALTER TABLE "project_purchase_orders"
      ADD CONSTRAINT "project_purchase_orders_documentIntakeId_fkey"
      FOREIGN KEY ("documentIntakeId") REFERENCES "document_intakes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "project_purchase_orders_companyId_projectId_poNumber_key"
  ON "project_purchase_orders"("companyId", "projectId", "poNumber");
CREATE INDEX IF NOT EXISTS "project_purchase_orders_companyId_projectId_issueDate_idx"
  ON "project_purchase_orders"("companyId", "projectId", "issueDate");
CREATE INDEX IF NOT EXISTS "project_purchase_orders_companyId_projectId_status_idx"
  ON "project_purchase_orders"("companyId", "projectId", "status");
CREATE INDEX IF NOT EXISTS "project_purchase_orders_companyId_documentIntakeId_idx"
  ON "project_purchase_orders"("companyId", "documentIntakeId");

ALTER TABLE public.project_purchase_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_purchase_orders' AND policyname = 'project_purchase_orders_tenant_policy'
  ) THEN
    CREATE POLICY project_purchase_orders_tenant_policy
    ON public.project_purchase_orders
    USING (public.app_tenant_access("companyId"))
    WITH CHECK (public.app_tenant_access("companyId"));
  END IF;
END $$;

ALTER TABLE public.project_purchase_orders FORCE ROW LEVEL SECURITY;
