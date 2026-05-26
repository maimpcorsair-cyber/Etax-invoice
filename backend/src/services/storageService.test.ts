import test from 'node:test';
import assert from 'node:assert/strict';
import { getStorageServerSideEncryption } from './storageService';

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const original = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('storage upload omits SSE header for R2/S3-compatible custom endpoints', () => {
  withEnv({
    S3_ENDPOINT: 'https://example-account-id.r2.cloudflarestorage.com',
    S3_SERVER_SIDE_ENCRYPTION: undefined,
  }, () => {
    assert.equal(getStorageServerSideEncryption(), undefined);
  });
});

test('storage upload keeps AES256 SSE default for AWS S3', () => {
  withEnv({
    S3_ENDPOINT: undefined,
    S3_SERVER_SIDE_ENCRYPTION: undefined,
  }, () => {
    assert.equal(getStorageServerSideEncryption(), 'AES256');
  });
});

test('storage SSE can be explicitly configured or disabled', () => {
  withEnv({ S3_SERVER_SIDE_ENCRYPTION: 'AES256' }, () => {
    assert.equal(getStorageServerSideEncryption(), 'AES256');
  });

  withEnv({ S3_SERVER_SIDE_ENCRYPTION: 'false' }, () => {
    assert.equal(getStorageServerSideEncryption(), undefined);
  });
});
