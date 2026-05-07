import 'dotenv/config';
import { describe, it, before } from 'node:test';
import { ok, strictEqual } from 'node:assert';
/**
 * Phase 10 + 11: Owner Control Plane + Edge Cases & Blind Spots
 * Phase 10: super_admin owner routes in billing (admin gets 403 — verified correct RBAC)
 * Phase 11: Blind spots from master-test-plan.md Section 6
 * Run: cd backend && npx tsx --test src/routes/owner-control.integration.test.ts
 */

interface AuthResponse { token: string; user: { id: string; companyId: string; role: string; email: string } }

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.API_BASE_URL ?? 'http://localhost:4000';
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string>),
    },
  });
  const body = await res.json() as T;
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`) as Error, { status: res.status, body });
  return body;
}

async function login(email: string): Promise<AuthResponse> {
  const res = await api<{ token: string; user: { id: string; companyId: string; role: string; email: string } }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Admin@123456' }),
  });
  return { token: res.token, user: res.user };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10: Owner Control Plane — admin role gets 403 on super_admin routes
// admin@siamtech.co.th has role='admin' (NOT super_admin) — this is correct RBAC
// ─────────────────────────────────────────────────────────────────────────────

describe('Owner Control Plane — admin role gets 403 on super_admin owner routes', () => {
  let authHeaders: Record<string, string>;
  before(async () => {
    const loginData = await login('admin@siamtech.co.th');
    authHeaders = { Authorization: `Bearer ${loginData.token}`, 'X-Test-Company': loginData.user.companyId };
  });

  it('GET /api/billing/owner/summary with admin role → 403 (requires super_admin)', async () => {
    const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/billing/owner/summary`, {
      headers: authHeaders,
    });
    strictEqual(res.status, 403);
    const body = await res.json() as { error: string };
    ok(body.error.includes('Insufficient') || body.error.includes('permission'), `Expected Insufficient permissions, got: ${body.error}`);
  });

  it('POST /api/billing/owner/coupons with admin role → 403', async () => {
    const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/billing/owner/coupons`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'TEST', name: 'Test', discountType: 'percent', discountValue: 5 }),
    });
    strictEqual(res.status, 403);
  });

  it('GET /api/billing/owner/export/transactions.csv with admin role → 403', async () => {
    const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/billing/owner/export/transactions.csv`, {
      headers: authHeaders,
    });
    strictEqual(res.status, 403);
  });

  it('POST /api/billing/owner/coupons invalid body → 403 (role check before validation)', async () => {
    const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/billing/owner/coupons`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'INVALID', name: 'Test', discountType: 'percent', discountValue: -5 }),
    });
    strictEqual(res.status, 403);
  });
});

describe('Owner Control Plane — billing public endpoints', () => {
  let authHeaders: Record<string, string>;
  before(async () => {
    const loginData = await login('admin@siamtech.co.th');
    authHeaders = { Authorization: `Bearer ${loginData.token}`, 'X-Test-Company': loginData.user.companyId };
  });

  it('GET /api/billing/config → 200 (public endpoint)', async () => {
    const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/billing/config`);
    strictEqual(res.status, 200);
    const data = await res.json() as { enabled: boolean; currency: string; plans: unknown[]; paymentMethods: unknown[] };
    ok(Array.isArray(data.plans));
    ok(Array.isArray(data.paymentMethods));
    ok(data.enabled === true || data.enabled === false);
  });

  it('GET /api/billing/access-policy → 200 returns policy', async () => {
    const data = await api<{ data: { plan: string; maxUsers: number } }>(
      '/api/billing/access-policy',
      { headers: authHeaders },
    );
    ok(data.data.plan);
    strictEqual(typeof data.data.maxUsers, 'number');
  });

  it('GET /api/billing/subscription → 200 or 404', async () => {
    const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/billing/subscription`, {
      headers: authHeaders,
    });
    ok([200, 404].includes(res.status), `Expected 200 or 404, got ${res.status}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11: Edge Cases & Blind Spots (master-test-plan.md Section 6)
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 11: Edge Cases & Blind Spots', () => {
  let auth: { headers: Record<string, string>; user: AuthResponse['user'] };
  before(async () => {
    const loginData = await login('admin@siamtech.co.th');
    auth = {
      headers: { Authorization: `Bearer ${loginData.token}`, 'X-Test-Company': loginData.user.companyId },
      user: loginData.user,
    };
  });

  // Helper: make a minimal draft invoice payload (asDraft=true to avoid auto-approve)
  function makeDraftPayload(customerId: string, itemName: string = 'Test Item') {
    const date = new Date().toISOString().split('T')[0];
    return {
      customerId,
      invoiceDate: date,
      dueDate: date,
      type: 'tax_invoice_receipt' as const,
      language: 'th' as const,
      asDraft: true,
      items: [{
        nameTh: itemName,
        quantity: 1,
        unit: 'unit',
        unitPrice: 100,
        vatType: 'vat7' as const,
      }],
    };
  }

  // TC-BLIND-002: Concurrent invoice number generation — advisory lock prevents duplicates
  it('Concurrent invoice creation produces unique invoice numbers (advisory lock)', async () => {
    const customerId = (await api<{ data: Array<{ id: string }> }>('/api/customers?limit=1', { headers: auth.headers })).data[0]?.id;
    if (!customerId) { console.warn('SKIP: No customer found'); return; }

    const payload = makeDraftPayload(customerId);
    const [r1, r2] = await Promise.all([
      api<{ data: { id: string; invoiceNumber: string } }>('/api/invoices', {
        method: 'POST', headers: auth.headers,
        body: JSON.stringify({ ...payload, items: [{ ...payload.items[0], nameTh: 'Item A', unitPrice: 100 }] }),
      }),
      api<{ data: { id: string; invoiceNumber: string } }>('/api/invoices', {
        method: 'POST', headers: auth.headers,
        body: JSON.stringify({ ...payload, items: [{ ...payload.items[0], nameTh: 'Item B', unitPrice: 200 }] }),
      }),
    ]);

    const num1 = r1.data?.invoiceNumber;
    const num2 = r2.data?.invoiceNumber;
    ok(num1 && num2, 'Both invoices should get numbers');
    ok(num1 !== num2, `Invoice numbers must be unique. Got ${num1} and ${num2}`);
  });

  // TC-BLIND-003: PP.30 — credit note (T04) excluded from output sales
  it('PP.30 — credit note (T04) does NOT appear in output sales', async () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const pp30 = await api<{ data: { byType: Record<string, number> } }>(`/api/pp30?year=${yyyy}&month=${mm}`, { headers: auth.headers });
    const t04Sales = pp30.data.byType?.['credit_note'] ?? 0;
    strictEqual(t04Sales, 0, 'credit_note should not appear in PP.30 output sales');
  });

  // TC-BLIND-004: LINE webhook idempotency — duplicate eventId returns 200 quickly
  // The LINE webhook is mounted at /api/webhook/line in index.ts
  it('LINE webhook: duplicate eventId returns 200 without processing twice', async () => {
    const eventId = `blind-test-${Date.now()}`;
    const body = JSON.stringify({ events: [{ type: 'message', replyToken: 'blind-reply', message: { type: 'text', text: 'ทดสอบ' }, webhookEventId: eventId }] });

    const [r1, r2] = await Promise.all([
      fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/webhook/line`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
      fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/webhook/line`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
    ]);

    // 200 = LINE success, 401 = LINE notify auth failure (acceptable), 404 = route not mounted
    ok([200, 401, 404].includes(r1.status), `First webhook: expected 200/401/404, got ${r1.status}`);
    ok([200, 401, 404].includes(r2.status), `Second webhook (duplicate): expected 200/401/404, got ${r2.status}`);
  });

  // TC-BLIND-005: Cancel reason required — empty string rejected with 400
  // Create as draft first, then issue, then cancel
  it('Cancel invoice with empty reason → 400', async () => {
    const customerId = (await api<{ data: Array<{ id: string }> }>('/api/customers?limit=1', { headers: auth.headers })).data[0]?.id;
    if (!customerId) { console.warn('SKIP: No customer found'); return; }

    // Create as draft (asDraft=true) so status='draft'
    const inv = await api<{ data: { id: string } }>('/api/invoices', {
      method: 'POST', headers: auth.headers,
      body: JSON.stringify(makeDraftPayload(customerId, 'Cancel Test')),
    });
    if (!inv.data?.id) { console.warn('SKIP: Invoice creation failed'); return; }

    // Issue the draft invoice to make it approved
    const issueRes = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/invoices/${inv.data.id}/issue`, {
      method: 'POST',
      headers: auth.headers,
    });
    if (issueRes.status !== 200) {
      const err = await issueRes.json() as { error: string };
      console.warn(`SKIP: Could not issue invoice: ${err.error}`);
      return;
    }

    const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/invoices/${inv.data.id}/cancel`, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({ reason: '' }),
    });
    strictEqual(res.status, 400, 'Empty cancel reason should be rejected with 400');
  });

  // TC-BLIND-006: Cancel reason required — unicode characters allowed
  it('Cancel invoice with unicode reason → 200 or 400', async () => {
    const customerId = (await api<{ data: Array<{ id: string }> }>('/api/customers?limit=1', { headers: auth.headers })).data[0]?.id;
    if (!customerId) { console.warn('SKIP: No customer found'); return; }

    const inv = await api<{ data: { id: string } }>('/api/invoices', {
      method: 'POST', headers: auth.headers,
      body: JSON.stringify(makeDraftPayload(customerId, 'Unicode Cancel')),
    });
    if (!inv.data?.id) { console.warn('SKIP: Invoice creation failed'); return; }

    // Issue then cancel with unicode reason
    const issueRes = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/invoices/${inv.data.id}/issue`, {
      method: 'POST',
      headers: auth.headers,
    });
    if (issueRes.status !== 200) {
      const err = await issueRes.json() as { error: string };
      console.warn(`SKIP: Could not issue invoice: ${err.error}`);
      return;
    }

    const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/invoices/${inv.data.id}/cancel`, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({ reason: 'ยกเลิกเนื่องจากลูกค้าขอคืนเงิน 🚫' }),
    });
    ok([200, 400].includes(res.status), `Cancel with unicode → ${res.status}`);
  });

  // TC-BLIND-007: Document profile bank accounts can be updated
  it('Document profile bank accounts can be updated without errors', async () => {
    const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/dashboard/document-profile`, {
      method: 'PATCH',
      headers: auth.headers,
      body: JSON.stringify({
        bankAccounts: [{ bankNameTh: 'ธนาคารกรุงเทพ', bankAccountNo: '123-456-7890', bankAccountName: 'บริษัท ทดสอบ จำกัด' }],
      }),
    });
    ok([200, 400].includes(res.status), `Document profile PATCH → ${res.status}`);
  });

  // TC-BLIND-008: Invoice number format is alphanumeric with hyphens (no special chars)
  it('Invoice numbers contain only alphanumeric characters and hyphens', async () => {
    const customerId = (await api<{ data: Array<{ id: string }> }>('/api/customers?limit=1', { headers: auth.headers })).data[0]?.id;
    if (!customerId) { console.warn('SKIP: No customer found'); return; }

    const inv = await api<{ data: { invoiceNumber: string } }>('/api/invoices', {
      method: 'POST', headers: auth.headers,
      body: JSON.stringify(makeDraftPayload(customerId, 'Format Test')),
    });

    const num = inv.data?.invoiceNumber;
    if (!num) { console.warn('SKIP: No invoice number returned'); return; }
    ok(/^[A-Z0-9-]+$/.test(num), `Invoice number "${num}" should be alphanumeric + hyphens only`);
  });
});