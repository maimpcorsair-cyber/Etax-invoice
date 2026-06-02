import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptGoogleRefreshToken,
  encryptGoogleRefreshToken,
  isGoogleRefreshTokenEncrypted,
} from './googleDriveTokenService';

process.env.CONFIG_ENCRYPTION_KEY = 'unit-test-google-drive-token-key';

test('Google Drive refresh tokens are encrypted at rest and decrypt for API use', () => {
  const encrypted = encryptGoogleRefreshToken('refresh-token-secret');

  assert.ok(encrypted);
  assert.notEqual(encrypted, 'refresh-token-secret');
  assert.equal(isGoogleRefreshTokenEncrypted(encrypted), true);
  assert.equal(decryptGoogleRefreshToken(encrypted), 'refresh-token-secret');
});

test('Google Drive refresh token reader remains compatible with legacy plaintext rows', () => {
  assert.equal(decryptGoogleRefreshToken('legacy-refresh-token'), 'legacy-refresh-token');
  assert.equal(isGoogleRefreshTokenEncrypted('legacy-refresh-token'), false);
});

test('Google Drive refresh token encryption is idempotent', () => {
  const encrypted = encryptGoogleRefreshToken('refresh-token-secret');
  assert.equal(encryptGoogleRefreshToken(encrypted), encrypted);
});
