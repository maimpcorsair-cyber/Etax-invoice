-- 011_rls_company_subscriptions.sql
-- Finish tenant isolation for company subscription records.

ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_subscriptions_tenant_policy ON public.company_subscriptions;

CREATE POLICY company_subscriptions_tenant_policy
ON public.company_subscriptions
USING (public.app_tenant_access("companyId"))
WITH CHECK (public.app_tenant_access("companyId"));

ALTER TABLE public.company_subscriptions FORCE ROW LEVEL SECURITY;
