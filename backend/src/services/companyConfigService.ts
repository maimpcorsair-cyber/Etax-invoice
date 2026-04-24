import crypto from 'crypto';

const ENCRYPTED_PREFIX = 'enc:v1:';

type NullableString = string | null | undefined;

export interface CompanyRuntimeConfigSource {
  certificatePath?: NullableString;
  certificatePassword?: NullableString;
  rdClientId?: NullableString;
  rdClientSecret?: NullableString;
  rdEnvironment?: NullableString;
}

export interface ResolvedCompanyRuntimeConfig {
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

export function resolveCompanyRuntimeConfig(source?: CompanyRuntimeConfigSource | null): ResolvedCompanyRuntimeConfig {
  return {
    certPath: source?.certificatePath ?? process.env.CERT_PATH ?? undefined,
    certPassword: decryptConfigValue(source?.certificatePassword) ?? process.env.CERT_PASSWORD ?? undefined,
    rdClientId: source?.rdClientId ?? process.env.RD_CLIENT_ID ?? undefined,
    rdClientSecret: decryptConfigValue(source?.rdClientSecret) ?? process.env.RD_CLIENT_SECRET ?? undefined,
    rdEnvironment: source?.rdEnvironment ?? process.env.RD_ENVIRONMENT ?? 'sandbox',
  };
}
