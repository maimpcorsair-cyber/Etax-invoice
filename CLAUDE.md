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
- `mcp__postgres__query` ✅ — query production DB ได้ตรงๆ
- `gh` CLI ✅ — logged in locally as `maimpcorsair-cyber`; use for Actions/deploy run checks
- `context7` ✅ — library docs
- `playwright` ✅ — E2E browser testing

## สิ่งที่ยังต้องทำ (priority — verified 2026-05-19)
1. 🟡 **Real cert per company** — ทุก company ยังใช้ self-signed dev cert, ส่ง RD production จริงต้องอัพโหลด TDID/INET cert ผ่าน Admin Panel (UI พร้อมแล้ว: `frontend/src/pages/AdminPanel.tsx:1566`)
2. 🟡 **Combined slip+bill Flex card** (paypers-style) — LINE bot polish, batching ถูกถอดใน `ae77fb6`
3. 🟢 **Stripe billing live mode** — Backend wired (`routes/billing.ts`, `billingRenewalWorker`), `STRIPE_SECRET_KEY` ตั้งใน Render เรียบร้อย — ต้องทดสอบ checkout จริง

Done (อย่าทำซ้ำ):
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
