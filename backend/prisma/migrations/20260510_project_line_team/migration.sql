ALTER TABLE "line_otps" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

ALTER TABLE "line_group_links" ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'group';
ALTER TABLE "line_group_links" ADD COLUMN IF NOT EXISTS "pictureUrl" TEXT;
ALTER TABLE "line_group_links" ADD COLUMN IF NOT EXISTS "memberCount" INTEGER;
ALTER TABLE "line_group_links" ADD COLUMN IF NOT EXISTS "lastMessageAt" TIMESTAMP(3);
ALTER TABLE "line_group_links" ADD COLUMN IF NOT EXISTS "lastSenderLineUserId" TEXT;
ALTER TABLE "line_group_links" ADD COLUMN IF NOT EXISTS "lastSenderDisplayName" TEXT;
ALTER TABLE "line_group_links" ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "line_project_members" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "lineGroupLinkId" TEXT NOT NULL,
  "lineUserId" TEXT NOT NULL,
  "displayName" TEXT,
  "pictureUrl" TEXT,
  "linkedUserId" TEXT,
  "role" TEXT NOT NULL DEFAULT 'line_guest',
  "documentCount" INTEGER NOT NULL DEFAULT 0,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "line_project_members_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'line_project_members_projectId_fkey') THEN
    ALTER TABLE "line_project_members"
      ADD CONSTRAINT "line_project_members_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'line_project_members_lineGroupLinkId_fkey') THEN
    ALTER TABLE "line_project_members"
      ADD CONSTRAINT "line_project_members_lineGroupLinkId_fkey"
      FOREIGN KEY ("lineGroupLinkId") REFERENCES "line_group_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'line_project_members_linkedUserId_fkey') THEN
    ALTER TABLE "line_project_members"
      ADD CONSTRAINT "line_project_members_linkedUserId_fkey"
      FOREIGN KEY ("linkedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "line_otps_companyId_projectId_idx" ON "line_otps"("companyId", "projectId");
CREATE UNIQUE INDEX IF NOT EXISTS "line_project_members_lineGroupLinkId_lineUserId_key" ON "line_project_members"("lineGroupLinkId", "lineUserId");
CREATE INDEX IF NOT EXISTS "line_project_members_companyId_projectId_idx" ON "line_project_members"("companyId", "projectId");
CREATE INDEX IF NOT EXISTS "line_project_members_companyId_lineUserId_idx" ON "line_project_members"("companyId", "lineUserId");
CREATE INDEX IF NOT EXISTS "line_project_members_projectId_role_idx" ON "line_project_members"("projectId", "role");

ALTER TABLE public.line_project_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'line_project_members' AND policyname = 'line_project_members_tenant_policy'
  ) THEN
    CREATE POLICY line_project_members_tenant_policy
    ON public.line_project_members
    USING (public.app_tenant_access("companyId"))
    WITH CHECK (public.app_tenant_access("companyId"));
  END IF;
END $$;

ALTER TABLE public.line_project_members FORCE ROW LEVEL SECURITY;
