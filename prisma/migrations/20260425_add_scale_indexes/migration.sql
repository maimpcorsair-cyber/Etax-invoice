-- Migration: add_scale_indexes
-- Created: 2026-04-25
-- Purpose: Add missing indexes identified during scale audit for 1,000+ user workloads.
-- All indexes are CONCURRENTLY to avoid table locks in production.
-- Run each statement individually; CONCURRENTLY cannot run inside a transaction block.

-- ============================================================
-- invoices
-- ============================================================

-- Compound: dashboard "issued invoices in date range" query.
-- Covers companyId + status + invoiceDate in a single b-tree scan,
-- avoiding a secondary filter on the existing (companyId, status) index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "invoices_companyId_status_invoiceDate_idx"
    ON invoices ("companyId", status, "invoiceDate");

-- RD submission queue polls pending/in_progress/retrying records per company.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "invoices_companyId_rdSubmissionStatus_idx"
    ON invoices ("companyId", "rdSubmissionStatus");

-- FK: buyerId → customers(id). Postgres does not auto-index FK columns.
-- Without this, every Customer → Invoice join does a sequential scan on invoices.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "invoices_buyerId_idx"
    ON invoices ("buyerId");

-- FK: createdBy → users(id).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "invoices_createdBy_idx"
    ON invoices ("createdBy");

-- FK: referenceInvoiceId → invoices(id) (self-referential).
-- Used when fetching credit/debit notes and receipts linked to a parent invoice.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "invoices_referenceInvoiceId_idx"
    ON invoices ("referenceInvoiceId");

-- ============================================================
-- customers
-- ============================================================

-- Customer list page always adds isActive = true filter within a company.
-- The existing (companyId) index cannot satisfy both predicates efficiently at scale.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customers_companyId_isActive_idx"
    ON customers ("companyId", "isActive");

-- Note: taxId search is covered by the existing unique index on
-- (companyId, taxId, branchCode) — prefix queries on (companyId, taxId) use it.

-- ============================================================
-- audit_logs
-- ============================================================

-- "Show all actions by this user within this company" — compound covers both filters.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_companyId_userId_idx"
    ON audit_logs ("companyId", "userId");

-- "Show all actions by this user ordered by time" — userId + createdAt enables
-- efficient ORDER BY without a sort on the full audit_logs table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_userId_createdAt_idx"
    ON audit_logs ("userId", "createdAt");

-- ============================================================
-- users
-- ============================================================

-- User management page: list active users per company.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_companyId_isActive_idx"
    ON users ("companyId", "isActive");

-- Role-based filtering within a tenant (e.g., assign work to accountants only).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_companyId_role_idx"
    ON users ("companyId", role);

-- ============================================================
-- payments
-- ============================================================
-- Note: Payment has no companyId column. Cross-company payment queries must
-- join through invoices using the existing invoices_companyId_idx.
-- The existing payments_invoiceId_idx is the correct and sufficient access path.
-- No additional indexes needed here.
