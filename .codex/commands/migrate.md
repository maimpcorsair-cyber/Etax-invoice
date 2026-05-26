---
description: Run Prisma migrations and regenerate the client.
allowed-tools: Bash
argument-hint: "[optional migration name for new migration, or blank to just apply pending]"
---

Run Prisma migration workflow.

```bash
cd "/Users/domdom/Documents/GitHub/Etax-invoice/backend"
```

If `$ARGUMENTS` is empty: apply pending migrations only.
```bash
npx prisma migrate deploy
npx prisma generate
```

If `$ARGUMENTS` is provided: create a new migration with that name.
```bash
npx prisma migrate dev --name "$ARGUMENTS"
npx prisma generate
```

After generate, validate the backend Prisma schema:
```bash
npx prisma validate
```

Then remind to run `/typecheck` and `/restart-backend` to pick up the schema changes.
