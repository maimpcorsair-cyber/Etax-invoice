# Suggested Commands

Use from repo root `/Users/domdom/Documents/GitHub/Etax-invoice` unless noted.

Discovery:
- `rg "pattern" path` for fast text search.
- `rg --files` to list files.
- `git status --short`, `git diff --check`, `git log --oneline -5`.

Backend:
- `cd backend && npm run typecheck`
- `cd backend && npm run build`
- `cd backend && npm run dev` for local Express dev server on port 4000.
- `cd backend && npm run test` or targeted integration scripts in package.json.

Frontend:
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- `cd frontend && npm run dev` for Vite dev server on port 3000.

Prisma/schema:
- After schema changes, create/apply a migration and run Prisma generate.
- Root schema is `prisma/schema.prisma`; deployment may also require backend migration mirror under `backend/prisma/migrations` per existing project pattern.

Production verification:
- `curl -sS -w '\nHTTP %{http_code} time %{time_total}s\n' https://etax-invoice-api.onrender.com/api/health`
- Verify frontend and authenticated login when declaring production readiness.
- `gh run list --branch main --limit 5` and `gh run watch <run-id> --exit-status` for GitHub Actions.

Avoid destructive git commands. Do not stage `.claude/settings.local.json` unless explicitly requested.