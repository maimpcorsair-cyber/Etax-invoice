---
name: "source-command-rd-submit"
description: "Queue a local invoice for Revenue Department submission."
---

# source-command-rd-submit

Use this skill when the user asks to run the migrated source command `rd-submit`.

## Command Template

Queue the invoice ID in `$ARGUMENTS` for RD submission:

```bash
INV_ID="$ARGUMENTS"
if [ -z "$INV_ID" ]; then
  echo "Usage: rd-submit <invoice-id>"
  echo "Recent invoices you can submit:"
  PGPASSWORD=etax_secret psql -h localhost -U etax_user -d etax_invoice -c \
    "SELECT id, \"invoiceNumber\", type, status, \"rdSubmissionStatus\" FROM invoices ORDER BY \"createdAt\" DESC LIMIT 10;"
  exit 1
fi

TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@siamtech.co.th","password":"Admin@123456"}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('data',{}).get('token') or d.get('token',''))")

curl -s -X POST "http://localhost:4000/api/invoices/$INV_ID/submit-rd" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | python3 -m json.tool
```

After queueing, the BullMQ `rd-submission` worker runs:

1. generate XML
2. XAdES-BES sign
3. TSA timestamp
4. submit to RD
5. update DB status

In local sandbox mode, RD submission may return mocked success. Watch logs with `source-command-logs` filtered by `rd`.
