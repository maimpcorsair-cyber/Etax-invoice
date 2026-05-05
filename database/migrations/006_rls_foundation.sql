-- 006_rls_foundation.sql
-- Foundation helpers for a staged PostgreSQL Row Level Security rollout.
--
-- This migration is intentionally non-breaking:
-- - it does NOT enable RLS on application tables yet
-- - it does NOT create blocking policies yet
-- - it only adds helper functions we can reuse during gradual activation

CREATE OR REPLACE FUNCTION public.app_current_company_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_company_id', true), '');
$$;

CREATE OR REPLACE FUNCTION public.app_current_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '');
$$;

CREATE OR REPLACE FUNCTION public.app_current_role_name()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_role', true), '');
$$;

CREATE OR REPLACE FUNCTION public.app_system_mode_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.system_mode', true), '') = 'on', false);
$$;

CREATE OR REPLACE FUNCTION public.app_tenant_access(target_company_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.app_system_mode_enabled()
    OR (
      public.app_current_company_id() IS NOT NULL
      AND target_company_id IS NOT NULL
      AND public.app_current_company_id() = target_company_id
    );
$$;

CREATE OR REPLACE FUNCTION public.app_invoice_access(target_invoice_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = target_invoice_id
      AND public.app_tenant_access(i.company_id)
  );
$$;

COMMENT ON FUNCTION public.app_current_company_id() IS 'Reads current tenant company id from the PostgreSQL session variable app.current_company_id.';
COMMENT ON FUNCTION public.app_current_user_id() IS 'Reads current user id from the PostgreSQL session variable app.current_user_id.';
COMMENT ON FUNCTION public.app_current_role_name() IS 'Reads current application role from the PostgreSQL session variable app.current_role.';
COMMENT ON FUNCTION public.app_system_mode_enabled() IS 'True when the current session is explicitly allowed to bypass tenant RLS checks.';
COMMENT ON FUNCTION public.app_tenant_access(text) IS 'Returns true when the current session is allowed to access a company-owned row.';
COMMENT ON FUNCTION public.app_invoice_access(text) IS 'Returns true when the current session is allowed to access a row related to the given invoice.';

-- Next phase reference:
--   ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY customers_tenant_policy ON public.customers
--     USING (public.app_tenant_access(company_id))
--     WITH CHECK (public.app_tenant_access(company_id));
--
-- Similar activation can then be staged for:
--   users, products, invoices, audit_logs, document_templates, company_subscriptions
-- and relation-owned tables via helpers like public.app_invoice_access(...) for:
--   invoice_items, payments
