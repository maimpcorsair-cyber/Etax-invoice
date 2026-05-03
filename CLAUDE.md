# Thai e-Tax Invoice System

ETDA ขมธอ. 3-2560 — submits XAdES-BES signed XML to Revenue Department API.
**Product ขายจริง** — multi-tenant SaaS สำหรับออกใบกำกับภาษีอิเล็กทรอนิกส์

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

## Pending GitHub Secrets (ต้องใส่ก่อน render-deploy workflow จะทำงาน)
- `RENDER_DEPLOY_HOOK_URL` — Render → etax-invoice-api → Settings → Deploy Hook
- `RENDER_WORKER_DEPLOY_HOOK_URL` — Render → etax-invoice-worker → Settings → Deploy Hook
- `RENDER_API_KEY` — Render → Account Settings → API Keys

## MCP tools ที่ใช้งานได้
- `mcp__postgres__query` ✅ — query production DB ได้ตรงๆ
- `mcp__github__*` ⚠️ — ต้อง add `GITHUB_PERSONAL_ACCESS_TOKEN` ใน `~/.claude/settings.json` → env section
- `context7` ✅ — library docs
- `playwright` ✅ — E2E browser testing

## สิ่งที่ยังต้องทำ (priority)
1. 🔴 **Subscription + Payment system** — `company_subscriptions`, `billing_transactions`, `coupons` tables มีแล้วแต่ยังไม่ implement — เก็บเงินไม่ได้
2. 🔴 **Puppeteer บน Render** — ต้องเพิ่ม Chrome buildpack หรือใช้ Render paid tier (PDF ออกไม่ได้บน production)
3. 🟡 **Signup/Onboarding flow** — ยังไม่ได้ทดสอบ end-to-end (users = 0 ใน DB)
4. 🟡 **Certificate upload UI** — ทุก company ยังไม่มี cert, ส่ง RD production ไม่ได้
5. 🟢 **Render deploy status** — รอใส่ GitHub Secrets 3 ตัวข้างบน

## Gotchas
1. **Prisma client sync** — after `prisma generate` at root:
   ```bash
   cp -r node_modules/.prisma/client/. backend/node_modules/.prisma/client/
   ```
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

## Slash commands
`/typecheck` `/health` `/db-shell "SQL"` `/logs [pattern]`
`/restart-backend` `/restart-frontend` `/migrate [name]`
`/gen-cert` `/sign-test` `/rd-submit <invoiceId>` `/review [file]`
