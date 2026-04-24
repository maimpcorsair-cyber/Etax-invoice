-- 007_rls_customers.sql
-- First live RLS activation: customers
--
-- This keeps the application-compatible tenant checks we already have,
-- while letting PostgreSQL enforce row-level isolation as a second layer.

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_tenant_policy ON public.customers;

CREATE POLICY customers_tenant_policy
ON public.customers
USING (public.app_tenant_access("companyId"))
WITH CHECK (public.app_tenant_access("companyId"));
