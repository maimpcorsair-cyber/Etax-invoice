import type { PrismaClient } from '@prisma/client';
import { calculateMonthlyWht } from './thaiTaxCalculator';
import { calculateMonthlySso } from './ssoCalculator';

// Orchestrates one monthly payroll: pull active employees, compute
// gross + WHT + SSO + PVD + net per head, materialise Payslip rows
// under a single PayrollRun row. Idempotent — re-running the same
// company × year × month replaces the existing run's payslips.

export interface PayrollAdjustment {
  label: string;
  amount: number;
  type: 'addition' | 'deduction';
}

export interface EmployeeAdjustmentMap {
  [employeeId: string]: PayrollAdjustment[];
}

export interface PayrollRunInput {
  companyId: string;
  year: number;
  month: number;        // 1-12
  payDate: Date;
  createdBy: string;
  adjustments?: EmployeeAdjustmentMap;
  notes?: string;
}

export interface PayrollRunResult {
  payrollRunId: string;
  payslipCount: number;
  totalGross: number;
  totalNet: number;
  totalWht: number;
  totalSso: number;
}

function sumAdjustments(list: PayrollAdjustment[] | undefined): { additions: number; deductions: number } {
  if (!list?.length) return { additions: 0, deductions: 0 };
  let additions = 0;
  let deductions = 0;
  for (const a of list) {
    if (a.type === 'addition') additions += a.amount;
    else deductions += a.amount;
  }
  return { additions, deductions };
}

export async function runPayroll(prisma: PrismaClient, input: PayrollRunInput): Promise<PayrollRunResult> {
  const { companyId, year, month, payDate, createdBy, adjustments = {}, notes } = input;

  if (month < 1 || month > 12) throw new Error('month must be 1-12');

  const employees = await prisma.employee.findMany({
    where: { companyId, isActive: true },
  });

  // Compute everything before the transaction so the DB write is fast.
  const computed = employees.map((emp) => {
    const adj = adjustments[emp.id] ?? [];
    const { additions, deductions } = sumAdjustments(adj);
    const gross = emp.baseSalary + additions - deductions;

    const pvdMonthly = (gross * (emp.pvdPercent ?? 0)) / 100;
    const tax = calculateMonthlyWht(gross, {
      hasSpouse: emp.hasSpouse,
      numChildren: emp.numChildren,
      numParents: emp.numParents,
      pvdAnnual: pvdMonthly * 12,
    });
    const sso = calculateMonthlySso(gross, emp.ssoMember);

    const net = gross - tax.monthlyWht - sso.employee - pvdMonthly;

    return {
      employeeId: emp.id,
      employeeName: emp.fullName,
      employeeCode: emp.employeeCode,
      position: emp.position ?? null,
      baseSalary: emp.baseSalary,
      adjustments: adj,
      gross,
      whtAmount: tax.monthlyWht,
      ssoEmployee: sso.employee,
      ssoEmployer: sso.employer,
      pvdAmount: pvdMonthly,
      net,
    };
  });

  const totals = computed.reduce(
    (acc, p) => ({
      gross: acc.gross + p.gross,
      net: acc.net + p.net,
      wht: acc.wht + p.whtAmount,
      sso: acc.sso + p.ssoEmployee,
    }),
    { gross: 0, net: 0, wht: 0, sso: 0 },
  );

  // Upsert the PayrollRun + replace payslips inside a transaction so a
  // partial failure doesn't leave the company with half a run.
  const result = await prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.upsert({
      where: { companyId_year_month: { companyId, year, month } },
      create: {
        companyId, year, month,
        status: 'draft',
        payDate,
        totalGross: totals.gross,
        totalNet: totals.net,
        totalWht: totals.wht,
        totalSso: totals.sso,
        notes: notes ?? null,
        createdBy,
      },
      update: {
        payDate,
        totalGross: totals.gross,
        totalNet: totals.net,
        totalWht: totals.wht,
        totalSso: totals.sso,
        notes: notes ?? null,
        status: 'draft',
        finalizedAt: null,
        paidAt: null,
      },
    });
    await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });
    if (computed.length > 0) {
      await tx.payslip.createMany({
        data: computed.map((p) => ({
          ...p,
          payrollRunId: run.id,
          adjustments: p.adjustments as unknown as object,
        })),
      });
    }
    return run;
  });

  return {
    payrollRunId: result.id,
    payslipCount: computed.length,
    totalGross: totals.gross,
    totalNet: totals.net,
    totalWht: totals.wht,
    totalSso: totals.sso,
  };
}
