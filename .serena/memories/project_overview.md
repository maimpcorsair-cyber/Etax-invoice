# Project Overview

Thai e-Tax Invoice System / Billboy in `/Users/domdom/Documents/GitHub/Etax-invoice`.

Purpose: full-stack Thai e-Tax invoice/accounting workflow app with sales e-Tax, purchase OCR/intake, expenses, VAT/PP30, LINE AI, Google Drive/Sheets, project/job workspace, owner operations, and billing.

Stack:
- Frontend: React 18 + Vite + TypeScript + Tailwind + Zustand/react-query + lucide-react.
- Backend: Node 20 + Express + TypeScript + Zod + Prisma + BullMQ.
- DB/queue: PostgreSQL via Prisma, Redis/BullMQ.
- Integrations: LINE Bot, Google Drive/Sheets, Stripe, S3-compatible storage, Puppeteer PDF, Thai e-Tax XML/signing.

Structure:
- `backend/`: Express routes, services, queues/workers, tests.
- `frontend/`: React SPA pages/components/hooks/store.
- `prisma/`: root Prisma schema and migrations.
- `backend/prisma/`: backend deployment migration mirror for Render.
- `PROJECT_STATE.md`: current handoff and deploy state.
- `AGENTS.md`: durable repo instructions and conventions.