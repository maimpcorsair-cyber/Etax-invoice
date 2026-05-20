// Social Security Office (สำนักงานประกันสังคม) contribution per
// Social Security Act §33: 5 % of the employee's wage, with a wage
// ceiling of 15,000 baht → max 750 baht/month from each side
// (employee + employer matching).
//
// Both sides remit to สปส.1-10 form, due by the 15th of the following
// month.

const SSO_RATE = 0.05;
const SSO_WAGE_CEILING = 15_000;

export interface SsoBreakdown {
  basis: number;      // wage capped at 15,000
  employee: number;   // 5 % of basis
  employer: number;   // same — employer matches
  total: number;      // combined remittance to สปส.
}

export function calculateMonthlySso(monthlyGross: number, isMember: boolean): SsoBreakdown {
  if (!isMember || monthlyGross <= 0) {
    return { basis: 0, employee: 0, employer: 0, total: 0 };
  }
  const basis = Math.min(monthlyGross, SSO_WAGE_CEILING);
  const employee = Math.round(basis * SSO_RATE * 100) / 100;
  return { basis, employee, employer: employee, total: employee * 2 };
}
