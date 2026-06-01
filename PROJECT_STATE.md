# Project State Handoff

Last updated: 2026-06-01 (frontend UI polish + DeleteButton shipped)

## Latest work (2026-06-01)

Frontend UI polish — shipped to production via Vercel (main `6e272dd`):
- **App-wide brand consistency (`#3`, 41f1376):** swept off-brand `indigo-*` → `primary-*` (navy) across 24 files (~160 occurrences; indigo isn't in the palette). Removed 3 banned `border-l-4` side-stripes in VatSummary. Dashboard a11y/contrast: `text-gray-400`→`text-gray-500`, `focus-visible` rings on command/first-invoice cards, e-Tax banner indigo→navy. Token-only, no layout/logic change. Detector on `src/pages` 23→17 (real slop — `ai-color-palette` + 3 `side-tab` — gone; remainder are gray-on-color ternary false-positives + 1 informational single-font).
- **`<DeleteButton/>` component (`#4`, 6e272dd):** reusable on-brand animated delete (trash-lid-lift hover, danger-red, focus ring, aria-label, prefers-reduced-motion, ghost/solid + sm/md). Replaced 4 ad-hoc `Trash2` buttons in ItemsTable, QuotationBuilder (items+milestones), DeliveryNoteBuilder, RecurringInvoiceBuilder.
- **Design docs:** added `PRODUCT.md` + `DESIGN.md` (Stitch format) as canonical; `.impeccable.md` reduced to a pointer; CLAUDE.md design-context records the **keep mascot + soft wallpaper, never strip for minimal** rule (an austere navy redesign was rejected and reverted).
- **Verification:** typecheck + unit-tests + build green on both PRs; components rendered in isolation. Vercel Production deploy `6e272dd` `state=success`, `etax-invoice.vercel.app` HTTP 200. Note: the live, logged-in pages were not visually QA'd from here (local DB down + Vercel preview SSO) — changes are token-only/additive and low-risk; revert is a `git revert` away.

## Earlier work (2026-06-01)

PDF A4 width + Thai wrapping polish — shipped and verified live on prod (`7bdd689`):
- **More usable A4 width:** standard PDFs now use `6mm` left/right Puppeteer margins instead of `10mm`, align the printed page footer to the same edge, and remove redundant inner horizontal padding. The print frame consumes the available width rather than subtracting the old margin a second time.
- **Stable document metadata:** the right-side metadata column is wider and emphasized document numbers stay on one line, so values such as `QT-2026-000010` no longer wrap after the year.
- **Thai amount-in-words heading:** the `จำนวนเงินเป็นตัวอักษร` label no longer inherits uppercase label letter-spacing and is kept intact on one line.
- **Verification:** backend typecheck, backend lint, backend unit tests (`109/109`), focused PDF tests (`18/18`), and `git diff --check` pass. A rendered 11-line quotation visually confirmed exactly two pages with the quotation number unbroken on page `1/2`, wider A4 content, aligned footer, and intact amount-in-words heading on page `2/2`. GitHub Typecheck + Unit tests + Prod smoke green for `7bdd689`; Render deploy run `26751515656` green. Post-deploy checks: `/api/health` 200, `/api/health/deep` status ok with `notConfigured=[]`, and `/api/health/pdf` 200.

PDF mixed-VAT summary + controlled tax pagination — shipped and verified live on prod (`8b5088d`):
- **Accurate compact VAT summary:** single-rate documents stay concise. Mixed `VAT 7% / VAT 0% / exempt` documents show their tax bases only in the totals card below the table; per-line rows remain compact and pre-VAT only.
- **T01/T02 multi-page accounting layout:** tax invoices with more than eight items now use controlled pages. Every page repeats the document number/date plus seller and buyer legal details; intermediate pages show `มีหน้าต่อไป`; totals, acknowledgements, and signatures render once after the final item page. Quotations keep the existing lighter pagination flow.
- **Verification:** backend typecheck, backend lint, focused PDF tests (`18/18`), and `git diff --check` pass. A rendered 11-line mixed-VAT T02 PDF visually confirmed exactly two pages with repeated accounting headers, `มีหน้าต่อไป` only on page `1/2`, VAT buckets and signatures only on page `2/2`. GitHub Typecheck + Unit tests + Prod smoke green for `8b5088d`; Render deploy run `26749458370` green. Post-deploy checks: `/api/health` 200, `/api/health/deep` status ok with `notConfigured=[]`, and `/api/health/pdf` 200.

PDF line-item VAT cleanup — shipped and verified live on prod (`cd8efba`):
- **More room for item details:** standard-builder PDFs no longer render a per-line VAT type column, including mixed `7% / 0% / exempt` documents. The follow-up also removes VAT-inclusive line totals, leaving one pre-VAT amount column per item. VAT and net total stay in the totals summary below the table; tax calculations and e-Tax payload data are unchanged.
- **Verification:** backend typecheck, backend lint, focused PDF tests (`17/17`), `git diff --check`, and a rendered mixed-VAT A4 quotation PDF pass. GitHub Typecheck + Unit tests + Prod smoke green for `cd8efba`; Render deploy run `26748171745` green. Post-deploy checks: `/api/health` 200, `/api/health/deep` status ok with `notConfigured=[]`, and `/api/health/pdf` 200.

Flat A4 PDF + document page footer — shipped and verified live on prod (`9372f4e`):
- **Less boxed accounting layout:** removed the decorative outer paper frame/shadow and flattened the buyer section from a nested card-within-card into one compact accounting block, freeing A4 space.
- **Multi-page traceability:** standard-builder PDFs now expose their document number to Puppeteer; generated PDF pages carry a print-margin footer `Billboy · <document no.>` + `Page x / y`, so page 2 clearly refers back to page 1 without consuming content space.
- **Verification:** backend typecheck, backend lint, focused PDF tests (`17/17`), `git diff --check`, and a generated 11-line quotation PDF all pass; rendered page `1/2` and `2/2` visually confirmed. GitHub Typecheck + Unit tests + Prod smoke green for `9372f4e`; Render deploy run `26744622698` green with production Prisma migrate deploy + backend health smoke. Post-deploy checks: `/api/health` 200, `/api/health/deep` status ok with `notConfigured=[]`, and `/api/health/pdf` 200.

PDF signature/VAT polish — shipped and verified live on prod (`7858804`):
- **Signature order changed:** issuer/authorized signature now renders on the left; customer/receiver signature renders on the right.
- **VAT columns simplified:** line-item tables hide VAT columns when all items share the same VAT type and show VAT only in the summary. If a document mixes VAT 7% / 0% / exempt lines, the table shows only the per-line VAT type for audit clarity; the per-line tax amount stays summary-only.
- **Verification:** backend typecheck, backend lint, backend unit tests pass (`107` tests). A generated 2-line T01 PDF rendered locally with issuer-left/customer-right signature and no per-line VAT header. GitHub Typecheck + Unit tests + Prod smoke green for `7858804`; Render deploy run `26738671270` green with production Prisma migrate deploy + backend health smoke.

Multi-page PDF layout polish — shipped and verified live on prod (`1e80612`):
- **Removed decorative document watermarks.** The standard builder no longer renders the faded theme word behind document content, and the default theme no longer carries `mark: "STANDARD"`.
- **Cleaner line-item tables.** The discount column is hidden unless at least one line item has an actual discount; empty discount rows no longer waste table width.
- **Better multi-page A4 flow.** Multi-page PDFs now use a white print background, repeated table headers, cloned page borders, tighter final-page support/signature spacing, and suppress the non-essential footer in multi-page print mode to avoid orphan footer-only pages.
- **Verification:** backend typecheck, backend lint, backend unit tests pass. A generated 11-line quotation PDF rendered to 2 pages locally with no watermark and no empty discount column. GitHub Typecheck + Unit tests + Prod smoke green for `1e80612`; Render deploy run `26736640114` green with production Prisma migrate deploy + backend health smoke.

Quotation revision flow — shipped and verified live on prod (`591c5b7`):
- **Locked quotations are no longer edited in place.** Sent/accepted/rejected/expired quotations now get a `POST /api/quotations/:id/revise` path that creates a fresh draft revision with a new quotation number, links it back to the original chain, and marks the previous copy as superseded for audit/history.
- **Lists stay clean.** Normal quotation lists and customer-portal document lists hide superseded quotations by default, while detail pages show revision history and a clear "open latest" path for old copies. Public customer links for superseded quotations remain readable but cannot be accepted/rejected; they ask the customer to request the latest link.
- **Guardrails added.** Superseded quotations cannot be re-shared, status-changed, converted to invoice, or used to create delivery notes; only the latest active revision can continue the workflow.
- **Migration applied:** `20260601_quotation_revisions` adds `revision_root_id`, `revision_no`, `superseded_by_id`, and `superseded_at` to `quotations`.
- **Verification:** backend typecheck, backend lint, frontend typecheck/lint/build, focused quotation/PDF/share token tests, and `git diff --check` pass. GitHub Typecheck + Unit tests + Prod smoke green for `591c5b7`; Vercel production deployment `dpl_Fxdjom1KCEnP9v7QViT695uAqPQq` is Ready + aliased to `etax-invoice.vercel.app`; Render deploy run `26735008104` green with production Prisma migrate deploy + backend health smoke. Post-deploy checks: `/api/health` 200, `/api/health/deep` status ok with `notConfigured=[]`, and `/app/quotations/new` 200.

Quotation item detail lines — shipped and verified live on prod (`5e8fbcd`):
- **Multi-line detail per quotation item** — the quotation builder now exposes a textarea under each line-item name for per-item details (scope, model, conditions, notes). The existing `QuotationItem.descriptionTh/descriptionEn` fields are used, so no schema migration is needed.
- **PDF + customer share rendering** — quotation PDF rows render detail text under the item name and preserve line breaks; public quotation share pages show the same detail. Regression coverage added in `pdfService.test.ts` and `quotationPdfService.test.ts`. Verified: GitHub Typecheck + Unit tests + Prod smoke green, Vercel `dpl_WNAmUPx6cDFq8wFsUfXV155dTUSe` Ready + aliased to `etax-invoice.vercel.app`, Render deploy run `26725602268` green, backend `/api/health` 200.

Quotation detail UX polish — ready to deploy:
- **A4 live preview fit** — quotation detail now renders the right-side live preview inside a scaled A4 frame (794×1123) with a visible zoom percent, matching the actual generated PDF shape instead of a tall free-form iframe.
- **Customer-send actions simplified** — removed duplicate top/share-card buttons. The top bar keeps only PDF actions and conversion actions; the share panel now has one primary "ส่งทาง LINE" flow, one customer link area, one ready-to-send message area, and accept/reject/cancel controls only while the quotation is still `sent`.

Quotation system hardening — shipped and verified live on prod:
- **Management/agency fee %** (`97a47bf`, preview fix `ef653ec`) — `Quotation.feePercent`/`feeLabel` (migration `20260601_quotation_management_fee`). VATable fee on item subtotal before VAT: `feeAmount=subtotal*pct/100; feeVat=fee*0.07; vat=itemVat+feeVat; total=subtotal+fee+vat-discount`. Verified `361000 +15% → 444210.50` (matches ShowWorks/CRW example PDFs). Fee row + "รวมก่อน VAT" line in `standard.ts`; inputs in `QuotationBuilder.tsx`.
- **Convert-to-invoice fee carry** (`b805d81`) — convert now materializes the fee as a synthetic VATable line item and lifts invoice subtotal to (item subtotal + fee), so subtotal+VAT reconciles to total (previously the fee vanished → invoice totals didn't balance, would fail e-Tax XML). Verified live: 2-line invoice 415150+29060.50=444210.50.
- **Auto-expiry** (`3b8347d`) — `quotationExpiryWorker` nightly cron (00:05) flips `sent`→`expired` where `validUntil<now` (draft/accepted never expire). Core in side-effect-free `quotationExpiryService.runQuotationExpiry()`. Manual trigger `POST /api/quotations/run-expiry` (company-scoped) verified live: sent→run→expired. Cron activates via worker `autoDeployTrigger: commit`.

Remaining gaps closed (`9f39d51`), all verified live on prod:
- **WHT estimate** — `Quotation.whtRate` ('1'|'3'|'5'%) + migration `20260601_quotation_wht_rate`. Informational, does not change total; shows "หัก ณ ที่จ่าย (X%)" + "ยอดชำระสุทธิ" below grand total in `standard.ts`. Base = pre-VAT (subtotal+fee). Carried into `Invoice.whtRate` on convert. Verified: 415150 × 3% = 12454.50 → net 431756.00.
- **Deposit baht figures** — `serviceDetailsNotes` now renders "มัดจำ 30% = ฿32,100 (คงเหลือ ฿74,900)" computed from total, not a bare percent.
- **Re-convert after cancel** — cancelling an invoice (all 4 paths in invoices.ts) now releases its source quotation `converted`→`accepted` + clears convertedToInvoiceId via `releaseSourceQuotation()`. Verified: convert→cancel→quotation accepted→re-convert OK.

**Payment-schedule table** (`69bf0df`) — milestones (service_project / boq_contract) now render as a proper table on the PDF (งวด / รายละเอียด / กำหนดชำระ / จำนวนเงิน + schedule-total row + mismatch warning when sum ≠ total), instead of flattened note text. `extractMilestones` + `PdfInvoiceData.milestones` + `standard.ts` table. Form editor + validation already existed (no frontend change). Verified live: sums-match → no warning; sum 50000 vs 107000 → "ต่างจากยอดสุทธิ 57,000.00".

**Known non-bug (by design):** management/agency fee is always VAT 7% (ค่าบริการ is VATable regardless of underlying items) — correct per Thai law.
**WHT certificate base fix deployed** (`0cf01a1`) — invoice-linked WHT certificate now calculates withholding from pre-VAT `Invoice.subtotal` while keeping `totalAmount`/net payment based on the VAT-inclusive invoice total. Regression added: 100,000 + VAT 7% + WHT 3% => WHT 3,000, net 104,000. Verified: GitHub Typecheck + Unit tests + Prod smoke green; Render deploy run `26724301157` green; production `/api/health` 200. Focused local integration test still needs local Postgres + backend API (`localhost:5432`/`:4000`) to run outside CI/prod.
**Privacy entry audit deployed** (`0cf01a1`) — `/app/account/privacy` route and desktop account menu already existed; mobile More drawer now includes the Privacy/data-rights entry. Vercel production deployment `https://etax-invoice-62g588ljy-maimpcorsair-1177s-projects.vercel.app` is Ready and `/app/account/privacy` returns 200.
**Payroll audit:** existing payroll unit tests pass (tax calculator, SSO calculator, PND.1 CSV, SSO 1-10 CSV). Current module covers employee CRUD, payroll runs, payslip rows, finalize, and CSV government exports. Remaining product gaps are likely payslip PDF per employee and any native/macro government filing formats beyond CSV, not new payroll calculation logic.
Test data left on siamtech demo tenant: several `ทดสอบ`/`PREVIEW` quotations + draft/cancelled invoices (non-draft quotations can't be deleted via API). Demo tenant only.

Short current-state snapshot for Codex, Claude, and other agents. Start from `AI_HANDOFF.md`, then use this file for the latest status. Full historical notes were archived to `docs/state/PROJECT_HISTORY_2026-05.md`.

## Current Deploy Snapshot

Frontend:
- Platform: Vercel
- Project: `etax-invoice`
- URL: `https://etax-invoice.vercel.app`
- Latest feature production deployment: `dpl_79onqPrgRw7Sj1tuYtUGfjgzzJ7r` (`https://etax-invoice-o5yca0egm-maimpcorsair-1177s-projects.vercel.app`) aliased to `etax-invoice.vercel.app`.
- Latest checked route: `/app/quotations/new` returned SPA HTML 200 from `etax-invoice.vercel.app`; Vercel inspect shows production `Ready`.

Backend:
- Platform: Render
- Service: `etax-invoice-api` (`srv-d7lkqkvavr4c73a0qqh0`)
- Plan: Standard ($25)
- URL: `https://etax-invoice-api.onrender.com`
- Latest live deploy checked: `27edf1c` via `Deploy to Render` run `26692937062` (document template unification). Verified post-deploy: `/api/health` ok, `/api/health/deep` all providers green `notConfigured=[]`, `/api/health/pdf` 200, and `POST /api/invoices/preview` regenerated A4 PDFs for both `builtin:official-navy` (122KB) and `builtin:dark-king` (137KB) → `%PDF`, 200.
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
- Push checks for `b446363` green: Typecheck (`26691315772`), Unit tests (`26691315760`), Prod smoke test (`26691315764`).
- Manual `Deploy to Render` run `26691322861` green: backend typecheck, production Prisma migrate deploy, Render deploy, backend health smoke.
- Frontend Vercel production deploy from `frontend/` completed and aliased: `dpl_79onqPrgRw7Sj1tuYtUGfjgzzJ7r`.

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
- Document polish + configurable footer shipped 2026-05-31 (`a0be4df`, `3a91b61`, `5d8b069`): (1) signature labels adapt per doc type — quotation → ผู้อนุมัติ/ลูกค้า, receipt → ผู้จ่ายเงิน/ลูกค้า, else ผู้รับสินค้า/ลูกค้า; PromptPay "scan to pay" QR is suppressed on quotations and already-paid docs (`enrichPromptPayQr` guard + `isPaid` on `PdfInvoiceData`, passed from pdfWorker). (2) **Company-wide configurable footer fine-print** — new `Company.documentFooterNote` (migration `20260531_company_document_footer`, applied via render-deploy migrate step), editable in Settings (textarea + 3 Thai/EN quick-insert chips), rendered as a dense `.legal-footer` block at the bottom of every document; resolved at render time in `buildHtmlForCompany` (try/catch safe). (3) **Fixed PUT /api/admin/company 500** — it returned the full row (leaking certificateBlob/certificatePassword + brittle RETURNING-all-scalars); now selects an explicit safe field set and logs the real error. Verified on prod: PUT footer → 200 (saved, line breaks preserved), preview PDF regenerates 200, GET company returns documentFooterNote. Picker thumbnails realigned 2026-05-31 (`8ac8171`): `TemplateMarketplace` catalogCss now overrides every thumbnail to the unified formal look (white paper + accent-tinted wash, 3px solid accent top rule, accent table header, no mascots/glow) so the gallery matches the actual PDF; verified via a static harness on minimal/cute/dark-accent presets. Dead-code + QR cleanup shipped 2026-05-31 (`15feca1`): removed the 8 unreachable builder files (minimal/cute/professional/dark/anime/crayon/marketplace + orphaned _posterTemplate; −2444 lines) and the dead routing branches — only `builders/standard.ts` remains; the test now exercises the base builder across one theme per family. `enrichPromptPayQr` now prefers the company's `isDefault` bank account over array order.
- Per-document PromptPay account selection shipped 2026-05-31 (`9b98366`): the PromptPay QR follows the bank account selected on each document, not just the company default. `promptPayId` is captured in the invoice builder (select/add/default autofill), persisted in localStorage drafts + the seller snapshot `documentPreferences`, and flows through create + both preview routes to `PdfInvoiceData.promptPayId`. `enrichPromptPayQr` honors it ONLY when it matches one of the company's configured accounts (rejects arbitrary ids → no payment redirection), else falls back to default, else first. Multi-account companies are now fully supported.
- Template picker curated + pastel theme fix + quotation live preview shipped 2026-05-31: (a) `documentTemplatePresets` trimmed to 8 curated modern choices (4 ทางการ Navy/Slate/Mono/Teal + 3 สี Soft Pink/Soft Blue/Warm Beige + Standard A4); deleted the unused 1385-line `TemplateMarketplace` gallery; removed dead frontend `lib/api.ts` + 3 unused backend deps (@line/bot-sdk, express-rate-limit, express-validator). (b) Added theme-map entries for `cute-pastel-pink`/`cute-baby-blue` (they were missing → fell to navy fallback, so Soft Pink/Blue showed no colour). (c) **Quotation live preview** (`cbeb323`): new `POST /api/quotations/preview` renders HTML/PDF from un-saved form data (sample buyer, full kind/serviceDetails/BOQ support); QuotationBuilder now has a debounced 2-column sticky live-preview iframe like the invoice builder. The template-document workstation is feature-complete.
- Signature system shipped 2026-05-31: (a) new `SignaturePad` component (draw / type-to-handwriting / upload → PNG) in Settings → saved once to the company signature profile (`e66caa9`); (b) **fixed a real bug** — `useDocumentProfile` started `loading=false`, so the invoice builder's run-once "apply default signature/bank" effect fired against the empty initial profile and latched before the real profile loaded → a signature set in Settings never appeared. Fix: `loading` starts true (`2ecbbe1`). Verified on prod: invoice builder now auto-fills signer from the profile. (c) `buildHtmlForCompany` now falls back to the company `documentSignatureProfile` (signerName/title/image) when a document has no signer, so **quotations + any document show the company signature automatically** (`9ddbea1`, verified on the quotation preview). Reminder of the two signature layers: the visual signature (image, optional, same weight as signing on paper, NOT legally required per ม.86/4) vs the digital XAdES signature (cert + RD, the legal e-Tax one) — still dormant since no company has a real cert.
- Delivery-note live preview shipped 2026-05-31 (`d8d1547`): `POST /api/delivery-notes/preview` renders HTML/PDF from un-saved form data (sample buyer + company seller via the existing buildDeliveryNoteHtml); DeliveryNoteBuilder now has the debounced 2-column sticky live-preview iframe, matching the invoice + quotation builders. All three document builders now have consistent live preview. A customer share-link was intentionally not added to delivery notes (operational/printed doc, not a send-link-and-pay document). Verified on prod (preview renders 5797B HTML).
- Document template unification shipped 2026-05-31 (`27edf1c`): all PDF documents now render through one formal base builder (`pdfService/builders/standard.ts` via `buildHtml`). Discovery: every `builtin:*` templateId already routed to `buildHtml` (the per-variant minimal/cute/pro/dark/anime/crayon builders are dead code behind an early return in `pdfService.ts:254`), so one edit changes all themes. Changes: (1) thin 3px solid top rule (was 10px fading gradient), clean solid title-card, removed template-name badge, 8px formal corners; (2) `resolveDocumentTheme` + new `deriveSurfaceTokens` — EVERY theme (incl. Dark/Anime/Cute) renders on a clean white paper with dark high-contrast text; theme identity is only its accent color + a subtle accent-tinted page wash (fixes dark-on-dark unreadable seller-address/totals once surface vars were introduced; `ack-statement`/`online-box`/`cert-pill` no longer use near-black `accent-soft` as a background); (3) full accounting footer — dual signature lines always render (ผู้รับสินค้า/ลูกค้า + ผู้มีอำนาจลงนาม/ออกโดย, each with date line), received-goods acknowledgement (skipped on quotations), original/copy + ordinary/e-Tax marking in footer; (4) **multi-page A4 fix** — non-compact docs paginate cleanly (shell → block flow in print, `thead` repeats via table-header-group, rows/totals/signature `break-inside: avoid`); every page stays A4 (MediaBox 595×842pt); 12 items 5→3 pages, 25 items 9→4 pages, files ~3× smaller; the ≤8-item compact one-page layout is unchanged. `pdfService.test.ts` updated to assert the always-on dual signature lines (15 PDF tests pass). Known follow-ups: the per-variant builder files are now dead code (can be deleted with test rework); `POST /api/invoices/preview` still hardcodes a mock buyer "ลูกค้าตัวอย่าง" (`invoices.ts:1511`) so the in-builder preview shows a placeholder buyer even though issued docs use the real buyer; frontend `TemplateMarketplace` inline preview is a separate client renderer not yet aligned to this look.
- Quotation logistics/import-export preset shipped 2026-05-31 (`b446363`): `/app/quotations/new` now includes `Logistics / Import-Export` in the compact quotation type dropdown. The preset reveals only trade/logistics fields: origin, destination, Incoterms, shipment mode, cargo details/weight, currency, exchange rate, freight charge, local charge, customs fee, and insurance. Backend validation accepts `kind='logistics_import_export'` and stores these in `Quotation.serviceDetails` without a schema migration; quotation PDFs and public quotation share links render the new fields. Verified locally with backend/frontend typecheck, backend/frontend lint, frontend build, focused quotation PDF tests (3), Playwright UI smoke selecting the logistics preset, and `git diff --check`. Production: Vercel `dpl_79onqPrgRw7Sj1tuYtUGfjgzzJ7r` Ready + aliased, Render deploy run `26691322861` green, `/app/quotations/new` returned 200, `/api/health` ok, and `/api/health/deep` returned every provider green with `notConfigured=[]`.
- Quotation coverage expansion shipped 2026-05-30 (`5510e1d`): `/app/quotations/new` now keeps the fast general flow while exposing one compact preset dropdown for `สินค้า / ทั่วไป`, `งานบริการ`, `Project / Scope งาน`, `BOQ / งานเหมา`, and `รายเดือน / Subscription / เช่า`. Optional sections appear only when relevant: deliverables, exclusions, warranty, project linkage, deposit, milestones, revisions, contract duration, billing cycle, SLA, cancellation terms, and security deposit. BOQ line items persist an optional `sectionTitle` via migration `20260530_quotation_boq_sections`; seller UI, customer share page, and quotation PDF render grouped section context and pre-VAT section subtotals. The quotation-builder preview now calculates per-line discount as percent, matching the backend. Public quotation share validates response shape before rendering instead of crashing on malformed data. Verified locally with backend/frontend typecheck, backend/frontend build, touched-file lint, `git diff --check`, backend unit tests (106), focused quotation PDF tests (2), Playwright desktop/mobile seller flow, and curl public-share contract smoke. Production migration/deploy completed via `Deploy to Render` run `26689260845`; post-deploy `/api/health/deep` returned every provider green and `notConfigured=[]`.
- Quotation service/project mode added 2026-05-30: `/app/quotations/new` and draft quotation edit now let sellers choose a compact `งานบริการ / โปรเจกต์` mode, optionally link an existing active Project, and capture scope, timeline, deposit percentage, revision rounds/terms, and milestone payments. Existing Project descriptions/date ranges prefill empty quote fields; milestone totals warn when they do not match the quotation total. Structured data persists in `Quotation.kind` + `Quotation.serviceDetails` via migration `20260530_quotation_service_details`, renders into quotation PDFs, and appears on the public customer share page. General quotations remain the default and keep the fast form. Verified locally with backend/frontend typecheck, backend/frontend lint, frontend build, and focused PDF/share tests.
- Quotation template selection added 2026-05-30: `/app/quotations/new` and draft quotation edit now expose a compact "รูปแบบใบเสนอราคา" dropdown using the same built-in Minimal/Cute template catalog as invoices. The selected `templateId` is stored in the quotation's seller snapshot (`seller.documentPreferences`) so it follows the quotation PDF, customer share PDF, and future reloads without a schema migration. Backend quotation PDF data forwards `templateId` into the standard A4 renderer, and built-in templates now explicitly support `quotation`. Verified with backend/frontend typecheck, backend/frontend lint, frontend build, and focused PDF/quotationPdfService tests.
- Invoice builder section navigation UX fix added 2026-05-30: the section stepper in `/app/invoices/new` no longer uses a sticky high-z block that can cover section headings while scrolling. Active state is now a restrained underline/text treatment instead of a dark filled rectangle, item count uses a neutral chip, and form sections have scroll margins so desktop and mobile jumps keep headings visible. Verified with frontend typecheck/lint/build.
- Quotation customer acceptance flow added 2026-05-30: sellers can generate a public customer link from Quotation List or Quotation Detail via `POST /api/quotations/:id/share-link`; customers open `/share/quotation/:token` without login, download the PDF, and accept/reject the quotation. Backend public routes under `/api/share/quotation/:token` stream the quotation PDF on demand and update status only while the quote is `sent`; expired quotes are blocked. Verified with backend/frontend typecheck, backend/frontend lint, frontend build, and focused `quotationShareToken` unit tests. Full backend test suite is still not a useful local signal unless Postgres + Redis are running; it fails/loops on `localhost:5432` and `localhost:6379` integration dependencies.
- Quotation send/PDF flow added 2026-05-30: authenticated `GET /api/quotations/:id/preview` now renders quotation HTML/PDF using the standard A4 builder with quotation-specific title/valid-until/payment-terms copy. Quotation list has a per-row PDF download action; quotation detail has Open PDF, Download PDF, Copy customer message, and Open LINE actions, and "Save + send" was clarified to "Save and prepare" because the system prepares the PDF/message rather than sending autonomously.
- Invoice PDF A4 layout fix added 2026-05-29: standard PDFs now use a tighter square-corner compact layout, remove overflow padding that could create a second page, remove emoji PromptPay labels, and keep up to 8 line items in the one-page compact layout before intentionally flowing to more pages.
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
- R2 production storage configured 2026-05-27: user added R2/S3 env vars on Render; production `/api/health/deep` returned `providers.s3.ok=true` and `notConfigured=[]` at `2026-05-27T16:24:59.213Z`. `npm run render:r2` remains available for future secret sync/deploys without printing values.
- Purchase document intake R2 preview/MIME fix pushed in `1811f47` on 2026-05-28; GitHub Typecheck, Unit tests, and Prod smoke all green. Frontend thumbnails/previews/open-file now load through authenticated `/api/purchase-invoices/document-intakes/:id/file` instead of private R2 `fileUrl`; backend streams stored objects instead of redirecting to presigned URLs, sniffs PDF/JPEG/PNG/WebP signatures, stores corrected `mimeType` on upload, and corrects `mimeType` on re-analysis. Local verification also passed `frontend` typecheck/build/lint and `backend` typecheck/lint. Next production check after deploy: upload the real `invoice-preview-2026-05-27.pdf` from `/app/purchase-invoices` and confirm the card says PDF, preview opens, and OCR no longer uses image-only `qr_decode` stages for that PDF.
- First Invoice Winning Path polish added 2026-05-29: after issuing an invoice, `IssuedSuccessModal` now creates the customer share link immediately and presents the customer QR, Copy, Open LINE, View customer page, Download PDF, Verify, optional Email, and Record payment actions in one panel. This closes the biggest gap after the dashboard first-invoice CTA: sellers no longer need to return to the invoice list to find share/payment actions. Verified locally with `frontend` typecheck/lint/build.
- Mobile invoice builder frame fix added 2026-05-29: `/app/invoices/new` no longer wraps the mobile form/preview tabs in a rounded fixed-height bordered panel; the form now uses normal page scroll so Project/Job and later cards are not clipped on phones. Verified locally with `frontend` typecheck/lint/build.
- Invoice builder polish added 2026-05-29: header helper/validation UI is now compact and neutral instead of large amber/green callout cards; the form section nav is a fixed grid (3 columns on mobile, 6 on larger screens) instead of a horizontal scrolling pill row; document type dropdowns are ordered T01-T05 and fresh invoice creation now defaults to T01 (`tax_invoice_receipt`) with a one-time local preference migration from the old T02 default. Verified locally with `frontend` typecheck/lint/build.
- Company settings validation UX fixed 2026-05-29: `/app/settings#company` no longer shows raw "Validation error"; frontend validates Thai company name, 13-digit tax ID, 5-digit branch code, Thai address, email, and website before saving, highlights the exact fields, and renders a compact neutral status message. Backend `/api/admin/company` now trims strings, treats blank optional fields as omitted, normalizes bare website domains to `https://...`, and validates tax ID/branch code formats consistently. Verified locally with frontend typecheck/lint/build and backend typecheck/lint.
- Mobile invoice builder guardrails added 2026-05-29: `/app/invoices/new` no longer uses native `window.confirm` for recoverable drafts; it shows an inline restore/start-fresh panel. Due date now has calendar-day presets (7/15/30/45 days) using local date math. `/api/company/profile` now returns `electronicInvoicingReady` (boolean only, no secrets), and the invoice builder hides the whole Ordinary/Electronic selector until RD credentials + non-dev certificate are ready. The company-logo checkbox is hidden until a Settings logo exists. Verified with frontend typecheck/build, backend typecheck, and Playwright mobile smoke with mocked profile (`dialogCount=0`, e-Tax hidden, logo hidden, due-date chips visible).
- Mobile invoice builder action/preview/PDF polish added 2026-05-29: mobile now has a fixed Preview/Save/Issue action bar above the bottom nav, so `/app/invoices/new` no longer hides the save/issue actions on phones. The preview modal uses a full-height mobile sheet and scales the A4 iframe instead of cropping it. Standard ordinary PDFs with up to 3 items use a compact one-page layout; ordinary documents no longer show the "Electronic Tax Document" eyebrow, redundant "ORDINARY DOCUMENT" badge, or blank signature boxes. Verified with frontend typecheck/lint/build, backend typecheck/lint/unit tests, and a Puppeteer PDF smoke fixture matching the reported 1-item + bank + PromptPay case (`pages=1`).
- Mobile invoice builder visual cleanup added 2026-05-29: removed emoji-style UI text from `frontend/src`, replaced invoice mobile Form/Preview tabs with lucide icons, collapsed the selected buyer display to one compact summary card instead of repeating the company name/search result/detail stack, and moved the AI chat launcher to the lower-right above the mobile action/nav area so it no longer blocks Save/Issue. Verified with frontend typecheck/lint/build and an emoji grep over `frontend/src`.
- Invoice share PDF R2 proxy fix added 2026-05-29: public `/api/share/invoice/:token/pdf` now streams the private R2/S3 PDF object through the backend using the share token instead of redirecting customers to the raw Cloudflare R2 URL (which showed XML `InvalidArgument` / `Authorization` in mobile in-app browsers). `/api/share/invoice/:token` no longer exposes the private R2 URL; it returns the backend PDF endpoint path when ready. Verified with backend typecheck/lint/unit tests, including R2 URL-to-storage-key parsing.
- T01 due-date UX fix added 2026-05-29: invoice builder now treats T01 (`tax_invoice_receipt`) as cash sale / paid immediately, so the due-date field and 7/15/30/45-day presets show only for T02 (`tax_invoice`). Draft recovery, customer credit-days autofill, preview payload, and save/issue payload no longer carry `dueDate` for T01. Verified with frontend typecheck/lint/build.
- Invoice template data parity fix added 2026-05-29: marketplace/poster PDF templates now keep seller contact, bank transfer, and PromptPay payment details instead of dropping them versus the standard template, and they hide missing due-date rows for T01 instead of rendering `ครบกำหนด -`. Added a regression test for marketplace T01 payment details/no blank due date. Verified with backend typecheck/lint and focused `pdfService.test.ts`.
- A4 invoice preview/page fill fix added 2026-05-29: standard invoice HTML now keeps a full A4-height page frame and pushes payment/support content toward the lower page on short one-item invoices, so the PDF no longer looks like content is squeezed into the top half. The invoice builder inline preview now labels the panel "ตัวอย่าง A4" and scales by panel width up to 68% instead of capping at 50%. Verified with backend/frontend typecheck/lint/build and focused `pdfService.test.ts`.
- **P0 invoice-issue 500 fixed 2026-05-29 (`1308919`)** — found via production E2E. Issuing any invoice (`POST /api/invoices`, non-draft) returned 500 "Failed to create invoice". Two compounding bugs in the invoice-number generator: (1) `withInvoiceLock` (config/rls.ts) opened a plain `prisma.$transaction` WITHOUT the tenant RLS context, so the "latest number" `findFirst` saw zero rows (RLS policies use `current_setting('app.current_company_id', true)` → NULL) and the sequence restarted at `000001` every time → `[companyId, invoiceNumber]` unique-constraint collision. A company could issue its 1st invoice but never a 2nd. (2) `generateInvoiceNumber` matched `startsWith('${prefix}-${year}')` which over-matched a legacy month format (`INV-202604-...` starts with `INV-2026`), corrupting sequence detection. Fix: `withInvoiceLock` now applies tenant RLS context inside the lock (also fixes the same latent bug in delivery-note + quotation number generators that share it); `generateInvoiceNumber` matches `${prefix}-${year}-` with trailing dash; the create catch now logs the real error (was a silent 500). Verified on prod: issue create → 201 `INV-2026-000004` (continued from `000003`, skipped legacy `INV-202604-*`), share link + customer page + PDF download all work end-to-end. Landing-page "BullMQ" jargon also replaced with plain Thai.
  - E2E open findings (not yet fixed): free signup is **Google-only** (no email/password path — conversion risk for SMEs without Google); invoice **in-builder preview** shows placeholder buyer "ลูกค้าตัวอย่าง" instead of the selected customer (backend preview builder; the ISSUED document + customer share page show the correct buyer, so it is cosmetic/pre-issue only); Owner Plane has many junk test tenants (incl. profane names) to clean up.
  - Smoke data left in demo tenant `company-demo-001`: draft `DRAFT-202605-054171` + issued `INV-2026-000004` from the E2E run.
- Winning Flow Sprint Customer Pay polish added 2026-05-29 (`4f5124d`): InvoiceShare now shows "เกินกำหนด" (rose) badge + rose dueDate row when invoice is past-due and unpaid; backend returns `seller.logoUrl` so the customer share page shows the seller's logo; Dashboard 0-invoice state consolidated — seed-demo moved from a competing green panel to a secondary text link inside the blue first-invoice panel. Verified frontend + backend typecheck clean. IssuedSuccessModal audited: all action grids use `sm:` breakpoints to stack on mobile, `max-h-[92vh] overflow-y-auto` — no layout fix needed.

## Session handoff (2026-05-26) — what Codex/next-session should pick up

User is switching to Codex to continue. Pending work, ranked by impact:

1. **R2 upload smoke** — R2 health is configured and green (`providers.s3.ok=true`, `notConfigured=[]`). Next prove one real upload path: sign in to production, upload a small PDF/JPG from `/app/purchase-invoices`, confirm no `503 File storage is not configured`, and confirm the document reopens from stored object storage.

2. **Drive folder migration** — `getTransactionMonthBucket()` helper already exists ([googleDriveService.ts](backend/src/services/googleDriveService.ts)). Now that R2 is configured, wire `transactionDate` into `ensureProjectFolder` so YYYY/MM bucket is created based on `invoiceDate` not `createdAt`.

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
