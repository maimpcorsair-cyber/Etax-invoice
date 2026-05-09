# Project State Handoff

Last updated: 2026-05-09 18:45 Asia/Bangkok

Use this file as the short handoff for Codex, Claude, or any other model before doing work in this repo. For durable rules and architecture, also read `AGENTS.md` and `CLAUDE.md`.

## Current Production Status

- Frontend: Vercel project `etax-invoice`, production URL `https://etax-invoice.vercel.app`.
- Backend: Render service `etax-invoice-api`, production URL `https://etax-invoice-api.onrender.com`.
- Backend health currently verified as `version: 2026-05-09d`.
- Vercel CLI is installed globally and logged in as `maimpcorsair-1177`.
- Vercel project is linked locally in `.vercel/repo.json`; `.vercel` is ignored and must not be committed.
- GitHub CLI is logged in as `maimpcorsair-cyber`; `gh run list` works.
- GitHub Actions `Deploy to Render` and `Typecheck` are working on `main`.

## Latest Work Completed

- Fixed LINE account linking under database RLS.
- Fixed LINE webhook link lookup under system RLS.
- Improved LINE OCR replies for bank transfer slips:
  - amount
  - bank/app
  - sender
  - receiver
  - reference
- Added PDF OCR fallback for LINE:
  - parse digital PDF text first
  - if no useful fields, rasterize PDF pages to PNG
  - OCR rasterized pages with vision fallback
  - use bank-slip specialist when PDF/page looks like a transfer slip
- Fixed LINE document intake persistence and web preview:
  - create/update `DocumentIntake` under system RLS
  - if storage upload fails, fallback to database `fileBase64`
  - no silent return when OCR gives no result
  - failed/unreadable documents still appear in Input VAT for manual review
- Improved Input VAT document library UI:
  - larger PDF/JPG thumbnail preview
  - separate file type chip (`PDF` / image)
  - clearer document kind label when OCR has not classified a file yet
- Added `.vercel` to `.gitignore`.

## Recent Commits To Know

- `7b92bbf` chore: ignore Vercel local config
- `0fae480` chore: bump backend health version
- `f8b62c8` fix: persist LINE document intake previews
- `c4976f8` fix: add PDF raster OCR fallback for LINE
- `305e70e` fix: improve LINE slip OCR details
- `548efe3` fix: resolve LINE webhook links under RLS
- `37840a9` fix: run LINE linking under RLS context

## Important Local Dirty State

- `.claude/settings.local.json` may be modified locally.
- This file is Claude permission/local config only.
- It should normally stay local and should not be committed unless the user explicitly wants shared Claude permissions.
- Current diff only broadens allowed Claude bash commands around `git add`, `git commit`, and `git push`; no production code or secret was involved.

## How To Verify Deploy Quickly

```bash
gh run list --limit 5
curl -sS https://etax-invoice-api.onrender.com/api/health
curl -sS https://etax-invoice.vercel.app/api/health
vercel ls etax-invoice
```

Expected backend health after the latest backend fix:

```json
{"status":"ok","version":"2026-05-09d"}
```

## What To Test Next

1. In LINE, send a PDF that previously produced no reply.
2. Confirm LINE sends a reply even if OCR cannot read it.
3. Open web app `https://etax-invoice.vercel.app/app/purchase-invoices`.
4. Check Input VAT document library:
   - LINE-uploaded PDF/JPG appears.
   - thumbnail/preview opens.
   - OCR status is visible.
   - failed unreadable file remains available for manual review.
5. Send a bank transfer slip and confirm reply includes sender/receiver/reference.

## Known Risks / Next Improvements

- Production DB read-only debugging is not yet set up as a safe repeatable tool.
- LINE webhook observability should be improved with a compact admin/debug view:
  - message id
  - company id
  - user id
  - document intake id
  - OCR stage
  - error/warnings
- PDF OCR fallback depends on Puppeteer rasterization being available in Render runtime.
- Long-term best OCR plan:
  - cheap digital PDF text extraction first
  - QR decode for slips when possible
  - vision OCR only when needed
  - specialized bank slip extraction for transfer documents
  - always store the original file for human review

## Core Rules

- Multi-tenant queries must use `req.user!.companyId`; never trust `companyId` from request body.
- For LINE webhooks without a JWT request user, use the existing RLS helper pattern (`withSystemRlsContext` or a scoped RLS context) before Prisma reads/writes that touch tenant data.
- Do not commit certificates, `.env` secrets, `.vercel`, or local Claude/Codex auth state.
- Prefer `rg` for search and verify with real runtime checks, not config inspection only.
