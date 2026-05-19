import crypto from 'crypto';

const ENCRYPTED_PREFIX = 'enc:v1:';

// Magic header for AES-256-GCM encrypted BYTEA blobs. 8 bytes so it never
// collides with a real .p12 (ASN.1 DER `0x30 0x82 ...`). Layout on disk:
//   [magic 8B][iv 12B][authTag 16B][ciphertext ...]
const BLOB_MAGIC = Buffer.from('ENCB1\x00\x00\x00', 'binary');
const BLOB_HEADER_LEN = BLOB_MAGIC.length + 12 + 16;

type NullableString = string | null | undefined;

export interface CompanyRuntimeConfigSource {
  // Per-company .p12 bytes — Prisma returns Buffer for Bytes columns.
  certificateBlob?: Buffer | Uint8Array | null;
  certificatePath?: NullableString;
  certificatePassword?: NullableString;
  rdClientId?: NullableString;
  rdClientSecret?: NullableString;
  rdEnvironment?: NullableString;
}

export interface ResolvedCompanyRuntimeConfig {
  certBlob?: Buffer;
  certPath?: string;
  certPassword?: string;
  rdClientId?: string;
  rdClientSecret?: string;
  rdEnvironment: string;
}

function getEncryptionKeyMaterial(): string {
  return process.env.CONFIG_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? '';
}

function deriveKey(): Buffer {
  const material = getEncryptionKeyMaterial();
  if (!material) {
    throw new Error('CONFIG_ENCRYPTION_KEY or JWT_SECRET must be configured');
  }

  return crypto.createHash('sha256').update(material, 'utf8').digest();
}

export function encryptConfigValue(value: NullableString): string | null {
  if (!value) return null;
  if (value.startsWith(ENCRYPTED_PREFIX)) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${Buffer.concat([iv, authTag, encrypted]).toString('base64')}`;
}

export function decryptConfigValue(value: NullableString): string | null {
  if (!value) return null;
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value;

  const raw = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function isBlobEncrypted(blob: Buffer | Uint8Array): boolean {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return buf.length >= BLOB_HEADER_LEN && buf.subarray(0, BLOB_MAGIC.length).equals(BLOB_MAGIC);
}

export function encryptBlob(plain: Buffer | Uint8Array): Buffer {
  const buf = Buffer.isBuffer(plain) ? plain : Buffer.from(plain);
  if (isBlobEncrypted(buf)) return buf;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(buf), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([BLOB_MAGIC, iv, authTag, ciphertext]);
}

export function decryptBlob(stored: Buffer | Uint8Array): Buffer {
  const buf = Buffer.isBuffer(stored) ? stored : Buffer.from(stored);
  if (!isBlobEncrypted(buf)) return buf; // legacy plain row
  const iv = buf.subarray(BLOB_MAGIC.length, BLOB_MAGIC.length + 12);
  const authTag = buf.subarray(BLOB_MAGIC.length + 12, BLOB_HEADER_LEN);
  const ciphertext = buf.subarray(BLOB_HEADER_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function resolveCompanyRuntimeConfig(source?: CompanyRuntimeConfigSource | null): ResolvedCompanyRuntimeConfig {
  const rawBlob = source?.certificateBlob
    ? (Buffer.isBuffer(source.certificateBlob) ? source.certificateBlob : Buffer.from(source.certificateBlob))
    : undefined;
  const blob = rawBlob ? decryptBlob(rawBlob) : undefined;
  return {
    certBlob: blob,
    certPath: source?.certificatePath ?? (blob ? undefined : process.env.CERT_PATH ?? undefined),
    certPassword: decryptConfigValue(source?.certificatePassword) ?? process.env.CERT_PASSWORD ?? undefined,
    rdClientId: source?.rdClientId ?? process.env.RD_CLIENT_ID ?? undefined,
    rdClientSecret: decryptConfigValue(source?.rdClientSecret) ?? process.env.RD_CLIENT_SECRET ?? undefined,
    rdEnvironment: source?.rdEnvironment ?? process.env.RD_ENVIRONMENT ?? 'sandbox',
  };
}
