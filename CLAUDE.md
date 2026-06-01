# Thai e-Tax Invoice System

ETDA ขมธอ. 3-2560 — submits XAdES-BES signed XML to Revenue Department API.
**Product ขายจริง** — multi-tenant SaaS สำหรับออกใบกำกับภาษีอิเล็กทรอนิกส์

> **Start here for handoff:** read [`AI_HANDOFF.md`](AI_HANDOFF.md) first, then [`PROJECT_STATE.md`](PROJECT_STATE.md) for the compact latest production/deploy status, recent commits, dirty local state, and next verification steps. Open `docs/state/PROJECT_HISTORY_2026-05.md` only when older detailed history is needed.

## Stack
- **Frontend** `frontend/` — React 18 + Vite 5 + TypeScript 5 + Tailwind 3 + Zustand, port 3000
- **Backend** `backend/` — Node 20 + Express 4 + TypeScript 5 + Zod + BullMQ 5, port 4000
- **DB** — PostgreSQL 16 via Prisma 5 (`prisma/schema.prisma`)
- **Queue** — Redis 7 via BullMQ
- **Signing** — node-forge: XAdES-BES, PKCS#12, RSA-SHA256
- **Timestamp** — RFC 3161 TSA (freetsa dev, TDID prod)
- **PDF** — Puppeteer HTML→PDF
- **Storage** — S3-compatible (AWS SDK v3)

## Production deployment
- **Frontend** → Vercel (auto-deploy on push to main)
- **Backend** → Render (`etax-invoice-api`) — `https://etax-invoice-api.onrender.com`
- **Worker** → Render (`etax-invoice-worker`) — BullMQ signing worker
- **DB** → Render Postgres (`etax-postgres`)
- **Redis** → Render Redis

## Dev credentials
```
Admin:    admin@siamtech.co.th / Admin@123456
Postgres: etax_user / etax_secret @ localhost:5432/etax_invoice
Redis:    redis_secret @ localhost:6379
Cert:     backend/certs/test-company.p12 / etax-dev-password
```

## Key source files
```
backend/src/services/
  xmlService.ts           UBL XML generation (generateRDXml)
  signatureService.ts     XAdES-BES signing (signXml)
  tsaService.ts           RFC 3161 timestamps
  rdApiService.ts         RD API submission
  pdfService.ts           HTML builders per template variant

backend/src/queues/workers/rdSubmitWorker.ts   BullMQ signing pipeline

frontend/src/pages/InvoiceBuilder.tsx                  Form + live preview split pane (responsive tabs mobile)
frontend/src/components/invoice/TemplateMarketplace.tsx Canva-style gallery panel
frontend/src/lib/documentTemplatePresets.ts            51 template definitions
```

## Document types
| T-code | docType value | Description |
|--------|---------------|-------------|
| T01 | `tax_invoice_receipt` | Cash sale |
| T02 | `tax_invoice` | Credit sale |
| T03 | `receipt` | Payment on T02 |
| T04 | `credit_note` | Refund |
| T05 | `debit_note` | Extra charge |

## Template system (51 templates)
- Groups: Standard · Minimal · Pro · Cute · Dark (10) · Anime (10) · Fun
- `pdfService.ts` routes by prefix: `builtin:dark-*` → `buildHtmlDark(variant)`, `builtin:anime-*` → `buildHtmlAnime(variant)`
- `documentTemplatePresets.ts` — `id, tagEn, swatches[]`; `tagEn` controls marketplace category

## Signing pipeline
```
Invoice → generateRDXml() → signXml() → requestTimestamp() → submitToRD()
```
Orchestrated by `rdSubmitWorker.ts`. `RD_ENVIRONMENT=sandbox` (default) → mock responses.

## Multi-tenancy rule
Always use `req.user!.companyId` — **never trust companyId from request body**.

## GitHub Actions workflows
- `typecheck.yml` — tsc check on every push/PR
- `keepalive.yml` — ping Render every 5 min (prevent cold start)
- `db-migrate.yml` — manual production migration
- `render-deploy.yml` — trigger Render deploy on push to main, report status back to GitHub
- `health-check.yml` — check Vercel + Render every 10 min

## Deploy status
- `render-deploy.yml` is currently working on `main`; backend deploys have been verified through GitHub Actions and Render health.
- See `PROJECT_STATE.md` for the current verified backend health version and CLI status. Use `docs/state/PROJECT_HISTORY_2026-05.md` only for older detailed deploy history.

## MCP tools ที่ใช้งานได้
- `gh` CLI ✅ — logged in locally as `maimpcorsair-cyber`; use for Actions/deploy run checks
- `context7` ✅ — library docs
- `playwright` ✅ — E2E browser testing
- `sequential-thinking` ✅ — structured step-by-step reasoning for tricky debugging/planning
- `memory` ✅ — local MCP memory graph
- `sentry` ✅ — Sentry issue/release/debug context
- `tavily` 🔑 — AI web search, needs `TAVILY_API_KEY`
- `firecrawl` 🔑 — web scraping, needs `FIRECRAWL_API_KEY`

Do not assume Postgres MCP is available unless `/mcp` shows it in the current Claude session. If absent, use `/db-shell`, `source-command-db-shell`, or `psql`-based project commands. Codex/Claude parity notes live in `docs/agents/tool-parity.md`.

## Agent skills

### Issue tracker

Work is tracked in GitHub Issues for `maimpcorsair-cyber/Etax-invoice`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default Matt Pocock label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo. Start from `AI_HANDOFF.md`, then `PROJECT_STATE.md`, then `AGENTS.md`/`CLAUDE.md`. See `docs/agents/domain.md`.

### Tool parity

Codex and Claude should both see the 59 mirrored project skills. Keep `.agents/skills/` and `.claude/skills/` aligned. See `docs/agents/tool-parity.md`.

## สิ่งที่ยังต้องทำ (priority — verified 2026-05-19)
1. 🟡 **Real cert per company — backend infra พร้อมแล้ว แต่ไม่มีใครอัพโหลดจริง** — DB BYTEA + per-tenant cache fix shipped (`bdff724`). ขั้นต่อไปคือ user ทดสอบ upload TDID/INET cert ผ่าน Admin Panel (`frontend/src/pages/AdminPanel.tsx:1566`) แล้วรัน `/signing-test`
2. 🟡 **Combined slip+bill Flex card** (paypers-style) — LINE bot polish, batching ถูกถอดใน `ae77fb6`
3. 🟢 **Stripe billing live mode** — Backend wired (`routes/billing.ts`, `billingRenewalWorker`), `STRIPE_SECRET_KEY` ตั้งใน Render เรียบร้อย — ต้องทดสอบ checkout จริง

Done (อย่าทำซ้ำ):
- ✅ **Cert per-company multi-tenancy** — fixed `bdff724` (2026-05-19). `.p12` ย้ายเข้า `Company.certificateBlob` BYTEA + cache per companyId; ของเก่าเขียนทับกันบน FS ephemeral
- ✅ **Signup/Onboarding E2E test** — verified 2026-05-19 end-to-end on production (POST `/free-signup` → DB persist → 409 on dup probe); commit `840c755` UX fixes verified via Playwright. See `PROJECT_STATE.md`.
- ✅ **Sentry verified end-to-end** — backend + frontend both shipping events to project `4511412901052416` (2026-05-19)
- ✅ Puppeteer/PDF บน Render — Dockerfile install Chromium + Thai fonts, `/api/health/pdf` smoke test endpoint
- ✅ Certificate upload UI — `AdminPanel.tsx:CertificateTab` มีครบ
- ✅ Subscription tables + Stripe routes
- ✅ LINE bot OCR pipeline (gpt-4o-mini → Gemini → OpenRouter)
- ✅ Magic-link guest edit page (`/intake-edit/<jwt>`, 72h TTL, slip auto-OCR, rate-limit, audit log)

## Gotchas
1. **Prisma lives in backend/** — single source of truth at `backend/prisma/schema.prisma`. Always `cd backend && npx prisma generate` (NOT root). Root no longer has a prisma/ dir as of 2026-05-18 cleanup.
2. **Raw SQL casing** — Prisma camelCase columns need double-quotes: `SELECT "isActive" FROM users`
3. **PKCS#12 on OpenSSL 3** — use `algorithm: 'aes256'` in `toPkcs12Asn1`, not `'3des'` (MAC verify fails)
4. **JWT expiresIn** — jsonwebtoken v9 `StringValue` type, cast `as any` (see `routes/auth.ts`)
5. **Certs never committed** — `backend/certs/` in `.gitignore`; upload real cert via `POST /api/admin/certificate`
6. **seller JSON snapshot** — pass full company object as `seller` JSONB on invoice create; don't rely on join

## Common commands
```bash
# Type check
cd frontend && npx tsc --noEmit
cd backend  && npx tsc --noEmit

# Migration
npx prisma migrate dev --name <name>

# Restart backend
pkill -f "tsx watch"; cd backend && npx tsx watch src/index.ts &
```

## Handoff hygiene
- Before final reply, update `PROJECT_STATE.md` when the work changes production/deploy status, CLI/tooling status, schema/database state, LINE/OCR behavior, important risks, or next verification steps. Keep it short, do not include secrets, and put long history in `docs/state/`.

## Slash commands
`/typecheck` `/health` `/db-shell "SQL"` `/logs [pattern]`
`/restart-backend` `/restart-frontend` `/migrate [name]`
`/gen-cert` `/sign-test` `/rd-submit <invoiceId>` `/review [file]`

## Design Context (frontend/UI)

Canonical source: [`.impeccable.md`](.impeccable.md). Read it before any UI work. Essence:

- **Users**: Thai SME owners (occasional, mobile, want simplicity + confidence), accountants (daily power users, want density + efficiency), LINE-first operators (capture from phone). Formal Thai business context — documents go to กรมสรรพากร; errors cost money.
- **Brand**: Clear · Trustworthy · Professional. Feel like a well-run law firm's software — calm and in control, never flashy or entertaining.
- **Theme**: Light mode (daytime office, formal, government submissions).
- **Color**: Navy authoritative (`#1e3a8a` zone), clean white backgrounds. **No** SaaS purple/gradient, no AI-slop glowing hero metrics, no marketing-site look.
- **References**: Thai banking apps (KBank, SCB Biz), Notion, Linear — information density without decoration.
- **Principles**: density over decoration · trust through restraint (solid fills, color means something) · clarity under time pressure · bilingual TH/EN first-class · mobile-aware desktop-first · next action always visible · customer surfaces simpler than seller surfaces · LINE is a first-class input channel.
- **Anti-goals**: never leak infra/tax-infra terms (tenant, XAdES, BullMQ, webhook, worker, magic link) into owner/customer UI; no generic SaaS marketing pages for core product; don't bury pay/share actions behind menus; don't use AI/purple/glow to signal "intelligence" — show it through fewer corrections and clearer next steps.
