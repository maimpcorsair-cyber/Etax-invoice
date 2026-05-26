# Winning Flow Sprint

Last updated: 2026-05-27

Purpose: align Codex, Claude, and product work around the flows that can make Billboy beat FlowAccount, PEAK, and Paypers for Thai SMEs.

## Product Thesis

Billboy should win by owning the shortest path from real business documents to paid, tax-ready records.

FlowAccount and PEAK are broad accounting suites. Paypers is strong around AI/OCR convenience. Billboy's best wedge is the combination of:

- LINE-first document intake
- OCR repair and review
- Invoice, delivery note, recurring invoice, and inventory workflow
- Customer-facing invoice/share/payment link
- Thai e-Tax/RD capability for businesses that need it
- PDPA and audit readiness

The winning promise is:

> From photo, chat, or invoice to paid/tax-ready record in under 3 minutes.

## Main Customer Loop

1. Owner or admin captures a document in LINE or the web.
2. Billboy classifies it and extracts fields.
3. User reviews only uncertain fields.
4. System saves it as invoice, purchase invoice, expense, payment slip, or delivery evidence.
5. Customer gets a clean link with PDF, amount, due date, and PromptPay/payment path.
6. Owner dashboard shows what is paid, unpaid, missing, and safe for tax.

This loop matters more than adding another isolated module.

## Competitor Positioning

| Competitor | Strength | Do not fight directly | Billboy should win by |
|---|---|---|---|
| FlowAccount | trusted broad SME accounting suite | full accounting feature count | faster document-to-invoice/payment loop |
| PEAK | accounting depth and finance operations | complete ERP/accounting parity today | LINE intake + simpler owner decisions |
| Paypers | AI/OCR convenience | OCR-only race | OCR plus invoice, payment, portal, tax record |

## P0 Execution Order

### 1. Unblock Storage

R2/S3 env is still the biggest operational blocker. File uploads, evidence, LINE slip persistence, and Drive migration work remain fragile until storage is configured.

Done when:

- `S3_BUCKET`, `S3_REGION=auto`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` are set on both Render services.
- `GET /api/health/deep` no longer lists `s3` under `notConfigured`.
- A real file upload survives refresh and can be opened again.

Reference: `docs/deployment/r2-render-setup.md`.

### 2. First Invoice Winning Path

Goal: a new SME can create and send the first invoice without understanding the whole app.

Build/verify:

- Dashboard next-action panel for new users: create invoice, add customer, send link.
- Invoice builder default path that can work with a new customer and one product line.
- After invoice creation, immediately show primary actions: share by LINE, copy link, download PDF, mark paid.
- Keep advanced e-Tax/RD settings behind progressive disclosure.

Definition of done:

- New user can create and share an invoice in under 3 minutes.
- Mobile and desktop both expose the same primary action.
- No customer-facing or owner-facing copy says backend, endpoint, tenant, XAdES, BullMQ, webhook, or magic link.

### 3. Customer Pay Flow

Goal: the customer link should feel safe and obvious without requiring login.

Build/verify:

- Public invoice view prioritizes seller, buyer, amount, due date, status, PDF, PromptPay/payment action.
- PromptPay QR and payment instructions are visible for unpaid invoices.
- Paid/overdue/cancelled states are obvious.
- Customer portal repeats the same mental model instead of acting like a mini admin app.

Definition of done:

- Customer can open link on mobile, understand the amount, and know how to pay in under 10 seconds.
- Seller can see share/payment status from invoice list without opening multiple screens.

### 4. LINE OCR Review Flow

Goal: LINE is the fastest entry point, not a notification sidecar.

Build/verify:

- Receipt/bill/slip cards use plain choices: save expense, match invoice, attach slip, review fields.
- OCR uncertainty is shown as "needs review" instead of technical confidence language.
- Review link opens a mobile-first page with the same decision already selected when possible.
- Duplicate slip warnings always include a working save/match next step.

Definition of done:

- Linked LINE user can send a receipt and save it in 30 seconds after OCR finishes.
- Linked LINE user can send a bank slip and match it to a likely invoice without visiting a desktop admin screen.

### 5. PromptPay Auto-Verify

Goal: remove manual owner approval from paid signup/payment flows where Stripe can confirm payment.

Build/verify:

- Marketing paid signup uses Stripe PromptPay channel where possible.
- Webhook activates plan only after confirmed payment.
- Manual approval remains only as an owner/admin fallback with clear labeling.

Definition of done:

- A paid PromptPay signup can move from checkout to active tenant without owner intervention.
- Fraud risk stays lower than the current manual QR path.

## UX Debt To Fix While Shipping

- Landing page should lead with the core SME loop, not a feature wall.
- Dashboard must answer "what should I do now?".
- Navigation should group by workflow: sell, buy, documents, customers/products, reports/settings.
- Customer-facing pages must stay lighter than internal pages.
- Owner/admin/debug concepts must not leak to normal users.
- Tables need strong empty states and visible primary actions.

## Two-Week Sprint Shape

| Day | Focus | Output |
|---|---|---|
| 0 | R2 setup verification | storage health green, upload smoke passes |
| 1 | First invoice path audit | identify exact screens, dead ends, missing CTAs |
| 2 | First invoice path implementation | dashboard next action + post-create share actions |
| 3 | Customer pay/share polish | mobile public link and invoice list status pass |
| 4 | LINE OCR mobile review polish | save/match/review decisions tightened |
| 5 | PromptPay auto-verify plan or implementation | webhook-confirmed paid signup path |
| 6 | Real OCR sample corpus | repeatable accuracy checks for real receipts/slips |
| 7 | End-to-end smoke | new user -> invoice -> customer link -> paid/status proof |

## What To Build Next

Start with First Invoice Winning Path after R2 is configured or in parallel if storage is still waiting on external setup.

Recommended implementation order:

1. Audit `Dashboard`, `InvoiceBuilder`, `InvoiceList`, public share invoice view, and portal mobile screenshots.
2. Add a dashboard next-action panel for new/low-activity companies.
3. Make invoice creation end in a success/share state, not only a return to list.
4. Verify with Playwright on desktop and mobile.
5. Record proof in `PROJECT_STATE.md`.

## Measurement

Track these manually until analytics exists:

- Time to first invoice shared.
- Time from LINE upload to saved accounting record.
- Customer link open-to-payment clarity on mobile.
- Number of fields corrected after OCR.
- Number of unpaid invoices with no next action.

If a feature does not improve at least one of these, it is probably not the next thing to build.
