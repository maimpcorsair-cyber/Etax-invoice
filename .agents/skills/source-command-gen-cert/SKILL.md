---
name: "source-command-gen-cert"
description: "Regenerate the self-signed development .p12 certificate for signing tests."
---

# source-command-gen-cert

Use this skill when the user asks to run the migrated source command `gen-cert`.

## Command Template

Regenerate the development certificate at `backend/certs/test-company.p12`.

```bash
cd "/Users/domdom/Documents/GitHub/Etax-invoice/backend"
npx tsx scripts/generate-test-cert.ts
openssl pkcs12 -in certs/test-company.p12 -nokeys -noout -passin pass:etax-dev-password
cat certs/test-company-info.json
```

If the user passes `--aes256`, first inspect `scripts/generate-test-cert.ts` and make sure `forge.pkcs12.toPkcs12Asn1` uses `algorithm: 'aes256'` instead of `algorithm: '3des'`, then regenerate.

If OpenSSL reports a MAC verify error, invoke or recommend `cert-manager`.

After completion:
- remind the user to run `sign-test`
- do not commit anything under `backend/certs/`
