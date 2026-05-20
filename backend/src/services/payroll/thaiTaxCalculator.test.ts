// Unit tests for thaiTaxCalculator — verifies the 2026 progressive PIT
// brackets and the annualised monthly withholding pipeline. These math
// errors hurt SMEs at year-end reconciliation, so the table cases double
// as a regression suite if the brackets ever change.
//
// Run: cd backend && npx tsx --test src/services/payroll/thaiTaxCalculator.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAnnualTax, calculateMonthlyWht } from './thaiTaxCalculator';

test('calculateAnnualTax — taxable income 0 returns 0', () => {
  assert.equal(calculateAnnualTax(0), 0);
});

test('calculateAnnualTax — negative input is clamped to 0', () => {
  assert.equal(calculateAnnualTax(-50_000), 0);
});

test('calculateAnnualTax — 150,000 exact bracket top → 0% (still in tax-free band)', () => {
  // First bracket is up to 150,000 at 0%. Anything in this band is tax-free.
  assert.equal(calculateAnnualTax(150_000), 0);
});

test('calculateAnnualTax — 200,000 = 0 + (50,000 × 5%)', () => {
  // 150k @ 0% + 50k @ 5% = 2,500
  assert.equal(calculateAnnualTax(200_000), 2_500);
});

test('calculateAnnualTax — 300,000 = bottom of 10% bracket', () => {
  // 150k @ 0% + 150k @ 5% = 7,500
  assert.equal(calculateAnnualTax(300_000), 7_500);
});

test('calculateAnnualTax — 500,000 = bottom of 15% bracket', () => {
  // 150k @ 0% + 150k @ 5% + 200k @ 10% = 0 + 7,500 + 20,000 = 27,500
  assert.equal(calculateAnnualTax(500_000), 27_500);
});

test('calculateAnnualTax — 1,000,000 = top of 20% bracket', () => {
  // 0 + 7,500 + 20,000 + 37,500 + 50,000 = 115,000
  assert.equal(calculateAnnualTax(1_000_000), 115_000);
});

test('calculateAnnualTax — 5,000,000 = top of 30% bracket', () => {
  // 0 + 7,500 + 20,000 + 37,500 + 50,000 + 250,000 + 900,000 = 1,265,000
  assert.equal(calculateAnnualTax(5_000_000), 1_265_000);
});

test('calculateAnnualTax — 10,000,000 includes 35% top rate', () => {
  // Up to 5M = 1,265,000 (from above); remainder 5M @ 35% = 1,750,000
  // Total = 3,015,000
  assert.equal(calculateAnnualTax(10_000_000), 3_015_000);
});

test('calculateMonthlyWht — minimum-wage salary 12,000/mo → effectively no tax', () => {
  // 12,000 × 12 = 144,000 gross
  // Standard expense = min(50% × 144k, 100k) = 72,000
  // Personal allowance = 60,000
  // Taxable = 144k - 72k - 60k = 12,000 → falls in 0% band
  const result = calculateMonthlyWht(12_000, { hasSpouse: false, numChildren: 0, numParents: 0, pvdAnnual: 0 });
  assert.equal(result.annualTax, 0);
  assert.equal(result.monthlyWht, 0);
});

test('calculateMonthlyWht — single SME owner 50,000/mo, no dependants', () => {
  // 50k × 12 = 600k gross
  // Standard expense = min(50% × 600k, 100k) = 100,000
  // Personal allowance = 60,000
  // Taxable = 600k - 100k - 60k = 440,000
  // Tax = 0 + 7,500 + 14,000 = 21,500 (last bracket only partially used)
  //   150k @ 0% = 0
  //   150k @ 5% = 7,500
  //   140k @ 10% = 14,000
  // Total annual = 21,500
  const result = calculateMonthlyWht(50_000, { hasSpouse: false, numChildren: 0, numParents: 0, pvdAnnual: 0 });
  assert.equal(result.taxableIncome, 440_000);
  assert.equal(result.annualTax, 21_500);
  assert.equal(result.monthlyWht, 21_500 / 12);
});

test('calculateMonthlyWht — married with 2 children + 1 parent reduces tax', () => {
  // 50k × 12 = 600k gross
  // Std expense = 100k; allowances = 60k + 60k (spouse) + 60k (2 children) + 30k (1 parent) = 210k
  // Taxable = 600k - 100k - 210k = 290,000
  // Tax = 0 + 7,000 = 7,000  (150k @ 0% + 140k @ 5%)
  const result = calculateMonthlyWht(50_000, { hasSpouse: true, numChildren: 2, numParents: 1, pvdAnnual: 0 });
  assert.equal(result.allowances.spouse, 60_000);
  assert.equal(result.allowances.children, 60_000);
  assert.equal(result.allowances.parents, 30_000);
  assert.equal(result.taxableIncome, 290_000);
  assert.equal(result.annualTax, 7_000);
});

test('calculateMonthlyWht — children allowance caps at 3 even with 5 kids', () => {
  // numChildren = 5 should clamp to 3 = 90,000 allowance
  const result = calculateMonthlyWht(50_000, { hasSpouse: false, numChildren: 5, numParents: 0, pvdAnnual: 0 });
  assert.equal(result.allowances.children, 90_000);
});

test('calculateMonthlyWht — parents allowance caps at 2 even with 4 listed', () => {
  // numParents = 4 should clamp to 2 = 60,000
  const result = calculateMonthlyWht(50_000, { hasSpouse: false, numChildren: 0, numParents: 4, pvdAnnual: 0 });
  assert.equal(result.allowances.parents, 60_000);
});

test('calculateMonthlyWht — PVD deduction caps at 500,000', () => {
  // Even if the employee contributes 1M in a year, only 500k is deductible.
  const result = calculateMonthlyWht(100_000, { hasSpouse: false, numChildren: 0, numParents: 0, pvdAnnual: 1_000_000 });
  assert.equal(result.allowances.pvd, 500_000);
});

test('calculateMonthlyWht — negative PVD value is clamped to 0', () => {
  const result = calculateMonthlyWht(50_000, { hasSpouse: false, numChildren: 0, numParents: 0, pvdAnnual: -100_000 });
  assert.equal(result.allowances.pvd, 0);
});

test('calculateMonthlyWht — high-income salary 500,000/mo hits multiple brackets', () => {
  // 500k × 12 = 6M gross
  // Std expense = 100k (capped)
  // Allowance = 60k personal
  // Taxable = 6M - 100k - 60k = 5,840,000
  // Tax through brackets:
  //   150k @ 0% = 0
  //   150k @ 5% = 7,500
  //   200k @ 10% = 20,000
  //   250k @ 15% = 37,500
  //   250k @ 20% = 50,000
  //   1,000k @ 25% = 250,000
  //   3,000k @ 30% = 900,000
  //   840k @ 35% = 294,000
  // Total = 1,559,000
  const result = calculateMonthlyWht(500_000, { hasSpouse: false, numChildren: 0, numParents: 0, pvdAnnual: 0 });
  assert.equal(result.taxableIncome, 5_840_000);
  assert.equal(result.annualTax, 1_559_000);
});

test('calculateMonthlyWht — monthly = annualTax / 12 exactly', () => {
  const result = calculateMonthlyWht(80_000, { hasSpouse: true, numChildren: 1, numParents: 2, pvdAnnual: 24_000 });
  assert.equal(result.monthlyWht, result.annualTax / 12);
});

test('calculateMonthlyWht — annualGross is always monthly × 12', () => {
  const result = calculateMonthlyWht(45_000, { hasSpouse: false, numChildren: 0, numParents: 0, pvdAnnual: 0 });
  assert.equal(result.annualGross, 540_000);
});

test('calculateMonthlyWht — standard expense respects 100k cap on high salaries', () => {
  // 100,000/mo × 12 = 1.2M; 50% would be 600k, but cap is 100k
  const result = calculateMonthlyWht(100_000, { hasSpouse: false, numChildren: 0, numParents: 0, pvdAnnual: 0 });
  assert.equal(result.standardExpense, 100_000);
});

test('calculateMonthlyWht — standard expense at exact cap-boundary salary', () => {
  // 200k annual → 50% = 100k → exactly at cap
  // 200k / 12 = 16,666.67
  const result = calculateMonthlyWht(200_000 / 12, { hasSpouse: false, numChildren: 0, numParents: 0, pvdAnnual: 0 });
  assert.equal(result.standardExpense, 100_000);
});
