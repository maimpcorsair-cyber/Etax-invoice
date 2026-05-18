# Project State Handoff

Last updated: 2026-05-19 05:05 Asia/Bangkok

Short current-state snapshot for Codex, Claude, and other agents. Start from `AI_HANDOFF.md`, then use this file for the latest status. Full historical notes were archived to `docs/state/PROJECT_HISTORY_2026-05.md`.

## Current Deploy Snapshot

Frontend:
- Platform: Vercel
- Project: `etax-invoice`
- URL: `https://etax-invoice.vercel.app`
- Latest deploy commit: `56f4dad` (slip OCR race + empty-OCR fixes — pending auto-deploy)
- Previous live commit: `d505fc9` (slip attachment + auto-OCR feature)

Backend:
- Platform: Render
- Service: `etax-invoice-api` (`srv-d7lkqkvavr4c73a0qqh0`)
- Plan: Standard ($25)
- URL: `https://etax-invoice-api.onrender.com`
- Latest live deploy: commit `d505fc9` (2026-05-18 12:58 UTC, `dep-d85goleq1p3s73fpkr10`)
- Pending: `56f4dad` (slip race + empty-OCR rejection fixes)
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
- Both backend + frontend `npx tsc --noEmit` clean at `56f4dad`

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
- `.serena/project.yml`, `LOCAL_DEPLOYMENT.md` modified locally — not part of any feature work.

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
- Note: response field `loginMethod: "google"` is hardcoded even for manual signup (`billing.ts:888`) — cosmetic-only since `token` is correctly `null`, but worth tidying in a follow-up.

## Latest Completed Changes

- Invoice builder UX: `/app/invoices/new` now uses a framed form/preview workspace, removes nested desktop form scroll, keeps section chips sticky, and makes the preview pane sticky on desktop.
- DBD/RD/MOC autofill: Thai address selection prefers the most complete official address and preserves postcode; English address is official/user-verified only, not romanized from Thai.
- Product catalog: products/services support type, category, account code, unit cost, default WHT, and sync into the company Google Sheet tab `สินค้าและบริการ`.
- Customer evidence/Drive/Sheet: `รายชื่อ` supports customer/vendor evidence metadata, Drive folders, compact checklist, and company month-end `รายชื่อและเอกสาร` sheet tab.
- Customer credit terms: optional `creditLimit` and `creditDays` are stored and invoice due date auto-fills from `creditDays` when empty.

## Next Best Actions

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
