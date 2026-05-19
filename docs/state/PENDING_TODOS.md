# Pending TODOs — deferred work

Last updated: 2026-05-19

Items that were intentionally deferred during the launch-readiness push.
Pick these up when the right trigger fires (column "When to revisit").

## Deferred infrastructure / DX

| Item | Effort | When to revisit | Notes |
|------|--------|-----------------|-------|
| **Render auto-deploy on push to main** | 1 h | Next time someone notices a fix took 30 min to land | `render-deploy.yml` currently only fires on `workflow_dispatch`. Every push requires a manual `gh workflow run "Trigger Render Deploy"` to actually ship. Add a `push: branches: [main]` trigger OR enable Render-side auto-deploy (Dashboard → service → "Auto-Deploy: On"). The latter is easier and skips the migration step we currently do in the workflow — figure out whether migrations should also be automated or stay manual. |

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
