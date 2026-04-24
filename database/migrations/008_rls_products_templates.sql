-- 008_rls_products_templates.sql
-- Phase 1 live RLS activation for products and document templates.

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_tenant_policy ON public.products;
DROP POLICY IF EXISTS document_templates_tenant_policy ON public.document_templates;

CREATE POLICY products_tenant_policy
ON public.products
USING (public.app_tenant_access("companyId"))
WITH CHECK (public.app_tenant_access("companyId"));

CREATE POLICY document_templates_tenant_policy
ON public.document_templates
USING (public.app_tenant_access("companyId"))
WITH CHECK (public.app_tenant_access("companyId"));
