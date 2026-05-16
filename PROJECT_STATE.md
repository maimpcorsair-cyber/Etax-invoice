# Project State Handoff

Last updated: 2026-05-16 19:58 Asia/Bangkok

Short current-state snapshot for Codex, Claude, and other agents. Start from `AI_HANDOFF.md`, then use this file for the latest status. Full historical notes were archived to `docs/state/PROJECT_HISTORY_2026-05.md`.

## Current Deploy Snapshot

Frontend:
- Platform: Vercel
- Project: `etax-invoice`
- URL: `https://etax-invoice.vercel.app`
- Latest verified page: `/app/invoices/new`
- Latest code deploy commit: `3d6d9bd` (`Remove nested invoice form scroll`)
- Latest docs-only commit after deploy: `ac013e7`
- Status: HTTP 200; `last-modified: Sat, 16 May 2026 10:47:20 GMT`
- Verified production bundle: `InvoiceBuilder-Ctger4kl.js`

Backend:
- Platform: Render
- Service: `etax-invoice-api`
- URL: `https://etax-invoice-api.onrender.com`
- Health: `/api/health` returned HTTP 200
- Health payload observed: `{"status":"ok","version":"2026-05-09d"}`
- Latest backend deploy noted: commit `63dd77d` (`Fix DBD address autofill policy`)

Worker:
- Platform: Render
- Service: `etax-invoice-worker`
- Last known status: healthy after the latest Render deploy status checks in history
- Verify with: `npm run render:status -- --target all --commit HEAD`

Last CI:
- Latest code Typecheck: GitHub Actions run `25959708948`, success, commit `3d6d9bd`
- Recent scheduled health checks on `main` are passing

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
