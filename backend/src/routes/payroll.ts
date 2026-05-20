import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { requireRole } from '../middleware/auth';
import { runPayroll, type EmployeeAdjustmentMap } from '../services/payroll/payrollRunner';
import { buildPnd1Csv, buildSso110Csv, UTF8_BOM, type PayslipRow } from '../services/payroll/csvExports';

// Phase 3 payroll routes — Employee CRUD, monthly run, payslip
// retrieval, and the two government exports (ภงด.1 + สปส.1-10) as
// CSV files. Government .txt formats are bank-by-bank specific and
// CSV uploads are now accepted by RD's e-WHT portal + SSO online
// system, so CSV is the lowest-friction option for v1.

export const payrollRouter = Router();

// All edit routes need accountant+; read routes are open to viewers.
const editRole = requireRole('admin', 'super_admin', 'accountant');

// ── Employee CRUD ────────────────────────────────────────────────────

const employeeBodySchema = z.object({
  employeeCode: z.string().trim().min(1).max(50),
  fullName: z.string().trim().min(1).max(200),
  position: z.string().trim().max(100).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  nationalId: z.string().regex(/^\d{13}$/).optional().or(z.literal('')),
  ssoNumber: z.string().regex(/^\d{13}$/).optional().or(z.literal('')),
  baseSalary: z.number().nonnegative(),
  bankAccount: z.string().trim().max(50).optional().or(z.literal('')),
  bankName: z.string().trim().max(100).optional().or(z.literal('')),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  hasSpouse: z.boolean().default(false),
  numChildren: z.number().int().min(0).max(20).default(0),
  numParents: z.number().int().min(0).max(2).default(0),
  pvdPercent: z.number().min(0).max(15).default(0),
  ssoMember: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

function normaliseBody(body: z.infer<typeof employeeBodySchema>) {
  return {
    ...body,
    position: body.position || null,
    email: body.email || null,
    phone: body.phone || null,
    nationalId: body.nationalId || null,
    ssoNumber: body.ssoNumber || null,
    bankAccount: body.bankAccount || null,
    bankName: body.bankName || null,
    startDate: new Date(`${body.startDate}T00:00:00.000Z`),
    endDate: body.endDate ? new Date(`${body.endDate}T00:00:00.000Z`) : null,
  };
}

payrollRouter.get('/employees', async (req, res) => {
  try {
    const employees = await req.txn!((tx) =>
      tx.employee.findMany({
        where: { companyId: req.user!.companyId },
        orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
      }),
    );
    res.json({ data: employees });
  } catch (err) {
    logger.error('list employees failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to list employees' });
  }
});

payrollRouter.post('/employees', editRole, async (req, res) => {
  try {
    const body = employeeBodySchema.parse(req.body);
    const created = await req.txn!((tx) =>
      tx.employee.create({
        data: { ...normaliseBody(body), companyId: req.user!.companyId },
      }),
    );
    res.status(201).json({ data: created });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.issues });
      return;
    }
    logger.error('create employee failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

payrollRouter.patch('/employees/:id', editRole, async (req, res) => {
  try {
    const body = employeeBodySchema.partial().parse(req.body);
    const existing = await prisma.employee.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    const updated = await prisma.employee.update({
      where: { id: existing.id },
      data: {
        ...body,
        ...(body.startDate ? { startDate: new Date(`${body.startDate}T00:00:00.000Z`) } : {}),
        ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(`${body.endDate}T00:00:00.000Z`) : null } : {}),
        ...(body.position !== undefined ? { position: body.position || null } : {}),
        ...(body.email !== undefined ? { email: body.email || null } : {}),
        ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
        ...(body.nationalId !== undefined ? { nationalId: body.nationalId || null } : {}),
        ...(body.ssoNumber !== undefined ? { ssoNumber: body.ssoNumber || null } : {}),
        ...(body.bankAccount !== undefined ? { bankAccount: body.bankAccount || null } : {}),
        ...(body.bankName !== undefined ? { bankName: body.bankName || null } : {}),
      },
    });
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.issues });
      return;
    }
    logger.error('update employee failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// ── Payroll runs ─────────────────────────────────────────────────────

payrollRouter.get('/runs', async (req, res) => {
  try {
    const year = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
    const runs = await req.txn!((tx) =>
      tx.payrollRun.findMany({
        where: { companyId: req.user!.companyId, ...(year ? { year } : {}) },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 36,
      }),
    );
    res.json({ data: runs });
  } catch (err) {
    logger.error('list payroll runs failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to list payroll runs' });
  }
});

const runPayrollSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adjustments: z.record(z.string(), z.array(z.object({
    label: z.string(),
    amount: z.number(),
    type: z.enum(['addition', 'deduction']),
  }))).optional(),
  notes: z.string().max(500).optional(),
});

payrollRouter.post('/runs', editRole, async (req, res) => {
  try {
    const body = runPayrollSchema.parse(req.body);
    const result = await runPayroll(prisma, {
      companyId: req.user!.companyId,
      year: body.year,
      month: body.month,
      payDate: new Date(`${body.payDate}T00:00:00.000Z`),
      createdBy: req.user!.userId,
      adjustments: body.adjustments as EmployeeAdjustmentMap | undefined,
      notes: body.notes,
    });
    res.json({ data: result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.issues });
      return;
    }
    logger.error('run payroll failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to run payroll' });
  }
});

payrollRouter.get('/runs/:id/payslips', async (req, res) => {
  try {
    const run = await prisma.payrollRun.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: { payslips: { orderBy: { employeeName: 'asc' } } },
    });
    if (!run) {
      res.status(404).json({ error: 'Payroll run not found' });
      return;
    }
    res.json({ data: { run, payslips: run.payslips } });
  } catch (err) {
    logger.error('list payslips failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to list payslips' });
  }
});

payrollRouter.post('/runs/:id/finalize', editRole, async (req, res) => {
  try {
    const run = await prisma.payrollRun.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!run) {
      res.status(404).json({ error: 'Payroll run not found' });
      return;
    }
    if (run.status !== 'draft') {
      res.status(400).json({ error: 'Run is already finalized' });
      return;
    }
    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'finalized', finalizedAt: new Date() },
    });
    res.json({ data: updated });
  } catch (err) {
    logger.error('finalize run failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to finalize' });
  }
});

// ── Government exports — CSV ─────────────────────────────────────────
// Builders live in services/payroll/csvExports.ts so the column
// schemas can be locked by unit tests and reused outside this route.

payrollRouter.get('/runs/:id/export/pnd1', async (req, res) => {
  try {
    const run = await prisma.payrollRun.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: { payslips: { include: { employee: { select: { nationalId: true, ssoNumber: true } } } } },
    });
    if (!run) {
      res.status(404).json({ error: 'Payroll run not found' });
      return;
    }
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: { taxId: true, nameTh: true },
    });
    const rows: PayslipRow[] = run.payslips.map((p) => ({
      employeeName: p.employeeName,
      employeeNationalId: p.employee?.nationalId ?? null,
      employeeSsoNumber: p.employee?.ssoNumber ?? null,
      gross: p.gross,
      whtAmount: p.whtAmount,
      ssoEmployee: p.ssoEmployee,
      ssoEmployer: p.ssoEmployer,
    }));
    const csv = buildPnd1Csv(rows, {
      year: run.year,
      month: run.month,
      payDateIso: run.payDate.toISOString().slice(0, 10),
      companyTaxId: company?.taxId ?? null,
      companyNameTh: company?.nameTh ?? null,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pnd1-${run.year}-${String(run.month).padStart(2, '0')}.csv"`);
    res.send(UTF8_BOM + csv);
  } catch (err) {
    logger.error('export pnd1 failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to export ภงด.1' });
  }
});

payrollRouter.get('/runs/:id/export/sso', async (req, res) => {
  try {
    const run = await prisma.payrollRun.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: { payslips: { include: { employee: { select: { ssoNumber: true, nationalId: true } } } } },
    });
    if (!run) {
      res.status(404).json({ error: 'Payroll run not found' });
      return;
    }
    const rows: PayslipRow[] = run.payslips.map((p) => ({
      employeeName: p.employeeName,
      employeeNationalId: p.employee?.nationalId ?? null,
      employeeSsoNumber: p.employee?.ssoNumber ?? null,
      gross: p.gross,
      whtAmount: p.whtAmount,
      ssoEmployee: p.ssoEmployee,
      ssoEmployer: p.ssoEmployer,
    }));
    const csv = buildSso110Csv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sso-1-10-${run.year}-${String(run.month).padStart(2, '0')}.csv"`);
    res.send(UTF8_BOM + csv);
  } catch (err) {
    logger.error('export sso failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to export สปส.1-10' });
  }
});
