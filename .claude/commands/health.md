---
description: Check status of all stack components (backend, frontend, postgres, redis).
allowed-tools: Bash
---

Run these 4 checks in parallel:

1. **Backend**: `curl -s http://localhost:4000/health || echo DOWN`
2. **Frontend**: `curl -sI http://localhost:3000/ | head -1 || echo DOWN`
3. **PostgreSQL**: `PGPASSWORD=etax_secret psql -h localhost -U etax_user -d etax_invoice -c "SELECT 1;" 2>&1 | tail -3`
4. **Redis**: `redis-cli -a redis_secret -h localhost ping 2>&1 | tail -1`

Summarize each as ✅/❌ with a one-line explanation.

If any service is down, suggest the matching fix:
- Backend down → `/restart-backend`
- Frontend down → `/restart-frontend`
- Postgres down → `cd /Users/chuvit/Documents/E-tax\ invoice && docker-compose up -d postgres`
- Redis down → `docker-compose up -d redis`
