// Thai personal income tax (PIT) for employment income — used to compute
// the monthly withholding (ภงด.1) the employer must remit by the 7th of
// the following month. Math is per Revenue Code §40(1) + §50 + §57:
//
//   1. Annualise monthly gross (× 12)
//   2. Subtract employment-income standard expense = min(50 %, 100,000 ฿)
//   3. Subtract personal + spouse + children + parents allowances
//   4. Apply the progressive 2026 bracket table → annual tax
//   5. Divide by 12 → monthly withholding
//
// Rates last updated 2026-05-20 (no change since 2017 Revenue Code reform).
// If the brackets shift, replace BRACKETS_2026 and bump the file header.

export interface TaxAllowances {
  hasSpouse: boolean;
  numChildren: number;   // capped at 3 per Revenue Code §47(1)(c)
  numParents: number;    // capped at 2 (taxpayer's parents only — §47(1)(j))
  pvdAnnual: number;     // PVD contribution (already-deducted from gross)
}

const PERSONAL_ALLOWANCE = 60_000;
const SPOUSE_ALLOWANCE = 60_000;
const CHILD_ALLOWANCE = 30_000;
const PARENT_ALLOWANCE = 30_000;
const STANDARD_EXPENSE_RATE = 0.5;
const STANDARD_EXPENSE_CAP = 100_000;
const PVD_DEDUCTION_CAP = 500_000;
const MAX_CHILDREN = 3;
const MAX_PARENTS = 2;

interface Bracket { upTo: number; rate: number; }

// 2026 progressive PIT brackets (annual taxable income, baht).
const BRACKETS_2026: Bracket[] = [
  { upTo:   150_000, rate: 0    },
  { upTo:   300_000, rate: 0.05 },
  { upTo:   500_000, rate: 0.10 },
  { upTo:   750_000, rate: 0.15 },
  { upTo: 1_000_000, rate: 0.20 },
  { upTo: 2_000_000, rate: 0.25 },
  { upTo: 5_000_000, rate: 0.30 },
  { upTo: Infinity,  rate: 0.35 },
];

/** Compute annual income tax from taxable income via the progressive table. */
export function calculateAnnualTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const bracket of BRACKETS_2026) {
    const taxedHere = Math.min(taxableIncome, bracket.upTo) - lower;
    if (taxedHere <= 0) break;
    tax += taxedHere * bracket.rate;
    lower = bracket.upTo;
    if (taxableIncome <= bracket.upTo) break;
  }
  return tax;
}

export interface MonthlyTaxBreakdown {
  annualGross: number;
  standardExpense: number;
  allowances: {
    personal: number;
    spouse: number;
    children: number;
    parents: number;
    pvd: number;
    total: number;
  };
  taxableIncome: number;
  annualTax: number;
  monthlyWht: number;
}

/**
 * Monthly withholding = annualised tax / 12. We always derive from
 * annualised income so a salary increase mid-year doesn't under- or
 * over-withhold — same approach SAP/Oracle HCM use.
 */
export function calculateMonthlyWht(monthlyGross: number, allowances: TaxAllowances): MonthlyTaxBreakdown {
  const annualGross = monthlyGross * 12;
  const standardExpense = Math.min(annualGross * STANDARD_EXPENSE_RATE, STANDARD_EXPENSE_CAP);

  const personalA = PERSONAL_ALLOWANCE;
  const spouseA = allowances.hasSpouse ? SPOUSE_ALLOWANCE : 0;
  const childrenA = Math.min(allowances.numChildren, MAX_CHILDREN) * CHILD_ALLOWANCE;
  const parentsA = Math.min(allowances.numParents, MAX_PARENTS) * PARENT_ALLOWANCE;
  const pvdA = Math.min(Math.max(0, allowances.pvdAnnual), PVD_DEDUCTION_CAP);
  const totalAllowances = personalA + spouseA + childrenA + parentsA + pvdA;

  const taxableIncome = Math.max(0, annualGross - standardExpense - totalAllowances);
  const annualTax = calculateAnnualTax(taxableIncome);
  const monthlyWht = Math.max(0, annualTax / 12);

  return {
    annualGross,
    standardExpense,
    allowances: {
      personal: personalA,
      spouse: spouseA,
      children: childrenA,
      parents: parentsA,
      pvd: pvdA,
      total: totalAllowances,
    },
    taxableIncome,
    annualTax,
    monthlyWht,
  };
}
