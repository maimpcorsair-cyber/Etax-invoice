# Phase 1 Execution Report — Auth & RLS (Cross-Tenant Isolation + Login/Logout)

**Executed:** 2026-05-06  
**Mode:** Code (HTTP API via curl + code analysis)  
**Test Runner:** Manual curl + Node.js integration tests  
**Backend:** http://127.0.0.1:4000 (live)  
**Test Account:** admin@siamtech.co.th / Admin@123456 (role: admin, companyId: company-001)

---

## Test Case Results Summary

| Test ID | Description | Result | Notes |
|---------|-------------|--------|-------|
| TC-AUTH-001 | Email/password login (admin@siamtech.co.th / Admin@123456) | ✅ PASS | Returns 200 with JWT containing userId, companyId, role, email |
| TC-AUTH-003 | Invalid credentials rejected (wrong password) | ✅ PASS | Returns 401 "Invalid credentials" |
| TC-AUTH-004 | Expired JWT rejected | ✅ PASS | Returns 401 "Invalid or expired token" |
| TC-AUTH-005 | Viewer cannot access admin routes | ⚠️ CANNOT TEST | No viewer user seeded; route uses plan-based gate, not role gate |
| TC-AUTH-006 | Admin cannot access /api/billing/owner/* routes | ✅ PASS | Returns 403 "Insufficient permissions" for admin accessing owner summary |
| TC-RLS-001 | Company A cannot read Company B's invoices | ⚠️ CANNOT TEST | Secondary company admin (admin+1@demo-etax.co.th) not seeded |
| TC-RLS-002 | Company A cannot create payments on Company B's invoices | ⚠️ CANNOT TEST | Secondary company not seeded |
| TC-RLS-003 | Company A cannot update Company B's customers | ⚠️ CANNOT TEST | Secondary company not seeded |
| TC-RLS-004 | super_admin can access all tenants via Owner Control Plane | ✅ PASS (code review) | Route uses `requireRole('super_admin')` + Prisma without RLS context (bypass) |
| TC-RLS-005 | Audit logs scoped to company | ⚠️ PARTIAL | Route correctly gated behind Business/Enterprise plan; current account is Free |

**Executed: 5 confirmed, 4 blocked by missing fixtures**

---

## Detailed Results

### ✅ TC-AUTH-001: Email/password login

**Steps:**
```bash
POST /api/auth/login {"email":"admin@siamtech.co.th","password":"Admin@123456"}
```

**Expected:** 200, returns token + user object with companyId  
**Actual:** ✅ PASS — 200 with JWT containing:
```json
{
  "token": "eyJhbGci...",
  "user": {
    "id": "user-admin-001",
    "email": "admin@siamtech.co.th",
    "name": "Admin User",
    "role": "admin",
    "companyId": "company-001",
    "company": { "nameTh": "...", "taxId": "0105545123456" }
  }
}
```

**Token payload:** `{ userId, companyId, role, email, iat, exp }`  
**Token expiry:** 7 days (JWT_EXPIRES_IN)

---

### ✅ TC-AUTH-003: Invalid credentials rejected

**Steps:**
```bash
POST /api/auth/login {"email":"admin@siamtech.co.th","password":"WrongPassword123"}
```

**Expected:** 401 Unauthorized  
**Actual:** ✅ PASS — `{"error":"Invalid credentials"}` HTTP 401

---

### ✅ TC-AUTH-004: Expired/fake JWT rejected

**Steps:**
```bash
GET /api/invoices -H "Authorization: Bearer <invalid/expired token>"
```

**Expected:** 401  
**Actual:** ✅ PASS — `{"error":"Invalid or expired token"}` HTTP 401

Both invalid format tokens and expired tokens are handled by `jwt.verify()` in `authenticate` middleware and return 401.

---

### ⚠️ TC-AUTH-005: Viewer cannot access admin routes

**Status:** CANNOT TEST — no viewer user exists in DB

**Analysis:**
The test case expects a viewer token to be rejected when calling `POST /api/invoices`. However, the `POST /` route uses **plan-based feature gates** (`hasFeatureAccess(policy, 'create_invoice')`) rather than **role-based guards** (`requireRole`). This means:

1. A viewer user on a **Business plan** CAN create invoices (plan allows it)
2. An admin user on a **Free plan** CANNOT create invoices (plan restricts it)

This is a design choice (feature gates based on billing plan, not role) that makes the TC-AUTH-005 test description inaccurate. The actual protection is:
- `GET /api/invoices` — any authenticated user can list their own invoices (no role gate)
- `POST /api/invoices` — requires `canCreateInvoice` from access policy (plan-gated)
- `POST /:id/issue` — requires `requireRole('admin', 'super_admin', 'accountant')` ✅ role-gated
- `DELETE /:id` — requires `requireRole('admin')` ✅ role-gated

**Finding:** The test case description in the master plan says "viewer cannot create invoices" but the actual implementation uses billing-plan gates, not role gates. The role-based guards exist on sensitive write operations (issue, cancel, delete), but the basic invoice creation is plan-gated.

**Recommendation:** Either update TC-AUTH-005 to reflect the plan-gated behavior, or consider adding a role guard to `POST /` as a belt-and-suspenders approach.

---

### ✅ TC-AUTH-006: Admin cannot access /api/billing/owner/* routes

**Steps:**
```bash
# Admin token
GET /api/billing/owner/summary
Authorization: Bearer <admin_token>
```

**Expected:** 403 Forbidden  
**Actual:** ✅ PASS — `{"error":"Insufficient permissions"}` HTTP 403

**Root cause verified in code:**
```typescript
// billing.ts: route definition
billingRouter.get('/owner/summary', authenticate, requireRole('super_admin'), async ...)

// auth.ts: roleRank
const roleRank = { viewer: 0, accountant: 1, admin: 2, super_admin: 3 }
// admin rank (2) < super_admin rank (3) → access denied
```

---

### ⚠️ TC-RLS-001 to TC-RLS-003: Cross-tenant isolation tests BLOCKED

**Status:** CANNOT TEST — secondary company admin not seeded

**Test requirements:**
- Company A: admin@siamtech.co.th (company-001)
- Company B: admin+1@demo-etax.co.th (company-demo-002 or similar)

**Actual:**
```bash
POST /api/auth/login {"email":"admin+1@demo-etax.co.th","password":"Admin@123456"}
→ {"error":"Invalid credentials"} HTTP 401
```

**Root cause:** The seed script (`backend/src/database/seed.ts`) only runs in `SEED_MODE=full` (not default bootstrap). Extra companies (company-demo-002, etc.) with their admin users are only created when `SEED_MODE=full`. The default bootstrap seed only creates:
- company-001 (actually company-demo-001 via seed.ts) with admin + accountant users
- No second company

**Impact:** TC-RLS-001, TC-RLS-002, TC-RLS-003 cannot be executed without seeding a second company.

**Code analysis (RLS implementation verified via source review):**

The `withRlsContext` / `tenantRlsContext` pattern is correctly applied:
- `GET /api/invoices/:id` uses `withRlsContext(prisma, tenantRlsContext(req.user!), ...)` with `findFirst({ where: { id, companyId: req.user!.companyId } })` — correct RLS boundary
- `POST /api/invoices/:id/payments` uses same pattern — correct
- `PUT /api/customers/:id` uses same pattern — correct

If a Company B admin tried to access Company A's invoice (which doesn't exist in their DB view due to RLS), they would get 404 (not 403, to avoid leaking existence).

---

### ✅ TC-RLS-004: super_admin Owner Control Plane (code verification)

**Status:** ✅ PASS — verified via code analysis

**Route:** `GET /api/billing/owner/summary`  
**Guard:** `requireRole('super_admin')`  
**Implementation:**
```typescript
billingRouter.get('/owner/summary', authenticate, requireRole('super_admin'), async (_req, res) => {
  // Uses raw Prisma queries (NO tenantRlsContext) to access ALL companies
  const [transactions, coupons, pendingSignups] = await Promise.all([
    prisma.billingTransaction.findMany({ ... }), // no RLS filter
    prisma.coupon.findMany({ ... }),
    prisma.pendingSignup.findMany({ ... }),
  ]);
});
```

The route **deliberately bypasses RLS** to enable super_admin cross-tenant access. This is the correct pattern — RLS context is applied on normal tenant routes but not on owner control plane routes.

Non-super_admin users get 403 (verified in TC-AUTH-006).

---

### ⚠️ TC-RLS-005: Audit logs scoped to company

**Status:** PARTIAL — route correctly gated behind plan

**Actual:**
```bash
GET /api/audit?limit=5 -H "Authorization: Bearer <admin_token>"
→ {"error":"Upgrade to Business or Enterprise to access audit logs"} HTTP 403
```

**Root cause:** Current account has `plan: "free"`. The audit route is gated behind `hasFeatureAccess(policy, 'audit_logs')` which returns `false` for Free plan (confirmed in access policy check).

**Code analysis:**
The audit route itself should correctly filter by `companyId: req.user!.companyId` via `withRlsContext` + `tenantRlsContext`. The gating is appropriate (Business+ only), but can't be tested without a paid plan account.

---

## Integration Test Status

**Test files found:**
- `backend/src/routes/tenant-isolation.integration.test.ts` — 3 tests
- `backend/src/routes/invoices.integration.test.ts` — 3 tests
- `backend/src/routes/payments.integration.test.ts` — 1 test

**Test execution results:**
```bash
$ cd backend && npx tsx --test src/routes/tenant-isolation.integration.test.ts

❌ tenant isolation: another company cannot read or mutate foreign resources
   → AssertionError: login should succeed for admin+1@demo-etax.co.th (401 !== 200)

❌ tenant RLS: customer routes still work for the owning company  
   → PrismaClientInitializationError: User `` was denied access

❌ tenant RLS: product and template routes still work for the owning company
   → PrismaClientInitializationError: User `` was denied access
```

**Problems identified:**
1. **Secondary company not seeded** — `admin+1@demo-etax.co.th` doesn't exist
2. **Prisma test environment not configured** — tests use `process.env` but no `.env.test` exists; the error `User '' was denied access` suggests `DATABASE_URL` env var is empty or wrong for the test runner
3. **ES module warning** — test file uses `import` syntax but `package.json` doesn't have `"type": "module"`

---

## Bugs Found

### 🔴 BUG-001: Missing test fixtures — secondary company not seeded

**Severity:** High  
**Impact:** TC-RLS-001, TC-RLS-002, TC-RLS-003, TC-RLS-004 cannot be automated  
**Description:** The integration test suite requires `admin+1@demo-etax.co.th` (a second company's admin) but this user is only created when `SEED_MODE=full`. Default bootstrap seed does not create secondary companies.

**Fix required:** Either:
1. Ensure `SEED_MODE=full` is used when seeding for testing, OR
2. Add a minimal second company + admin user in the bootstrap seed, OR
3. Add a setup script that creates the second company before running integration tests

### 🟡 BUG-002: Logout is a no-op (stateless JWT)

**Severity:** Low  
**Impact:** Users expect logout to invalidate their token server-side  
**Description:** `POST /api/auth/logout` returns `{"message":"Logged out successfully"}` but does nothing — the JWT remains valid until expiry. This is expected behavior for stateless JWTs but may confuse users.

**Recommendation:** Document this clearly. If server-side logout is required, implement a token blocklist in Redis with TTL matching token expiry.

### 🟡 BUG-003: TC-AUTH-005 test case doesn't match implementation

**Severity:** Medium  
**Impact:** The test case expects role-based rejection for viewer on invoice creation, but the actual implementation uses plan-based feature gates

**Description:** 
- Test case says: "viewer cannot create invoices" → expect 403
- Actual behavior: viewer on Business plan CAN create invoices; admin on Free plan CANNOT

**Recommendation:** Update TC-AUTH-005 to reflect the plan-gated design, or add role guard to `POST /` route.

### 🟡 BUG-004: Integration tests require environment variables

**Severity:** Medium  
**Impact:** Integration tests fail without `.env` with `TEST_ADMIN_EMAIL`, `TEST_SECONDARY_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `DATABASE_URL`

**Fix:** Add `.env.test` or document the required env vars for running integration tests.

---

## Next Steps

### Immediate (fixes before re-running Phase 1)

1. **Seed secondary company** — run seed with `SEED_MODE=full node backend/src/database/seed.ts` OR add minimal second company to bootstrap seed
2. **Verify integration test env vars** — create `.env.test` with required variables
3. **Re-run tenant isolation tests** after fixing fixtures

### Phase 1 completion checklist (after fixes)

- [ ] TC-RLS-001: Company A cannot read Company B's invoices — run integration test or manual curl
- [ ] TC-RLS-002: Company A cannot create payments on Company B's invoices — run integration test
- [ ] TC-RLS-003: Company A cannot update Company B's customers — run integration test
- [ ] TC-RLS-005: Audit logs scoped to company — test with Business plan account

### Phase 2 onward

- [ ] Phase 2: Customer CRUD + Product CRUD + Invoice number generation
- [ ] Phase 3: Invoice lifecycle (create → issue → submit → cancel)
- [ ] Phase 4: WHT certificates
- [ ] Phase 5: PP.30 & VAT reporting
- [ ] Phase 6: Purchase invoices & expenses
- [ ] Phase 7: LINE OA integration
- [ ] Phase 8: Billing & subscriptions
- [ ] Phase 9: Dashboard & reporting
- [ ] Phase 10: Owner Control Plane (super_admin)
- [ ] Phase 11: Edge cases

---

## Appendix: Auth Route Analysis

| Route | Auth Required | Role Guard | Feature Gate | Notes |
|-------|--------------|------------|--------------|-------|
| POST /api/auth/login | No | — | — | |
| POST /api/auth/google | No | — | — | |
| POST /api/auth/logout | No | — | — | No-op (stateless JWT) |
| GET /api/auth/me | Yes | — | — | |
| GET /api/invoices | Yes | — | — | List scoped by companyId |
| POST /api/invoices | Yes | No | ✅ canCreateInvoice | Plan-gated |
| GET /api/invoices/:id | Yes | — | — | RLS-scoped |
| PATCH /api/invoices/:id | Yes | — | — | RLS-scoped |
| DELETE /api/invoices/:id | Yes | ✅ admin | — | Role-gated |
| POST /:id/issue | Yes | ✅ admin/super_admin/accountant | ✅ canCreateInvoice | |
| POST /:id/submit-rd | Yes | ✅ admin/accountant | ✅ submit_rd | |
| POST /:id/cancel | Yes | ✅ admin/super_admin/accountant | — | |
| GET /api/billing/owner/summary | Yes | ✅ super_admin | — | No RLS (bypass for owner) |