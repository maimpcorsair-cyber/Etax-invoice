---
name: "source-command-db-shell"
description: "Run a raw SQL query against the local dev Postgres database."
---

# source-command-db-shell

Use this skill when the user asks to run the migrated source command `db-shell`.

## Command Template

Execute a SQL query against the local `etax_invoice` database:

```bash
PGPASSWORD=etax_secret psql -h localhost -U etax_user -d etax_invoice -c "$ARGUMENTS"
```

If no query is provided, show the table list and invoice schema:

```bash
PGPASSWORD=etax_secret psql -h localhost -U etax_user -d etax_invoice -c "\dt"
PGPASSWORD=etax_secret psql -h localhost -U etax_user -d etax_invoice -c "\d invoices"
```

Important: Prisma-generated columns often use camelCase and need Postgres double quotes:

```sql
SELECT email, "isActive", "createdAt" FROM users;
SELECT "invoiceNumber", "rdSubmissionStatus" FROM invoices WHERE "companyId" = 'company-demo-001';
```

Never use this skill with production credentials. Local dev only.
