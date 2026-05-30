import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret-min-32-bytes-please-aaaaaaaaaa';

import {
  buildQuotationShareUrl,
  signQuotationShareToken,
  verifyQuotationShareToken,
} from './quotationShareToken';

test('signQuotationShareToken -> verifyQuotationShareToken round-trips quotation scope', () => {
  const token = signQuotationShareToken({ quotationId: 'qt-1', companyId: 'co-1' });
  const decoded = verifyQuotationShareToken(token);
  assert.equal(decoded?.quotationId, 'qt-1');
  assert.equal(decoded?.companyId, 'co-1');
});

test('verifyQuotationShareToken rejects wrong audience', () => {
  const token = jwt.sign(
    { quotationId: 'qt-1', companyId: 'co-1' },
    process.env.JWT_SECRET!,
    { audience: 'invoice-share', expiresIn: 3600 },
  );
  assert.equal(verifyQuotationShareToken(token), null);
});

test('verifyQuotationShareToken rejects missing required fields', () => {
  const token = jwt.sign(
    { companyId: 'co-1' },
    process.env.JWT_SECRET!,
    { audience: 'quotation-share', expiresIn: 3600 },
  );
  assert.equal(verifyQuotationShareToken(token), null);
});

test('verifyQuotationShareToken rejects expired tokens and garbage', () => {
  const expired = signQuotationShareToken({ quotationId: 'qt-1', companyId: 'co-1' }, -1);
  assert.equal(verifyQuotationShareToken(expired), null);
  assert.equal(verifyQuotationShareToken('not-a-token'), null);
});

test('buildQuotationShareUrl strips trailing slash and embeds token', () => {
  assert.equal(
    buildQuotationShareUrl('https://example.com/', 'tok123'),
    'https://example.com/share/quotation/tok123',
  );
});
