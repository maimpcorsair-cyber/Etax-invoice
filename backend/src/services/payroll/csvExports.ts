// Pure CSV builders for payroll government-form exports. Stateless,
// testable, and intentionally separated from the Express route so the
// format can be locked by unit tests.
//
// ── ภงด.1 (PND.1) — Monthly WHT remittance for §40(1) salaries ──
// Submitted to Revenue Department by the 7th of the following month.
// The RD e-Filing portal accepts XML uploads; the official Excel template
// (RDPND1.xlsm) is what accountants use to PREPARE data, then export the
// XML via the template's macro. Billboy's CSV is structured to paste
// directly into that Excel template — column order matches.
//
// ── สปส.1-10 (SSO Form 1-10) — Monthly social security remittance ──
// Submitted to Social Security Office by the 15th of the following month.
// Online filing at https://www.sso.go.th accepts CSV upload directly.

export interface PayslipRow {
  employeeName: string;
  employeeNationalId: string | null;
  employeeSsoNumber: string | null;
  gross: number;
  whtAmount: number;
  ssoEmployee: number;
  ssoEmployer: number;
}

export interface PayrollRunMeta {
  year: number;
  month: number;
  payDateIso: string; // YYYY-MM-DD
  companyTaxId: string | null;
  companyNameTh: string | null;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function joinCsv(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>): string {
  const header = columns.map((c) => c.label).join(',');
  const lines = rows.map((row) => columns.map((c) => csvEscape(row[c.key])).join(','));
  return [header, ...lines].join('\n');
}

/**
 * Build the ภงด.1 (PND.1) CSV — one row per employee.
 * Columns match the RD Excel template (RDPND1.xlsm) so accountants can
 * paste into the template and trigger the XML-export macro.
 *
 * Column meanings:
 * - No: running number per the form
 * - WithholderTaxId: company's tax ID (same on every row)
 * - NationalID: employee's 13-digit national ID
 * - Name: employee full name
 * - IncomeType: 1 = §40(1) salaries (only value Billboy supports today)
 * - PayDate: ISO date the salary was actually paid
 * - GrossIncome: gross salary before deductions
 * - WhtRate: blank — variable per progressive bracket, RD calculates
 * - WhtAmount: WHT withheld this month
 * - Condition: 1 = withheld, 2 = paid on behalf, 3 = paid on behalf forever
 */
export function buildPnd1Csv(rows: PayslipRow[], meta: PayrollRunMeta): string {
  return joinCsv(
    rows.map((row, idx) => ({
      no: String(idx + 1),
      withholderTaxId: meta.companyTaxId ?? '',
      nationalId: row.employeeNationalId ?? '',
      name: row.employeeName,
      incomeType: '1',
      payDate: meta.payDateIso,
      grossIncome: row.gross.toFixed(2),
      whtRate: '',
      whtAmount: row.whtAmount.toFixed(2),
      condition: '1',
    })),
    [
      { key: 'no', label: 'No' },
      { key: 'withholderTaxId', label: 'WithholderTaxId' },
      { key: 'nationalId', label: 'NationalID' },
      { key: 'name', label: 'Name' },
      { key: 'incomeType', label: 'IncomeType' },
      { key: 'payDate', label: 'PayDate' },
      { key: 'grossIncome', label: 'GrossIncome' },
      { key: 'whtRate', label: 'WhtRate' },
      { key: 'whtAmount', label: 'WhtAmount' },
      { key: 'condition', label: 'Condition' },
    ],
  );
}

/**
 * Build the สปส.1-10 (SSO 1-10) CSV — one row per employee.
 * Columns match the SSO online filing CSV format at sso.go.th.
 *
 * The TotalContribution column is the combined employee + employer share
 * (each capped at 750 ฿/month since basis is capped at 15,000 ฿).
 */
export function buildSso110Csv(rows: PayslipRow[]): string {
  return joinCsv(
    rows.map((row, idx) => {
      const firstName = row.employeeName.split(' ')[0] ?? row.employeeName;
      const lastName = row.employeeName.split(' ').slice(1).join(' ');
      const total = row.ssoEmployee + row.ssoEmployer;
      return {
        no: String(idx + 1),
        ssoNumber: row.employeeSsoNumber || row.employeeNationalId || '',
        prefix: '',
        firstName,
        lastName,
        salary: row.gross.toFixed(2),
        employeeContribution: row.ssoEmployee.toFixed(2),
        employerContribution: row.ssoEmployer.toFixed(2),
        totalContribution: total.toFixed(2),
      };
    }),
    [
      { key: 'no', label: 'No' },
      { key: 'ssoNumber', label: 'SSO_Number' },
      { key: 'prefix', label: 'Prefix' },
      { key: 'firstName', label: 'FirstName' },
      { key: 'lastName', label: 'LastName' },
      { key: 'salary', label: 'Salary' },
      { key: 'employeeContribution', label: 'EmployeeContribution' },
      { key: 'employerContribution', label: 'EmployerContribution' },
      { key: 'totalContribution', label: 'TotalContribution' },
    ],
  );
}

// BOM prefix so Excel TH opens UTF-8 files without prompting for encoding.
export const UTF8_BOM = '﻿';
