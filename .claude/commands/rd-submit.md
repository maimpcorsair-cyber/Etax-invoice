---
description: Queue a specific invoice for RD (Revenue Department) submission.
allowed-tools: Bash
argument-hint: "<invoice-id>  (the Prisma CUID of the invoice)"
---

Queue invoice `$ARGUMENTS` for RD submission.

```bash
INV_ID="$ARGUMENTS"
if [ -z "$INV_ID" ]; then
  echo "Usage: /rd-submit <invoice-id>"
  echo ""
  echo "Recent invoices you can submit:"
  PGPASSWORD=etax_secret psql -h localhost -U etax_user -d etax_invoice -c \
    "SELECT id, \"invoiceNumber\", type, status, \"rdSubmissionStatus\" FROM invoices ORDER BY \"createdAt\" DESC LIMIT 10;"
  exit 1
fi

TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@siamtech.co.th","password":"Admin@123456"}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('data',{}).get('token') or '')")

curl -s -X POST "http://localhost:4000/api/invoices/$INV_ID/submit-rd" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | python3 -m json.tool
```

After queueing, the BullMQ `rd-submission` worker picks it up and runs:
1. Generate XML → 2. XAdES-BES sign → 3. TSA timestamp → 4. POST to RD → 5. Update DB

Tail logs to watch progress:
```bash
tail -f "/Users/chuvit/Documents/E-tax invoice/backend.out" | grep -i "rd worker\|rd-submit"
```

(In dev with `RD_ENVIRONMENT=sandbox`, step 4 returns a mocked success.)
