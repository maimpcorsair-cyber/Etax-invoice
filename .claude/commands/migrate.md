---
description: Run Prisma migrations and regenerate the client.
allowed-tools: Bash
argument-hint: "[optional migration name for new migration, or blank to just apply pending]"
---

Run Prisma migration workflow.

```bash
cd "/Users/chuvit/Documents/E-tax invoice/backend"
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

After generate, ensure the backend's local Prisma client is fresh:
```bash
if [ -d "../node_modules/.prisma/client" ]; then
  cp -r "../node_modules/.prisma/client/." "node_modules/.prisma/client/" 2>/dev/null || true
  echo "✅ Synced generated client to backend/node_modules/.prisma/client"
fi
```

Then remind to run `/typecheck` and `/restart-backend` to pick up the schema changes.
