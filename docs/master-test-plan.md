# Billboy e-Tax Invoice — Master Test Plan

**Version:** 1.0  
**Date:** 2026-05-06  
**Scope:** Full-stack e-Tax Invoice application (ETDA ขมธอ. 3-2560 compliant)  
**Stack:** React 18 + Vite 5 / Node 20 + Express 4 / PostgreSQL 16 + Prisma 5 / Redis + BullMQ

---

## 1. User Roles & Permission Matrices

### 1.1 Roles

| Role | Description |
|------|-------------|
| `super_admin` | Owner Control Plane — manages all tenant companies, billing, coupons, renewals. Has special bypass of tenant RLS for cross-tenant operations. |
| `admin` | Full tenant access — can issue invoices, manage users, certificates, RD config, billing portal |
| `accountant` | Operational role — create/issue invoices, WHT certificates, submit to RD, expenses |
| `viewer` | Read-only — can view invoices, dashboard, reports. Cannot create or modify. |

### 1.2 Permission Matrix by Role

| Feature | super_admin | admin | accountant | viewer |
|---------|-------------|-------|------------|--------|
| Create invoice (draft) | ✅ (tenant) | ✅ | ✅ | ❌ |
| Issue / finalize invoice | ✅ (tenant) | ✅ | ✅ | ❌ |
| Cancel invoice | ✅ (tenant) | ✅ | ✅ | ❌ |
| Submit to RD | ✅ (tenant) | ✅ | ✅ | ❌ |
| Issue receipt from tax invoice | ✅ (tenant) | ✅ | ✅ | ❌ |
| Create WHT certificate | ✅ (tenant) | ✅ | ✅ | ❌ |
| Manage customers/products | ✅ (tenant) | ✅ | ✅ | ❌ |
| Manage users | ✅ (tenant) | ✅ | ❌ | ❌ |
| Upload certificate | ✅ (tenant) | ✅ | ❌ | ❌ |
| Configure RD credentials | ✅ (tenant) | ✅ | ❌ | ❌ |
| Custom templates | ✅ (tenant) | ✅ | ❌ | ❌ |
| View audit logs | ✅ (tenant) | ✅ | ❌ | ❌ |
| Export Excel | ✅ (tenant) | ✅ | ❌ | ❌ |
| Export Google Sheets | ✅ (tenant) | ✅ | ❌ | ❌ |
| Send invoice email | ✅ (tenant) | ✅ | ✅ | ❌ |
| Billing portal | ✅ (tenant) | ✅ | ❌ | ❌ |
| LINE OA settings | ✅ (tenant) | ✅ | ❌ | ❌ |
| Expense vouchers (create) | ✅ (tenant) | ✅ | ✅ | ❌ |
| Expense vouchers (approve/reject) | ✅ (tenant) | ✅ | ❌ | ❌ |
| Owner Control Plane (all tenants) | ✅ | ❌ | ❌ | ❌ |
| Delete invoice | ✅ (tenant) | ✅ | ❌ | ❌ |
| Delete customer/product | ✅ (tenant) | ✅ | ❌ | ❌ |

### 1.3 Permission Matrix by Billing Plan

| Feature | Free | Starter | Business | Enterprise |
|---------|------|---------|----------|------------|
| Create invoice | ✅ (20/month) | ✅ (150/month) | ✅ (800/month) | ✅ (unlimited) |
| Submit to RD | ❌ | ✅ | ✅ | ✅ |
| Manage certificate | ❌ | ✅ | ✅ | ✅ |
| RD config | ❌ | ✅ | ✅ | ✅ |
| Custom templates | ❌ | ❌ | ✅ | ✅ |
| Audit logs | ❌ | ❌ | ✅ | ✅ |
| Export Excel | ❌ | ✅ | ✅ | ✅ |
| Google Sheets | ❌ | ❌ | ✅ | ✅ |
| Invite users | ❌ (1 user) | ✅ (3 users) | ✅ (8 users) | ✅ (unlimited) |
| Send invoice email | ❌ | ✅ | ✅ | ✅ |
| Billing portal | ❌ | ✅ | ✅ | ✅ |
| LINE OA | ❌ | ✅ | ✅ | ✅ |
| Max customers | 50 | 500 | 5,000 | unlimited |
| Max products | 50 | 500 | 5,000 | unlimited |

---

## 2. Document Type Reference

| Code | Type | Thai Name | Auto-Submit to RD | Notes |
|------|------|-----------|-------------------|-------|
| T01 | `tax_invoice_receipt` | ใบกำกับภาษี + ใบเสร็จ (ขายสด) | ✅ on create | VAT accrues at payment |
| T02 | `tax_invoice` | ใบกำกับภาษี (ขายเชื่อ) | ✅ on create | VAT accrues at delivery ม.78(1) |
| T03 | `receipt` | ใบเสร็จรับเงิน | ✅ on issue | Issues from existing T02 |
| T04 | `credit_note` | ใบลดหนี้ | ❌ manual | Requires approval |
| T05 | `debit_note` | ใบเพิ่มหนี้ | ❌ manual | Requires approval |

---

## 3. Test Execution Order

Tests are ordered to maximize coverage with minimum effort by leveraging prerequisites and shared fixtures.

### Phase 1: Foundation (run first — no dependencies)
| Order | Test Group | Why First |
|-------|-----------|-----------|
| 1.1 | Auth: login (Google OAuth + email/password) | All tests depend on valid auth |
| 1.2 | Auth: JWT validation + expiry | Security baseline |
| 1.3 | Tenant isolation: RLS boundary (Company A cannot see Company B) | Critical security — if this fails, everything else is compromised |
| 1.4 | Role assignment: viewer cannot access admin routes | Permission baseline |

### Phase 2: Core Data (shared fixtures for later tests)
| Order | Test Group |
|-------|-----------|
| 2.1 | Customer CRUD + soft-delete |
| 2.2 | Product CRUD + soft-delete |
| 2.3 | Invoice number generation (sequential + advisory lock) |

### Phase 3: Invoice Lifecycle
| Order | Test Group |
|-------|-----------|
| 3.1 | Invoice create → draft (T01, T02, T03, T04, T05) |
| 3.2 | Invoice issue (draft → approved + real invoice number) |
| 3.3 | Invoice update (draft only — not after issue) |
| 3.4 | Invoice auto-submit to RD (T01, T02) |
| 3.5 | Invoice manual submit to RD (T03, T04, T05) |
| 3.6 | RD submission pipeline: XML → XAdES-BES → TSA → RD API |
| 3.7 | RD retry logic (mock failure + retry) |
| 3.8 | Invoice cancel: draft → cancelled (no RD call) |
| 3.9 | Invoice cancel: submitted → RD cancel API called + local cancel |
| 3.10 | Invoice cancel: failed submission → local cancel only |
| 3.11 | Issue receipt from T02 → T03 auto-created, T02 marked paid |
| 3.12 | Draft auto-save + recovery |
| 3.13 | Partial payments + payment tracking |

### Phase 4: WHT Certificates
| Order | Test Group |
|-------|-----------|
| 4.1 | WHT certificate create (from invoice + standalone) |
| 4.2 | WHT calculation: 1%, 3%, 5% rates |
| 4.3 | WHT certificate → invoice link (bidirectional) |
| 4.4 | WHT certificate update (rate, amount) |
| 4.5 | WHT certificate PDF download |
| 4.6 | PP.30 WHT summary aggregation |

### Phase 5: PP.30 & VAT
| Order | Test Group |
|-------|-----------|
| 5.1 | PP.30 calculation: output VAT = output - input VAT |
| 5.2 | PP.30: vatExempt and vatZero correctly excluded from VAT |
| 5.3 | PP.30: T04/T05 (credit/debit) excluded from PP.30 sales |
| 5.4 | PP.30 CSV export |
| 5.5 | PP.30 Google Sheets export |
| 5.6 | VAT summary by type (vat7/vatExempt/vatZero) |

### Phase 6: Purchase Invoices & Expenses
| Order | Test Group |
|-------|-----------|
| 6.1 | Purchase invoice create + VAT deduction |
| 6.2 | Purchase invoice: duplicate detection (companyId + taxId + invoiceNumber) |
| 6.3 | Expense voucher: draft → submitted → approved/rejected |
| 6.4 | Expense approval deducts petty cash balance |
| 6.5 | Expense limit enforcement |
| 6.6 | WHT on expense items (1%, 3%, 5%) |

### Phase 7: LINE OA Integration
| Order | Test Group |
|-------|-----------|
| 7.1 | LINE webhook: OTP link flow |
| 7.2 | LINE: OCR supplier invoice → create purchase invoice |
| 7.3 | LINE: OCR bank transfer → match to outstanding invoice |
| 7.4 | LINE: document confirmation flex card |
| 7.5 | LINE: overdue invoice notification |
| 7.6 | LINE: invoice lookup by number → Flex Card with PDF button |
| 7.7 | LINE: VAT summary command |
| 7.8 | LINE: Redis session persistence across messages |

### Phase 8: Billing & Subscriptions
| Order | Test Group |
|-------|-----------|
| 8.1 | Free signup (email/password + Google OAuth) |
| 8.2 | Paid signup: Stripe Checkout (starter + business) |
| 8.3 | Paid signup: Stripe PromptPay QR |
| 8.4 | Paid signup: PromptPay QR standalone |
| 8.5 | Coupon: percent discount + fixed discount |
| 8.6 | Coupon: redemption limit enforcement |
| 8.7 | Stripe webhook: checkout.session.completed → provision |
| 8.8 | Stripe webhook: invoice.payment_failed → past_due |
| 8.9 | Billing portal session creation |
| 8.10 | Renewal: create checkout session |
| 8.11 | Plan upgrade/downgrade enforcement (feature gates) |
| 8.12 | Document limit enforcement (20/150/800 per month) |
| 8.13 | User limit enforcement (1/3/8) |

### Phase 9: Dashboard & Reporting
| Order | Test Group |
|-------|-----------|
| 9.1 | Dashboard: revenue, invoice counts by status |
| 9.2 | Dashboard: outstanding receivables aging |
| 9.3 | Customer statement generation |
| 9.4 | Invoice Excel export |
| 9.5 | Invoice Google Sheets export |

### Phase 10: Owner Control Plane (super_admin only)
| Order | Test Group |
|-------|-----------|
| 10.1 | Owner: view all tenant transactions |
| 10.2 | Owner: export transactions CSV |
| 10.3 | Owner: create/update/delete coupons |
| 10.4 | Owner: mark PromptPay transaction as paid |
| 10.5 | Owner: send renewal reminder email |
| 10.6 | Owner: create renewal checkout session |
| 10.7 | Non-super_admin: cannot access owner routes (403) |

### Phase 11: Edge Cases & Blind Spots
| Order | Test Group |
|-------|-----------|
| 11.1 | Invoice with 0% VAT (vatZero) — correctly excluded from PP.30 VAT calc |
| 11.2 | Invoice with exempt VAT (vatExempt) — correctly excluded from PP.30 VAT calc |
| 11.3 | Invoice with mixed VAT items (vat7 + vatZero + vatExempt) |
| 11.4 | Discount at invoice level (not per-item) |
| 11.5 | WHT on invoice: whtAmount stored on invoice, certificate linked |
| 11.6 | Invoice reference chain: T04 → T02, T05 → T02 |
| 11.7 | Advisory lock contention: concurrent invoice number generation |
| 11.8 | RD submission: certificate expiry detection |
| 11.9 | RD submission: TSA failure fallback (mock TSA) |
| 11.10 | Document limit at month boundary (correct getMonthStart() usage) |
| 11.11 | Storage quota: 500MB limit enforcement |
| 11.12 | LINE: duplicate webhook event deduplication |
| 11.13 | LINE: OCR confidence levels (high/medium/low) routing |
| 11.14 | Credit note on cancelled invoice → rejection |
| 11.15 | Submit RD on already-submitted invoice → rejection |

---

## 4. Detailed Test Cases

### 4.1 Authentication & Authorization

#### TC-AUTH-001: Email/password login
- **Test ID:** TC-AUTH-001
- **Description:** User logs in with email + password
- **Role:** Any
- **Plan:** Any
- **Steps:**
  1. POST /api/auth/login with valid credentials
  2. Receive JWT token
  3. Use token to access /api/invoices
- **Expected:** 200, returns token + user object with companyId
- **Priority:** P0
- **Automated:** ✅ (integration test)

#### TC-AUTH-002: Google OAuth login
- **Test ID:** TC-AUTH-002
- **Description:** User logs in with Google ID token
- **Role:** Any
- **Plan:** Any
- **Steps:**
  1. POST /api/auth/google with Google credential
  2. Receive JWT token (new user created if first time)
- **Expected:** 200, token returned, user created in DB
- **Priority:** P0
- **Automated:** ✅ (integration test)

#### TC-AUTH-003: Invalid credentials rejected
- **Test ID:** TC-AUTH-003
- **Description:** Wrong password returns 401
- **Role:** Any
- **Plan:** Any
- **Steps:** POST /api/auth/login with wrong password
- **Expected:** 401 Unauthorized
- **Priority:** P0
- **Automated:** ✅

#### TC-AUTH-004: JWT expired token rejected
- **Test ID:** TC-AUTH-004
- **Description:** Requests with expired JWT return 401
- **Role:** Any
- **Plan:** Any
- **Steps:** Use token with past expiry, call /api/invoices
- **Expected:** 401
- **Priority:** P1
- **Automated:** ✅

#### TC-AUTH-005: Viewer plan-gated on invoice creation; role-gated on sensitive operations
- **Test ID:** TC-AUTH-005
- **Description:** Invoice creation is gated by billing plan, not role. Sensitive write operations (issue, cancel, delete) use role guards.
- **Role:** viewer (any plan)
- **Plan:** Any — Free viewers CANNOT create invoices (plan limit), Business+ viewers CAN
- **Steps:**
  1. Authenticate as viewer on Free plan → POST /api/invoices → expect 403 (plan limit)
  2. Authenticate as viewer on Business plan → POST /api/invoices → expect 201 (plan allows)
  3. Viewer on any plan → POST /:id/issue → expect 403 (requireRole guard)
  4. Viewer on any plan → DELETE /:id → expect 403 (requireRole guard)
- **Expected:** Mixed — 403 for operations requiring roles; creation depends on plan
- **Priority:** P0
- **Automated:** ✅

#### TC-AUTH-006: super_admin owner routes denied to admin
- **Test ID:** TC-AUTH-006
- **Description:** Admin cannot access /api/billing/owner/* routes
- **Role:** admin
- **Plan:** Any
- **Steps:** GET /api/billing/owner/summary with admin token
- **Expected:** 403
- **Priority:** P0
- **Automated:** ✅

---

### 4.2 Multi-Tenancy & RLS

#### TC-RLS-001: Company A cannot read Company B's invoices
- **Test ID:** TC-RLS-001
- **Description:** Cross-tenant invoice access denied
- **Role:** admin (both companies)
- **Plan:** Any paid
- **Steps:**
  1. Company A admin creates invoice Inv-A
  2. Company B admin calls GET /api/invoices/Inv-A
- **Expected:** 404 (not 403, to avoid leaking existence)
- **Priority:** P0
- **Automated:** ✅ (tenant-isolation.integration.test.ts)

#### TC-RLS-002: Company A cannot create payments on Company B's invoices
- **Test ID:** TC-RLS-002
- **Description:** Cross-tenant payment creation blocked
- **Role:** admin (Company B)
- **Plan:** Any paid
- **Steps:** POST /api/invoices/Inv-A/payments from Company B
- **Expected:** 404
- **Priority:** P0
- **Automated:** ✅

#### TC-RLS-003: Company A cannot update Company B's customers
- **Test ID:** TC-RLS-003
- **Description:** Cross-tenant customer mutation blocked
- **Role:** admin (Company B)
- **Plan:** Any
- **Steps:** PUT /api/customers/Customer-A with Company B token
- **Expected:** 404
- **Priority:** P0
- **Automated:** ✅

#### TC-RLS-004: RLS bypass for super_admin owner operations
- **Test ID:** TC-RLS-004
- **Description:** super_admin can view all tenants' transactions in owner plane
- **Role:** super_admin
- **Plan:** N/A (platform admin)
- **Steps:** GET /api/billing/owner/summary
- **Expected:** 200, returns all tenant transactions
- **Priority:** P0
- **Automated:** ✅

#### TC-RLS-005: Audit logs scoped to company
- **Test ID:** TC-RLS-005
- **Description:** Company A's audit logs don't contain Company B's actions
- **Role:** admin
- **Plan:** Any
- **Steps:** Audit logs filtered by req.user.companyId from JWT
- **Expected:** Company A admin only sees Company A audit entries
- **Priority:** P1
- **Automated:** Manual (requires inspecting audit log data)

---

### 4.3 Invoice Lifecycle

#### TC-INV-001: Create T01 (tax_invoice_receipt) — auto-submit RD
- **Test ID:** TC-INV-001
- **Description:** T01 created → auto-approved → RD queue triggered
- **Role:** accountant
- **Plan:** starter+
- **Steps:**
  1. POST /api/invoices with type=tax_invoice_receipt, isDraft=false
  2. Invoice status becomes approved, rdSubmissionStatus = pending
  3. Wait for RD worker to complete
- **Expected:** status=submitted, rdSubmissionStatus=success, rdDocId populated
- **Priority:** P0
- **Automated:** ✅ (invoices.integration.test.ts)

#### TC-INV-002: Create T02 (tax_invoice) — auto-submit RD
- **Test ID:** TC-INV-002
- **Description:** T02 created → auto-approved → RD queue triggered
- **Role:** accountant
- **Plan:** starter+
- **Steps:** Same as TC-INV-001 with type=tax_invoice
- **Expected:** Same as TC-INV-001
- **Priority:** P0
- **Automated:** ✅

#### TC-INV-003: Create T04 (credit_note) — NOT auto-submit
- **Test ID:** TC-INV-003
- **Description:** T04 created as draft, no auto-RD submission
- **Role:** accountant
- **Plan:** starter+
- **Steps:** POST /api/invoices with type=credit_note
- **Expected:** status=draft, rdSubmissionStatus=null (no queue)
- **Priority:** P1
- **Automated:** ✅

#### TC-INV-004: Issue draft invoice → real invoice number assigned
- **Test ID:** TC-INV-004
- **Description:** Draft invoice with DRAFT-YYYYMM-NNNNNN number → real sequential number
- **Role:** admin
- **Plan:** starter+
- **Steps:**
  1. Create draft: POST /api/invoices with asDraft=true
  2. Issue: POST /api/invoices/:id/issue
- **Expected:** Invoice number changes from DRAFT-* to INV-YYYY-NNNNN, status=approved
- **Priority:** P0
- **Automated:** ✅

#### TC-INV-005: Cannot edit issued/submitted invoice
- **Test ID:** TC-INV-005
- **Description:** PATCH /api/invoices/:id rejected after issue
- **Role:** accountant
- **Plan:** starter+
- **Steps:** PATCH /api/invoices/:id where status=submitted
- **Expected:** 400 "Submitted invoices cannot be edited"
- **Priority:** P0
- **Automated:** ✅

#### TC-INV-006: Draft auto-save + recovery
- **Test ID:** TC-INV-006
- **Description:** Draft invoice saved with asDraft=true, recoverable
- **Role:** accountant
- **Plan:** starter+
- **Steps:**
  1. Create draft: POST /api/invoices with asDraft=true
  2. GET /api/invoices/:id — draft number DRAFT-* returned
  3. Issue draft: POST /api/invoices/:id/issue
- **Expected:** Draft recoverable, sequential number assigned on issue
- **Priority:** P0
- **Automated:** ✅ (manual verification of form state persistence)

#### TC-INV-007: Cancel draft invoice (no RD call)
- **Test ID:** TC-INV-007
- **Description:** POST /api/invoices/:id/cancel on draft → local cancel only
- **Role:** admin
- **Plan:** starter+
- **Steps:** POST /api/invoices/:id/cancel (draft invoice)
- **Expected:** status=cancelled, rdSubmissionStatus unchanged, no RD API call
- **Priority:** P0
- **Automated:** ✅

#### TC-INV-008: Cancel submitted invoice → RD cancel API called
- **Test ID:** TC-INV-008
- **Description:** POST /api/invoices/:id/cancel on submitted → cancelDocumentRD called
- **Role:** admin
- **Plan:** starter+
- **Steps:** POST /api/invoices/:id/cancel (submitted invoice, rdSubmissionStatus=success)
- **Expected:** RD cancel API called, status=cancelled, rdSubmissionStatus unchanged (success)
- **Priority:** P0
- **Automated:** ✅ (manual — requires mocking RD API)

#### TC-INV-009: Cancel failed-submission invoice → local cancel only
- **Test ID:** TC-INV-009
- **Description:** POST /api/invoices/:id/cancel where rdSubmissionStatus=failed → no RD call
- **Role:** admin
- **Plan:** starter+
- **Steps:** POST /api/invoices/:id/cancel (rdSubmissionStatus=failed)
- **Expected:** status=cancelled, rdSubmissionStatus=failed, no RD API call
- **Priority:** P1
- **Automated:** ✅

#### TC-INV-010: Issue receipt from T02
- **Test ID:** TC-INV-010
- **Description:** POST /api/invoices/:id/issue-receipt creates T03, marks T02 paid
- **Role:** accountant
- **Plan:** starter+
- **Steps:**
  1. Create T02 with isPaid=false
  2. POST /api/invoices/:id/issue-receipt
- **Expected:** T03 created (type=receipt, referenceInvoiceId=T02.id), T02.isPaid=true, T03 auto-submitted to RD
- **Priority:** P0
- **Automated:** ✅ (invoices.integration.test.ts)

#### TC-INV-011: Issue receipt on already-paid T02 → rejection
- **Test ID:** TC-INV-011
- **Description:** Cannot issue second receipt
- **Role:** accountant
- **Plan:** starter+
- **Steps:** POST /api/invoices/:id/issue-receipt on already-paid invoice
- **Expected:** 400 "Invoice already paid / receipt already issued"
- **Priority:** P1
- **Automated:** ✅

#### TC-INV-012: Invoice with discount (per-item + invoice-level)
- **Test ID:** TC-INV-012
- **Description:** VAT calculated on discounted amount
- **Role:** accountant
- **Plan:** starter+
- **Steps:** Create invoice with discount=10% on items and discount field at invoice level
- **Expected:** subtotal = sum(discounted amounts), vatAmount = subtotal * 0.07
- **Priority:** P1
- **Automated:** ✅

#### TC-INV-013: Invoice with vatZero items
- **Test ID:** TC-INV-013
- **Description:** vatZero items excluded from VAT calculation
- **Role:** accountant
- **Plan:** starter+
- **Steps:** Create invoice with mix of vat7 and vatZero items
- **Expected:** vatAmount = sum(vat7 items) * 0.07, vatZero items contribute 0 VAT
- **Priority:** P1
- **Automated:** ✅

#### TC-INV-014: Invoice with vatExempt items
- **Test ID:** TC-INV-014
- **Description:** vatExempt items correctly shown but no VAT
- **Role:** accountant
- **Plan:** starter+
- **Steps:** Create invoice with vatExempt items
- **Expected:** subtotal includes vatExempt, but vatAmount does NOT include vatExempt VAT
- **Priority:** P1
- **Automated:** ✅

#### TC-INV-015: Partial payment tracking
- **Test ID:** TC-INV-015
- **Description:** Multiple payments recorded, isPaid only true when total >= invoice.total
- **Role:** accountant
- **Plan:** starter+
- **Steps:**
  1. Create invoice total=10,000
  2. POST /api/invoices/:id/payments with amount=5,000
  3. Check isPaid=false, paidAmount=5,000
  4. POST second payment amount=5,000
  5. Check isPaid=true, paidAmount=10,000
- **Expected:** isPaid=true only after sum(payments) >= invoice.total
- **Priority:** P1
- **Automated:** ✅

#### TC-INV-016: Concurrent invoice number generation (advisory lock)
- **Test ID:** TC-INV-016
- **Description:** Two concurrent invoice creates → no duplicate numbers
- **Role:** accountant
- **Plan:** starter+
- **Steps:** Submit 2 invoice creation requests simultaneously for same company
- **Expected:** Both succeed with unique invoice numbers, no race condition
- **Priority:** P0
- **Automated:** ✅ (requires concurrent test runner)

#### TC-INV-017: Invoice list pagination
- **Test ID:** TC-INV-017
- **Description:** GET /api/invoices?page=2&limit=20 returns correct subset
- **Role:** viewer
- **Plan:** Any
- **Steps:** GET /api/invoices?page=2&limit=20
- **Expected:** 20 results, pagination metadata correct
- **Priority:** P2
- **Automated:** ✅

#### TC-INV-018: Invoice search by number and customer name
- **Test ID:** TC-INV-018
- **Description:** GET /api/invoices?search=INV-001
- **Role:** viewer
- **Plan:** Any
- **Steps:** GET /api/invoices?search=ABC+Co
- **Expected:** Returns invoices matching buyer name or invoice number
- **Priority:** P2
- **Automated:** ✅

---

### 4.4 RD Submission Pipeline

#### TC-RD-001: Full RD pipeline (mock) completes successfully
- **Test ID:** TC-RD-001
- **Description:** Invoice → XML → XAdES-BES sign → TSA → RD API (sandbox)
- **Role:** admin
- **Plan:** starter+
- **Steps:**
  1. Create T01/T02 invoice
  2. Poll / wait for rdSubmissionStatus = success
- **Expected:** rdDocId populated, status=submitted, rdSubmittedAt set
- **Priority:** P0
- **Automated:** ✅ (invoices.integration.test.ts)

#### TC-RD-002: RD retry on transient failure
- **Test ID:** TC-RD-002
- **Description:** BullMQ retry with exponential backoff on RD failure
- **Role:** admin
- **Plan:** starter+
- **Steps:** Mock RD API to fail first 2 attempts, succeed on 3rd
- **Expected:** Job succeeds after retry, rdSubmissionStatus=success
- **Priority:** P1
- **Automated:** ❌ (requires fault injection)

#### TC-RD-003: RD final failure after max retries → status=failed
- **Test ID:** TC-RD-003
- **Description:** After 5 failed attempts, job moves to failed state
- **Role:** admin
- **Plan:** starter+
- **Steps:** Mock RD API to always fail
- **Expected:** rdSubmissionStatus=failed, user notified
- **Priority:** P1
- **Automated:** ❌ (requires fault injection)

#### TC-RD-004: RD submission with expired certificate
- **Test ID:** TC-RD-004
- **Description:** Signing step fails gracefully if cert is expired
- **Role:** admin
- **Plan:** starter+
- **Steps:** Upload expired .p12, submit invoice to RD
- **Expected:** rdSubmissionStatus=failed, error message includes cert expiry
- **Priority:** P1
- **Automated:** ❌

#### TC-RD-005: Cannot re-submit already-submitted invoice
- **Test ID:** TC-RD-005
- **Description:** POST /api/invoices/:id/submit-rd on already-submitted invoice
- **Role:** admin
- **Plan:** starter+
- **Steps:** POST /api/invoices/:id/submit-rd where rdSubmissionStatus=success
- **Expected:** 400 "Invoice already submitted to RD"
- **Priority:** P1
- **Automated:** ✅

#### TC-RD-006: T04/T05 require manual submit (no auto-submit)
- **Test ID:** TC-RD-006
- **Description:** T04/T05 do not auto-submit to RD on create/issue
- **Role:** admin
- **Plan:** starter+
- **Steps:** Create T04 (credit_note), check rdSubmissionStatus
- **Expected:** rdSubmissionStatus=null, must call submit-rd manually
- **Priority:** P1
- **Automated:** ✅

#### TC-RD-007: Invoice cancellation → RD cancel API called (submitted invoice)
- **Test ID:** TC-RD-007
- **Description:** See TC-INV-008
- **Priority:** P0
- **Automated:** ✅

#### TC-RD-008: Signing test endpoint (admin self-check)
- **Test ID:** TC-RD-008
- **Description:** POST /api/admin/signing-test runs full pipeline without RD
- **Role:** admin
- **Plan:** starter+
- **Steps:** POST /api/admin/signing-test
- **Expected:** 200, steps: Load Cert → XAdES-BES → TSA → all ok
- **Priority:** P1
- **Automated:** ❌

---

### 4.5 WHT Certificates

#### TC-WHT-001: Create WHT certificate from invoice
- **Test ID:** TC-WHT-001
- **Description:** POST /api/invoices/:id/wht-certificate creates WHT cert linked to invoice
- **Role:** accountant
- **Plan:** starter+
- **Steps:**
  1. Create and issue invoice (total=10,000)
  2. POST /api/invoices/:id/wht-certificate with whtRate=3
- **Expected:** WHT cert created, whtAmount=300, netAmount=9,700, invoice.whtCertificateId set
- **Priority:** P0
- **Automated:** ✅

#### TC-WHT-002: WHT certificate standalone creation
- **Test ID:** TC-WHT-002
- **Description:** POST /api/wht-certificates (without invoiceId)
- **Role:** accountant
- **Plan:** starter+
- **Steps:** POST /api/wht-certificates with recipient data, no invoiceId
- **Expected:** WHT cert created with sequential number WHT-{taxId}-{YYYYMM}-{NNNN}
- **Priority:** P0
- **Automated:** ✅

#### TC-WHT-003: WHT calculation — all three rates
- **Test ID:** TC-WHT-003
- **Description:** 1%, 3%, 5% WHT rates calculated correctly
- **Role:** accountant
- **Plan:** starter+
- **Steps:** Create WHT certs at 1%, 3%, 5% on same base amount (10,000)
- **Expected:** whtAmount = 100, 300, 500 respectively; netAmount = 9,900, 9,700, 9,500
- **Priority:** P0
- **Automated:** ✅

#### TC-WHT-004: WHT certificate number format
- **Test ID:** TC-WHT-004
- **Description:** Certificate numbers follow WHT-{TAXID}-{YYYYMM}-{NNNN} format
- **Role:** accountant
- **Plan:** starter+
- **Steps:** Create 3 WHT certs in same month
- **Expected:** WHT-0105555123456-202605-0001, -0002, -0003
- **Priority:** P1
- **Automated:** ✅

#### TC-WHT-005: Cannot create WHT cert on draft invoice
- **Test ID:** TC-WHT-005
- **Description:** POST /api/invoices/:id/wht-certificate on draft invoice
- **Role:** accountant
- **Plan:** starter+
- **Steps:** POST /api/invoices/:id/wht-certificate (draft invoice)
- **Expected:** 400 "Cannot create WHT certificate for a draft invoice"
- **Priority:** P1
- **Automated:** ✅

#### TC-WHT-006: Cannot create duplicate WHT cert on invoice
- **Test ID:** TC-WHT-006
- **Description:** Invoice already has whtCertificateId → rejection
- **Role:** accountant
- **Plan:** starter+
- **Steps:** POST /api/invoices/:id/wht-certificate on invoice that already has WHT cert
- **Expected:** 409 "Invoice already has a WHT certificate"
- **Priority:** P1
- **Automated:** ✅

#### TC-WHT-007: WHT PDF download
- **Test ID:** TC-WHT-007
- **Description:** GET /api/wht-certificates/:id/pdf
- **Role:** viewer
- **Plan:** starter+
- **Steps:** GET /api/wht-certificates/:id/pdf
- **Expected:** PDF file returned (Content-Type: application/pdf)
- **Priority:** P1
- **Automated:** ❌

#### TC-WHT-008: WHT PP.30 aggregation
- **Test ID:** TC-WHT-008
- **Description:** GET /api/pp30/wht aggregates WHT certs by rate for period
- **Role:** viewer
- **Plan:** starter+
- **Steps:** Create WHT certs at 1%, 3%, 5%, GET /api/pp30/wht?year=2026&month=5
- **Expected:** byRate breakdown correct, totalCertificates, totalWithheld, totalAmount correct
- **Priority:** P0
- **Automated:** ✅

#### TC-WHT-009: WHT income types (ม.40(1), ม.40(2), ม.40(4))
- **Test ID:** TC-WHT-009
- **Description:** WHT certs correctly tagged with incomeType
- **Role:** accountant
- **Plan:** starter+
- **Steps:** Create WHT certs with incomeType 1, 2, 4
- **Expected:** Each certificate stores correct incomeType, PP.30 WHT summary groups by type
- **Priority:** P2
- **Automated:** ✅

#### TC-WHT-010: WHT cert update recalculates amounts
- **Test ID:** TC-WHT-010
- **Description:** PATCH /api/wht-certificates/:id changes whtRate → whtAmount/netAmount updated
- **Role:** accountant
- **Plan:** starter+
- **Steps:**
  1. Create cert at 3% (whtAmount=300)
  2. PATCH to whtRate=1
- **Expected:** whtAmount=100, netAmount=9,900
- **Priority:** P1
- **Automated:** ✅

#### TC-WHT-011: WHT cert deletion unlinks from invoice
- **Test ID:** TC-WHT-011
- **Description:** DELETE /api/wht-certificates/:id → invoice.whtCertificateId=null
- **Role:** admin
- **Plan:** starter+
- **Steps:** DELETE /api/wht-certificates/:id where cert.invoiceId is set
- **Expected:** Certificate deleted, invoice.whtCertificateId=null, invoice.whtAmount=0, invoice.whtRate=null
- **Priority:** P1
- **Automated:** ✅

---

### 4.6 PP.30 & VAT Reporting

#### TC-PP30-001: Basic PP.30 calculation
- **Test ID:** TC-PP30-001
- **Description:** PP.30 output - input VAT calculation
- **Role:** viewer
- **Plan:** starter+
- **Steps:**
  1. Create sales invoices with vat7 items totaling 100,000 + 7,000 VAT
  2. Create purchase invoices with vat7 items totaling 50,000 + 3,500 VAT
  3. GET /api/pp30?year=2026&month=5
- **Expected:** outputVat=7,000, inputVat=3,500, vatPayable=3,500
- **Priority:** P0
- **Automated:** ✅

#### TC-PP30-002: vatExempt excluded from PP.30 VAT calculation
- **Test ID:** TC-PP30-002
- **Description:** vatExempt sales not included in output VAT
- **Role:** viewer
- **Plan:** starter+
- **Steps:** Create invoice with vatExempt items totaling 50,000
- **Expected:** sales.totalExclVat includes 50,000, but outputVat=0 from exempt items
- **Priority:** P0
- **Automated:** ✅

#### TC-PP30-003: vatZero excluded from PP.30 VAT calculation
- **Test ID:** TC-PP30-003
- **Description:** vatZero sales not included in output VAT
- **Role:** viewer
- **Plan:** starter+
- **Steps:** Create invoice with vatZero items totaling 20,000
- **Expected:** sales.totalExclVat includes 20,000, but outputVat=0 from zero-rated items
- **Priority:** P0
- **Automated:** ✅

#### TC-PP30-004: Credit note (T04) excluded from PP.30 sales
- **Test ID:** TC-PP30-004
- **Description:** T04 has status cancelled → not counted in PP.30
- **Role:** viewer
- **Plan:** starter+
- **Steps:** Create and cancel T04 credit note (subtracted from sales)
- **Expected:** T04 not included in PP.30 output VAT calculation (cancelled docs excluded)
- **Priority:** P1
- **Automated:** ✅

#### TC-PP30-005: PP.30 CSV export
- **Test ID:** TC-PP30-005
- **Description:** GET /api/pp30/export returns CSV
- **Role:** viewer (starter+)
- **Plan:** starter+
- **Steps:** GET /api/pp30/export?year=2026&month=5
- **Expected:** CSV file with correct data, Content-Disposition header set
- **Priority:** P2
- **Automated:** ✅

#### TC-PP30-006: PP.30 Google Sheets export (business+)
- **Test ID:** TC-PP30-006
- **Description:** POST /api/pp30/export/sheets → URL returned
- **Role:** viewer
- **Plan:** business+
- **Steps:** POST /api/pp30/export/sheets with year/month
- **Expected:** 403 for starter plan, 200 with sheets URL for business+
- **Priority:** P1
- **Automated:** ❌

#### TC-PP30-007: PP.30 with mixed VAT types in single invoice
- **Test ID:** TC-PP30-007
- **Description:** Invoice with items of different vatTypes
- **Role:** viewer
- **Plan:** starter+
- **Steps:** Create invoice with 3 items: vat7(1,000), vatZero(500), vatExempt(300)
- **Expected:** byVatType correctly separated, totalExclVat = 1,800, outputVat = 70
- **Priority:** P1
- **Automated:** ✅

#### TC-PP30-008: PP.30 at month boundary
- **Test ID:** TC-PP30-008
- **Description:** Invoices dated in previous month not included
- **Role:** viewer
- **Plan:** starter+
- **Steps:** Create invoice dated April 30, query May PP.30
- **Expected:** April invoice not included in May PP.30
- **Priority:** P1
- **Automated:** ✅

---

### 4.7 Billing & Subscriptions

#### TC-BILL-001: Free signup — email/password
- **Test ID:** TC-BILL-001
- **Description:** POST /api/billing/free-signup creates company + user
- **Role:** N/A
- **Plan:** N/A
- **Steps:**
  1. POST /api/billing/free-signup with company data
  2. Login with created credentials
- **Expected:** Company + user created, plan=free, user can create up to 20 invoices/month
- **Priority:** P0
- **Automated:** ✅

#### TC-BILL-002: Free signup — Google OAuth
- **Test ID:** TC-BILL-002
- **Description:** POST /api/billing/free-signup with googleCredential
- **Role:** N/A
- **Plan:** N/A
- **Steps:** POST /api/billing/free-signup with googleCredential
- **Expected:** User created with googleSub set, JWT returned immediately
- **Priority:** P0
- **Automated:** ✅

#### TC-BILL-003: Paid signup — Stripe Checkout (starter)
- **Test ID:** TC-BILL-003
- **Description:** POST /api/billing/checkout-session → Stripe redirect
- **Role:** N/A
- **Plan:** N/A
- **Steps:** POST /api/billing/checkout-session with plan=starter, paymentMethod=stripe
- **Expected:** 201 with session.url (Stripe-hosted page), pendingSignup created
- **Priority:** P0
- **Automated:** ✅

#### TC-BILL-004: Stripe PromptPay QR signup
- **Test ID:** TC-BILL-004
- **Description:** POST /api/billing/checkout-session with paymentMethod=stripe_promptpay
- **Role:** N/A
- **Plan:** N/A
- **Steps:** POST /api/billing/checkout-session with plan=starter, paymentMethod=stripe_promptpay
- **Expected:** 201, Stripe session with promptpay payment method
- **Priority:** P1
- **Automated:** ✅

#### TC-BILL-005: Stripe webhook — checkout.session.completed → provision
- **Test ID:** TC-BILL-005
- **Description:** Full signup lifecycle via Stripe webhook
- **Role:** N/A
- **Plan:** N/A
- **Steps:**
  1. Create Stripe Checkout session
  2. Simulate stripe.webhooks.constructEvent with checkout.session.completed
  3. POST to /api/billing/stripe/webhook
- **Expected:** PendingSignup status=activated, company+subscription created, user role=admin
- **Priority:** P0
- **Automated:** ✅

#### TC-BILL-006: Stripe webhook — invoice.payment_failed → past_due
- **Test ID:** TC-BILL-006
- **Description:** Failed payment → subscription status=past_due
- **Role:** N/A
- **Plan:** N/A
- **Steps:** POST webhook with invoice.payment_failed event
- **Expected:** subscription.status = past_due, billing_transaction.status = payment_failed
- **Priority:** P1
- **Automated:** ✅

#### TC-BILL-007: Document limit enforcement — free plan
- **Test ID:** TC-BILL-007
- **Description:** Free plan limited to 20 documents/month
- **Role:** admin
- **Plan:** free
- **Steps:**
  1. Create 20 invoices (all succeed)
  2. Attempt to create invoice #21
- **Expected:** 21st creation returns 403 with "monthly document limit" message
- **Priority:** P0
- **Automated:** ✅

#### TC-BILL-008: User limit enforcement — starter plan (3 users)
- **Test ID:** TC-BILL-008
- **Description:** Starter plan limited to 3 users
- **Role:** admin
- **Plan:** starter
- **Steps:**
  1. Create 3 users (admin + 2 accountants)
  2. Attempt to create 4th user
- **Expected:** 4th creation returns 403 "user limit for the Starter plan (3)"
- **Priority:** P0
- **Automated:** ✅

#### TC-BILL-009: Feature gate — starter cannot use custom templates
- **Test ID:** TC-BILL-009
- **Description:** Custom template routes blocked for starter plan
- **Role:** admin
- **Plan:** starter
- **Steps:** POST /api/admin/templates with starter plan
- **Expected:** 403 "Upgrade to Business or Enterprise to manage custom templates"
- **Priority:** P1
- **Automated:** ✅

#### TC-BILL-010: Feature gate — starter cannot use Google Sheets export
- **Test ID:** TC-BILL-010
- **Description:** POST /api/pp30/export/sheets blocked for starter
- **Role:** admin
- **Plan:** starter
- **Steps:** POST /api/pp30/export/sheets
- **Expected:** 403 for starter, 200 for business
- **Priority:** P1
- **Automated:** ✅

#### TC-BILL-011: Coupon — percent discount
- **Test ID:** TC-BILL-011
- **Description:** Coupon with discountType=percent applied to checkout
- **Role:** N/A
- **Plan:** N/A
- **Steps:**
  1. POST /api/billing/coupon/preview with code for 20% off starter
  2. Create checkout with same coupon code
- **Expected:** totalAmount = subtotalAmount * 0.8
- **Priority:** P1
- **Automated:** ✅

#### TC-BILL-012: Coupon — fixed discount
- **Test ID:** TC-BILL-012
- **Description:** Coupon with discountType=fixed applied to checkout
- **Role:** N/A
- **Plan:** N/A
- **Steps:** POST /api/billing/coupon/preview with fixed amount coupon
- **Expected:** totalAmount = subtotalAmount - fixedValue
- **Priority:** P1
- **Automated:** ✅

#### TC-BILL-013: Coupon — redemption limit
- **Test ID:** TC-BILL-013
- **Description:** Coupon with maxRedemptions exhausted → rejection
- **Role:** N/A
- **Plan:** N/A
- **Steps:** Create coupon with maxRedemptions=2, apply 3 times
- **Expected:** 3rd application → 400 "Coupon has reached maximum redemptions"
- **Priority:** P2
- **Automated:** ✅

#### TC-BILL-014: Renewal checkout session
- **Test ID:** TC-BILL-014
- **Description:** Owner creates renewal session for past_due tenant
- **Role:** super_admin
- **Plan:** N/A
- **Steps:** POST /api/billing/owner/renewals/:companyId/create-session
- **Expected:** Stripe checkout session created, email sent to tenant
- **Priority:** P1
- **Automated:** ✅

#### TC-BILL-015: Billing portal session
- **Test ID:** TC-BILL-015
- **Description:** Admin creates Stripe billing portal session
- **Role:** admin
- **Plan:** starter+
- **Steps:** POST /api/billing/portal-session
- **Expected:** Stripe portal URL returned, admin can manage subscription
- **Priority:** P1
- **Automated:** ✅

#### TC-BILL-016: Access policy endpoint
- **Test ID:** TC-BILL-016
- **Description:** GET /api/billing/access-policy returns correct limits
- **Role:** viewer
- **Plan:** Any
- **Steps:** GET /api/billing/access-policy
- **Expected:** Correct plan, limits, usage counts for current company
- **Priority:** P1
- **Automated:** ✅

---

### 4.8 LINE OA Integration

#### TC-LINE-001: OTP link flow
- **Test ID:** TC-LINE-001
- **Description:** User links LINE account via 6-digit OTP
- **Role:** Any authenticated user
- **Plan:** starter+
- **Steps:**
  1. POST /api/line/link-start → receive OTP
  2. User sends OTP via LINE app
  3. LINE webhook receives text message with OTP
- **Expected:** LineUserLink created, LINE sends confirmation message
- **Priority:** P0
- **Automated:** ✅

#### TC-LINE-002: OCR supplier invoice → purchase invoice created
- **Test ID:** TC-LINE-002
- **Description:** LINE receives image of supplier invoice → OCR → purchase invoice saved
- **Role:** LINE user linked to tenant
- **Plan:** starter+
- **Steps:**
  1. Send JPG image of supplier invoice via LINE
  2. OCR processes image
  3. Flex confirmation card sent
  4. User confirms via postback
- **Expected:** PurchaseInvoice created in DB with supplier data
- **Priority:** P0
- **Automated:** ❌

#### TC-LINE-003: OCR bank transfer → matches outstanding invoice
- **Test ID:** TC-LINE-003
- **Description:** LINE receives bank slip → OCR → matched to outstanding invoice
- **Role:** LINE user linked to tenant
- **Plan:** starter+
- **Steps:** Send JPG of bank transfer slip for exact outstanding invoice amount
- **Expected:** Payment recorded on matched invoice, isPaid updated
- **Priority:** P0
- **Automated:** ❌

#### TC-LINE-004: LINE document confirmation — missing fields
- **Test ID:** TC-LINE-004
- **Description:** OCR result missing required fields → user prompted for each
- **Role:** LINE user linked to tenant
- **Plan:** starter+
- **Steps:** Send blurry invoice image where total is unreadable
- **Expected:** LINE asks for missing field one by one
- **Priority:** P1
- **Automated:** ❌

#### TC-LINE-005: LINE overdue invoice notification
- **Test ID:** TC-LINE-005
- **Description:** LINE user sends "ใบเกินกำหนด" → Flex card of overdue invoices
- **Role:** LINE user linked to tenant
- **Plan:** starter+
- **Steps:** User has unpaid invoices past dueDate, sends "ใบเกินกำหนด" to LINE
- **Expected:** Flex card with list of overdue invoices, amounts, days overdue
- **Priority:** P1
- **Automated:** ❌

#### TC-LINE-006: LINE invoice lookup → Flex Card with PDF button
- **Test ID:** TC-LINE-006
- **Description:** LINE user sends "ส่งใบ INV-001" → Flex card + PDF URL
- **Role:** LINE user linked to tenant
- **Plan:** starter+
- **Steps:** Send "ส่งใบ INV-001" to LINE
- **Expected:** Flex card with invoice details + button to open PDF
- **Priority:** P1
- **Automated:** ❌

#### TC-LINE-007: LINE duplicate webhook event deduplication
- **Test ID:** TC-LINE-007
- **Description:** LINE retries webhook → same event processed only once
- **Role:** LINE webhook
- **Plan:** starter+
- **Steps:** LINE resends same event within 5 minutes
- **Expected:** Second event skipped (Redis dedup key set with 5min TTL)
- **Priority:** P1
- **Automated:** ❌

#### TC-LINE-008: LINE AI fallback — ask about VAT
- **Test ID:** TC-LINE-008
- **Description:** LINE user asks "ภาษีซื้อเดือนนี้เท่าไร" → AI (Pinuch) responds
- **Role:** LINE user linked to tenant
- **Plan:** starter+
- **Steps:** Send message matching AI handler pattern to LINE
- **Expected:** AI-generated response with correct VAT figures
- **Priority:** P2
- **Automated:** ❌

---

### 4.9 Expenses & Petty Cash

#### TC-EXP-001: Create expense voucher
- **Test ID:** TC-EXP-001
- **Description:** POST /api/expenses with items
- **Role:** accountant
- **Plan:** starter+
- **Steps:** POST /api/expenses with 2 items (amounts 500, 300)
- **Expected:** Voucher created, totalAmount=800, status=draft
- **Priority:** P0
- **Automated:** ✅

#### TC-EXP-002: Submit expense voucher → approved
- **Test ID:** TC-EXP-002
- **Description:** POST /api/expenses/:id/submit → POST /api/expenses/:id/approve
- **Role:** accountant submits, admin approves
- **Plan:** starter+
- **Steps:**
  1. Accountant creates + submits voucher
  2. Admin approves voucher
- **Expected:** status=submitted after submit, status=approved after approve, petty cash deducted
- **Priority:** P0
- **Automated:** ✅

#### TC-EXP-003: Reject expense voucher
- **Test ID:** TC-EXP-003
- **Description:** POST /api/expenses/:id/reject with rejectionNote
- **Role:** admin
- **Plan:** starter+
- **Steps:** POST /api/expenses/:id/reject with note
- **Expected:** status=rejected, rejectionNote stored, approvalLog created
- **Priority:** P1
- **Automated:** ✅

#### TC-EXP-004: Cannot edit submitted/approved voucher
- **Test ID:** TC-EXP-004
- **Description:** PATCH /api/expenses/:id where status=submitted
- **Role:** accountant
- **Plan:** starter+
- **Steps:** PATCH /api/expenses/:id (voucher status=submitted)
- **Expected:** 400 "Only draft vouchers can be edited"
- **Priority:** P1
- **Automated:** ✅

#### TC-EXP-005: Expense limit enforcement
- **Test ID:** TC-EXP-005
- **Description:** Item exceeding company.expenseLimit rejected
- **Role:** admin
- **Plan:** starter+
- **Steps:**
  1. Set expense limit to 5,000
  2. Create expense item with amount=6,000
- **Expected:** 400 "exceeds expense limit of 5000 THB"
- **Priority:** P1
- **Automated:** ✅

#### TC-EXP-006: Petty cash top-up
- **Test ID:** TC-EXP-006
- **Description:** POST /api/expenses/petty-cash/topup
- **Role:** admin
- **Plan:** starter+
- **Steps:** POST /api/expenses/petty-cash/topup with amount=10,000
- **Expected:** petty_cash.balance incremented by 10,000
- **Priority:** P1
- **Automated:** ✅

#### TC-EXP-007: WHT on expense items
- **Test ID:** TC-EXP-007
- **Description:** Expense item with whtApplicable=true → whtAmount and netAmount calculated
- **Role:** accountant
- **Plan:** starter+
- **Steps:** Create expense item amount=10,000, whtApplicable=true, whtRate=3
- **Expected:** whtAmount=300, netAmount=9,700 stored in expense_items
- **Priority:** P1
- **Automated:** ✅

#### TC-EXP-008: Google Sheets expense export
- **Test ID:** TC-EXP-008
- **Description:** POST /api/expenses/export/sheets
- **Role:** accountant
- **Plan:** starter+
- **Steps:** POST /api/expenses/export/sheets with date filters
- **Expected:** Google Sheets URL returned, export includes WHT columns
- **Priority:** P2
- **Automated:** ❌

---

### 4.10 Dashboard & Reporting

#### TC-DASH-001: Dashboard revenue totals
- **Test ID:** TC-DASH-001
- **Description:** GET /api/dashboard — correct revenue and invoice counts
- **Role:** viewer
- **Plan:** Any
- **Steps:** GET /api/dashboard
- **Expected:** totalRevenue, totalInvoices, counts by status match actual data
- **Priority:** P0
- **Automated:** ✅

#### TC-DASH-002: Dashboard outstanding receivables aging
- **Test ID:** TC-DASH-002
- **Description:** GET /api/dashboard — overdue invoices grouped correctly
- **Role:** viewer
- **Plan:** Any
- **Steps:** Create paid and unpaid invoices with different due dates, check dashboard
- **Expected:** Aging buckets (current, 1-30, 31-60, 61-90, 90+) correct
- **Priority:** P1
- **Automated:** ✅

#### TC-DASH-003: Customer statement generation
- **Test ID:** TC-DASH-003
- **Description:** GET /api/customers/:id/statement — full transaction history
- **Role:** viewer
- **Plan:** Any
- **Steps:** GET /api/customers/:id/statement
- **Expected:** All invoices for customer, running balance, aging data
- **Priority:** P1
- **Automated:** ✅

#### TC-DASH-004: Invoice Excel export
- **Test ID:** TC-DASH-004
- **Description:** GET /api/invoices/export/excel
- **Role:** viewer
- **Plan:** starter+
- **Steps:** GET /api/invoices/export/excel with optional status filter
- **Expected:** .xlsx file with correct invoice columns
- **Priority:** P2
- **Automated:** ✅

---

## 5. Risk Register

### Critical Risks (P0 — undetected = severe production impact)

| Risk ID | Risk Description | Impact | Likelihood | Detection Difficulty | Mitigation |
|---------|------------------|--------|------------|---------------------|------------|
| R-001 | **RLS bypass**: User in Company A can see/modify Company B's data due to missing `companyId` filter or RLS context not applied | Data breach — two companies see each other's invoices, customer data, payments | Low | **Very Hard** — requires cross-tenant testing, won't show in single-company testing | TC-RLS-001 to TC-RLS-005 must pass; add RLS audit logging |
| R-002 | **Invoice number collision**: Advisory lock fails under extreme concurrency → duplicate invoice numbers | RD rejects duplicate invoice numbers; fiscal compliance failure | Low | Hard — requires specific concurrent load pattern | TC-INV-016; monitor invoice number generation at DB level |
| R-003 | **XAdES signature with expired certificate**: Expired .p12 used for RD submission → all signatures invalid | RD rejects all invoices; compliance failure; re-issuance required | Medium | Medium — requires monitoring cert expiry | TC-RD-004; `/api/admin/signing-test` run weekly; alert on expiring certs |
| R-004 | **WHT calculation error**: Wrong WHT rate applied (1%/3%/5%) → incorrect tax withheld and remitted | Tax compliance error; penalties from Revenue Department | Medium | Hard — subtle off-bycurrency errors | TC-WHT-003; always use `Math.round()` for financial calculations |
| R-005 | **PP.30 includes cancelled invoices**: Cancelled/submitted draft status change not filtered → PP.30 shows wrong VAT payable | Tax filing error; underpayment or overpayment | Medium | Medium | TC-PP30-004; explicit `status: { in: ['approved', 'submitted'] }` filter required |
| R-006 | **Document limit bypass**: `getUsageValue` returns stale count → company exceeds plan limit | Revenue loss; unfair free-tier abuse | Low | Hard — timing gap between invoice create and count update | TC-BILL-007; use DB transaction for atomic count |
| R-007 | **Invoice cancellation race**: User cancels invoice while RD worker is submitting → conflicting states | Invoice cancelled locally but RD accepts it → two records at RD | Low | Hard — requires timing manipulation | RD worker checks `status === 'cancelled'` before submission; soft-lock pattern |

### High Risks (P1 — significant impact but easier to detect)

| Risk ID | Risk Description | Impact | Likelihood | Detection Difficulty | Mitigation |
|---------|------------------|--------|------------|---------------------|------------|
| R-008 | **PromptPay QR payment fraud**: Attacker creates checkout with PromptPay method, QR code displayed but not scanned. System provisions account before payment confirmation | Free access to paid features | Medium | Medium | Webhook `checkout.session.completed` only triggered by Stripe after payment; monitor `payment_failed` events |
| R-009 | **Certificate upload without validation**: Admin uploads invalid .p12 → signing silently fails → invoices never reach RD | All RD submissions fail; silent data loss | Low | Easy — TDID signing test catches this | TC-RD-008 (`/api/admin/signing-test`) must pass before RD enabled |
| R-010 | **LINE webhook signature bypass**: LINE webhook without valid signature accepted | Attacker sends fake messages to user's LINE → fake purchase invoices created | Low | Medium — LINE platform provides signature | Verify `x-line-signature` header on every webhook call |
| R-011 | **Google Sheets OAuth token expiry**: Long-lived refresh token expires → Google Sheets export silently fails | PP.30 export breaks for business+ users | Medium | Medium — needs long-running test or token rotation | Implement token refresh; alert on export failure |
| R-012 | **Invoice edit after issue → RD mismatch**: Admin patches invoice after issue but before RD submission → local DB and RD have different data | Compliance failure; RD and DB out of sync | Low | Hard — requires timing between issue and RD worker | TC-INV-005; RD worker generates fresh XML at submission time, not at issue time |
| R-013 | **WHT cert unlink on delete → invoice left with stale WHT reference**: WHT cert deleted but invoice.whtAmount not cleared | PP.30 WHT summary double-counts or shows stale data | Low | Medium | TC-WHT-011; cascade delete or transaction must clear invoice link |
| R-014 | **Credit note exceeds original invoice amount**: T04 total > T02 total → invalid negative VAT | Tax calculation error | Low | Easy — business rule validation | Add validation: T04.total <= T02.total |
| R-015 | **VAT zero-rate vs exempt confusion**: `vatZero` and `vatExempt` mixed up in PP.30 report → wrong tax filing | Tax compliance error | Medium | Medium | TC-PP30-002, TC-PP30-003; separate byVatType buckets |
| R-016 | **RD retry storm**: RD API rate-limited → all jobs retry simultaneously → BullMQ saturation | All submissions delayed; potential RD throttling | Medium | Medium — load test with rate-limited RD | Exponential backoff (already implemented); queue depth monitoring |
| R-017 | **Storage quota silently exceeded**: company uploads many PDFs → exceeds 500MB → uploads start failing silently | User doesn't know storage is full; uploads fail | Medium | Easy — storageUsedBytes tracked | Show quota indicator in UI when >80% full |
| R-018 | **Invoice PDF not generated before email sent**: `sendInvoiceEmail` triggered before PDF worker completes → broken PDF link | Customer receives invoice email with missing/broken PDF | Low | Medium | PDF generation is queued before email; email sent with pdfUrl only after PDF worker completes |

### Medium Risks (P2 — notable but manageable)

| Risk ID | Risk Description | Impact | Mitigation |
|---------|------------------|--------|------------|
| R-019 | **Promo code race**: Two users redeem same single-use promo code simultaneously → both get discount | Revenue loss (double discount) | Coupon `maxRedemptions` checked atomically in DB transaction |
| R-020 | **User role downgrade**: Admin demoted to accountant → loses access to existing features mid-session | UX confusion; features disappear mid-session | JWT role used for routing; new login required to pick up new role |
| R-021 | **Purchase invoice duplicate not caught at OCR stage**: OCR creates purchase invoice, duplicate check only at save → user gets duplicate notification after save | Duplicate data created; must manually delete | OCR confirmation card shows "possible duplicate" warning before save (implemented) |
| R-022 | **Petty cash balance goes negative**: Approval deducts more than available balance | Accounting error | Add check: `balance >= voucher.totalAmount` before deduction |
| R-023 | **Invoice number format mismatch with RD**: Invoice number contains special characters → RD rejects XML schema validation | RD submission fails at schema validation step | Use only alphanumeric + hyphens in invoice numbers; validate before RD call |
| R-024 | **Free plan → paid plan upgrade not instant**: User upgrades → features still gated until Stripe webhook processes | UX confusion | Stripe webhook processes within seconds; consider optimistic UI update |
| R-025 | **Thai date handling**: Buddhist calendar vs AD — PP.30 and invoice dates may display wrong year | User confusion; potential filing error | All DB dates stored as UTC; display uses Buddhist calendar (ภาษาไทย: +543 years) |

---

## 6. Blind Spots & Special Cases

These are areas the codebase has addressed but are easy to regress:

### 6.1 RLS Context Propagation
- Every Prisma query MUST go through `withRlsContext` or `tenantRlsContext` — queries outside this context bypass RLS
- **Known gap**: Raw SQL queries in migrations may not respect RLS
- **Test**: TC-RLS-001

### 6.2 Invoice Number Advisory Lock
- `withInvoiceLock` in [`rls.ts:51`](backend/src/config/rls.ts:51) prevents race conditions
- **Edge case**: If lock times out (5s), invoice creation fails with a transaction timeout — user sees error but no duplicate
- **Test**: TC-INV-016

### 6.3 Draft Invoice Number Format
- Drafts use `DRAFT-{YYYYMM}-{6-digit-timestamp}` — must NOT trigger sequential number generation
- Real numbers only assigned on `POST /api/invoices/:id/issue`
- **Test**: TC-INV-004, TC-INV-006

### 6.4 WHT Sequence Per Company Per Month
- WHT certificate sequence is `WHT-{TAXID}-{YYYYMM}-{NNNN}` — resets each month per company
- Uses PostgreSQL named sequence per company-month via raw SQL `nextval`
- **Edge case**: If `nextval` named sequence doesn't exist → auto-created? Verify sequence creation
- **Test**: TC-WHT-004

### 6.5 PP.30 Status Filter
- Only `approved` and `submitted` invoices count in PP.30
- `draft`, `pending`, `cancelled`, `rejected` are excluded
- **Edge case**: T04 (credit note) with status=submitted → currently included? (Should be subtracted)
- **Test**: TC-PP30-004

### 6.6 Company Certificate Path Encryption
- Certificate password stored in DB encrypted via `encryptConfigValue`
- Dev certificates stored as plaintext path reference
- **Edge case**: Production certs must never be logged or returned in API responses
- **Test**: TC-RD-004 (expired cert detection)

### 6.7 LINE Webhook Idempotency
- LINE retries webhook on 200 timeout — same event may arrive multiple times
- Redis dedup key `line:seen:{eventId}` with 5-minute TTL prevents double-processing
- **Edge case**: Redis unavailable → dedup check skipped (fallback to "allow through")
- **Test**: TC-LINE-007

### 6.8 Thailand Tax ID Format
- All Thai tax IDs must be exactly 13 digits
- Validation via Zod: `z.string().regex(/^\d{13}$/)` in billing routes
- **Edge case**: Branch codes must be 5 digits (00000 for HQ)
- **Test**: TC-BILL-001, TC-BILL-003

### 6.9 Auto-Submit Triggering on Issue vs Create
- T01/T02 auto-submit triggered in BOTH `POST /` (when `isDraft=false`) AND `POST /:id/issue` (when converting DRAFT → real)
- Risk: Double-submit if both paths triggered accidentally
- **Safeguard**: `queueRdSubmission` is idempotent — sets `rdSubmissionStatus=pending` but if already in progress/success, worker skips
- **Test**: TC-RD-005

### 6.10 Cancel Reason Required
- [`invoices.ts:409`](backend/src/routes/invoices.ts:409) requires `cancelReason` to be non-empty
- **Edge case**: Unicode characters in reason → ensure stored as UTF-8
- **Test**: TC-INV-008

### 6.11 Invoice Buyer Snapshot (seller JSON)
- Invoice stores `seller` as JSONB snapshot at creation time
- If company profile changes after invoice creation → invoice still shows original data
- **This is intentional** for audit compliance — do not change
- **Test**: Verify old invoices retain original seller data after company update

### 6.12 WHT on Invoices vs Expenses
- WHT on **invoices** (outgoing documents): ภาษีหัก ณ ที่จ่าย — you're the payer
- WHT on **expense items** (incoming documents): ภาษีหัก ณ ที่จ่าย — supplier withholds from you
- Both use 1%/3%/5% but different accounting treatment
- **Test**: TC-WHT-001 (invoice), TC-EXP-007 (expense)

### 6.13 RD Environment Isolation
- `RD_ENVIRONMENT=sandbox` → mock responses
- `RD_ENVIRONMENT=production` → real calls
- **Edge case**: QA engineer runs tests against production — requires explicit `RD_ENVIRONMENT` check
- **Safeguard**: Refuse production RD calls if `rdClientId`/`rdClientSecret` not configured

### 6.14 Google OAuth New User Creation
- Google login for non-existent user → auto-creates account with `role=admin`
- **Edge case**: Existing email (same email different Google account) → conflict
- **Test**: TC-AUTH-002

### 6.15 Invoice PDF Generation Timing
- PDF generation is async (BullMQ `invoiceQueue`)
- `GET /api/invoices/:id/preview` generates PDF synchronously for preview
- `pdfUrl` may be `null` immediately after issue — LINE lookup shows "PDF not ready yet"
- **Test**: TC-LINE-006 (PDF button should gracefully handle null pdfUrl)

---

## 7. Test Environments & Prerequisites

### 7.1 Required Test Fixtures

| Fixture | Setup | Used By |
|---------|-------|---------|
| `TEST_ADMIN_EMAIL` | admin@siamtech.co.th / Admin@123456 | All tenant tests |
| `TEST_SECONDARY_ADMIN_EMAIL` | admin+1@demo-etax.co.th / Admin@123456 | Tenant isolation tests |
| Company A (primary) | `TEST_ADMIN_EMAIL` companyId | All tests |
| Company B (secondary) | `TEST_SECONDARY_ADMIN_EMAIL` companyId | RLS isolation tests |
| Stripe test mode | stripe.com/test-api | Billing tests |
| LINE Channel test mode | developers.line.biz | LINE webhook tests |
| RD sandbox | `rdEnvironment=sandbox` | RD submission tests |
| Dev .p12 certificate | backend/certs/test-company.p12 | Signing tests |

### 7.2 Environment Variables for Testing

```bash
TEST_BASE_URL=http://127.0.0.1:4000
TEST_ADMIN_EMAIL=admin@siamtech.co.th
TEST_SECONDARY_ADMIN_EMAIL=admin+1@demo-etax.co.th
TEST_ADMIN_PASSWORD=Admin@123456
RD_ENVIRONMENT=sandbox
STRIPE_WEBHOOK_SECRET=whsec_test_...
LINE_CHANNEL_SECRET=...
```

### 7.3 Running the Test Suite

```bash
# Run all integration tests
cd backend && npm test

# Run specific test file
cd backend && node --test src/routes/tenant-isolation.integration.test.ts

# Run tenant isolation tests
cd backend && node --test src/routes/tenant-isolation.integration.test.ts

# Run invoice integration tests
cd backend && node --test src/routes/invoices.integration.test.ts

# Run with coverage
cd backend && npm test -- --experimental-test-coverage
```

---

## 8. Regression Testing Checklist

Before each release, run this critical subset (estimated 2-3 hours for full manual pass):

### P0 — Must Pass (blocker if any fail)
- [ ] TC-RLS-001: Cross-tenant invoice access denied
- [ ] TC-RLS-002: Cross-tenant payment creation denied
- [ ] TC-INV-001: T01 auto-submit RD completes
- [ ] TC-INV-002: T02 auto-submit RD completes
- [ ] TC-INV-004: Draft → real invoice number on issue
- [ ] TC-INV-005: Cannot edit submitted invoice
- [ ] TC-INV-007: Cancel draft (no RD call)
- [ ] TC-INV-008: Cancel submitted → RD cancel API called
- [ ] TC-INV-010: Issue receipt from T02 creates T03
- [ ] TC-RD-001: Full RD pipeline (XML → sign → TSA → RD)
- [ ] TC-WHT-001: WHT cert from invoice
- [ ] TC-WHT-003: WHT 1%/3%/5% calculation
- [ ] TC-BILL-001: Free signup
- [ ] TC-BILL-005: Stripe webhook → provision
- [ ] TC-BILL-007: Document limit (free plan = 20/month)
- [ ] TC-BILL-008: User limit (starter = 3 users)
- [ ] TC-PP30-001: PP.30 basic calculation

### P1 — Should Pass (can ship if minor failures, fix within 24h)
- [ ] TC-AUTH-001 through TC-AUTH-006: All auth/permission tests
- [ ] TC-INV-006: Draft auto-save recovery
- [ ] TC-INV-012: Discount calculation
- [ ] TC-INV-013: vatZero items excluded from VAT
- [ ] TC-INV-014: vatExempt items excluded from VAT
- [ ] TC-INV-015: Partial payment tracking
- [ ] TC-RD-002: RD retry on transient failure
- [ ] TC-RD-005: Cannot re-submit submitted invoice
- [ ] TC-WHT-002: Standalone WHT cert creation
- [ ] TC-WHT-005: Cannot create WHT on draft invoice
- [ ] TC-WHT-008: PP.30 WHT aggregation
- [ ] TC-PP30-002: vatExempt excluded from PP.30
- [ ] TC-PP30-003: vatZero excluded from PP.30
- [ ] TC-BILL-009: Starter cannot use custom templates
- [ ] TC-BILL-010: Starter cannot use Google Sheets
- [ ] TC-EXP-001: Create expense voucher
- [ ] TC-EXP-002: Submit + approve expense
- [ ] TC-DASH-001: Dashboard revenue totals

### P2 — Smoke Tests (can skip in hotfix, full pass before milestone)
- [ ] TC-WHT-007: WHT PDF download
- [ ] TC-PP30-005: PP.30 CSV export
- [ ] TC-DASH-003: Customer statement
- [ ] TC-DASH-004: Invoice Excel export

---

## 9. Known Gaps & Future Test Coverage

These areas need test coverage but require additional setup (CI environment, mock services, etc.):

| Gap | Description | Priority |
|-----|-------------|----------|
| E2E browser tests | Playwright tests for full UI flows (login → create invoice → submit → verify RD status) | High |
| Load testing | Artillery scripts for concurrent invoice creation, RD submission throughput | High |
| Certificate expiry monitoring test | Automated test that checks cert expiry date and alerts | Medium |
| LINE OA end-to-end | Real LINE Bot API testing requires ngrok + LINE dev console | Medium |
| Stripe test in production mode | Test Stripe with actual sandbox payments vs mock | Medium |
| Multi-browser responsive tests | Invoice PDF renders correctly on Chrome/Firefox/Safari | Low |
| Accessibility (a11y) tests | Invoice builder form accessibility, screen reader compatibility | Low |
| GDPR/data deletion | Test that deleting company removes all PII per GDPR | Low |

---

## 10. Test ID Reference Index

| Test ID | File | Automated? |
|---------|------|------------|
| TC-AUTH-001 | auth.test.ts | ✅ |
| TC-AUTH-002 | auth.test.ts | ✅ |
| TC-AUTH-003 | auth.test.ts | ✅ |
| TC-AUTH-004 | auth.test.ts | ✅ |
| TC-AUTH-005 | — | ✅ (role guard test) |
| TC-AUTH-006 | — | ✅ (role guard test) |
| TC-RLS-001 | tenant-isolation.integration.test.ts | ✅ |
| TC-RLS-002 | tenant-isolation.integration.test.ts | ✅ |
| TC-RLS-003 | tenant-isolation.integration.test.ts | ✅ |
| TC-RLS-004 | tenant-isolation.integration.test.ts | ✅ |
| TC-RLS-005 | — | Manual |
| TC-INV-001 | invoices.integration.test.ts | ✅ |
| TC-INV-002 | invoices.integration.test.ts | ✅ |
| TC-INV-003 | invoices.test.ts | ✅ |
| TC-INV-004 | invoices.test.ts | ✅ |
| TC-INV-005 | invoices.test.ts | ✅ |
| TC-INV-006 | useInvoiceForm.test.tsx | ✅ (frontend) |
| TC-INV-007 | invoices.test.ts | ✅ |
| TC-INV-008 | invoices.test.ts | ✅ |
| TC-INV-009 | invoices.test.ts | ✅ |
| TC-INV-010 | invoices.integration.test.ts | ✅ |
| TC-INV-011 | invoices.test.ts | ✅ |
| TC-INV-012 | invoiceCalculation.test.ts | ✅ |
| TC-INV-013 | invoiceCalculation.test.ts | ✅ |
| TC-INV-014 | invoiceCalculation.test.ts | ✅ |
| TC-INV-015 | invoices.test.ts | ✅ |
| TC-INV-016 | concurrency.test.ts | ❌ (needs fault injection) |
| TC-INV-017 | invoices.test.ts | ✅ |
| TC-INV-018 | invoices.test.ts | ✅ |
| TC-RD-001 | invoices.integration.test.ts | ✅ |
| TC-RD-002 | rdSubmitWorker.test.ts | ❌ (needs fault injection) |
| TC-RD-003 | rdSubmitWorker.test.ts | ❌ (needs fault injection) |
| TC-RD-004 | signing.test.ts | ❌ |
| TC-RD-005 | invoices.test.ts | ✅ |
| TC-RD-006 | invoices.test.ts | ✅ |
| TC-RD-007 | (see TC-INV-008) | ✅ |
| TC-RD-008 | admin.test.ts | ❌ |
| TC-WHT-001 | whtCertificates.test.ts | ✅ |
| TC-WHT-002 | whtCertificates.test.ts | ✅ |
| TC-WHT-003 | whtCertificates.test.ts | ✅ |
| TC-WHT-004 | whtCertificates.test.ts | ✅ |
| TC-WHT-005 | invoices.test.ts | ✅ |
| TC-WHT-006 | invoices.test.ts | ✅ |
| TC-WHT-007 | whtCertificates.test.ts | ❌ |
| TC-WHT-008 | pp30.test.ts | ✅ |
| TC-WHT-009 | whtCertificates.test.ts | ✅ |
| TC-WHT-010 | whtCertificates.test.ts | ✅ |
| TC-WHT-011 | whtCertificates.test.ts | ✅ |
| TC-PP30-001 | pp30.test.ts | ✅ |
| TC-PP30-002 | pp30.test.ts | ✅ |
| TC-PP30-003 | pp30.test.ts | ✅ |
| TC-PP30-004 | pp30.test.ts | ✅ |
| TC-PP30-005 | pp30.test.ts | ✅ |
| TC-PP30-006 | pp30.test.ts | ❌ |
| TC-PP30-007 | pp30.test.ts | ✅ |
| TC-PP30-008 | pp30.test.ts | ✅ |
| TC-BILL-001 | billing.test.ts | ✅ |
| TC-BILL-002 | billing.test.ts | ✅ |
| TC-BILL-003 | billing.test.ts | ✅ |
| TC-BILL-004 | billing.test.ts | ✅ |
| TC-BILL-005 | billing.test.ts | ✅ |
| TC-BILL-006 | billing.test.ts | ✅ |
| TC-BILL-007 | accessPolicy.test.ts | ✅ |
| TC-BILL-008 | accessPolicy.test.ts | ✅ |
| TC-BILL-009 | accessPolicy.test.ts | ✅ |
| TC-BILL-010 | accessPolicy.test.ts | ✅ |
| TC-BILL-011 | billing.test.ts | ✅ |
| TC-BILL-012 | billing.test.ts | ✅ |
| TC-BILL-013 | billing.test.ts | ✅ |
| TC-BILL-014 | billing.test.ts | ✅ |
| TC-BILL-015 | billing.test.ts | ✅ |
| TC-BILL-016 | billing.test.ts | ✅ |
| TC-LINE-001 | line.test.ts | ✅ |
| TC-LINE-002 | line.test.ts | ❌ |
| TC-LINE-003 | line.test.ts | ❌ |
| TC-LINE-004 | line.test.ts | ❌ |
| TC-LINE-005 | line.test.ts | ❌ |
| TC-LINE-006 | line.test.ts | ❌ |
| TC-LINE-007 | line.test.ts | ❌ |
| TC-LINE-008 | line.test.ts | ❌ |
| TC-EXP-001 | expenses.test.ts | ✅ |
| TC-EXP-002 | expenses.test.ts | ✅ |
| TC-EXP-003 | expenses.test.ts | ✅ |
| TC-EXP-004 | expenses.test.ts | ✅ |
| TC-EXP-005 | expenses.test.ts | ✅ |
| TC-EXP-006 | expenses.test.ts | ✅ |
| TC-EXP-007 | expenses.test.ts | ✅ |
| TC-EXP-008 | expenses.test.ts | ❌ |
| TC-DASH-001 | dashboard.test.ts | ✅ |
| TC-DASH-002 | dashboard.test.ts | ✅ |
| TC-DASH-003 | customers.test.ts | ✅ |
| TC-DASH-004 | invoices.test.ts | ✅ |

---

## Appendix A: Zod Validation Quick Reference

| Field | Validation Rule |
|-------|----------------|
| Thai Tax ID | `^\d{13}$` (13 digits) |
| Branch Code | `^\d{5}$` (5 digits, 00000 = HQ) |
| Invoice Number | Alphanumeric + hyphens only |
| WHT Rate | `1` \| `3` \| `5` (as string) |
| Income Type | `1` (ม.40(1)) \| `2` (ม.40(2)) \| `4` (ม.40(4)) |
| VAT Types | `vat7` \| `vatExempt` \| `vatZero` |
| Document Types | `tax_invoice` \| `tax_invoice_receipt` \| `receipt` \| `credit_note` \| `debit_note` |
| Cancel Reason | Non-empty string, required |

## Appendix B: Key DB Indexes for Query Performance

| Table | Index | Purpose |
|-------|-------|---------|
| invoices | `[companyId, status, invoiceDate]` | Dashboard + PP.30 |
| invoices | `[companyId, rdSubmissionStatus]` | RD submission queue |
| invoices | `[companyId, invoiceNumber]` UNIQUE | Deduplication |
| wht_certificates | `[companyId, paymentDate]` | PP.30 WHT summary |
| purchase_invoices | `[companyId, supplierTaxId, invoiceNumber]` UNIQUE | Duplicate detection |
| audit_logs | `[companyId, createdAt]` | Audit log queries |
| document_intakes | `[companyId, status, createdAt]` | LINE intake queue |

## Appendix C: Related Documentation

- [RLS Rollout](docs/security/rls-rollout.md) — RLS implementation notes
- [Stripe Billing Setup](docs/stripe-billing-setup.md) — Billing configuration
- [Load Test Plan](docs/load-test-plan.md) — Artillery load testing
- [DEPLOY_FREE_FIRST](docs/DEPLOY_FREE_FIRST.md) — Deployment guide
- [TOOLS.md](.Codex/TOOLS.md) — Agent and command reference