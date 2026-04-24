# Local Deployment Guide for E-Tax Invoice

## Local host split

The app now supports two local entry points:

- Customer app: `http://app.localhost:3000`
- Owner app: `http://ops.localhost:3000`

Both resolve locally on modern macOS browsers without extra hosts-file changes.

## Quick Start Options

### Option 1: Frontend Only (UI Testing) ✅ Ready Now
**No database needed - test UI/UX immediately**

```bash
cd frontend
npm run dev -- --host 0.0.0.0
```
- Opens at: `http://app.localhost:3000`
- Owner entry: `http://ops.localhost:3000`
- Can view pages, test navigation, language switching (TH/EN)
- Backend API calls will fail (no database yet)

### Option 2: Full Stack (Frontend + Backend + Database) 🔧 Requires Setup

#### Prerequisites:
- PostgreSQL 16+
- Redis 7+
- OR: Install Docker for easier setup

#### Step 1: Start PostgreSQL (Choose One)

**Option A: Using Homebrew (macOS)**
```bash
brew install postgresql redis
brew services start postgresql
brew services start redis
```

**Option B: Using Docker** (faster, no local installation)
```bash
docker run -d \
  --name etax_postgres \
  -e POSTGRES_DB=etax_invoice \
  -e POSTGRES_USER=etax_user \
  -e POSTGRES_PASSWORD=etax_secret \
  -p 5432:5432 \
  postgres:16-alpine

docker run -d \
  --name etax_redis \
  -e REDIS_PASSWORD=redis_secret \
  -p 6379:6379 \
  redis:7-alpine redis-server --requirepass redis_secret
```

#### Step 2: Setup Database

```bash
cd backend
npx prisma migrate dev
# This will:
# - Create database tables
# - Run migrations (001_initial.sql, 002_seed.sql)
# - Seed demo data (users, customers, products)
```

#### Step 3: Start Backend

```bash
cd backend
npm run dev
```
- Backend runs at: http://localhost:4000
- Hot reload enabled with tsx watch

#### Step 4: Start Frontend (New Terminal)

```bash
cd frontend
npm run dev
```
- Frontend at: http://app.localhost:3000
- Owner frontend at: http://ops.localhost:3000
- Will connect to backend at localhost:4000

### Demo URLs

- Customer login: `http://app.localhost:3000/login`
- Owner login: `http://ops.localhost:3000/login`
- Owner overview: `http://ops.localhost:3000/ops/overview`

### Demo Credentials (After Seed)
From database seed:
- **Admin User**: admin@etax.com / password
- **Company**: บริษัท ทดสอบ (Demo Company)

### Project Structure
```
.
├── backend/        # Node.js + Express + Prisma
├── frontend/       # React + Vite + Tailwind
├── prisma/         # Database schema
├── database/       # SQL migrations
└── docker-compose.yml  # Full stack Docker setup
```

### Environment Variables
Created: `.env` and `.env.local` in root directory

### Troubleshooting

**Port 5173 already in use (frontend)**
```bash
npm run dev -- --port 5174
```

**Port 3001 already in use (backend)**
Edit backend/.env or environment variable:
```bash
PORT=3002 npm run dev
```

**Database connection error**
- Verify PostgreSQL is running: `psql -U etax_user`
- Check DATABASE_URL in .env

**Redis connection error**
- Verify Redis is running: `redis-cli ping`
- Check REDIS_URL in .env

### Next Steps
1. Start with **Option 1** (Frontend Only) to test UI
2. Set up PostgreSQL + Redis
3. Run database migrations
4. Test full stack with **Option 2**
