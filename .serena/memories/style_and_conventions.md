# Style and Conventions

- TypeScript strict mode in backend and frontend.
- Backend uses Express route modules under `backend/src/routes`, service modules under `backend/src/services`, Zod for validation, Prisma for DB access.
- Multi-tenancy: scope DB work by `companyId` from JWT/session context; never trust `companyId` from request bodies.
- Prefer existing helper/service patterns and RLS wrappers (`withRlsContext`, tenant context) when touching route-level data.
- Frontend uses React function components, Tailwind classes, lucide icons, and existing page/component conventions.
- Keep edits scoped and avoid unrelated refactors.
- Do not commit secrets/certs/env files. `.claude/settings.local.json` is local and should not be touched/staged unless requested.
- Before non-trivial edits, use Serena symbol/ref lookup when available.
- After durable production/deploy/schema/LINE/OCR/status changes, update `PROJECT_STATE.md` briefly with facts and verification.