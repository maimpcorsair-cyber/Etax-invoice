CREATE TABLE IF NOT EXISTS "document_comments" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "documentIntakeId" TEXT NOT NULL,
  "authorType" TEXT NOT NULL DEFAULT 'user',
  "authorUserId" TEXT,
  "authorName" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'comment',
  "status" TEXT NOT NULL DEFAULT 'open',
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_comments_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_comments_projectId_fkey') THEN
    ALTER TABLE "document_comments"
      ADD CONSTRAINT "document_comments_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_comments_documentIntakeId_fkey') THEN
    ALTER TABLE "document_comments"
      ADD CONSTRAINT "document_comments_documentIntakeId_fkey"
      FOREIGN KEY ("documentIntakeId") REFERENCES "document_intakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "document_comments_companyId_projectId_createdAt_idx"
  ON "document_comments"("companyId", "projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "document_comments_companyId_documentIntakeId_createdAt_idx"
  ON "document_comments"("companyId", "documentIntakeId", "createdAt");
CREATE INDEX IF NOT EXISTS "document_comments_companyId_status_idx"
  ON "document_comments"("companyId", "status");

ALTER TABLE public.document_comments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'document_comments' AND policyname = 'document_comments_tenant_policy'
  ) THEN
    CREATE POLICY document_comments_tenant_policy
    ON public.document_comments
    USING (public.app_tenant_access("companyId"))
    WITH CHECK (public.app_tenant_access("companyId"));
  END IF;
END $$;

ALTER TABLE public.document_comments FORCE ROW LEVEL SECURITY;
