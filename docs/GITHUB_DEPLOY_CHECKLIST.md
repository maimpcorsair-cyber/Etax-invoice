# GitHub Deploy Checklist

Use this checklist to move the project from local-only to GitHub-first deployment.

## 1. Create the GitHub repository

Create a new private GitHub repository first.

Recommended name:

- `etax-invoice`

Recommended default branch:

- `main`

## 2. Push this project to GitHub

From the repo root:

```bash
git init
git add .
git commit -m "Initial deploy-ready setup"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

## 3. Confirm secrets are not committed

Before pushing, make sure these are not tracked:

- `.env`
- `.env.local`
- `backend/certs/`
- any `*.p12`, `*.pem`, `*.key`

This repo now includes a root `.gitignore` to help prevent that.

## 4. Enable GitHub Actions

This repo now includes:

- `.github/workflows/typecheck.yml`

After pushing:

1. Open the GitHub repository
2. Go to the `Actions` tab
3. Confirm the `Typecheck` workflow runs successfully

This gives you a basic CI gate before deployment.

## 5. Deploy the backend from GitHub

Recommended:

- Render Blueprint deploy using `render.yaml`

Steps:

1. Open Render
2. Create a new Blueprint
3. Connect your GitHub repository
4. Select this repo
5. Render reads `render.yaml`

After that, configure:

- `REDIS_URL`
- `FRONTEND_URLS`
- any optional mail / storage / RD variables you want enabled

GitHub Actions secrets used by the deploy pipeline:

- `PRODUCTION_DATABASE_URL`
- `RENDER_DEPLOY_HOOK_URL`
- `RENDER_API_KEY`
- `RENDER_SERVICE_ID` (optional, but needed to poll deploy status through the Render API)

## 6. Deploy the frontend from GitHub

Recommended:

- Vercel if you want the easiest frontend flow
- Render Static Site if you want to keep both apps on Render

### Vercel path

1. Import the GitHub repo into Vercel
2. Set Root Directory to `frontend`
3. Framework preset should resolve as `Vite`
4. Add the frontend env vars

Example:

```bash
VITE_APP_ORIGIN=https://your-frontend.vercel.app
VITE_OPS_ORIGIN=https://your-frontend.vercel.app
VITE_APEX_ORIGIN=https://your-frontend.vercel.app
```

### Render Static Site path

1. Create a new Static Site in Render
2. Connect the same GitHub repo
3. Set Root Directory to `frontend`
4. Build command:

```bash
npm ci && npm run build
```

5. Publish directory:

```bash
dist
```

## 7. Run database migration once

After Render creates Postgres, run:

```bash
cd backend
DATABASE_URL="<RENDER_POSTGRES_URL>" npx prisma migrate deploy
```

Optional seed:

```bash
cd backend
DATABASE_URL="<RENDER_POSTGRES_URL>" npm run db:seed
```

## 8. Set production-safe minimum env vars

Backend minimum:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `FRONTEND_URLS`
- `RD_ENVIRONMENT=sandbox`

Frontend minimum:

- `VITE_APP_ORIGIN`
- `VITE_OPS_ORIGIN`
- `VITE_APEX_ORIGIN`

## 9. First soft-launch verification

Check these in order:

1. `GET /health`
2. Login works
3. Create customer
4. Create invoice
5. Preview invoice
6. Download PDF
7. Edit invoice
8. Open SOA page

## 10. When you are ready to grow

Upgrade in this order:

1. Render Postgres
2. Render backend service
3. Add object storage
4. Add custom domain
5. Turn on production RD credentials later
