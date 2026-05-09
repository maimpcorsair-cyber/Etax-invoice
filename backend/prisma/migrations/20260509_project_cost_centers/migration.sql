DO $$
BEGIN
  CREATE TYPE "ProjectStatus" AS ENUM ('active', 'on_hold', 'completed', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ProjectMemberRole" AS ENUM ('owner', 'approver', 'member', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "projects" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "customerName" TEXT,
  "budgetAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" "ProjectStatus" NOT NULL DEFAULT 'active',
  "ownerId" TEXT,
  "approverId" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "metadata" JSONB,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "project_members" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "ProjectMemberRole" NOT NULL DEFAULT 'member',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "document_intakes" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "expense_vouchers" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "line_group_links" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_companyId_fkey') THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_ownerId_fkey') THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_approverId_fkey') THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_approverId_fkey"
      FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_createdBy_fkey') THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_createdBy_fkey"
      FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_members_projectId_fkey') THEN
    ALTER TABLE "project_members"
      ADD CONSTRAINT "project_members_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_members_userId_fkey') THEN
    ALTER TABLE "project_members"
      ADD CONSTRAINT "project_members_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_projectId_fkey') THEN
    ALTER TABLE "invoices"
      ADD CONSTRAINT "invoices_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_invoices_projectId_fkey') THEN
    ALTER TABLE "purchase_invoices"
      ADD CONSTRAINT "purchase_invoices_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_intakes_projectId_fkey') THEN
    ALTER TABLE "document_intakes"
      ADD CONSTRAINT "document_intakes_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_vouchers_projectId_fkey') THEN
    ALTER TABLE "expense_vouchers"
      ADD CONSTRAINT "expense_vouchers_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'line_group_links_projectId_fkey') THEN
    ALTER TABLE "line_group_links"
      ADD CONSTRAINT "line_group_links_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "projects_companyId_code_key" ON "projects"("companyId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");
CREATE INDEX IF NOT EXISTS "projects_companyId_status_idx" ON "projects"("companyId", "status");
CREATE INDEX IF NOT EXISTS "projects_companyId_ownerId_idx" ON "projects"("companyId", "ownerId");
CREATE INDEX IF NOT EXISTS "projects_companyId_approverId_idx" ON "projects"("companyId", "approverId");
CREATE INDEX IF NOT EXISTS "projects_createdBy_idx" ON "projects"("createdBy");
CREATE INDEX IF NOT EXISTS "project_members_userId_idx" ON "project_members"("userId");
CREATE INDEX IF NOT EXISTS "project_members_projectId_role_idx" ON "project_members"("projectId", "role");
CREATE INDEX IF NOT EXISTS "invoices_companyId_projectId_idx" ON "invoices"("companyId", "projectId");
CREATE INDEX IF NOT EXISTS "purchase_invoices_companyId_projectId_idx" ON "purchase_invoices"("companyId", "projectId");
CREATE INDEX IF NOT EXISTS "document_intakes_companyId_projectId_createdAt_idx" ON "document_intakes"("companyId", "projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "expense_vouchers_companyId_projectId_idx" ON "expense_vouchers"("companyId", "projectId");
CREATE INDEX IF NOT EXISTS "line_group_links_companyId_projectId_idx" ON "line_group_links"("companyId", "projectId");

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'projects_tenant_policy'
  ) THEN
    CREATE POLICY projects_tenant_policy
    ON public.projects
    USING (public.app_tenant_access("companyId"))
    WITH CHECK (public.app_tenant_access("companyId"));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_members' AND policyname = 'project_members_tenant_policy'
  ) THEN
    CREATE POLICY project_members_tenant_policy
    ON public.project_members
    USING (
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = "projectId"
          AND public.app_tenant_access(p."companyId")
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = "projectId"
          AND public.app_tenant_access(p."companyId")
      )
    );
  END IF;
END $$;

ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_members FORCE ROW LEVEL SECURITY;
