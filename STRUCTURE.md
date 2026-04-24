# e-Tax Invoice System v2.0 — Project Structure

## Stack

| Layer     | Technology                                       |
|-----------|--------------------------------------------------|
| Frontend  | React 18 + TypeScript + Vite + Tailwind CSS      |
| i18n      | i18next + react-i18next (TH/EN instant switch)   |
| Backend   | Node.js + Express + TypeScript                   |
| Database  | PostgreSQL 16 + Prisma ORM                       |
| Queue     | BullMQ + Redis (PDF gen, sign, RD submit, retry) |
| PDF       | Puppeteer (Thai font via Sarabun/Google Fonts)   |
| Storage   | S3-compatible (MinIO for local dev / AWS S3)     |
| Auth      | JWT + RBAC (4 roles)                             |
| Container | Docker Compose                                   |

## Folder Structure

```
2048/
├── docker-compose.yml          # Full stack: postgres, redis, backend, frontend, minio
├── .env.example                # All environment variables documented
├── prisma/
│   └── schema.prisma           # Prisma schema (bilingual fields throughout)
├── database/
│   └── migrations/
│       ├── 001_initial.sql     # Complete PostgreSQL schema
│       └── 002_seed.sql        # Demo data (company, users, customers, products)
├── frontend/
│   ├── src/
│   │   ├── i18n/
│   │   │   ├── index.ts        # i18next config (auto-detect, localStorage persist)
│   │   │   └── locales/
│   │   │       ├── th.json     # 200+ Thai translation keys
│   │   │       └── en.json     # 200+ English translation keys
│   │   ├── components/
│   │   │   ├── LanguageSwitcher.tsx  # TH/EN toggle (top-right, instant switch)
│   │   │   ├── Navbar.tsx            # Bilingual nav with user menu
│   │   │   └── Layout.tsx
│   │   ├── pages/
│   │   │   ├── Landing.tsx     # Marketing page (bilingual, pricing)
│   │   │   ├── Login.tsx       # Auth page
│   │   │   ├── Dashboard.tsx   # Stats + recent invoices
│   │   │   ├── InvoiceList.tsx # Search/filter invoice list
│   │   │   ├── InvoiceBuilder.tsx  # Full invoice creation (bilingual fields)
│   │   │   ├── AdminPanel.tsx  # Company, users, templates, RD config, cert
│   │   │   ├── AuditLogs.tsx   # Immutable audit trail
│   │   │   └── Settings.tsx    # Language, notifications, API keys
│   │   ├── hooks/
│   │   │   └── useLanguage.ts  # localizedField(), formatCurrency(), formatDate() (BE/CE)
│   │   ├── store/
│   │   │   └── authStore.ts    # Zustand + persist
│   │   └── types/
│   │       └── index.ts        # Full TypeScript types
└── backend/
    ├── src/
    │   ├── index.ts             # Express app (helmet, cors, rate-limit)
    │   ├── config/
    │   │   ├── database.ts      # Prisma client singleton
    │   │   ├── redis.ts         # ioredis client
    │   │   └── logger.ts        # Winston logger
    │   ├── middleware/
    │   │   └── auth.ts          # JWT authenticate + requireRole()
    │   ├── routes/
    │   │   ├── auth.ts          # POST /login, GET /me
    │   │   ├── invoices.ts      # CRUD + submit-to-RD endpoint
    │   │   ├── customers.ts     # CRUD with bilingual fields
    │   │   ├── products.ts      # CRUD with bilingual fields
    │   │   ├── audit.ts         # GET audit logs (admin only)
    │   │   └── admin.ts         # Company, users, RD config, certificate
    │   ├── services/
    │   │   ├── pdfService.ts    # Puppeteer PDF (TH/EN/Both), Thai Sarabun font
    │   │   ├── xmlService.ts    # RD-compliant XML (UBL schema, Thai required)
    │   │   ├── auditService.ts  # Append-only audit logging
    │   │   ├── invoiceService.ts # Invoice number gen, amount-in-words (TH+EN)
    │   │   └── storageService.ts # S3 upload/download/presigned URLs
    │   ├── queues/
    │   │   ├── index.ts         # BullMQ queue definitions
    │   │   └── workers/
    │   │       ├── pdfWorker.ts    # PDF + XML generation worker
    │   │       └── rdSubmitWorker.ts  # RD submission + retry worker
    │   └── templates/
    │       └── invoice-bilingual.html  # Full bilingual HTML template
    └── Dockerfile
```

## Bilingual Field Convention

Every user-facing entity has `_th` / `_en` variants:

```sql
customers:   name_th, name_en, address_th, address_en
products:    name_th, name_en, description_th, description_en
invoice_items: name_th, name_en, description_th, description_en
companies:   name_th, name_en, address_th, address_en
```

## Invoice Document Language Options

| Setting | PDF output                        | XML (RD)       |
|---------|-----------------------------------|----------------|
| `th`    | Thai text only                    | Thai (required)|
| `en`    | English text only                 | Thai (required)|
| `both`  | Thai + English side-by-side       | Thai (required)|

> RD requires Thai for all XML submissions. English is for display/export only.

## Queue Jobs (BullMQ)

```
invoice-processing queue:
  - generate-pdf     → pdfWorker (concurrency: 5, retry: 3 exponential)

rd-submission queue:
  - submit-to-rd     → rdSubmitWorker (concurrency: 2, retry: 5 exponential)
  - Dead-letter: invoices with status=failed after max retries
```

## RBAC Roles

| Role        | Capabilities                              |
|-------------|-------------------------------------------|
| super_admin | All + cross-company management            |
| admin       | Company settings, users, all invoices     |
| accountant  | Create/edit invoices, submit to RD        |
| viewer      | Read-only access                          |

## Quick Start

```bash
# 1. Copy env
cp .env.example .env

# 2. Start infrastructure
docker-compose up -d postgres redis minio

# 3. Backend
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npm run dev

# 4. Frontend
cd frontend
npm install
npm run dev

# Or full Docker stack:
docker-compose up --build
```

**Frontend**: http://localhost:3000
**Backend API**: http://localhost:4000
**MinIO Console**: http://localhost:9001
**Demo login**: admin@siamtech.co.th / Admin@123456
