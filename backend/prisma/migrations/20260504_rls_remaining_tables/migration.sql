-- Add RLS policies for remaining tables
-- Tables covered: purchase_invoices, document_intakes, expense_vouchers,
-- petty_cash, expense_items, expense_attachments, fcm_tokens, line_user_links

-- Enable RLS
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_user_links ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policies
CREATE POLICY purchase_invoices_tenant_policy ON public.purchase_invoices
  FOR ALL USING (company_id = current_setting('app.current_company_id', true)::text);

CREATE POLICY document_intakes_tenant_policy ON public.document_intakes
  FOR ALL USING (company_id = current_setting('app.current_company_id', true)::text);

CREATE POLICY expense_vouchers_tenant_policy ON public.expense_vouchers
  FOR ALL USING (company_id = current_setting('app.current_company_id', true)::text);

CREATE POLICY petty_cash_tenant_policy ON public.petty_cash
  FOR ALL USING (company_id = current_setting('app.current_company_id', true)::text);

-- Indirect relations (through parent table)
CREATE POLICY expense_items_tenant_policy ON public.expense_items
  FOR ALL USING (
    voucher_id IN (
      SELECT id FROM public.expense_vouchers
      WHERE company_id = current_setting('app.current_company_id', true)::text
    )
  );

CREATE POLICY expense_attachments_tenant_policy ON public.expense_attachments
  FOR ALL USING (
    expense_item_id IN (
      SELECT ei.id FROM public.expense_items ei
      JOIN public.expense_vouchers ev ON ei.voucher_id = ev.id
      WHERE ev.company_id = current_setting('app.current_company_id', true)::text
    )
  );

CREATE POLICY fcm_tokens_tenant_policy ON public.fcm_tokens
  FOR ALL USING (
    user_id IN (
      SELECT id FROM public.users
      WHERE company_id = current_setting('app.current_company_id', true)::text
    )
  );

CREATE POLICY line_user_links_tenant_policy ON public.line_user_links
  FOR ALL USING (
    user_id IN (
      SELECT id FROM public.users
      WHERE company_id = current_setting('app.current_company_id', true)::text
    )
  );

-- Force RLS for superuser sessions
ALTER TABLE public.purchase_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_intakes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_vouchers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fcm_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE public.line_user_links FORCE ROW LEVEL SECURITY;