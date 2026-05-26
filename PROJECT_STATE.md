# Project State Handoff

Last updated: 2026-05-27 (R2 sync helper added; R2 credentials still pending user)

Short current-state snapshot for Codex, Claude, and other agents. Start from `AI_HANDOFF.md`, then use this file for the latest status. Full historical notes were archived to `docs/state/PROJECT_HISTORY_2026-05.md`.

## Current Deploy Snapshot

Frontend:
- Platform: Vercel
- Project: `etax-invoice`
- URL: `https://etax-invoice.vercel.app`
- Latest production deployment: `dpl_9UjVgJYzAkLuHz7fP1Ft9uuTmUCm` (`https://etax-invoice-264ofvxqh-maimpcorsair-1177s-projects.vercel.app`) aliased to `etax-invoice.vercel.app`.
- Latest checked route: `/app/invoices` returned 200; production `InvoiceList-BryrLTMy.js` contains the new recurring-from-invoice UI (`/from-invoice/`, `Repeat`/`ทำซ้ำ`, modal copy).

Backend:
- Platform: Render
- Service: `etax-invoice-api` (`srv-d7lkqkvavr4c73a0qqh0`)
- Plan: Standard ($25)
- URL: `https://etax-invoice-api.onrender.com`
- Latest live deploy checked: `537166f` via `Deploy to Render` run `26253961989`.
- Health endpoints:
  - `/api/health` — shallow process liveness (express responding)
  - `/api/health/workers` — BullMQ queue stats; 503 if `line-ocr` queue is stuck > 5min
  - `/api/health/pdf` — Puppeteer smoke test (generates a tiny PDF, returns bytes + duration)
  - `/api/health/deep` — pings PG/Redis/OpenAI/Gemini/S3/LINE in parallel, 60s cache; 200/207/503
- Error log since 11:00 UTC: clean (all earlier RLS/P2025 errors resolved by `b6322f6` + `ab3a300`)

Worker:
- Platform: Render
- Service: `etax-invoice-worker` (`srv-d7ogvnbbc2fs738dlm30`)
- Status: healthy, processes `line-ocr` + signing queues

Last CI:
- Push checks for `7ea2eae` green: Typecheck (`26265452309`), Unit tests (`26265452332`), Prod smoke test (`26265452314`).
- Manual `Deploy to Render` run `26253961989` green: backend typecheck, production Prisma migrate deploy, Render deploy, backend health smoke.
- Frontend Vercel production deploy from `frontend/` completed and aliased: `dpl_9UjVgJYzAkLuHz7fP1Ft9uuTmUCm`.

## LINE / OCR pipeline (current)

- OCR provider chain: OpenAI gpt-4o-mini (primary) → Gemini Flash (fallback) → OpenRouter (last resort)
- Hard pipeline timeout: 75s (LINE webhook reply token window guard)
- OpenAI HTTP timeout: 90s, `max_tokens: 8000`, `response_format: json_object`
- JSON post-processing: strips markdown fences + recovers from truncation
- Stuck-intake recovery loop runs every 60s on web dyno (DB-backed scanner, Redis lock per intake)
- Magic-link guest edit page at `/intake-edit/<jwt>` (24h TTL, no login)
  - Backend: `backend/src/routes/intakeEdit.ts`
  - Frontend: `frontend/src/pages/IntakeEdit.tsx`
  - Endpoints: GET intake/file/attachments, PATCH fields, POST confirm/attachments/**slip**
  - **NEW (`d505fc9`+`56f4dad`)**: slip attachment with auto-OCR — user attaches a bank transfer slip to a bill intake, backend runs `ocrBankTransferSlip` and merges payment fields into parent intake's `ocrResult` inside a single transaction; rejects empty OCR results with 422 before any DB writes

## Current Dirty State

- `.claude/settings.local.json` is modified locally and intentionally not committed.
- `.serena/project.yml` is modified locally and intentionally not committed.
- Day 2 Delivery Note shipped in `f174653`: `DeliveryNote` / `DeliveryNoteItem` Prisma models, migration `backend/prisma/migrations/20260522_delivery_notes`, backend `/api/delivery-notes`, and frontend `/app/delivery-notes`.
- Production smoke passed: created `DN-2026-000001`, issued it, marked it delivered, then converted it to draft invoice `DRAFT-202605-112699` (`total=1.07`). A separate diagnostic draft invoice was cancelled after use.
- Convert fix note: `0cde329` wrapped invoice conversion in tenant RLS context; `9d739f4` makes converted invoices use draft numbering until explicitly issued.
- Day 2 polish shipped in `7d2d7ee`: Delivery Note HTML/PDF preview at `GET /api/delivery-notes/:id/preview?format=pdf`, frontend print/download buttons, and `POST /api/delivery-notes/from-quotation/:quotationId`.
- Production polish smoke passed: `DN-2026-000001` preview HTML 200, PDF 200 with `%PDF` signature (`169428` bytes); smoke quotation `QT-2026-000001` converted to draft delivery note `DN-2026-000002`.
- Day 3 Recurring invoice shipped in `537166f`: Prisma models/migration `20260522_recurring_invoices`, backend `/api/recurring-invoices`, daily BullMQ worker `recurring-invoices`, and frontend `/app/recurring-invoices`.
- Production recurring smoke passed: created smoke template `cmpg09kej0008gasdo2r1ckgi`, generated draft invoice `DRAFT-202605-MPG09L7ECKGI` (`total=1.07`, invoice `cmpg09l7p000jgasdwa4qmxzy`), verified listing, then cancelled both the smoke recurring template and smoke draft invoice.
- Day 3 polish shipped in `7ea2eae`: Invoice List now has "ทำซ้ำ"/"Repeat" actions that open a responsive modal and create a recurring schedule from the selected invoice via `POST /api/recurring-invoices/from-invoice/:invoiceId`.
- Production recurring-from-invoice smoke passed: source invoice `DRAFT-202605-112699` (`cmpfxwo3o000713bqu0docq7s`) created recurring schedule `cmpgbl8bf00a4gasdo8yyb8wg`, then cancelled the smoke schedule immediately.
- Codex Day 2/3 review fixes shipped in `e4a1c90`: Quotation line discountAmount switched from FLAT baht to PERCENT (matches Invoice + RecurringInvoice), and DRAFT- invoice numbers in recurringInvoiceService + deliveryNotes convert flow now use `generateInvoiceNumber()` advisory-locked sequence (was Date.now() based — would collide on [companyId, invoiceNumber] under concurrent generation).
- Day 4 Customer Portal shipped in `16eb4ba`: magic-link buyer portal at `/portal`. `services/customerPortalToken.ts` (JWT, audience 'customer-portal', 14d TTL), `routes/customerPortal.ts` (request-link / me / documents / invoices/:id / invoices/:id/pdf / quotations/:id / delivery-notes/:id), `sendCustomerPortalLinkEmail` consolidates multi-tenant matches into one email, frontend `/portal` Landing + Verify + Dashboard pages.
- Day 5 Inventory tracking shipped in `345e75f`: opt-in `Product.trackInventory` + `currentStock` + `reorderPoint`; new `StockMovement` ledger table (sale / purchase / adjustment_in / adjustment_out / opening_balance) with refType/refId back-pointer. `services/inventoryService.ts` provides tx-aware `moveStock`, `applyInvoiceStockMovements` (auto-decrement on issuing T01/T02/T03), `reverseStockMovementsFor` (auto-revert on cancel), plus `adjustStock` + `setOpeningBalance` for manual operations. Backend routes: `POST /api/products/:id/stock/adjust`, `POST /api/products/:id/stock/opening-balance`, `GET /api/products/:id/stock-movements`, `GET /api/products/low-stock`. Frontend `Products.tsx` gained inventory section in product modal, stock column with reorder badge, and per-row adjust dialog.
- Migration `20260522_inventory` applied to production via `Manual Prisma DB Migration` workflow (run `26291916334`, 33s, all steps green). Schema now live: `products.track_inventory` / `current_stock` / `reorder_point` columns + `stock_movements` table + `StockMovementType` enum.
- Next best action: enable inventory on one or two real products in production, issue a tax invoice referencing them, and verify `current_stock` decrements + the matching `stock_movements` ledger row exists.
- LINE system redesign L1-L4 shipped (2026-05-25). See `docs/state/line-system-redesign.md` for the full plan + red-team + steel-man.
  - **L1** (`0474aeb`): card UX cleanup — renamed "⏭ ข้ามไปก่อน" → "💾 บันทึกไว้ก่อน (จับคู่ทีหลังในเว็บ)"; added explicit "💾 บันทึกเป็นค่าใช้จ่ายทั่วไป" path with `save_as_expense:<intakeId>` postback handler; rephrased slip-options bubble from "สลิปนี้คู่กับบิลไหน?" to "จัดการสลิปนี้ยังไง?".
  - **L2** (`11fdec0`): new `services/ocrValidation.ts` runs deterministic regex/heuristic repair AFTER OCR returns. Rules: bank_transfer without bank signal → expense_receipt; 2+ restaurant signals → expense_receipt + meals + supplier backfill from header; tax_invoice without header+taxId → receipt. Every repair surfaced as `auto-repair: <orig>→<repaired>:<reason>` in `validationWarnings`.
  - **L3** (`d5e1ad1`): decision oracle `shouldEscalateAfterValidation()` logs when premium-tier OCR retry (gpt-4o / Gemini Pro) would help. Actual retry gated behind `OCR_PREMIUM_ESCALATION_ENABLED=true` env (default off) so we measure escalation rate before spending. Env `OPENAI_OCR_PREMIUM_MODEL=gpt-4o` reserved.
  - **L4** (this commit): partial. Added `transactionDate?: Date` to `DriveUploadOptions` + helper `getTransactionMonthBucket(date)` returning "YYYY/MM". Folder-structure migration deferred until R2/SMTP envs are set on Render (otherwise the dual-write that already shipped at `7788001` returns 503 on every upload anyway).
- Pending env config on Render (`etax-invoice-api` + `etax-invoice-worker`) before further storage work: `S3_BUCKET` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (or Cloudflare R2 equivalents) + `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS`.
- LINE gap-audit fixes shipped 2026-05-25 (`2690683`):
  - LINE push budget tracking: Redis counter `line:push_count:YYYY-MM` increments on every successful push; WARN at 80% of 500/mo free tier, ERROR at 100%. Exposed at `GET /api/health/line-budget`.
  - Duplicate-slip warning UX: dup-slip Flex card now renders `status='pending'` (with "✅ บันทึก" button) instead of `'unmatched'` (which had no save button despite the text instructing to tap it).
  - Confirmed: `paymentMatchingService.scoreCandidate`/`scorePurchaseCandidate` already factor supplier-name similarity into the 100-point match score (max 30). RT-8 concern from the plan was incorrect.
- LINE invoice share via magic link shipped (`cf15fd3` + fixes `205dd4d` `51a5ec1` `9c6172e`):
  - `/share/invoice/<token>` public viewer page (no login, 30-day TTL)
  - "ส่ง LINE" button on InvoiceList opens a modal with Copy link + Open-LINE-share-dialog buttons + clear 3-step instructions
  - PromptPay QR rendered on the viewer when invoice is unpaid and seller has PromptPay configured
  - useAuthBootstrap guards public token routes from the apex-domain auto-redirect (logged-in sellers can open their own share links without being bounced to /app/dashboard)
- LINE redesign L1-L4 + tests shipped 2026-05-25: see `docs/state/line-system-redesign.md` (plan + red-team + steel-man).
- SMTP env vars set on Render `etax-invoice-api` 2026-05-26 (user did Part B of the R2/SMTP setup guide):
  - `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=587`, `SMTP_USER=resend`, `SMTP_PASS=re_...`, `SMTP_SECURE=false`
  - Customer Portal magic link, free-signup welcome email, customer invite, and password reset are now functional.
  - R2/S3 storage envs still NOT set — file uploads still 503. User has the step-by-step instructions but hasn't done Part A yet.
- R2 compatibility patch shipped locally in `69055a2`: `storageService` no longer sends `ServerSideEncryption: AES256` when `S3_ENDPOINT` is configured, because Cloudflare R2 rejects the standard `x-amz-server-side-encryption` header on `PutObject`. AWS S3 still defaults to AES256. Setup runbook added at `docs/deployment/r2-render-setup.md`.
- Codex/Claude tool parity hardened 2026-05-27: `.agents/skills/` and `.claude/skills/` now both contain 59 skills; `.codex/commands/` mirrors the 11 `.claude/commands/`; `.codex/TOOLS.md` exists; `docs/agents/tool-parity.md` is the canonical checklist for skills, commands, MCP, CLI, and known runtime differences.
- Winning Flow Sprint defined 2026-05-27: `docs/state/winning-flow-sprint.md` now sets the competitor-winning product loop against FlowAccount/PEAK/Paypers, and `.impeccable.md` was expanded so Codex/Claude frontend work optimizes for "photo/chat/invoice -> paid or tax-ready record in under 3 minutes." Next implementation target: First Invoice Winning Path (dashboard next action + invoice post-create share/pay flow), after or in parallel with R2 setup.
- Frontend lint debt cleared 2026-05-27: `npm run lint`, `npm run typecheck`, and `npm run build` pass from `frontend/`; stale Chinese fallback strings were removed from the remaining React pages, and `frontend/src` now has no Han-script matches.
- R2 setup status 2026-05-27: production `/api/health/deep` still reports `notConfigured:["s3"]`. Local shell and GitHub repo secrets do not contain R2 values yet. Added `npm run render:r2` (`scripts/render-sync-r2-env.mjs`) to sync `S3_BUCKET`, `S3_REGION=auto`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` to both Render services without printing secret values, then trigger deploys.

## Session handoff (2026-05-26) — what Codex/next-session should pick up

User is switching to Codex to continue. Pending work, ranked by impact:

1. **R2 setup (15 min)** — unblock all file upload endpoints (customer evidence, expense attachment, LINE-OCR slip persistence, Master sheet Drive Link). Step-by-step runbook now lives in `docs/deployment/r2-render-setup.md`. Cloudflare R2 free tier 10GB. Envs needed on both `etax-invoice-api` and `etax-invoice-worker`: `S3_BUCKET`, `S3_REGION=auto`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. After: verify with `curl /api/health/deep` — `notConfigured` should no longer include `s3`.

2. **Drive folder migration (deferred until R2)** — `getTransactionMonthBucket()` helper already exists ([googleDriveService.ts](backend/src/services/googleDriveService.ts)). Need to wire `transactionDate` into `ensureProjectFolder` so YYYY/MM bucket is created based on `invoiceDate` not `createdAt`. Skipped this session because changing folder structure before R2 is the canonical storage doesn't help.

3. **Acquire first paying customer** — Owner Plane shows 5-7 real PromptPay pending signups (`PP-5O8XOKUC`, `PP-2Z042BS4`, `PP-25N6YV20`, `PP-125ZUQ7C`, `PP-NYYJFDUY`) and 4 Stripe pending (`cs_test_*`) totaling ~฿6,930 of stuck revenue. User explicitly said these are "เพื่อนทดสอบ" (friends testing) so don't auto-approve, but they prove the signup flow works end-to-end.

4. **PromptPay auto-verify via Stripe** — current PromptPay flow requires manual "Mark paid and activate tenant" tap by owner from `/ops/overview`. Stripe PromptPay (`stripe_promptpay`) channel already exists in `billing.ts:162` and has webhook auto-confirm. Move the marketing signup flow to that channel and drop the manual approval path.

5. **Real OCR sample corpus** — synthetic test fixtures landed in `backend/src/services/ocrValidation.test.ts`. Real images (61 Bistro receipt, KBank slip, Lazada tax invoice, etc.) belong in a `backend/samples/` folder + a runner that calls the OCR pipeline and asserts classification against expected. Foundation for measuring accuracy over time.

6. **AskBillboy AI chat audit** — never audited this session. The /api/ai-chat route is the chat interface inside the web app. Quality depends on prompt + context. Spot-check by asking 5 representative questions.

7. **OTP linking flow audit** — never audited. Web signup → admin sends invite → user enters OTP → LINE bot links to companyId. Read `backend/src/routes/line.ts` OTP handlers + `lineUserLink` schema.

Recent commit log this session (newest first):
- `2690683` LINE gap fixes (push budget + dup-slip status + supplier-similarity confirmation)
- `a77cb27` 12 regression tests for ocrValidation
- `5bd2815` L4: transactionDate option + bucket helper
- `d5e1ad1` L3: escalation decision oracle (log-only)
- `11fdec0` L2: post-OCR classification repair pass
- `0474aeb` L1: slip card UX + save_as_expense path
- `e06bbae` OCR prompt trim (fix 75s timeout)
- `8797ac0` OCR restaurant receipt classifier fix
- `9c6172e` share-link auth-bootstrap guard + LINE modal fallback
- `51a5ec1` share-link modal with Copy + Open-LINE
- `205dd4d` share-link Origin header fix (localhost bug)
- `cf15fd3` invoice share via LINE magic link (new feat)
- `867340a` UX audit pass — dev jargon + nav label cleanup
- `3fdb0d5` remove Chinese language entirely
- `badad3e` ProjectDetail layout fix (compact file list + 3-col grid)
- `2e111e0` hide Owner Plane/super_admin from customer surfaces
- `02dfaf9` drop Owner Login pill from customer login header
- `b2c370e` Day 5 Inventory prod migration applied

## Sentry verification status (verified 2026-05-19)

- Commits `e34dc2c` (verifier endpoint + retention purge) and `04cae0e` (trim DSN/env defensively) shipped.
- Active Sentry project: `etax-invoice-web`, org `billboyth`, org id `4511412824571904`, project id `4511412901052416` (NOT `4511412893974528` referenced in `04cae0e` commit message — that was an older project that the user replaced).
- Backend (Render `etax-invoice-api` + `etax-invoice-worker`): env vars `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`, `SENTRY_VERIFY_TOKEN` set. `GET /api/health/sentry-test?token=...` returns `{status:"sent", dsnConfigured:true, eventId:...}` and the event appears in the Sentry dashboard. Verified end-to-end.
- Frontend (Vercel `etax-invoice`): `VITE_SENTRY_DSN` updated to match Render DSN. Bundle `index-DJVy9dZB.js` (deployed 2026-05-18 22:29 UTC) contains the correct DSN. Verified via Playwright: triggered an unhandled error and observed `POST https://o4511412824571904.ingest.us.sentry.io/api/4511412901052416/envelope/ → 200`. Note: in Sentry SDK v10, `window.__SENTRY__` shows only `{version}` even when init succeeded — the legacy `hub` key was removed; do not use it as a probe.

## Signup E2E verification (2026-05-19)

- `POST /api/billing/free-signup` end-to-end against production: HTTP 201, returns `{companyId, userId, plan:"free", status:"activated"}`. Test data persisted: company `cmpbs60bx000f14m3pyqzm0ko` / user `cmpbs60c1000h14m3yue8hql0`, email `e2e-1779143605@billboy-test.local`, taxId `0001779143605`.
- DB persistence proven via duplicate-signup probe: re-POST same email → 409 `"This admin email is already registered"`, re-POST same taxId → 409 `"This tax ID is already registered"`.
- Commit `840c755` UX fixes verified on production via Playwright:
  - Fix #1 ✅ Thai company-name field preserves English: typed `บริษัท K&K Logistics จำกัด` retained both scripts (was stripping Latin pre-fix).
  - Fix #2 ✅ DBD auto-fill on 13-digit tax ID: frontend auto-fires `GET /api/billing/signup/lookup-juristic?taxId=...` → 200. Endpoint also rejects malformed taxIds with 400 `"Tax ID must be 13 digits"`. Cache is empty for unknown taxIds (returns `{data:null}`).
  - Fix #3 ✅ Manual email/name fields hidden when Google sign-in enabled: signup form shows only 4 inputs (companyNameTh, companyNameEn, taxId, phone, addressTh visible as fields; no adminEmail/adminName) — Google iframe present.
  - Fix #4 (navbar avatar) not tested — requires real Google login.
- Production DB now has >0 users for the first time. Item #1 in CLAUDE.md "สิ่งที่ยังต้องทำ" (Signup/Onboarding E2E test) can be marked done.
- Note: response field `loginMethod: "google"` was hardcoded even for manual signup (`billing.ts:888`) — fixed in commit `8f8f7c8` so it reads `'google'` or `'none'` based on actual binding, and `nextStep` no longer mis-instructs manual-path users.

## Cert multi-tenancy fix shipped 2026-05-19

Commit `bdff724` closed the P0 multi-tenant leak in the cert upload path. What changed:

- `companies` table gained `certificateBlob` (BYTEA) + `certificateUploadedAt`. The .p12 now lives per-row in DB, not on the web service's ephemeral disk. Migration `20260519_company_cert_blob` applied via the `Manual Prisma DB Migration` workflow (run `26074078407`, 31s, all steps green).
- `signatureService.ts` cache became `Map<cacheKey, …>` (was a single global slot). Every signing call site — `routes/admin.ts` GET/POST/`/signing-test`, `routes/system.ts`, `queues/workers/rdSubmitWorker.ts` — now passes `cacheKey: companyId` so per-company entries don't evict each other.
- `routes/admin.ts` POST `/certificate` writes the blob + encrypted password to DB and nulls out the legacy `certificatePath`. The previous FS-write to `certs/company.p12` is gone entirely. Size-validates the payload (~5KB expected, capped at 1MB).
- `companyConfigService.resolveCompanyRuntimeConfig` now surfaces `certBlob` alongside the legacy `certPath` fallback (dev `process.env.CERT_PATH` still works for local).
- `routes/system.ts` company-detail endpoint distinguishes "configured" (real uploaded blob) from "isDev" (still using the dev cert).

Why DB BYTEA over S3 (the obvious alternative): cert files are ~5KB each, atomic with the encrypted password row, Render Postgres backups cover them for free, and both web + worker services already share that DB. S3 added a network hop, a moving part, and IAM overhead with no payoff at this size.

Verified: typecheck clean, migration applied successfully on production. Functional verification (upload a real .p12 via Admin Panel → `/signing-test`) still depends on a real production admin login.

## PDPA launch-readiness landed 2026-05-19 (commit `c40dbbf`)

Six-piece bundle aimed at unblocking the first paying customer. All items
typecheck clean (`backend && frontend` `tsc --noEmit`). Two new migrations
not yet applied to production:

- `20260519_user_pdpa_consent` — `users.legalAcceptedAt` + version + `marketingOptInAt` (PDPA Section 19 consent capture at signup).
- `20260519_company_deletion_request` — `companies.deletionRequestedAt` / `hardDeleteScheduledAt` / `deletionRequestedBy` (Section 33 right-to-erasure with grace + tax-record retention).

Code changes:
- `services/companyConfigService.ts` — `encryptBlob` / `decryptBlob` (AES-256-GCM, 8-byte magic header) wrap the cert .p12 BYTEA. Legacy plain rows still decrypt transparently. Upload path in `routes/admin.ts` POST `/certificate` now encrypts before write.
- `routes/account.ts` (new) — `GET /export` returns JSON dump (user/company/invoices/customers/products/auditLog, BigInt-safe); `POST /delete` requires password re-auth (or typed `confirm: "DELETE"` for Google-only accounts); `POST /delete/cancel` within 30d grace.
- `routes/billing.ts` `/free-signup` — refuses signup without `acceptedLegal` and records `acceptedLegalVersion` (pinned `2026-05-19`).
- Legal i18n in TH+EN+ZH expanded to PDPA coverage: Privacy 12 sections (Sections 24, 26, 28, 30–37, 73), ToS 14 sections (SLA 99.5%, liability cap = 12-month fees), DPA 11 sections (Controller/Processor split, 48h breach notice, 90d return-or-delete on termination). `frontend/src/pages/DataProcessingAgreement.tsx` + `/legal/dpa` route added.
- Signup form `Landing.tsx`: consent checkbox (Terms + Privacy + DPA bundle) is required, marketing opt-in is separate. `signup.consent.*` keys in all 3 locales.

To finish on production:
1. Run the `Manual Prisma DB Migration` GitHub Action to apply both new migrations.
2. (When a real cert exists in DB) — admins should re-upload to convert legacy plain-blob row to encrypted form. New uploads encrypt automatically.

## Latest Completed Changes

- Day 3 Recurring invoice is live: create/edit recurring invoice templates, generate draft invoices manually, daily worker creates due drafts, and create recurring schedules from existing invoices via Invoice List.
- Delivery Note Day 2 polish is live: printable/downloadable PDF, Quotation -> Delivery Note handoff, backend Render deploy verified, frontend Vercel alias verified.
- Invoice builder UX: `/app/invoices/new` now uses a framed form/preview workspace, removes nested desktop form scroll, keeps section chips sticky, and makes the preview pane sticky on desktop.
- DBD/RD/MOC autofill: Thai address selection prefers the most complete official address and preserves postcode; English address is official/user-verified only, not romanized from Thai.
- Product catalog: products/services support type, category, account code, unit cost, default WHT, and sync into the company Google Sheet tab `สินค้าและบริการ`.
- Customer evidence/Drive/Sheet: `รายชื่อ` supports customer/vendor evidence metadata, Drive folders, compact checklist, and company month-end `รายชื่อและเอกสาร` sheet tab.
- Customer credit terms: optional `creditLimit` and `creditDays` are stored and invoice due date auto-fills from `creditDays` when empty.

## Next Best Actions

- Execute the Winning Flow Sprint starting with `docs/state/winning-flow-sprint.md`: R2 setup verification, then First Invoice Winning Path, Customer Pay Flow, LINE OCR Review Flow, PromptPay auto-verify, and real OCR sample corpus.
- If more invoice-builder UX work continues, verify desktop at `/app/invoices/new` after choosing buyer and adding at least one product item.
- If touching backend/worker, run backend typecheck/build and verify Render with `npm run render:status`.
- If touching frontend UX only, run frontend typecheck, touched-file lint, build, push, then verify the Vercel bundle.
- If changing production/deploy/database/LINE/OCR/Drive state, update this file briefly and archive long detail elsewhere.
- Keep `PROJECT_STATE.md` short; add older or verbose notes to `docs/state/PROJECT_HISTORY_2026-05.md` or a topic-specific doc.

## Fast Verification

```bash
gh run list --branch main --limit 8
curl -fsS https://etax-invoice-api.onrender.com/api/health
curl -I https://etax-invoice.vercel.app/app/invoices/new
npm run render:status -- --target all --commit HEAD
git status --short
```

## Handoff Docs

- Current state: `PROJECT_STATE.md`
- Agent entrypoint: `AI_HANDOFF.md`
- Full May 2026 state history: `docs/state/PROJECT_HISTORY_2026-05.md`
- Local run guide: `LOCAL_DEPLOYMENT.md`
- Durable project rules: `AGENTS.md` and `CLAUDE.md`

## Update Rule

- Update this file only when durable state changes: production/deploy status, schema/database state, CLI/tooling status, LINE/OCR/Drive behavior, important risks, or next verification steps.
- Keep entries factual and short. Prefer exact URL, commit, run id, status, and command.
- Do not paste secrets, tokens, certificate contents, `.env` values, local auth state, or long logs.
