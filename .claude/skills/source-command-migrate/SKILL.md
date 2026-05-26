---
name: "source-command-migrate"
description: "Run Prisma migrations and regenerate the backend Prisma client."
---

# source-command-migrate

Use this skill when the user asks to run the migrated source command `migrate`.

## Command Template

Run Prisma from the backend directory. The single source of truth is `backend/prisma/schema.prisma`.

If no migration name is provided, apply pending migrations:

```bash
cd "/Users/domdom/Documents/GitHub/Etax-invoice/backend"
npx prisma migrate deploy
npx prisma generate
```

If a migration name is provided, create and apply a new dev migration:

```bash
cd "/Users/domdom/Documents/GitHub/Etax-invoice/backend"
npx prisma migrate dev --name "$ARGUMENTS"
npx prisma generate
```

After generate, verify with:

```bash
cd "/Users/domdom/Documents/GitHub/Etax-invoice/backend"
npx prisma validate
```

Then remind the user to run `typecheck` and restart the backend.

Production note: commits that add files under `backend/prisma/migrations/` need the production migration workflow or an explicit Render migration path. Do not assume Render's normal auto-deploy applied new migrations.
