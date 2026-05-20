// Unit tests for ssoCalculator — Social Security Act §33: 5 % of monthly
// wage, capped at 15,000 baht (so max 750 ฿ per side per month). The
// employer matches the employee, so total remittance is 1,500 ฿.
//
// Run: cd backend && npx tsx --test src/services/payroll/ssoCalculator.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMonthlySso } from './ssoCalculator';

test('non-member returns all zeros regardless of salary', () => {
  const result = calculateMonthlySso(50_000, false);
  assert.deepEqual(result, { basis: 0, employee: 0, employer: 0, total: 0 });
});

test('zero salary returns all zeros even when SSO member', () => {
  const result = calculateMonthlySso(0, true);
  assert.deepEqual(result, { basis: 0, employee: 0, employer: 0, total: 0 });
});

test('negative salary is treated as zero', () => {
  const result = calculateMonthlySso(-1000, true);
  assert.deepEqual(result, { basis: 0, employee: 0, employer: 0, total: 0 });
});

test('low salary 10,000 → 5% = 500 each side, total 1,000', () => {
  const result = calculateMonthlySso(10_000, true);
  assert.equal(result.basis, 10_000);
  assert.equal(result.employee, 500);
  assert.equal(result.employer, 500);
  assert.equal(result.total, 1_000);
});

test('ceiling salary 15,000 → 750 each side (max contribution)', () => {
  const result = calculateMonthlySso(15_000, true);
  assert.equal(result.basis, 15_000);
  assert.equal(result.employee, 750);
  assert.equal(result.employer, 750);
  assert.equal(result.total, 1_500);
});

test('above-ceiling salary 50,000 → still capped at 750 each side', () => {
  // The ceiling means high earners pay the same as someone earning 15k —
  // SSO benefits are also capped at the same wage basis.
  const result = calculateMonthlySso(50_000, true);
  assert.equal(result.basis, 15_000);
  assert.equal(result.employee, 750);
  assert.equal(result.employer, 750);
  assert.equal(result.total, 1_500);
});

test('above-ceiling salary 1,000,000 → still 750 each side', () => {
  const result = calculateMonthlySso(1_000_000, true);
  assert.equal(result.employee, 750);
  assert.equal(result.employer, 750);
});

test('mid-range salary 12,345 → 617.25 rounded to 2 decimals', () => {
  // 12,345 × 5% = 617.25
  const result = calculateMonthlySso(12_345, true);
  assert.equal(result.basis, 12_345);
  assert.equal(result.employee, 617.25);
  assert.equal(result.employer, 617.25);
});

test('employer always matches employee exactly', () => {
  for (const salary of [5_000, 8_500, 14_999, 15_000, 30_000, 100_000]) {
    const result = calculateMonthlySso(salary, true);
    assert.equal(result.employer, result.employee, `mismatch at salary=${salary}`);
  }
});

test('total = employee + employer = 2 × employee', () => {
  for (const salary of [5_000, 12_000, 14_500, 15_000, 50_000]) {
    const result = calculateMonthlySso(salary, true);
    assert.equal(result.total, result.employee * 2, `mismatch at salary=${salary}`);
  }
});
