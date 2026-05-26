# Cloudflare R2 + Render Storage Setup

Status: code is R2-compatible as of `storageService.getStorageServerSideEncryption()`.

Cloudflare R2 implements most of the S3 API, but its `PutObject` compatibility table marks `x-amz-server-side-encryption` as unsupported:

- https://developers.cloudflare.com/r2/api/s3/api/#object-level-operations

For that reason the app omits `ServerSideEncryption` when `S3_ENDPOINT` is set. Plain AWS S3 still defaults to `AES256`, and compatible providers that support SSE can opt in with `S3_SERVER_SIDE_ENCRYPTION=AES256`.

## Render Environment Variables

Set these on both Render services:

- `etax-invoice-api`
- `etax-invoice-worker`

Required:

```text
S3_BUCKET=<r2-bucket-name>
S3_REGION=auto
S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
AWS_ACCESS_KEY_ID=<r2-access-key-id>
AWS_SECRET_ACCESS_KEY=<r2-secret-access-key>
```

Do not set `S3_SERVER_SIDE_ENCRYPTION` for Cloudflare R2.

## Cloudflare R2 Steps

1. Cloudflare dashboard -> R2 Object Storage -> Create bucket.
2. Create an R2 API token with object read/write access for that bucket.
3. Copy the S3 endpoint, access key id, and secret access key.
4. Add the five required env vars above to both Render services.
5. Redeploy both Render services so the env vars are loaded.

## Automated Sync

If the R2 values are available in your local shell, use the repo helper. It
sets the five variables on both Render services and triggers fresh deploys,
without printing secret values:

```bash
export RENDER_API_KEY=...
export S3_BUCKET=...
export S3_REGION=auto
export S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
npm run render:r2
```

Accepted aliases:

```bash
export R2_BUCKET=...
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...
export CLOUDFLARE_ACCOUNT_ID=...
```

Useful options:

```bash
npm run render:r2 -- --dry-run
npm run render:r2 -- --target api
npm run render:r2 -- --target worker
npm run render:r2 -- --no-deploy
```

## Verification

After redeploy:

```bash
curl -fsS https://etax-invoice-api.onrender.com/api/health/deep \
  | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); console.log({status:j.status, notConfigured:j.notConfigured, s3:j.providers?.s3});})"
```

Expected:

```text
notConfigured does not include "s3"
s3.ok === true
```

Then smoke one real upload path:

1. Sign in to production.
2. Open `/app/purchase-invoices`.
3. Upload a small PDF/JPG.
4. Confirm the upload no longer returns `503 File storage is not configured`.
5. Confirm the document appears with a `storageKey` through the existing UI/download path.

## Unblocked After This

- Customer evidence uploads
- Expense attachments
- Purchase invoice/document-intake uploads
- LINE OCR slip persistence to object storage
- Project portal uploads
- Later Drive folder migration work
