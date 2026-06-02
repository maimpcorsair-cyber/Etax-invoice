import { decryptConfigValue, encryptConfigValue } from './companyConfigService';

const ENCRYPTED_PREFIX = 'enc:v1:';

export function encryptGoogleRefreshToken(value?: string | null) {
  return encryptConfigValue(value);
}

export function decryptGoogleRefreshToken(value?: string | null) {
  return decryptConfigValue(value);
}

export function isGoogleRefreshTokenEncrypted(value?: string | null) {
  return !!value?.startsWith(ENCRYPTED_PREFIX);
}
