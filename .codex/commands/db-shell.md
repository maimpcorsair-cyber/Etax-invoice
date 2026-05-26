---
description: Run a raw SQL query against the dev Postgres DB.
allowed-tools: Bash
argument-hint: "SQL query in double quotes (use \"isActive\" with quotes for camelCase columns)"
---

Execute a SQL query against `etax_invoice` db.

```bash
PGPASSWORD=etax_secret psql -h localhost -U etax_user -d etax_invoice -c "$ARGUMENTS"
```

**Important**: Prisma-generated columns use camelCase with Postgres double-quotes:
```sql
SELECT email, "isActive", "createdAt" FROM users;
SELECT "invoiceNumber", "rdSubmissionStatus" FROM invoices WHERE "companyId" = 'company-demo-001';
```

If no arguments, show schema:
```sql
\dt
\d invoices
```

Never use this for production credentials. Dev only.
