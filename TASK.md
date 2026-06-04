# Current UI Redesign Task

Read `CLAUDE.md`, `DESIGN.md`, `PRODUCT.md`, and `PROJECT_STATE.md` before changing code.

## Goal

Improve the existing Billboy web app UI so it feels like a production-ready Thai B2B finance, invoice, and tax SaaS for SME owners, accountants, and LINE-first operators.

The product should feel:

- serious and trustworthy enough for tax documents
- warm and approachable enough for Thai SME owners
- dense and scannable enough for accountants
- premium without looking like a generic AI template

## Scope

Improve UI/UX in small safe steps, especially:

- dashboard layout and Ledger Banner direction
- sidebar, header, and mobile navigation
- invoice, quotation, receipt, purchase, and expense list pages
- filters, tabs, status badges, tables, empty states, and action buttons
- form pages and review flows
- Drive evidence vault and monthly tax register surfaces
- LINE/AI document intake and purchase-document workflows

## Do Not Change

- backend business logic
- API routes or contracts
- database schema
- authentication and authorization logic
- invoice numbering
- VAT, withholding tax, discount, or total calculations
- PDF, XML, signing, RD submission, or certificate logic
- production env vars or secrets

If a UI change appears to require backend or schema work, stop and explain the smallest required backend change before editing it.

## Design Rules

- Follow `DESIGN.md` as the source of truth.
- Keep Billboy's mascot, soft wallpaper, navy authority, and teal/gold warmth. Do not strip the brand into a cold navy/white admin panel.
- Use the existing Tailwind conventions and reusable components in `frontend/src/components/ui` before adding new UI dependencies.
- Use `lucide-react` icons for recognizable actions.
- Make tables compact but readable.
- Keep status and money states easy to scan.
- Keep primary actions visible and named clearly in Thai/English.
- Do not leak infrastructure words such as tenant, worker, BullMQ, webhook, XAdES, or magic link into owner/customer UI.

## Implementation Workflow

1. Inspect the current project structure and identify the exact pages/components touched.
2. Propose a short plan if the change spans more than one page.
3. Edit in small scoped steps.
4. Preserve all existing data loading, mutation, routing, and permission behavior.
5. Run the relevant checks, at minimum frontend typecheck/build for UI changes.
6. Summarize changed files, what improved, and what remains risky.

## Recommended Page Order

1. Shared app chrome: sidebar, header, mobile nav.
2. Dashboard: Ledger Banner, key metrics, Drive evidence vault, monthly tax register, next actions.
3. Sales documents: invoices, quotations, receipts, recurring invoices.
4. Purchase documents: AI inbox, uploaded slips/bills, matching, VAT purchase register readiness.
5. Customers/vendors/products: dense management screens and clear forms.
6. Responsive pass and polish.

## Quality Bar

The UI is acceptable when:

- a Thai SME owner can tell what to do next within a few seconds
- an accountant can scan document status and money state without opening every record
- upload/intake flows show whether a file is evidence, a bill, a slip, or needs matching
- desktop feels powerful, not decorative
- mobile keeps the main workflow usable
- the result still looks like Billboy, not a copied Linear/Stripe/shadcn template
