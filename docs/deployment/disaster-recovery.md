# Disaster recovery runbook

Last updated: 2026-05-19

Audience: whoever is on-call when production breaks. Keep this short — if
the steps drift from reality, fix them here first.

## What we protect against

The Render stack is single-region (Singapore web/worker + Oregon Postgres
per current YAML drift) and single-cloud. The realistic failure modes are:

1. Postgres data loss (bad migration, accidental DELETE, hardware fault on Render's side).
2. Render Singapore region outage.
3. S3 bucket loss (deleted or wrong region failover).
4. Customer asks for their data back (PDPA Section 30 — right to portability).
5. Customer asks to be forgotten (PDPA Section 33 — right to erasure).

## Where data lives

| Store | What's there | Backup mechanism |
|---|---|---|
| Render Postgres `etax-postgres` | Companies, users, invoices, customers, audit logs, **cert blobs** (BYTEA), pending signups | Render Basic tier: daily snapshots, 7-day retention |
| S3 bucket (`S3_BUCKET` env on Render) | Invoice PDFs, intake file uploads | S3 versioning + lifecycle (verify it's on — see below) |
| Customer Google Drive (per-tenant OAuth) | Customer-owned attachments + exports | Owned by the customer, NOT our responsibility |
| Render Redis | BullMQ queues, rate-limit counters, retention lock | Ephemeral by design — never the source of truth |
| Sentry (`billboyth` org, project `4511412901052416`) | Error events, breadcrumbs | Sentry's own retention (30d/90d depending on plan) |

If a row exists only in Redis or only in Sentry, it can be lost without impact.

## Backup verification — do these before the first paying customer

1. **Render Postgres plan is Basic tier or higher.**
   Dashboard → `etax-postgres` → "Plan Options". Free tier expires after 30
   days and has no backups; Basic ($6/mo) has daily snapshots + 7d retention.

2. **A backup actually exists.** Dashboard → `etax-postgres` → Recovery tab
   shows the snapshot list. There should be at least one snapshot per day for
   the last 7 days. If the list is empty 24h after the DB was created,
   contact Render support.

3. **S3 versioning is on.** AWS Console → S3 → the bucket → Properties →
   "Bucket Versioning: Enabled". If off, turn it on AND add a lifecycle rule
   to expire previous versions after 90 days (otherwise storage cost grows
   unbounded).

4. **DATABASE_URL is in 1Password / secrets manager**, not just Render env.
   The DB URL is the single most important secret in the stack — if you
   lose access to Render but still have the URL, you can `pg_dump` from
   anywhere.

## Recovery procedures

### A. Restore Postgres from snapshot (data loss)

1. Render dashboard → `etax-postgres` → Recovery → pick a snapshot.
2. Render restores **to a new database instance**. Old instance is untouched.
3. Once the new instance is "Available", copy its connection string.
4. Update `DATABASE_URL` env on `etax-invoice-api` AND `etax-invoice-worker`
   to point at the new instance.
5. Redeploy both services. Existing JWTs continue to work (signed with
   `JWT_SECRET` which is per-service, not per-DB).
6. Eyeball `/api/health/deep` — postgres should be `ok: true`.
7. Document the incident: which snapshot, what data was lost between the
   snapshot and the outage, who was affected.

Recovery time objective: ~15 minutes (snapshot restore is fast on Basic tier).
Recovery point objective: up to 24 hours data loss (daily snapshots).

### B. Render Singapore region outage

Render doesn't auto-fail-over between regions on the Basic plan.

Short-term (≤ 1 hour): wait. Render typically resolves regional issues fast
and a manual failover would lose more than you save. Tell customers via
status page.

Long-term plan if Render SG is down more than ~2 hours: spin up the stack
in Render Oregon (or another provider). The repo is region-agnostic; the
only region-specific bits are `S3_REGION=ap-southeast-1` (S3 reads work
cross-region, writes don't) and `RD_API_URL` (Thai gov, must stay reachable
from new region — it is, from anywhere).

We don't have a documented IaC for a cross-region rebuild. Adding this
runbook is on the backlog when we have >50 paying customers.

### C. S3 bucket loss / corruption

S3 versioning enabled means deletes are soft — restore previous versions
via the console or `aws s3api list-object-versions` + `restore-object`.

If the entire bucket is gone (extremely rare) and we don't have a
cross-region replica: PDFs are regeneratable from invoice rows in Postgres
(via the Puppeteer pipeline). Intake uploads are NOT regeneratable; they
were the user's original source — flag affected customers.

### D. PDPA Section 30 — customer requests their data

Self-serve endpoint shipped 2026-05-19 in commit `c40dbbf`. Tell the customer
to log in and hit:

```
GET /api/account/export
Authorization: Bearer <their JWT>
```

Returns a JSON dump of the user, company, all invoices, customers, products,
and per-user audit log. SLA: 30 days under PDPA — this endpoint returns
immediately for any tenant under ~50k rows. For larger tenants, fall back to
the manual `pg_dump` form below.

```bash
pg_dump "$DATABASE_URL" \
  --schema=public \
  --table=companies --table=users --table=invoices \
  --table=invoice_items --table=customers --table=payments \
  --table=audit_logs \
  --data-only \
  --where="company_id='<the-company-id>'" \
  > customer-<id>-export.sql
```

Plus the customer's PDFs from S3:

```bash
aws s3 sync "s3://$S3_BUCKET/companies/<the-company-id>/" ./customer-<id>-files/
```

### E. PDPA Section 33 — customer requests erasure

Self-serve endpoint shipped 2026-05-19. Customer hits:

```
POST /api/account/delete
Authorization: Bearer <their JWT>
Body: { "password": "...", "reason": "<optional>" }
```

(Google-only accounts pass `{ "confirm": "DELETE" }` instead of password.)

The endpoint anonymises PII immediately, schedules a hard delete for
`now + 5y` (tax retention window per Revenue Code), and emails the user a
confirmation with the cancel deadline. Within 30 days they can undo via
`POST /api/account/delete/cancel`.

Owner override (support ticket says "I changed my mind" after the grace
window): use the DSR queue at `/ops/dsr` or call:

```
POST /api/account/owner/dsr-queue/<companyId>/cancel
Authorization: Bearer <super_admin JWT>
```

Hard purge fires automatically once `hardDeleteScheduledAt` elapses — the
retention loop calls `prisma.company.deleteMany` which cascades through
the schema. Render snapshots still hold the row until their 7d rolling
window expires; mention this in the customer confirmation to keep PDPA
honest.

## Quarterly drills

### Postgres restore drill

Run quarterly. Validates that the snapshot path actually works before you
need it under pressure.

1. Render dashboard → `etax-postgres` → Recovery → pick yesterday's snapshot.
2. Restore to a new instance named `etax-postgres-drill-YYYYMMDD`.
3. Connect with `psql` and run the smoke queries:
   ```sql
   SELECT COUNT(*) FROM companies;
   SELECT COUNT(*) FROM invoices WHERE created_at > now() - interval '7 days';
   SELECT MAX(created_at) FROM audit_logs;
   ```
   Counts should match (within last-24h drift) the live DB.
4. Confirm BYTEA cert blobs decrypt: pick any company with a cert and run
   `SELECT length(certificate_blob) FROM companies WHERE certificate_blob IS NOT NULL LIMIT 1;`
   — should match the live DB's value.
5. Tear down the drill instance to avoid the second-DB charge.
6. Log the result + duration in `docs/state/PROJECT_HISTORY_*.md`.

### S3 versioning drill

Run quarterly.

1. Pick a non-critical object in the bucket (e.g., a test intake PDF).
2. `aws s3 cp` a different file over the same key — versioning makes this
   a new version, not a destructive overwrite.
3. `aws s3api list-object-versions --bucket "$S3_BUCKET" --prefix "<key>"`
   should show both versions.
4. Restore the original: `aws s3api copy-object` with the older `VersionId`.
5. Confirm via the app that the object reads back as the original.

### DSR endpoint drill

Run before any first paying customer + every release that touches
`backend/src/routes/account.ts`.

1. Sign up a throwaway tenant (`/api/billing/free-signup`).
2. Issue one invoice so there's data to export.
3. `curl /api/account/export` with the throwaway JWT — confirm JSON has
   all sections (user, company, invoices, customers, products, auditLog).
4. `curl /api/account/delete` with the password from step 1 — should 200
   and email a confirmation to the throwaway address.
5. Confirm the throwaway user is now `isActive: false` in DB.
6. `curl /api/account/delete/cancel` — should reactivate and clear
   `hardDeleteScheduledAt`.

## Open items (not yet implemented)

- [ ] Cross-region Postgres replica or weekly `pg_dump` to S3.
- [ ] On-call rotation + Sentry alert routing.
- [ ] Customer-facing data-rights UI inside the app (currently API-only).
