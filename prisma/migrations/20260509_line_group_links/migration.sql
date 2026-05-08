-- Add LINE group-to-company links for group chat document intake.

CREATE TABLE IF NOT EXISTS line_group_links (
  id             TEXT PRIMARY KEY,
  "companyId"    TEXT NOT NULL,
  "lineGroupId"  TEXT NOT NULL UNIQUE,
  "groupName"    TEXT,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "linkedById"   TEXT,
  "linkedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "line_group_links_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT "line_group_links_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "line_group_links_companyId_idx" ON line_group_links("companyId");
CREATE INDEX IF NOT EXISTS "line_group_links_companyId_isActive_idx" ON line_group_links("companyId", "isActive");
CREATE INDEX IF NOT EXISTS "line_group_links_lineGroupId_idx" ON line_group_links("lineGroupId");

ALTER TABLE public.line_group_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'line_group_links'
      AND policyname = 'line_group_links_tenant_policy'
  ) THEN
    CREATE POLICY line_group_links_tenant_policy
    ON public.line_group_links
    USING (public.app_tenant_access("companyId"))
    WITH CHECK (public.app_tenant_access("companyId"));
  END IF;
END $$;

ALTER TABLE public.line_group_links FORCE ROW LEVEL SECURITY;
