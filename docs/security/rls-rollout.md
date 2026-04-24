# RLS Rollout Plan

## Goal

Move tenant isolation from app-only enforcement to PostgreSQL-enforced row-level security without breaking the existing multi-tenant flows.

## Current state

As of April 24, 2026:

- App-level tenant isolation exists and is covered by integration tests.
- Owner control plane is separated into `/ops/*` and `/api/system/*`.
- Tenant tables now have active PostgreSQL RLS enforcement with `FORCE ROW LEVEL SECURITY`.
- Foundation helpers were added in `database/migrations/006_rls_foundation.sql`.
- First live policy activation is in `database/migrations/007_rls_customers.sql`.
- Additional Phase 1 activation is in `database/migrations/008_rls_products_templates.sql`.
- Core transactional activation is in `database/migrations/009_rls_core_transactions.sql`.
- Final hardening is in `database/migrations/010_force_rls_tenant_tables.sql`.
- Subscription isolation is in `database/migrations/011_rls_company_subscriptions.sql`.

## Session contract

When RLS is enabled, the application should set these PostgreSQL session variables inside the request transaction:

- `app.current_company_id`
- `app.current_user_id`
- `app.current_role`
- `app.system_mode`

Backend helper:

- `backend/src/config/rls.ts`

## Recommended activation order

### Phase 1: Low-risk company-owned tables

Enable RLS first for tables that already carry `companyId` directly and are already consistently scoped in application code:

1. `customers` - active as of April 24, 2026
2. `products` - active as of April 24, 2026
3. `document_templates` - active as of April 24, 2026
4. `audit_logs` - active as of April 24, 2026

Policy shape:

```sql
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_tenant_policy
ON public.customers
USING (public.app_tenant_access("companyId"))
WITH CHECK (public.app_tenant_access("companyId"));
```

### Phase 2: Core transactional tables

After request-level transaction scoping is in place:

1. `users` - active as of April 24, 2026
2. `company_subscriptions` - active as of April 24, 2026
3. `invoices` - active as of April 24, 2026

### Phase 3: Relation-owned tables

Use parent-row helpers:

1. `payments` via `public.app_invoice_access("invoiceId")` - active as of April 24, 2026
2. `invoice_items` via `public.app_invoice_access("invoiceId")` - active as of April 24, 2026

## Owner access model

`super_admin` should not bypass RLS silently. Instead:

- normal tenant app mode sets `app.system_mode = 'off'`
- owner-plane requests set `app.system_mode = 'on'` only in explicitly approved endpoints
- every owner cross-tenant action should be audit-logged

## Rollout safety checks

Before enabling any table:

1. add or update integration tests
2. migrate the target route(s) to `withRlsContext(...)`
3. verify tenant user still sees own records
4. verify cross-tenant access returns empty/404
5. verify owner-plane access still works where intended

## Current enforcement

These tables now run with both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`:

- `customers`
- `products`
- `document_templates`
- `audit_logs`
- `users`
- `invoices`
- `payments`
- `invoice_items`
- `company_subscriptions`

Request paths now use request-scoped RLS context, and background jobs use explicit system-mode RLS context.
