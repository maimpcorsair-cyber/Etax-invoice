// Unit tests for payroll CSV exports. Locks the column schema for
// ภงด.1 (PND.1) and สปส.1-10 (SSO 1-10) so accidental column reorder /
// rename gets caught before it breaks an accountant's upload to the RD or
// SSO portal mid-month.
//
// Run: cd backend && npm run test:unit

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPnd1Csv, buildSso110Csv, UTF8_BOM, type PayslipRow, type PayrollRunMeta } from './csvExports';

const SAMPLE_ROWS: PayslipRow[] = [
  {
    employeeName: 'สมชาย ใจดี',
    employeeNationalId: '1234567890123',
    employeeSsoNumber: '9876543210987',
    gross: 30000,
    whtAmount: 0,
    ssoEmployee: 750,
    ssoEmployer: 750,
  },
  {
    employeeName: 'Jane Doe',
    employeeNationalId: '5555555555555',
    employeeSsoNumber: null,
    gross: 80000,
    whtAmount: 2500,
    ssoEmployee: 750,
    ssoEmployer: 750,
  },
];

const SAMPLE_META: PayrollRunMeta = {
  year: 2026,
  month: 5,
  payDateIso: '2026-05-31',
  companyTaxId: '0105560123456',
  companyNameTh: 'บริษัท สยาม เทคโนโลยี จำกัด',
};

// ── PND.1 ───────────────────────────────────────────────────────────

test('PND.1 header matches RD Excel template column order', () => {
  const csv = buildPnd1Csv(SAMPLE_ROWS, SAMPLE_META);
  const header = csv.split('\n')[0];
  assert.equal(
    header,
    'No,WithholderTaxId,NationalID,Name,IncomeType,PayDate,GrossIncome,WhtRate,WhtAmount,Condition',
  );
});

test('PND.1 emits one row per employee plus the header', () => {
  const csv = buildPnd1Csv(SAMPLE_ROWS, SAMPLE_META);
  const lines = csv.split('\n');
  assert.equal(lines.length, 3); // header + 2 employees
});

test('PND.1 row 1 carries company tax ID, employee national ID, gross, WHT', () => {
  const csv = buildPnd1Csv(SAMPLE_ROWS, SAMPLE_META);
  const row1 = csv.split('\n')[1];
  // No,WithholderTaxId,NationalID,Name,IncomeType,PayDate,GrossIncome,WhtRate,WhtAmount,Condition
  assert.ok(row1.startsWith('1,0105560123456,1234567890123,'));
  assert.ok(row1.includes(',1,2026-05-31,30000.00,,0.00,1'));
});

test('PND.1 Thai employee name with comma is quoted properly', () => {
  const rows: PayslipRow[] = [{
    ...SAMPLE_ROWS[0],
    employeeName: 'สมชาย, ใจดี',
  }];
  const csv = buildPnd1Csv(rows, SAMPLE_META);
  assert.ok(csv.includes('"สมชาย, ใจดี"'));
});

test('PND.1 IncomeType is "1" (§40(1) employment) for all rows', () => {
  const csv = buildPnd1Csv(SAMPLE_ROWS, SAMPLE_META);
  const rows = csv.split('\n').slice(1);
  for (const row of rows) {
    assert.ok(row.split(',')[4] === '1', `expected IncomeType=1, got row: ${row}`);
  }
});

test('PND.1 Condition is "1" (withheld) for all rows', () => {
  const csv = buildPnd1Csv(SAMPLE_ROWS, SAMPLE_META);
  const rows = csv.split('\n').slice(1);
  for (const row of rows) {
    const cols = row.split(',');
    assert.equal(cols[cols.length - 1], '1');
  }
});

test('PND.1 handles missing national ID (empty cell, no crash)', () => {
  const rows: PayslipRow[] = [{ ...SAMPLE_ROWS[0], employeeNationalId: null }];
  const csv = buildPnd1Csv(rows, SAMPLE_META);
  const row1 = csv.split('\n')[1];
  // No,WithholderTaxId,(empty NationalID),Name,...
  assert.ok(row1.startsWith('1,0105560123456,,'));
});

test('PND.1 amounts have 2 decimals (RD requires fixed format)', () => {
  const csv = buildPnd1Csv(SAMPLE_ROWS, SAMPLE_META);
  assert.ok(csv.includes('30000.00'));
  assert.ok(csv.includes('80000.00'));
  assert.ok(csv.includes('2500.00'));
});

// ── สปส.1-10 ─────────────────────────────────────────────────────────

test('SSO 1-10 header matches sso.go.th expected column order', () => {
  const csv = buildSso110Csv(SAMPLE_ROWS);
  const header = csv.split('\n')[0];
  assert.equal(
    header,
    'No,SSO_Number,Prefix,FirstName,LastName,Salary,EmployeeContribution,EmployerContribution,TotalContribution',
  );
});

test('SSO 1-10 uses ssoNumber when present, falls back to nationalId', () => {
  const csv = buildSso110Csv(SAMPLE_ROWS);
  const rows = csv.split('\n').slice(1);
  // Row 1: ssoNumber present → uses 9876543210987
  assert.ok(rows[0].includes(',9876543210987,'));
  // Row 2: ssoNumber null → falls back to nationalId 5555555555555
  assert.ok(rows[1].includes(',5555555555555,'));
});

test('SSO 1-10 splits Thai name into first + last by first space', () => {
  const csv = buildSso110Csv(SAMPLE_ROWS);
  const cols = csv.split('\n')[1].split(',');
  // No,SSO_Number,Prefix,FirstName,LastName,...
  assert.equal(cols[3], 'สมชาย');
  assert.equal(cols[4], 'ใจดี');
});

test('SSO 1-10 splits English name and preserves middle/last', () => {
  const rows: PayslipRow[] = [{ ...SAMPLE_ROWS[0], employeeName: 'John Michael Doe' }];
  const csv = buildSso110Csv(rows);
  const cols = csv.split('\n')[1].split(',');
  assert.equal(cols[3], 'John');
  assert.equal(cols[4], 'Michael Doe');
});

test('SSO 1-10 TotalContribution = employee + employer', () => {
  const csv = buildSso110Csv(SAMPLE_ROWS);
  const cols = csv.split('\n')[1].split(',');
  // EmployeeContribution=750.00, EmployerContribution=750.00 → Total=1500.00
  assert.equal(cols[6], '750.00');
  assert.equal(cols[7], '750.00');
  assert.equal(cols[8], '1500.00');
});

test('SSO 1-10 handles single-word name (no last name)', () => {
  const rows: PayslipRow[] = [{ ...SAMPLE_ROWS[0], employeeName: 'Madonna' }];
  const csv = buildSso110Csv(rows);
  const cols = csv.split('\n')[1].split(',');
  assert.equal(cols[3], 'Madonna');
  assert.equal(cols[4], '');
});

// ── UTF-8 BOM constant ───────────────────────────────────────────────

test('UTF8_BOM is exactly the BOM byte sequence', () => {
  assert.equal(UTF8_BOM, '﻿');
});
