---
description: Regenerate the self-signed test .p12 certificate for dev signing.
allowed-tools: Bash, Read, Edit
argument-hint: "[--aes256]  (use AES-256 instead of 3DES to avoid MAC verify issues on OpenSSL 3)"
---

Regenerate the development certificate at `backend/certs/test-company.p12`.

Steps:
1. Kill any cert cache in running backend (backend will reload on next signing call).
2. `cd "/Users/chuvit/Documents/E-tax invoice/backend" && npx tsx scripts/generate-test-cert.ts`
3. Verify with openssl:
   `openssl pkcs12 -in backend/certs/test-company.p12 -nokeys -noout -passin pass:etax-dev-password`
4. If MAC verify fails, update `scripts/generate-test-cert.ts` to use `algorithm: 'aes256'` instead of `'3des'` in the `forge.pkcs12.toPkcs12Asn1` call, then regenerate.
5. Print the cert info: `cat backend/certs/test-company-info.json`

Arguments: $ARGUMENTS

If `--aes256` is passed, edit the script first to use aes256 BEFORE regenerating.

After completion, remind the user to:
- Run `/sign-test` to verify the end-to-end signing pipeline works
- Never commit `certs/` (already in .gitignore)
