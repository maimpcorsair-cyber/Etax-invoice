---
description: Run the full XAdES-BES signing + TSA timestamp test against the loaded certificate.
allowed-tools: Bash
---

Execute the signing pipeline test end-to-end.

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@siamtech.co.th","password":"Admin@123456"}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('data',{}).get('token') or d.get('token',''))")

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed — is backend running on :4000?"
  exit 1
fi

curl -s -X POST http://localhost:4000/api/admin/signing-test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | python3 -m json.tool
```

Interpret the result:
- Step ① Load Certificate — should be `ok`. If error = "MAC could not be verified", invoke `cert-manager` agent.
- Step ② XAdES-BES Sign — should produce `signatureId=Sig-*`.
- Step ③ TSA Timestamp — `isMock=true` is normal in dev (no TSA configured). Production needs a real TSA URL.
- Step ④ Total — all-green ✅ if everything worked.

If step ① fails, suggest running `/gen-cert --aes256`.
If step ② fails, invoke `etax-specialist` agent.
If step ③ errors (not just mock), check internet access to freetsa.org or configure an internal TSA.
