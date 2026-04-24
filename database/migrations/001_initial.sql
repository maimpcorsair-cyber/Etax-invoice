-- e-Tax Invoice System - Initial Schema
-- Bilingual (Thai / English) support throughout
-- Compliant with Thailand Revenue Department requirements

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'accountant', 'viewer');
CREATE TYPE invoice_type AS ENUM ('tax_invoice', 'receipt', 'credit_note', 'debit_note');
CREATE TYPE invoice_status AS ENUM ('draft', 'pending', 'approved', 'submitted', 'rejected', 'cancelled');
CREATE TYPE rd_submission_status AS ENUM ('pending', 'in_progress', 'success', 'failed', 'retrying');
CREATE TYPE vat_type AS ENUM ('vat7', 'vatExempt', 'vatZero');

-- Companies
CREATE TABLE companies (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name_th          TEXT NOT NULL,
    name_en          TEXT,
    tax_id           TEXT NOT NULL UNIQUE,
    branch_code      TEXT NOT NULL DEFAULT '00000',
    branch_name_th   TEXT,
    branch_name_en   TEXT,
    address_th       TEXT NOT NULL,
    address_en       TEXT,
    phone            TEXT,
    email            TEXT,
    website          TEXT,
    logo_url         TEXT,
    -- RD API configuration
    rd_client_id     TEXT,
    rd_client_secret TEXT,  -- stored encrypted
    rd_environment   TEXT NOT NULL DEFAULT 'sandbox',
    -- Digital certificate
    certificate_path     TEXT,
    certificate_password TEXT,  -- stored encrypted
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users (supports multiple companies via RBAC)
CREATE TABLE users (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          user_role NOT NULL DEFAULT 'viewer',
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_company ON users(company_id);

-- Customers (bilingual: name_th / name_en, address_th / address_en)
CREATE TABLE customers (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name_th         TEXT NOT NULL,
    name_en         TEXT,
    tax_id          TEXT NOT NULL,
    branch_code     TEXT NOT NULL DEFAULT '00000',
    branch_name_th  TEXT,
    branch_name_en  TEXT,
    address_th      TEXT NOT NULL,
    address_en      TEXT,
    email           TEXT,
    phone           TEXT,
    contact_person  TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, tax_id, branch_code)
);
CREATE INDEX idx_customers_company ON customers(company_id);
CREATE INDEX idx_customers_tax_id ON customers(tax_id);

-- Products / Services (bilingual: name_th / name_en)
CREATE TABLE products (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    code            TEXT NOT NULL,
    name_th         TEXT NOT NULL,
    name_en         TEXT,
    description_th  TEXT,
    description_en  TEXT,
    unit            TEXT NOT NULL DEFAULT 'ชิ้น',
    unit_price      NUMERIC(15, 4) NOT NULL DEFAULT 0,
    vat_type        vat_type NOT NULL DEFAULT 'vat7',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code)
);
CREATE INDEX idx_products_company ON products(company_id);

-- Invoices
CREATE TABLE invoices (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id          TEXT NOT NULL REFERENCES companies(id),
    invoice_number      TEXT NOT NULL,
    type                invoice_type NOT NULL,
    status              invoice_status NOT NULL DEFAULT 'draft',
    language            TEXT NOT NULL DEFAULT 'th',  -- 'th', 'en', 'both'
    invoice_date        DATE NOT NULL,
    due_date            DATE,
    buyer_id            TEXT NOT NULL REFERENCES customers(id),
    seller_snapshot     JSONB NOT NULL,  -- snapshot of company at invoice time
    subtotal            NUMERIC(15, 2) NOT NULL DEFAULT 0,
    vat_amount          NUMERIC(15, 2) NOT NULL DEFAULT 0,
    discount            NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total               NUMERIC(15, 2) NOT NULL DEFAULT 0,
    notes               TEXT,
    payment_method      TEXT,
    reference_doc_number TEXT,
    -- RD submission tracking
    rd_submission_status rd_submission_status,
    rd_doc_id           TEXT,
    rd_submitted_at     TIMESTAMPTZ,
    rd_response_xml     TEXT,
    -- Storage
    pdf_url             TEXT,
    xml_url             TEXT,
    created_by          TEXT NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, invoice_number)
);
CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_company_status ON invoices(company_id, status);
CREATE INDEX idx_invoices_company_date ON invoices(company_id, invoice_date);
CREATE INDEX idx_invoices_rd_status ON invoices(rd_submission_status) WHERE rd_submission_status IS NOT NULL;

-- Invoice Items (bilingual: name_th / name_en)
CREATE TABLE invoice_items (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    invoice_id      TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id      TEXT REFERENCES products(id),
    name_th         TEXT NOT NULL,
    name_en         TEXT,
    description_th  TEXT,
    description_en  TEXT,
    quantity        NUMERIC(15, 4) NOT NULL,
    unit            TEXT NOT NULL,
    unit_price      NUMERIC(15, 4) NOT NULL,
    discount        NUMERIC(5, 2) NOT NULL DEFAULT 0,
    vat_type        vat_type NOT NULL DEFAULT 'vat7',
    amount          NUMERIC(15, 2) NOT NULL,
    vat_amount      NUMERIC(15, 2) NOT NULL,
    total_amount    NUMERIC(15, 2) NOT NULL
);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

-- Audit Logs (immutable - no UPDATE/DELETE)
CREATE TABLE audit_logs (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id    TEXT NOT NULL,
    user_id       TEXT NOT NULL REFERENCES users(id),
    action        TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id   TEXT NOT NULL,
    details       JSONB NOT NULL DEFAULT '{}',
    ip_address    TEXT NOT NULL,
    user_agent    TEXT NOT NULL,
    language      TEXT NOT NULL DEFAULT 'th',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_company ON audit_logs(company_id);
CREATE INDEX idx_audit_company_date ON audit_logs(company_id, created_at);
CREATE INDEX idx_audit_resource ON audit_logs(company_id, resource_type, resource_id);

-- Document Templates (bilingual HTML)
CREATE TABLE document_templates (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,     -- 'tax_invoice', 'receipt', etc.
    language    TEXT NOT NULL,     -- 'th', 'en', 'both'
    name        TEXT NOT NULL,
    html_th     TEXT NOT NULL,
    html_en     TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, type, language)
);

-- Row-level security: ensure each company can only see its own data
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Prevent deletion of audit logs (immutable)
CREATE RULE no_delete_audit_logs AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE no_update_audit_logs AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;

-- Trigger: auto update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_templates_updated_at BEFORE UPDATE ON document_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
