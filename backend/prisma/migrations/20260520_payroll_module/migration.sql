-- Phase 3 Payroll module: Employee + PayrollRun + Payslip tables.
-- Monthly Thai income tax (ภงด.1) and social security (สปส.) handled
-- by application-layer calculators, not stored procedures.

CREATE TYPE "PayrollRunStatus" AS ENUM ('draft', 'finalized', 'paid');

CREATE TABLE "employees" (
    "id"              TEXT NOT NULL,
    "company_id"      TEXT NOT NULL,
    "employee_code"   TEXT NOT NULL,
    "full_name"       TEXT NOT NULL,
    "position"        TEXT,
    "email"           TEXT,
    "phone"           TEXT,
    "national_id"     TEXT,
    "sso_number"      TEXT,
    "base_salary"     DOUBLE PRECISION NOT NULL,
    "bank_account"    TEXT,
    "bank_name"       TEXT,
    "start_date"      TIMESTAMP(3) NOT NULL,
    "end_date"        TIMESTAMP(3),
    "has_spouse"      BOOLEAN NOT NULL DEFAULT false,
    "num_children"    INTEGER NOT NULL DEFAULT 0,
    "num_parents"     INTEGER NOT NULL DEFAULT 0,
    "pvd_percent"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sso_member"      BOOLEAN NOT NULL DEFAULT true,
    "is_active"       BOOLEAN NOT NULL DEFAULT true,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employees_company_id_employee_code_key" ON "employees"("company_id", "employee_code");
CREATE INDEX "employees_company_id_idx"                       ON "employees"("company_id");
CREATE INDEX "employees_company_id_is_active_idx"             ON "employees"("company_id", "is_active");

ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payroll_runs" (
    "id"           TEXT NOT NULL,
    "company_id"   TEXT NOT NULL,
    "year"         INTEGER NOT NULL,
    "month"        INTEGER NOT NULL,
    "status"       "PayrollRunStatus" NOT NULL DEFAULT 'draft',
    "pay_date"     TIMESTAMP(3) NOT NULL,
    "total_gross"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_net"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_wht"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_sso"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes"        TEXT,
    "created_by"   TEXT NOT NULL,
    "finalized_at" TIMESTAMP(3),
    "paid_at"      TIMESTAMP(3),
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_runs_company_id_year_month_key" ON "payroll_runs"("company_id", "year", "month");
CREATE INDEX "payroll_runs_company_id_year_idx"              ON "payroll_runs"("company_id", "year");

ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payslips" (
    "id"             TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "employee_id"    TEXT NOT NULL,
    "employee_name"  TEXT NOT NULL,
    "employee_code"  TEXT NOT NULL,
    "position"       TEXT,
    "base_salary"    DOUBLE PRECISION NOT NULL,
    "adjustments"    JSONB,
    "gross"          DOUBLE PRECISION NOT NULL,
    "wht_amount"     DOUBLE PRECISION NOT NULL,
    "sso_employee"   DOUBLE PRECISION NOT NULL,
    "sso_employer"   DOUBLE PRECISION NOT NULL,
    "pvd_amount"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "net"            DOUBLE PRECISION NOT NULL,
    "pdf_url"        TEXT,
    "emailed_at"     TIMESTAMP(3),
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payslips_payroll_run_id_idx" ON "payslips"("payroll_run_id");
CREATE INDEX "payslips_employee_id_idx"    ON "payslips"("employee_id");

ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_run_id_fkey"
    FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
