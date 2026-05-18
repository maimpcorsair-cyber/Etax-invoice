# Project State Handoff

Last updated: 2026-05-18 20:00 Asia/Bangkok

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
- No other tracked dirty files should remain after a clean docs commit.

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
