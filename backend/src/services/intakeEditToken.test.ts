// Unit tests for intakeEditToken — the magic-link bearer token issued by
// the LINE bot so guest users can edit a pending document intake without
// logging in. Tampering with any of these tests is a privilege-escalation
// concern: the token signature, audience, and TTL are the only barrier
// between a leaked URL and someone else's tax documents.
//
// Run: cd backend && npx tsx --test src/services/intakeEditToken.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

// Stub JWT_SECRET. The module reads it lazily inside sign/verify (not at
// module load) so setting it before the first call is enough.
process.env.JWT_SECRET = 'test-secret-min-32-bytes-please-aaaaaaaaaa';

import {
  signIntakeEditToken,
  verifyIntakeEditToken,
  getIntakeEditTtlSeconds,
  buildIntakeEditUrl,
} from './intakeEditToken';

test('signIntakeEditToken → verifyIntakeEditToken round-trips the payload', () => {
  const token = signIntakeEditToken({
    intakeId: 'intake-1',
    lineUserId: 'U123abc',
    companyId: 'co-1',
  });
  const decoded = verifyIntakeEditToken(token);
  assert.ok(decoded, 'token must verify');
  assert.equal(decoded?.intakeId, 'intake-1');
  assert.equal(decoded?.lineUserId, 'U123abc');
  assert.equal(decoded?.companyId, 'co-1');
});

test('verifyIntakeEditToken returns null for tampered signature', () => {
  const token = signIntakeEditToken({ intakeId: 'i', lineUserId: 'u', companyId: 'c' });
  // Flip a character in the signature part.
  const parts = token.split('.');
  parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith('A') ? 'BB' : 'AA');
  const tampered = parts.join('.');
  assert.equal(verifyIntakeEditToken(tampered), null);
});

test('verifyIntakeEditToken returns null for wrong audience', () => {
  // Forge a token with the same secret but a different audience —
  // the audience check is what stops a JWT issued for another purpose
  // (e.g., session JWT) from being replayed against intake-edit.
  const forged = jwt.sign(
    { intakeId: 'i', lineUserId: 'u', companyId: 'c' },
    process.env.JWT_SECRET!,
    { audience: 'some-other-audience', expiresIn: 3600 },
  );
  assert.equal(verifyIntakeEditToken(forged), null);
});

test('verifyIntakeEditToken returns null for expired token', () => {
  // ttlSeconds = -1 issues a token that's already past expiry the moment
  // it leaves sign(). jwt.verify enforces exp.
  const token = signIntakeEditToken({ intakeId: 'i', lineUserId: 'u', companyId: 'c' }, -1);
  assert.equal(verifyIntakeEditToken(token), null);
});

test('verifyIntakeEditToken returns null for garbage string', () => {
  assert.equal(verifyIntakeEditToken('not-a-jwt-at-all'), null);
  assert.equal(verifyIntakeEditToken(''), null);
  assert.equal(verifyIntakeEditToken('a.b.c'), null);
});

test('verifyIntakeEditToken returns null when required field missing', () => {
  // A correctly-signed token with the right audience but missing intakeId
  // should still be rejected — the route relies on all three fields.
  const partial = jwt.sign(
    { lineUserId: 'u', companyId: 'c' }, // intakeId missing
    process.env.JWT_SECRET!,
    { audience: 'intake-edit', expiresIn: 3600 },
  );
  assert.equal(verifyIntakeEditToken(partial), null);
});

test('signIntakeEditToken honours custom TTL', () => {
  const token = signIntakeEditToken({ intakeId: 'i', lineUserId: 'u', companyId: 'c' }, 600);
  const decoded = verifyIntakeEditToken(token);
  assert.ok(decoded?.exp);
  const now = Math.floor(Date.now() / 1000);
  // Should expire ~600s from now (allow ±5s drift for clock jitter)
  assert.ok(Math.abs(decoded!.exp! - (now + 600)) < 5);
});

test('getIntakeEditTtlSeconds returns a sane positive number', () => {
  const ttl = getIntakeEditTtlSeconds();
  assert.ok(ttl > 0);
  assert.ok(ttl <= 168 * 3600, 'must be clamped to ≤ 168h');
});

test('buildIntakeEditUrl strips trailing slashes and embeds token', () => {
  assert.equal(
    buildIntakeEditUrl('https://app.example.com/', 'tok123'),
    'https://app.example.com/intake-edit/tok123',
  );
  assert.equal(
    buildIntakeEditUrl('https://app.example.com', 'tok123'),
    'https://app.example.com/intake-edit/tok123',
  );
  assert.equal(
    buildIntakeEditUrl('https://app.example.com////', 'tok123'),
    'https://app.example.com/intake-edit/tok123',
  );
});

test('verifyIntakeEditToken rejects token signed with different secret', () => {
  // Sign with a different secret entirely — verify must reject. This is
  // what protects against a leaked dev secret being replayed against prod.
  const evil = jwt.sign(
    { intakeId: 'i', lineUserId: 'u', companyId: 'c' },
    'different-secret-attempting-forgery',
    { audience: 'intake-edit', expiresIn: 3600 },
  );
  assert.equal(verifyIntakeEditToken(evil), null);
});
