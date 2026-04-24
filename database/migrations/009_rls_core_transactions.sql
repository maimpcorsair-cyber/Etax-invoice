-- 009_rls_core_transactions.sql
-- Activate RLS policies for the remaining tenant-owned application tables.

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_tenant_policy ON public.audit_logs;
DROP POLICY IF EXISTS users_tenant_policy ON public.users;
DROP POLICY IF EXISTS invoices_tenant_policy ON public.invoices;
DROP POLICY IF EXISTS payments_invoice_policy ON public.payments;
DROP POLICY IF EXISTS invoice_items_invoice_policy ON public.invoice_items;

CREATE POLICY audit_logs_tenant_policy
ON public.audit_logs
USING (public.app_tenant_access("companyId"))
WITH CHECK (public.app_tenant_access("companyId"));

CREATE POLICY users_tenant_policy
ON public.users
USING (public.app_tenant_access("companyId"))
WITH CHECK (public.app_tenant_access("companyId"));

CREATE POLICY invoices_tenant_policy
ON public.invoices
USING (public.app_tenant_access("companyId"))
WITH CHECK (public.app_tenant_access("companyId"));

CREATE POLICY payments_invoice_policy
ON public.payments
USING (public.app_invoice_access("invoiceId"))
WITH CHECK (public.app_invoice_access("invoiceId"));

CREATE POLICY invoice_items_invoice_policy
ON public.invoice_items
USING (public.app_invoice_access("invoiceId"))
WITH CHECK (public.app_invoice_access("invoiceId"));
