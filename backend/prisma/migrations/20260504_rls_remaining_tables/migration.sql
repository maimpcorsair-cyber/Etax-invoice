-- Adds RLS policies for remaining tenant-owned tables:
--   purchase_invoices, document_intakes, expense_vouchers,
--   petty_cash, expense_items, expense_attachments,
--   FcmToken, line_user_links
--
-- Keep this migration in backend/prisma/migrations so production deploys use
-- one migration source through `prisma migrate deploy`.

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
      AND public.app_tenant_access(i."companyId")
  );
$$;

ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FcmToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_user_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_invoices_tenant_policy ON public.purchase_invoices;
DROP POLICY IF EXISTS document_intakes_tenant_policy ON public.document_intakes;
DROP POLICY IF EXISTS expense_vouchers_tenant_policy ON public.expense_vouchers;
DROP POLICY IF EXISTS petty_cash_tenant_policy ON public.petty_cash;
DROP POLICY IF EXISTS expense_items_tenant_policy ON public.expense_items;
DROP POLICY IF EXISTS expense_attachments_tenant_policy ON public.expense_attachments;
DROP POLICY IF EXISTS fcm_tokens_tenant_policy ON public."FcmToken";
DROP POLICY IF EXISTS line_user_links_tenant_policy ON public.line_user_links;

CREATE POLICY purchase_invoices_tenant_policy
ON public.purchase_invoices
USING (public.app_tenant_access("companyId"))
WITH CHECK (public.app_tenant_access("companyId"));

CREATE POLICY document_intakes_tenant_policy
ON public.document_intakes
USING (public.app_tenant_access("companyId"))
WITH CHECK (public.app_tenant_access("companyId"));

CREATE POLICY expense_vouchers_tenant_policy
ON public.expense_vouchers
USING (public.app_tenant_access("companyId"))
WITH CHECK (public.app_tenant_access("companyId"));

CREATE POLICY petty_cash_tenant_policy
ON public.petty_cash
USING (public.app_tenant_access("companyId"))
WITH CHECK (public.app_tenant_access("companyId"));

CREATE POLICY expense_items_tenant_policy
ON public.expense_items
USING (
  EXISTS (
    SELECT 1 FROM public.expense_vouchers ev
    WHERE ev.id = expense_items."voucherId"
      AND public.app_tenant_access(ev."companyId")
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expense_vouchers ev
    WHERE ev.id = expense_items."voucherId"
      AND public.app_tenant_access(ev."companyId")
  )
);

CREATE POLICY expense_attachments_tenant_policy
ON public.expense_attachments
USING (
  EXISTS (
    SELECT 1 FROM public.expense_items ei
    JOIN public.expense_vouchers ev ON ev.id = ei."voucherId"
    WHERE ei.id = expense_attachments."expenseItemId"
      AND public.app_tenant_access(ev."companyId")
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expense_items ei
    JOIN public.expense_vouchers ev ON ev.id = ei."voucherId"
    WHERE ei.id = expense_attachments."expenseItemId"
      AND public.app_tenant_access(ev."companyId")
  )
);

CREATE POLICY fcm_tokens_tenant_policy
ON public."FcmToken"
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = "FcmToken"."userId"
      AND public.app_tenant_access(u."companyId")
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = "FcmToken"."userId"
      AND public.app_tenant_access(u."companyId")
  )
);

CREATE POLICY line_user_links_tenant_policy
ON public.line_user_links
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = line_user_links."userId"
      AND public.app_tenant_access(u."companyId")
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = line_user_links."userId"
      AND public.app_tenant_access(u."companyId")
  )
);

ALTER TABLE public.purchase_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_intakes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_vouchers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public."FcmToken" FORCE ROW LEVEL SECURITY;
ALTER TABLE public.line_user_links FORCE ROW LEVEL SECURITY;
