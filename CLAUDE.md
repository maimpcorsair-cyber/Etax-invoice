# Thai e-Tax Invoice System — Project Memory

Full-stack e-Tax Invoice application compliant with **ETDA ขมธอ. 3-2560** (Thai Electronic Transactions Development Agency standard), submitting signed + timestamped XML documents to the **Revenue Department (กรมสรรพากร)** via their e-Tax API.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite 5 + TypeScript 5 + Tailwind 3 + Zustand + lucide-react |
| Backend | Node 20 + Express 4 + TypeScript 5 + Zod + BullMQ 5 |
| Database | PostgreSQL 16 via Prisma 5 |
| Queue | Redis 7 (BullMQ) |
| Signing | node-forge (XAdES-BES, PKCS#12, RSA-SHA256) |
| Timestamp | RFC 3161 TSA (freetsa dev / TDID prod) |
| Storage | S3-compatible (AWS SDK v3) |
| Render | Puppeteer (PDF generation) |

## Repo layout

```
/
├── backend/        Express API + workers (port 4000)
├── frontend/       React SPA (port 3000, Vite proxy → :4000)
├── prisma/         schema.prisma (single source of truth)
├── database/       Raw SQL migrations for reference
├── docker-compose.yml  Postgres + Redis
└── .claude/
    ├── agents/     Specialized subagents (etax-specialist, cert-manager, etc.)
    └── commands/   Slash commands (/typecheck, /sign-test, etc.)
```

## Quick index

- **Full tools reference**: see [`.claude/TOOLS.md`](.claude/TOOLS.md) — agents, commands, skills, MCP servers with a task → best-fit tool matrix.

## Team agents — when to invoke which

| Task | Agent |
|------|-------|
| Anything Thai-e-Tax domain (ETDA, XAdES, RD API, XML schema, T01-T05) | `etax-specialist` |
| Certificate / PKCS#12 / signing errors | `cert-manager` |
| Prisma schema, migrations, raw SQL | `prisma-db` |
| Express routes, services, BullMQ workers | `backend-dev` |
| React pages, components, forms, Tailwind | `frontend-dev` |
| TypeScript errors (`tsc --noEmit` fails) | `ts-fixer` |
| End-to-end HTTP testing with curl | `api-tester` |
| Pre-commit review, security audit | `code-reviewer` |

Claude Code will auto-route to the right agent when a task matches; you can also invoke explicitly with the `Agent` tool.

## Slash commands

| Command | Purpose |
|---------|---------|
| `/typecheck` | Run `tsc --noEmit` on backend + frontend in parallel |
| `/gen-cert` | Regenerate the self-signed dev .p12 |
| `/sign-test` | Run full XAdES-BES + TSA signing pipeline test |
| `/restart-backend` | Kill + restart tsx watch on :4000 |
| `/restart-frontend` | Kill + restart Vite on :3000 |
| `/health` | Probe all 4 services (backend, frontend, postgres, redis) |
| `/db-shell "SQL"` | Run a raw query against etax_invoice db |
| `/logs [pattern]` | Tail backend logs, optionally filtered |
| `/rd-submit <invId>` | Queue an invoice for RD submission |
| `/migrate [name]` | Apply or create a Prisma migration |
| `/review [file]` | Invoke code-reviewer on uncommitted changes |

## Official Anthropic skills (auto-discovered)

| Skill | Used when |
|-------|-----------|
| `pdf` | Reading RD regulation PDFs, filling invoice templates, OCR of scanned receipts |
| `xlsx` | Bulk-importing customers/invoices from Excel, exporting monthly VAT reports |
| `docx` | Generating formal letters, contracts, reports |
| `skill-creator` | Creating new project-specific skills |
| `brand-guidelines` | Applying consistent branding to UI/docs |

**Plus 18 Impeccable design skills** (`critique`, `polish`, `harden`, `clarify`, `distill`, `layout`, `typeset`, `colorize`, `shape`, `bolder`, `quieter`, `delight`, `animate`, `adapt`, `optimize`, `overdrive`, `audit`, `impeccable`) — auto-applied to frontend design tasks. See `.claude/TOOLS.md` for the full matrix.

## MCP servers

Project-scoped in `.mcp.json`:

- ✅ **context7** — up-to-date library docs (Prisma, node-forge, etc.) — no auth
- ✅ **playwright** — E2E browser testing of the React UI — no auth
- 🔑 **tavily** — AI web search — needs `TAVILY_API_KEY`
- 🔑 **firecrawl** — web scraping — needs `FIRECRAWL_API_KEY`

Run `/mcp` in Claude Code to see live status.

## Key conventions

### Multi-tenancy
Every query is scoped by `companyId` from the JWT. **Never trust `companyId` from request body** — always use `req.user!.companyId`.

### Document type codes
| Code | Type | When |
|------|------|------|
| T01 | Tax invoice / receipt (combined) | Cash sale |
| T02 | Tax invoice | Credit sale (awaits payment) |
| T03 | Receipt | Payment against a prior T02 |
| T04 | Credit note | Refund / reduction |
| T05 | Debit note | Additional charge |

### Signing pipeline (invoice submission)
```
Invoice record
  ↓ generateRDXml()               (src/services/xmlService.ts)
UBL XML
  ↓ signXml()                     (src/services/signatureService.ts)
XAdES-BES signed XML
  ↓ requestTimestamp() + embedTimestampInXml()   (src/services/tsaService.ts)
Signed + timestamped XML
  ↓ submitToRD()                  (src/services/rdApiService.ts)
RD response → update DB
```

All orchestrated by `src/queues/workers/rdSubmitWorker.ts` (BullMQ).

### Environments
- `RD_ENVIRONMENT=sandbox` (default) → RD API returns mocked success, TSA falls back to mock if freetsa unreachable.
- `RD_ENVIRONMENT=production` → Real RD call; requires `RD_CLIENT_ID`, `RD_CLIENT_SECRET`, and a real TDID/INET/TOT certificate (not the self-signed dev one).

### Dev credentials
```
Admin user:   admin@siamtech.co.th / Admin@123456
Postgres:     etax_user / etax_secret @ localhost:5432/etax_invoice
Redis:        redis_secret @ localhost:6379
Cert:         backend/certs/test-company.p12 / etax-dev-password
```

## Gotchas (learned the hard way)

1. **Prisma client sync**: the backend has its own `node_modules/@prisma/client`. After `prisma generate` at root, copy with:
   ```bash
   cp -r node_modules/.prisma/client/. backend/node_modules/.prisma/client/
   ```

2. **Column casing in raw SQL**: Prisma emits camelCase columns. psql queries need double-quotes:
   ```sql
   SELECT "isActive" FROM users;  -- not is_active
   ```

3. **PKCS#12 MAC verify errors**: node-forge + `algorithm: '3des'` fails MAC verify on OpenSSL 3. Use `algorithm: 'aes256'` in `toPkcs12Asn1`.

4. **JWT expiresIn typing**: `jsonwebtoken` v9 uses a branded `StringValue` type. Cast `as any` with a comment (done in `routes/auth.ts`).

5. **Certificates are NEVER committed**: `backend/certs/` and `*.p12/*.pem/*.key` are in `.gitignore`. Real TDID certs must be uploaded via `POST /api/admin/certificate`.

6. **Invoice must include `seller` JSON**: when creating an invoice, fetch the company and pass its data as `seller` JSONB. Don't rely on lazy join — the snapshot matters for audit.

## Task hygiene

- After any schema change: `/migrate` → `/typecheck` → `/restart-backend`
- After any cert change: `/sign-test`
- Before committing: `/typecheck` then `/review`
- If backend misbehaves: `/logs error` first, then `/health`
