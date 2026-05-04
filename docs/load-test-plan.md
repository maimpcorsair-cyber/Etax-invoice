# แผนทดสอบ Load Test — Thai e-Tax Invoice System

## 1. Executive Summary

เอกสารนี้กำหนดแผนการทดสอบ Load Test สำหรับระบบ Thai e-Tax Invoice ที่พัฒนาตามมาตรฐาน **ETDA ขมธอ. 3-2560** เพื่อยืนยันว่าระบบสามารถรองรับ **10,000 ผู้ใช้พร้อมกัน (concurrent users)** ได้อย่างมีเสถียรภาพ

### เป้าหมายหลัก
- ทดสอบระบบภายใต้ภาระงานสูงสุด 10,000 concurrent users
- ระบุ bottleneck และจุดอ่อนก่อนปล่อย production
- วัดประสิทธิภาพเชิงปริมาณ (throughput) และเวลาตอบสนอง (latency)

### Key Success Metrics
| Metric | Threshold |
|--------|-----------|
| Response Time p(95) | < 500ms |
| Error Rate | < 1% |
| System Stability | ไม่มี crash, ระบบกลับมา normal หลัง spike |

---

## 2. Test Scope

### ✅ In Scope
- Backend API (port 4000)
- Authentication (login, JWT validation)
- Invoice CRUD operations (T01–T05)
- Dashboard statistics
- Customer management
- Connection pooling (PostgreSQL, Redis)

### ❌ Out of Scope
- Frontend UI rendering
- Real Revenue Department (RD) API calls — ใช้ sandbox เท่านั้น
- Real payment processing (Stripe) — mock mode
- LINE Official Account integration
- Google Drive / Azure Document Intelligence
- PDF generation ใน load test

---

## 3. Prerequisites

### Software Requirements
```bash
# k6 (primary load testing tool)
brew install k6

# Artillery (backup tool)
npm install -g artillery
```

### Environment Requirements
```bash
# Backend ต้องรันอยู่ที่ localhost:4000
cd backend && npm run dev

# Docker services (PostgreSQL + Redis)
docker compose up -d

# ตั้งค่า environment
export RD_ENVIRONMENT=sandbox      # หลีกเลี่ยง RD API จริง
export NODE_ENV=production          # ปิด debug logs
```

### Credentials
```
Admin user:   admin@siamtech.co.th / Admin@123456
Postgres:     etax_user / etax_secret @ localhost:5432/etax_invoice
Redis:        redis_secret @ localhost:6379
```

### Verification Before Test
```bash
# ตรวจสอบ backend health
curl http://localhost:4000/api/system/health

# ตรวจสอบ PostgreSQL
psql postgresql://etax_user:etax_secret@localhost:5432/etax_invoice -c "SELECT 1"

# ตรวจสอบ Redis
redis-cli -a redis_secret ping
```

---

## 4. Test Scenarios (5 Phases)

### Phase 1: Baseline — 100 VUs, 2 นาที

**วัตถุประสงค์:** ยืนยันระบบทำงานได้ปกติภายใต้ภาระงานต่ำ

**Endpoints ที่ทดสอบ:**
- `POST /api/auth/login`
- `GET /api/invoices`
- `GET /api/dashboard/stats`
- `GET /api/customers`

**Threshold:**
- p(95) < 200ms
- Error rate < 0.1%

**คำสั่ง:**
```bash
DURATION_MULT=0.1 k6 run load-test.js --env PHASE=baseline
```

---

### Phase 2: Scale Up — 500 VUs, 3 นาที

**วัตถุประสงค์:** หา bottleneck แรกที่เกิดขึ้น

**Endpoints ที่ทดสอบ:** เหมือน Phase 1

**Threshold:**
- p(95) < 300ms
- Error rate < 0.2%

**คำสั่ง:**
```bash
DURATION_MULT=0.5 k6 run load-test.js --env PHASE=scale-up
```

---

### Phase 3: Sustained Load — 1,000 VUs, 5 นาที

**วัตถุประสงค์:** ทดสอบประสิทธิภาพต่อเนื่อง + ทดสอบ write operation

**Endpoints ที่ทดสอบ:**
- เหมือน Phase 1 +
- `POST /api/invoices` (สร้าง draft invoice)

**Threshold:**
- p(95) < 500ms
- Error rate < 0.5%

**คำสั่ง:**
```bash
k6 run load-test.js --env PHASE=sustained
```

---

### Phase 4: Spike Test — 5,000 VUs (instant spike), 1 นาที

**วัตถุประสงค์:** ทดสอบความยืดหยุ่นของระบบเมื่อมี traffic พุ่งขึ้นฉับพลัน

**Threshold:**
- System กลับมา normal ภายใน 2 นาทีหลัง spike
- No data corruption

**คำสั่ง:**
```bash
k6 run load-test.js --env PHASE=spike
```

---

### Phase 5: Target Load — 10,000 VUs, 10 นาที

**วัตถุประสงค์:** ยืนยันเป้าหมาย 10,000 concurrent users

**Threshold:**
- p(95) < 1,000ms
- Error rate < 1%
- No crashes

**คำสั่ง:**
```bash
k6 run load-test.js --env PHASE=target
```

---

## 5. Key Metrics to Collect

### HTTP Performance
| Metric | Description |
|--------|-------------|
| `http_req_duration` | Response time ของทุก request |
| `http_req_failed` | % ของ failed requests |
| `http_reqs` | จำนวน requests ทั้งหมดต่อวินาที |

**Percentiles ที่ต้องเก็บ:** p(50), p(95), p(99)

### Virtual Users
- `vus` — จำนวน VUs ณ ปัจจุบัน
- `vus_max` — จำนวน VUs สูงสุดที่กำหนด

### Backend Resource Usage
```bash
# CPU และ Memory ของ backend
top -p $(pgrep -f "tsx" | head -1)

# PostgreSQL connections
psql postgresql://etax_user:etax_secret@localhost:5432/etax_invoice -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname='etax_invoice'"

# Redis connections
redis-cli -a redis_secret info clients | grep connected_clients
```

### Database Metrics
```sql
-- Slow queries ระหว่าง test
SELECT query, calls, mean_time, total_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Lock waits
SELECT blocked_locks.pid AS blocked_pid,
       blocking_locks.pid AS blocking_pid
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_locks blocking_locks
  ON blocking_locks.granted
WHERE NOT blocked_locks.granted;
```

---

## 6. How to Run

### Using k6 (Primary)

```bash
# ติดตั้ง k6
brew install k6

# ดู options ทั้งหมด
k6 run --help

# Run baseline smoke test (เร็ว — 10% ของ duration)
DURATION_MULT=0.1 k6 run load-test.js

# Run specific phase
PHASE=baseline k6 run load-test.js
PHASE=scale-up k6 run load-test.js
PHASE=sustained k6 run load-test.js
PHASE=spike k6 run load-test.js
PHASE=target k6 run load-test.js

# Run full 10K test with custom config
BASE_URL=http://localhost:4000 k6 run load-test.js

# Run with verbose output
k6 run load-test.js --console-output

# Export JSON results
k6 run load-test.js --out json=results.json

# ใช้ alternative environment
k6 run load-test.js --env BASE_URL=https://staging.etax.in.th
```

### Using Artillery (Backup)

```bash
# ติดตั้ง Artillery
npm install -g artillery

# Run test
artillery run artillery-load-test.yml --output report.json

# Generate HTML report
artillery report report.json

# Run with environment
BASE_URL=http://localhost:4000 artillery run artillery-load-test.yml
```

### Quick Smoke Test (Under 1 Minute)

```bash
# ทดสอบเร็วที่สุด — baseline แบบย่อ
DURATION_MULT=0.05 k6 run load-test.js --env PHASE=baseline
```

---

## 7. Monitoring During Test

### Backend Logs
```bash
# Tail real-time logs
tail -f backend/logs/app.log

# Filter errors และ warnings
tail -f backend/logs/app.log | grep -E "ERROR|WARN|CRIT"

# Filter 5xx errors only
tail -f backend/logs/app.log | grep "500\|502\|503\|504"
```

### PostgreSQL Monitoring
```bash
# ดู active connections ทั้งหมด
psql postgresql://etax_user:etax_secret@localhost:5432/etax_invoice -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname='etax_invoice'"

# ดู connections แยกตาม state
psql postgresql://etax_user:etax_secret@localhost:5432/etax_invoice -c \
  "SELECT state, count(*) FROM pg_stat_activity GROUP BY state"

# ดู long-running queries
psql postgresql://etax_user:etax_secret@localhost:5432/etax_invoice -c \
  "SELECT pid, now() - pg_stat_activity.query_start AS duration, query \
   FROM pg_stat_activity \
   WHERE state = 'active' AND query_start < now() - interval '5 seconds'"
```

### Redis Monitoring
```bash
# Client connections
redis-cli -a redis_secret info clients

# Memory usage
redis-cli -a redis_secret info memory

# Command stats
redis-cli -a redis_secret info commandstats

# Slow log
redis-cli -a redis_secret slowlog get 10
```

### BullMQ Jobs
```bash
# ดู queue sizes
redis-cli -a redis_secret llen bull:invoice-submit
redis-cli -a redis_secret llen bull:pdf-generation
redis-cli -a redis_secret llen bull:compliance-check
```

### System Resources
```bash
# CPU/Memory ของทุก process
top -o %CPU

# Disk I/O
iostat -x 5

# Network
netstat -i 5
```

---

## 8. Pass/Fail Criteria

### ✅ PASS
- ทุก phase ทำงานสำเร็จโดยไม่ crash
- p(95) response time อยู่ใน threshold ของแต่ละ phase
- Error rate ต่ำกว่า threshold
- Backend logs ไม่มี CRIT/panic

### ⚠️ DEGRADED
- Test ทำงานสำเร็จแต่มี metrics บางตัวเกิน threshold
- Error rate อยู่ระหว่าง 1%–5%
- p(95) เกิน threshold แต่ไม่เกิน 2x
- ระบบยังคงทำงานได้แต่ช้าลง

### ❌ FAIL
- Backend process crash หรือ restart
- Error rate เกิน 5%
- Timeout > 60 วินาที
- HTTP 503/504 ตอบกลับจำนวนมาก
- Database connection pool exhausted
- Memory leak ทำให้ OOM kill

---

## 9. Post-Test Actions

### หากเกิด Failures

1. **วิเคราะห์ Logs**
   ```bash
   # หา error patterns
   grep -E "ERROR|CRIT" backend/logs/app.log | tail -100
   
   # หา slow requests
   grep "slow" backend/logs/app.log
   ```

2. **ตรวจสอบ Database Issues**
   ```sql
   -- Check Prisma connection pool
   -- ดูใน prisma/schema.prisma: datasource url มี connection_limit?
   
   -- Check for missing indexes
   SELECT schemaname, tablename, seq_scan, idx_scan
   FROM pg_stat_user_tables
   ORDER BY seq_scan DESC;
   
   -- Check RLS policies — อาจทำให้ full scan
   SELECT schemaname, tablename, policyname, cmd
   FROM pg_policies
   WHERE schemaname = 'public';
   ```

3. **ปรับ Configuration**
   ```bash
   # เพิ่ม Prisma connection pool
   # ใน backend/.env
   DATABASE_URL="postgresql://etax_user:etax_secret@localhost:5432/etax_invoice?connection_limit=20&pool_timeout=10"
   
   # เพิ่ม PgBouncer สำหรับ connection pooling
   # ดู docker-compose.yml
   ```

4. **Scale Options**
   - เพิ่ม Render instance size (ใน staging/production)
   - เปิดใช้ PgBouncer สำหรับ PostgreSQL pooling
   - เพิ่ม Redis cluster mode
   - ตรวจสอบ RLS policies ที่ทำให้เกิด full table scan

### Cleanup After Test
```bash
# ลบ test data
psql postgresql://etax_user:etax_secret@localhost:5432/etax_invoice -c \
  "DELETE FROM invoices WHERE created_at > NOW() - INTERVAL '1 hour' AND company_id = 'test-company-id'"

# Reset test users (clear failed login attempts, etc.)
psql postgresql://etax_user:etax_secret@localhost:5432/etax_invoice -c \
  "UPDATE users SET failed_login_attempts = 0"
```

---

## 10. Files Reference

### Test Scripts
| File | Description |
|------|-------------|
| [`load-test.js`](load-test.js) | Primary k6 load test script |
| [`artillery-load-test.yml`](artillery-load-test.yml) | Artillery YAML configuration |
| [`artillery-functions.js`](artillery-functions.js) | Artillery helper functions |

### This Document
| File | Description |
|------|-------------|
| `docs/load-test-plan.md` | แผนทดสอบ Load Test (เอกสารนี้) |

---

## 11. Troubleshooting Guide

### k6 Installation Issues
```bash
# บน macOS หากไม่สามารถติดตั้งผ่าน brew
curl -sL https://github.com/grafana/k6/releases/download/v0.55.0/k6-v0.55.0-linux-amd64.tar.gz | tar xz
sudo mv k6 /usr/local/bin/
```

### "Connection refused" Errors
- ตรวจสอบว่า backend รันอยู่: `curl http://localhost:4000/api/system/health`
- ตรวจสอบ port: `lsof -i :4000`

### Authentication Failures
- ตรวจสอบ `admin@siamtech.co.th` มีใน database:
  ```bash
  psql postgresql://etax_user:etax_secret@localhost:5432/etax_invoice -c \
    "SELECT email FROM users WHERE email = 'admin@siamtech.co.th'"
  ```
- หากไม่มี: `cd backend && npx prisma db seed`

### Redis Connection Issues
```bash
redis-cli -a redis_secret ping
# ควรได้: PONG
```

---

## Appendix: k6 Script Overview

[`load-test.js`](load-test.js) รองรับ environment variables ต่อไปนี้:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:4000` | Backend URL |
| `PHASE` | `target` | Test phase ที่จะ run |
| `DURATION_MULT` | `1.0` | คูณ duration ทั้งหมด (ใช้ 0.1 สำหรับ quick test) |

**Output:**
- Console: Real-time metrics ใน terminal
- JSON: `results.json` (ถ้าระบุ `--out json=results.json`)