# Pending TODOs — deferred work

Last updated: 2026-05-19

Items that were intentionally deferred during the launch-readiness push.
Pick these up when the right trigger fires (column "When to revisit").

## Deploy workflow — current state (2026-05-20)

Render `autoDeployTrigger: commit` is live (commit `8047c4e`). Code-only
pushes ship without human intervention; Render builds + restarts from
the push webhook directly. The GitHub `Deploy to Render` workflow is
**bypassed in this path** — it stays around for one specific case below.

| Push contains | How to ship | Why |
|---|---|---|
| Code-only (TS/React/configs) | Just push. Render auto-deploys. | The webhook path doesn't run migrations, but it doesn't need to either. |
| Prisma migration (new SQL under `backend/prisma/migrations/`) | `gh workflow run "Deploy to Render"` manually | Render's webhook deploy SKIPS the migration step. Code expecting new columns will 500 until the workflow's "Apply production migrations" step runs. |

When in doubt: check `git diff origin/main..HEAD backend/prisma/migrations/`.
Any output → use the workflow. Empty → push and walk away.

Future cleanup (low priority): teach the auto-deploy path to also run
migrations — e.g., a Render pre-deploy command that runs
`npx prisma migrate deploy` before the app starts. Then the workflow
becomes optional.

## Deferred features

| Item | Effort | When to revisit | Notes |
|------|--------|-----------------|-------|
| **Drive folder restructure (`01_ขาย`/`02_ซื้อ`/`03_ค่าใช้จ่าย`/`04_ภาษี`/`05_ฐานข้อมูล`/`06_โปรเจค`)** | 4–6 h | Before first paying customer audits — or when an existing tenant complains the Drive is messy | Master Sheet rebuild already groups data the audit-friendly way; Drive can stay on the current `Customers/<code>` + `Projects/<code>` until we have user evidence it's a real problem. Add YYYY/MM bucketing inside transaction folders. `ensureLegacyMoved` helper to migrate existing tenants lazily on first post-deploy upload. |
| **LINE bot — combined slip+bill Flex card** | 3–4 h | After a real LINE-OA user complains about the split cards | Was intentionally removed in `ae77fb6`; re-adding is design churn unless we have user evidence the split is worse. |
| **Onboarding tour / in-app guided walkthrough** | 4–6 h | After 5–10 paying customers report "I didn't know what to do" | Needs a library decision (Shepherd / react-joyright / custom) and live UX testing. Don't ship without watching at least one prospect use the product first. |
| **API documentation (OpenAPI / Swagger)** | 4 h | When a B2B customer asks for an integration spec | Generate via `swagger-jsdoc` or `zod-to-openapi` over existing Zod schemas. |
| **Multi-user roles per company** (accountant / viewer in addition to admin) | 6+ h | When a single-tenant customer asks for it OR before a 5-seat plan exists | Schema change is significant — `User` already has `role` but every permission gate currently treats `admin` as the only "edit" role. Needs auth-policy spec before code. |
| **Cross-region Postgres replica** (or weekly `pg_dump` to S3) | 3 h | After Render SG outage > 1 h, OR > 50 paying customers | Currently single-region; documented in `docs/deployment/disaster-recovery.md`. |
| **On-call rotation + Sentry alert routing** | 2 h | When 2+ humans need to share pager duty | Single-founder right now; pager fatigue isn't a problem yet. |
| **Customer-facing data-rights UI inside app** (currently API-only) | 4 h | Before first paying customer | `/account/export`, `/account/delete`, `/account/delete/cancel` exist as endpoints; need an in-app "Account → Privacy" tab. |

## Payroll module — IN PROGRESS (Phase 3)

Schema landed on disk in this session but **not yet shipped** as code.
Commit on disk includes the Prisma model + migration only; routes,
services, and UI still to build.

| Layer | Status | Notes |
|---|---|---|
| Schema (Employee + PayrollRun + Payslip + PayrollRunStatus enum) | ✅ on disk | `backend/prisma/schema.prisma` |
| Migration `20260520_payroll_module` | ✅ on disk | Not yet applied to production |
| Backend services (Thai income tax calc + SSO calc + payroll runner) | ❌ TODO | Will live under `backend/src/services/payroll/` |
| Backend routes (employees CRUD + payroll run + payslips + ภงด.1 / สปส. exports) | ❌ TODO | Suggested: new `backend/src/routes/payroll.ts` |
| Frontend (Employees list/form, PayrollRun page, Payslip viewer) | ❌ TODO | Suggested: `frontend/src/pages/Employees.tsx`, `Payroll.tsx`, `Payslip.tsx` |
| Sidebar IA (Payroll as a new top-level section OR under Purchases) | ❌ TODO | Probably its own top item: payroll touches monthly cadence + government filings |
| Production migration | ❌ TODO | Run `gh workflow run "Deploy to Render"` after the schema + routes ship (migration won't auto-apply via the commit auto-deploy path — see deploy gotcha section above) |

Thai income tax rates to encode (2026):
- 0 – 150,000 → 0 %
- 150,001 – 300,000 → 5 %
- 300,001 – 500,000 → 10 %
- 500,001 – 750,000 → 15 %
- 750,001 – 1,000,000 → 20 %
- 1,000,001 – 2,000,000 → 25 %
- 2,000,001 – 5,000,000 → 30 %
- > 5,000,000 → 35 %

Allowances per employee (pulled from Employee row):
- Personal: 60,000 baht/year
- Spouse: 60,000 (if `hasSpouse`)
- Children: 30,000 × `numChildren` (max 3)
- Parents: 30,000 × `numParents` (max 2)
- Employment-income standard expense: min(50 % of income, 100,000)

SSO formula: 5 % of `baseSalary` capped at salary of 15,000 → max
750 baht/month employee + 750 baht/month employer.

When the next agent picks this up: start with
`backend/src/services/payroll/thaiTaxCalculator.ts` (pure functions,
no DB), then the runner, then routes, then UI.

## Google OAuth verification — defer until public launch

**Status (2026-05-20):** Drive + Sheets integration works for the project
owner and any Google account added as a Test User in the OAuth consent
screen. Other users see a "Google hasn't verified this app" warning page
they must click through. Acceptable for closed beta; not acceptable for
public launch.

When to revisit:

| Trigger | Action |
|---------|--------|
| First beta customer wants Drive sync | Add their email as Test User (Cloud Console → OAuth consent screen → Test users → + ADD USERS). 1 minute per email. Limit 100. |
| About to open public signup | Fill the OAuth consent screen and submit for Google verification. Privacy/ToS pages are ready at `/privacy` and `/terms`; just need to plug the URLs and authorized domains (`etax-invoice.vercel.app`, `etax-invoice-api.onrender.com`) into the form. Click "Publish App" to trigger review. Google typically responds in 2–6 weeks. |
| Hit 100 test users | Same as above — verification becomes mandatory. |

Scopes we'll need to justify in the verification request:
- `https://www.googleapis.com/auth/drive.file` — store generated e-Tax
  PDFs in the customer's own Drive so they retain ownership and can
  audit independently. We never read files we didn't create.
- `https://www.googleapis.com/auth/spreadsheets` — export the
  per-tenant Master Workspace Sheet (tax / sales / purchases summary).

## User-side action items (out of scope for code agent)

| Item | Owner | Trigger to start |
|------|-------|------------------|
| Domain choice + purchase (`billboy.co` recommended) | User | Anytime before public launch |
| Cloudflare account + DNS + R2 bucket setup | User | After domain choice |
| Resend domain verification + Render SMTP env vars | User | After domain DNS is live |
| Stripe live mode end-to-end test | User | Before first paid signup |
| Cert upload to Admin Panel (real TDID/INET `.p12`) | User | Before first real e-Tax submission |
| Thai company registration | User | After 3–5 paying customers validate the product |
| Run the quarterly DR drills documented in `disaster-recovery.md` | User | First drill before paying customer, then every 90 days |

## What's already done (so we don't re-do it)

Tracked in `PROJECT_STATE.md` and commit history from `73c6925` onwards.
Headline items:

- Sentry verified end-to-end with PII scrubbing
- Multi-tenant cert leak fixed (DB BYTEA + per-company cache)
- PDPA-compliant Privacy / ToS / DPA in TH + EN + ZH
- Section 19 consent + re-consent on version bump
- Section 30/31 export endpoint (full data, not capped)
- Section 33 erasure with 30d user grace + 5y tax retention + owner override
- Cookie Banner with explicit consent
- LINE webhook timing-attack hardened
- DSR confirmation email + Owner Control Plane queue at `/ops/dsr`
- Demo data seed for prospects
