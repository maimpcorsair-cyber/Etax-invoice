# Project State Handoff

Last updated: 2026-05-10 20:10 Asia/Bangkok

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
- Latest verified project workspace deploy run: `25605830570` succeeded.
- Latest verified typecheck run: `25605830599` succeeded.
- Latest verified project context deploy run: `25606879186` succeeded.
- Latest verified project context typecheck run: `25606879199` succeeded.
- Latest verified LINE project/export deploy run: `25607397903` succeeded.
- Latest verified LINE project/export typecheck run: `25607397904` succeeded.
- Latest verified Project Approval + Tax Safety deploy run: `25608068266` succeeded.
- Latest verified Project Approval + Tax Safety typecheck run: `25608068262` succeeded.
- Latest verified Project Close-out + Telemetry deploy run: `25608658632` succeeded.
- Latest verified Project Close-out + Telemetry typecheck run: `25608658622` succeeded.
- Latest verified Smart Matching deploy run: `25609477061` succeeded.
- Latest verified Smart Matching typecheck run: `25609477058` succeeded.
- Latest verified DBD API foundation deploy run: `25610525046` succeeded.
- Latest verified DBD API foundation typecheck run: `25610525049` succeeded.
- Latest verified LINE Project Guest Portal deploy run: `25611329399` succeeded.
- Latest verified LINE Project Guest Portal typecheck run: `25611329397` succeeded.
- Latest verified LINE Project Guest Upload deploy run: `25611538817` succeeded.
- Latest verified LINE Project Guest Upload typecheck run: `25611538818` succeeded.
- Production checks after `c7a2410`:
  - backend `/api/health` returned `status: ok`, `version: 2026-05-09d`
  - frontend `/api/health` rewrite returned backend `status: ok`, `version: 2026-05-09d`
  - frontend `/app/projects` returned HTTP 200 from Vercel
- Production checks after `790e231`:
  - backend `/api/health` returned `status: ok`, `version: 2026-05-09d`
  - frontend `/api/health` rewrite returned backend `status: ok`, `version: 2026-05-09d`
  - frontend `/app/projects` returned HTTP 200 from Vercel
- Production checks after `d891e1d`:
  - backend `/api/health` returned `status: ok`, `version: 2026-05-09d`
  - frontend `/app/projects` returned HTTP 200 from Vercel
  - frontend `/api/health` rewrite returned backend `status: ok`, `version: 2026-05-09d`
- Production checks after `62b29f4`:
  - backend `/api/health` returned `status: ok`, `version: 2026-05-09d`
  - frontend `/api/health` rewrite returned backend `status: ok`, `version: 2026-05-09d`
  - frontend `/app/projects` returned HTTP 200 from Vercel
- Production checks after `e33bc42`:
  - backend `/api/health` returned `status: ok`, `version: 2026-05-09d`
  - frontend `/api/health` rewrite returned backend `status: ok`, `version: 2026-05-09d`
  - frontend `/app/projects` returned HTTP 200 from Vercel
- Production checks after `c4d59fd`:
  - backend `/api/health` returned `status: ok`, `version: 2026-05-09d`
  - frontend `/api/health` rewrite returned backend `status: ok`, `version: 2026-05-09d`
  - frontend `/app/projects` returned HTTP 200 from Vercel
- Production checks after `b5114c3`:
  - backend `/api/health` returned `status: ok`, `version: 2026-05-09d`
  - frontend `/api/health` rewrite returned backend `status: ok`, `version: 2026-05-09d`
  - frontend `/app/projects` returned HTTP 200 from Vercel
- Production checks after `596941a`:
  - backend `/api/health` returned `status: ok`, `version: 2026-05-09d`
  - frontend `/api/health` rewrite returned backend `status: ok`, `version: 2026-05-09d`
  - frontend `/app/projects` returned HTTP 200 from Vercel
- Production checks after `8627b69`:
  - backend `/api/health` returned `status: ok`, `version: 2026-05-09d`
  - frontend `/api/health` rewrite returned backend `status: ok`, `version: 2026-05-09d`
  - frontend `/app/projects` returned HTTP 200 from Vercel

## Latest Work Completed

- Added LINE Project Guest Upload v1:
  - public portal users can upload PDF/JPG/PNG/WebP into the linked project
  - backend `POST /api/project-portal/:token/upload`
  - uploaded files are saved as `DocumentIntake` with `source: project_guest`, `projectId`, and `status: needs_review`
  - guest uploads are intentionally review-only; they do not create purchase invoices, claim VAT, expose exports, or expose original file download links to guests
- Verified locally after LINE Project Guest Upload v1:
  - backend `npm run typecheck`
  - frontend `npm run typecheck`
  - backend `npm run build`
  - frontend `npm run build`
- Added LINE Project Guest Portal foundation:
  - admin can create a 7-day signed Project Portal link for a LINE group that is already assigned to a project
  - backend `POST /api/line/admin/groups/:groupId/portal-link`
  - public backend `GET /api/project-portal/:token`
  - frontend public route `/project-portal/:token`
  - portal shows project health, budget, committed cost, remaining budget, action-needed count, recent files, and project metadata
  - portal is read-only and does not expose file download URLs, exports, RD/certificate settings, or company-wide accounting
- Verified locally after LINE Project Guest Portal foundation:
  - backend `npm run typecheck`
  - frontend `npm run typecheck`
  - backend `npm run build`
  - frontend `npm run build`
- Added DBD / DGA API foundation:
  - backend `GET /api/dbd/status`
  - backend `GET /api/dbd/juristic/:juristicId`
  - backend `GET /api/dbd/juristic-search?name=...`
  - service gets DGA token via `DGA_CONSUMER_KEY`, `DGA_CONSUMER_SECRET`, and `DGA_AGENT_ID`
  - DBD profile/search paths are configurable by env so production can follow DGA/DBD contract changes without code edits
  - DBD is optional; routes return 503 when credentials are not configured
- Updated `docs/project-workspace-profit-plan.md` with the recommended round-by-round build order and DBD phase.
- Verified locally after DBD foundation:
  - backend `npm run typecheck`
- Added Smart Matching v1:
  - project workspace now returns `smartMatches` for unmatched slips/supporting documents and likely purchase candidates
  - Project Workspace has a Matching tab and overview matching panel
  - candidate scoring uses amount, supplier/receiver name, and date proximity
  - users can attach a matched document intake to a purchase invoice directly from the project workspace
- Verified locally after Smart Matching v1:
  - backend `npx tsc --noEmit`
  - frontend `npx tsc --noEmit`
  - backend `npm run build`
  - frontend `npm run build`
  - `git diff --check`
- Added Project Close-out / Phase 5 v1:
  - backend `POST /api/projects/:id/export/sheets` creates a Google Sheet with Overview, Action Needed, Files, Purchases, Sales, Expenses, and LINE Groups
  - backend `GET /api/projects/:id/export/zip` downloads a project attachment ZIP from storage-backed or DB-backed document intakes and includes `_links.txt` for link-only files
  - Project Workspace now has Sync Sheet and ZIP buttons beside Export Excel
  - Drive upload endpoint can receive `projectId` and `documentFolder` and place files into the project/category folder
  - project document intake uploads mirror a copy to the project Drive folder when Drive is configured, while keeping existing R2/DB preview behavior
- Added Monetization / Debug Phase 6 v1:
  - LINE live-status now includes 30-day source/mime breakdown and usage telemetry
  - Admin LINE/OCR status panel now shows billable documents, OCR intakes, LINE/web split, and estimated OCR cost
- Verified locally after Phase 5/6 v1:
  - backend `npx tsc --noEmit`
  - frontend `npx tsc --noEmit`
  - backend `npm run build`
  - frontend `npm run build`
  - `git diff --check`
- Added Project Approval Workflow v1:
  - project owner/approver can approve or reject submitted project expense vouchers
  - admins and super admins keep global expense approval permission
  - expense list/detail responses now include `canApprove` without exposing internal project member data
  - frontend Payment Voucher page shows approve/reject actions when the current user can approve the voucher
- Added Project Tax Safety Layer v1:
  - project workspace files and purchase invoices now include `taxSafety`
  - statuses include `vat_claimable`, `expense_only_no_vat`, `needs_tax_invoice`, `missing_required_fields`, `unmatched_payment`, `supporting_only`, and `needs_review`
  - project workspace overview shows Tax Safety summary, claimable input VAT, and risk counts
  - file list and purchase rows show tax safety chips
  - project Excel export now includes tax safety status and notes for Files and Purchases
- Verified locally after Approval Workflow + Tax Safety work:
  - backend `npx tsc --noEmit`
  - frontend `npx tsc --noEmit`
  - backend `npm run build`
  - frontend `npm run build`
  - `git diff --check`
- Added LINE Project Admin + Debug v1:
  - admin can assign/unassign a linked LINE group to a project from Admin → LINE
  - backend `PATCH /api/line/admin/groups/:groupId/project`
  - LINE live status recent document list now includes file name, source, project, target info, and purchase invoice linkage
  - Admin LINE group list now shows current project chip/link
- Added Project Export Pack v1:
  - backend `GET /api/projects/:id/export/excel`
  - project export workbook includes Overview, Action Needed, Files, Purchases, Sales, Expenses, and LINE Groups sheets
  - Project Workspace now has an Export Excel button
- Verified locally after LINE Admin + Project Export work:
  - backend `npm run typecheck`
  - frontend `npm run typecheck`
  - backend `npm run build`
  - frontend `npm run build`
  - `git diff --check`
- Added Project Context Everywhere v1:
  - Sales invoices can now store/update `projectId`
  - Sales invoice list supports `projectId` filtering and shows project chips
  - Invoice Builder has a project picker and honors `/app/invoices/new?projectId=...`
  - Input VAT purchase list supports `projectId` filtering and honors `/app/purchase-invoices?projectId=...`
  - Payment Voucher / Expenses can now store/update `projectId`
  - Expenses list supports `projectId` filtering and shows project chips
  - Project Workspace quick actions now open new sales invoice or expenses with the current project preselected
- Verified locally after Project Context Everywhere v1:
  - backend `npm run typecheck`
  - frontend `npm run typecheck`
  - backend `npm run build`
  - frontend `npm run build`
  - `git diff --check`
- Added Project Workspace detail MVP:
  - backend `GET /api/projects/:id/workspace`
  - frontend route `/app/projects/:id`
  - project list cards now open the workspace; edit remains a separate icon action
  - workspace shows budget, committed cost, sales invoiced, estimated margin, action-needed documents, file library, purchases, sales invoices, expense vouchers, LINE groups, and team context
  - file library previews PDF/JPG/PNG/WebP thumbnails where available and can open stored files
  - upload from project workspace sends files to `/api/purchase-invoices/document-intakes/upload` with the current `projectId`
- Verified locally:
  - backend `npm run typecheck`
  - frontend `npm run typecheck`
  - backend `npm run build`
  - frontend `npm run build`
- Added durable plan document:
  - `docs/project-workspace-profit-plan.md`
  - covers Project Workspace roadmap, LINE guest portal, Payment Voucher/non-VAT expenses, tax safety, pricing, costs, unit economics, and profitability assumptions
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

- `c4d59fd` feat: add project smart matching
- `e33bc42` feat: add project closeout exports and telemetry
- `62b29f4` feat: add project approvals and tax safety
- `c7a2410` feat: add line project admin and export pack
- `790e231` feat: connect projects across document workflows
- `d891e1d` feat: add project workspace detail
- `3a8c210` docs: add project workspace profit plan
- `b108bc4` feat: add solo team project packaging
- `497606c` docs: record project deploy status
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
4. Click a project card and confirm `/app/projects/:id` opens.
5. Upload PDF/JPG/PNG/WebP from the project workspace and confirm the file appears in the project file library.
6. Open Input VAT and upload a PDF/JPG with a project selected.
7. Confirm the intake and saved purchase invoice keep the same `projectId`.
8. In LINE, send a PDF that previously produced no reply.
9. Confirm LINE sends a reply even if OCR cannot read it.
10. Open web app `https://etax-invoice.vercel.app/app/purchase-invoices`.
11. Check Input VAT document library:
   - LINE-uploaded PDF/JPG appears.
   - thumbnail/preview opens.
   - OCR status is visible.
   - failed unreadable file remains available for manual review.
12. Send a bank transfer slip and confirm reply includes sender/receiver/reference.

## Known Risks / Next Improvements

- Production DB read-only debugging is not yet set up as a safe repeatable tool.
- Projects v1 is usable for budget/project tagging and workspace review, but next useful upgrades are:
  - project picker in LINE Admin group UI is now implemented in v1
  - project Excel export is now implemented in v1
  - project filter across Input VAT, expenses, and invoice lists is implemented in v1
  - approval workflow by project owner/approver
  - wire Drive uploads from project/category into the new Drive folder foundation
  - add Google Sheet sync and ZIP attachment pack per project
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
