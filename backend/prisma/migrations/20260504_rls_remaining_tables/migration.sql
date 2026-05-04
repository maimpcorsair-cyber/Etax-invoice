-- Adds RLS policies for remaining tenant-owned tables:
--   purchase_invoices, document_intakes, expense_vouchers,
--   petty_cash, expense_items, expense_attachments,
--   fcm_tokens, line_user_links
--
-- Keep this migration in backend/prisma/migrations so production deploys use
-- one migration source through `prisma migrate deploy`.

ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_user_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_invoices_tenant_policy ON public.purchase_invoices;
DROP POLICY IF EXISTS document_intakes_tenant_policy ON public.document_intakes;
DROP POLICY IF EXISTS expense_vouchers_tenant_policy ON public.expense_vouchers;
DROP POLICY IF EXISTS petty_cash_tenant_policy ON public.petty_cash;
DROP POLICY IF EXISTS expense_items_tenant_policy ON public.expense_items;
DROP POLICY IF EXISTS expense_attachments_tenant_policy ON public.expense_attachments;
DROP POLICY IF EXISTS fcm_tokens_tenant_policy ON public.fcm_tokens;
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
    WHERE ev.id = expense_items.voucher_id
      AND public.app_tenant_access(ev.company_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expense_vouchers ev
    WHERE ev.id = expense_items.voucher_id
      AND public.app_tenant_access(ev.company_id)
  )
);

CREATE POLICY expense_attachments_tenant_policy
ON public.expense_attachments
USING (
  EXISTS (
    SELECT 1 FROM public.expense_items ei
    JOIN public.expense_vouchers ev ON ev.id = ei.voucher_id
    WHERE ei.id = expense_attachments.expense_item_id
      AND public.app_tenant_access(ev.company_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expense_items ei
    JOIN public.expense_vouchers ev ON ev.id = ei.voucher_id
    WHERE ei.id = expense_attachments.expense_item_id
      AND public.app_tenant_access(ev.company_id)
  )
);

CREATE POLICY fcm_tokens_tenant_policy
ON public.fcm_tokens
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = fcm_tokens.user_id
      AND public.app_tenant_access(u.company_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = fcm_tokens.user_id
      AND public.app_tenant_access(u.company_id)
  )
);

CREATE POLICY line_user_links_tenant_policy
ON public.line_user_links
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = line_user_links.user_id
      AND public.app_tenant_access(u.company_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = line_user_links.user_id
      AND public.app_tenant_access(u.company_id)
  )
);

ALTER TABLE public.purchase_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_intakes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_vouchers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fcm_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE public.line_user_links FORCE ROW LEVEL SECURITY;
