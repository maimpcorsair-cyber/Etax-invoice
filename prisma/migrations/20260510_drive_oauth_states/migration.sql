CREATE TABLE IF NOT EXISTS "drive_oauth_states" (
  "id" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "returnPath" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "drive_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "drive_oauth_states_state_key" ON "drive_oauth_states"("state");
CREATE INDEX IF NOT EXISTS "drive_oauth_states_userId_idx" ON "drive_oauth_states"("userId");
CREATE INDEX IF NOT EXISTS "drive_oauth_states_companyId_idx" ON "drive_oauth_states"("companyId");
CREATE INDEX IF NOT EXISTS "drive_oauth_states_expiresAt_idx" ON "drive_oauth_states"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drive_oauth_states_userId_fkey'
  ) THEN
    ALTER TABLE "drive_oauth_states"
      ADD CONSTRAINT "drive_oauth_states_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE public.drive_oauth_states ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'drive_oauth_states'
      AND policyname = 'drive_oauth_states_tenant_policy'
  ) THEN
    CREATE POLICY drive_oauth_states_tenant_policy
    ON public.drive_oauth_states
    USING (public.app_tenant_access("companyId"))
    WITH CHECK (public.app_tenant_access("companyId"));
  END IF;
END $$;

ALTER TABLE public.drive_oauth_states FORCE ROW LEVEL SECURITY;
