# Project State Handoff

Last updated: 2026-05-09 22:33 Asia/Bangkok

Use this file as the short handoff for Codex, Claude, or any other model before doing work in this repo. For durable rules and architecture, also read `AGENTS.md` and `CLAUDE.md`.

## Maintenance Rule

- Read this file before starting any non-trivial work.
- Update this file before the final reply when a task changes production status, deploy state, CLI/tooling status, database/schema state, LINE/OCR behavior, important risks, or next verification steps.
- Keep updates short and factual. Prefer latest state, latest commit, exact command, exact URL, and exact health/version over long narrative.
- Do not paste secrets, tokens, certificate contents, `.env` values, or local auth state into this file.
- If only exploratory work happened and nothing durable changed, leave this file unchanged.

## Current Production Status

- Frontend: Vercel project `etax-invoice`, production URL `https://etax-invoice.vercel.app`.
- Backend: Render service `etax-invoice-api`, production URL `https://etax-invoice-api.onrender.com`.
- Backend health currently verified as `version: 2026-05-09d`.
- Vercel CLI is installed globally and logged in as `maimpcorsair-1177`.
- Vercel project is linked locally in `.vercel/repo.json`; `.vercel` is ignored and must not be committed.
- GitHub CLI is logged in as `maimpcorsair-cyber`; `gh run list` works.
- GitHub Actions `Deploy to Render` and `Typecheck` are working on `main`.
- GitHub Actions `Health Check` now has retries and longer timeouts to reduce false failures from Render cold starts.
- `Deploy to Render` workflow now treats `prisma migrate status` as informational; `prisma migrate deploy` is the step that applies/fails migrations.
- `Deploy to Render` smoke check now retries `/api/health` to tolerate Render cold starts after deploy hook.
- Production migration `20260509_project_cost_centers` was applied successfully by GitHub Actions run `25603792760`.
- Latest verified deploy run: `25603869894` succeeded.

## Latest Work Completed

- Updated commercial packaging toward Solo / Team:
  - internal `starter` plan is now presented as `Solo` at 299 THB/month
  - internal `business` plan is now presented as `Team` at 990 THB/month
  - policy now exposes project, LINE group, Drive-folder, included-seat, extra-seat, and extra-OCR limits
  - monthly document usage now counts invoices + purchase invoices + document intakes, not only sales invoices
- Added project usage gating:
  - Free: 1 project / 1 LINE group
  - Solo: 10 projects / 3 LINE groups / 3 users
  - Team: 50 projects / 20 LINE groups / 8 users
  - Enterprise: custom/unlimited
- Added Google Drive project-folder foundation:
  - root folder is now `Billboy`
  - supports company/project/category nesting
  - target project folder format: `Billboy / Company / Projects / PRJ... / 02_Tax_Invoices`
  - existing Drive uploads remain backward compatible when no project is passed
- Added Project / Cost Center foundation:
  - new `projects` and `project_members` tables
  - tenant-safe RLS policies for project data
  - optional `projectId` on invoices, purchase invoices, document intakes, expense vouchers, and LINE group links
  - Prisma migration: `20260509_project_cost_centers`
- Added `/api/projects`:
  - list/create/update/archive projects
  - assign owner/approver/members
  - budget summary from purchase invoices and expense vouchers
  - assign existing documents/records to a project
- Added frontend Projects page at `/app/projects`:
  - project budget cards
  - committed/paid/remaining totals
  - over-budget indicator
  - create/edit project modal
  - desktop and mobile nav links
- Updated Input VAT:
  - web uploads can be tagged with a project
  - manual purchase invoice create/edit can choose a project
  - OCR review inherits project from the intake
- Updated LINE intake behavior:
  - if a LINE group is assigned to a project, new documents from that group are saved with that `projectId`
  - LINE admin group list now returns project info for future UI wiring
- Fixed deploy workflow migration gate:
  - previous `prisma migrate status` step failed when migrations were pending
  - workflow now continues to `prisma migrate deploy` for normal production releases
- Fixed deploy workflow smoke check:
  - previous immediate `/health` check could timeout during Render deploy/cold start
  - workflow now retries `/api/health`
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
- Hardened `.github/workflows/health-check.yml` with 3 attempts, longer backend timeout, and longer frontend timeout.

## Recent Commits To Know

- `ac604f4` ci: retry backend health after deploy
- `383f08d` ci: allow pending migrations before deploy
- `aa06e6c` feat: add project cost centers
- `7b92bbf` chore: ignore Vercel local config
- `ad4c816` docs: require project state updates
- `80cd323` docs: add project state handoff
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
- `PROJECT_STATE.md` maintenance rule was added so future AI sessions update this file when durable state changes.

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

1. After deploy, confirm migration `20260509_project_cost_centers` ran on production.
2. Open web app `https://etax-invoice.vercel.app/app/projects`.
3. Create a project with budget, owner, and approver.
4. Open Input VAT and upload a PDF/JPG with a project selected.
5. Confirm the intake and saved purchase invoice keep the same `projectId`.
6. In LINE, send a PDF that previously produced no reply.
7. Confirm LINE sends a reply even if OCR cannot read it.
8. Open web app `https://etax-invoice.vercel.app/app/purchase-invoices`.
9. Check Input VAT document library:
   - LINE-uploaded PDF/JPG appears.
   - thumbnail/preview opens.
   - OCR status is visible.
   - failed unreadable file remains available for manual review.
10. Send a bank transfer slip and confirm reply includes sender/receiver/reference.

## Known Risks / Next Improvements

- Production DB read-only debugging is not yet set up as a safe repeatable tool.
- Projects v1 is usable for budget/project tagging, but next useful upgrades are:
  - project picker in LINE Admin group UI
  - project filter across Input VAT, expenses, and invoice lists
  - approval workflow by project owner/approver
  - wire Drive uploads from project/category into the new Drive folder foundation
  - add Google Sheet/Excel export per project
- Pricing labels changed in app config, but Stripe price env names are still `STRIPE_PRICE_STARTER_MONTHLY` and `STRIPE_PRICE_BUSINESS_MONTHLY`; Stripe dashboard prices should be updated to match 299/990 before charging real customers.
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
- Before final replies after meaningful work, check whether `PROJECT_STATE.md` needs an update.
