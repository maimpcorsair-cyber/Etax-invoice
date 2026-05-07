import 'dotenv/config';
import { describe, it, before } from 'node:test';
import { ok, strictEqual, notStrictEqual } from 'node:assert';
/**
 * Phase 9: Dashboard & Reporting Integration Tests
 * Covers: TC-DASH-001 through TC-DASH-004 + bonus rd-compliance
 * Run: cd backend && npx tsx --test src/routes/dashboard.integration.test.ts
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

async function adminAuth() {
  const { token, user } = await login('admin@siamtech.co.th');
  return {
    headers: { Authorization: `Bearer ${token}`, 'X-Test-Company': user.companyId },
    token,
    user,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-DASH-001/002: GET /api/dashboard/stats — revenue totals and receivables aging
// ─────────────────────────────────────────────────────────────────────────────
describe('TC-DASH-001/002: GET /api/dashboard/stats — revenue & receivables', () => {
  let auth: { headers: Record<string, string>; user: { companyId: string } };

  before(async () => {
    auth = await adminAuth();
  });

  it('returns 200 with stats structure', async () => {
    const data = await api<{ data: Record<string, unknown> }>('/api/dashboard/stats', {
      headers: auth.headers,
    });
    ok(data.data);
    strictEqual(typeof data.data.totalInvoices, 'number');
    strictEqual(typeof data.data.totalRevenue, 'number');
  });

  it('includes receivables aging breakdown', async () => {
    const data = await api<{ data: { receivables: Record<string, unknown> } }>('/api/dashboard/stats', {
      headers: auth.headers,
    });
    const recv = data.data.receivables as Record<string, unknown>;
    ok(typeof recv.totalOutstanding === 'number');
    ok(typeof recv.overdueOutstanding === 'number');
    ok(typeof recv.currentOutstanding === 'number');
    ok(recv.aging);
    const aging = recv.aging as Record<string, number>;
    strictEqual(typeof aging.current, 'number');
    strictEqual(typeof aging.days1To30, 'number');
    strictEqual(typeof aging.days31To60, 'number');
    strictEqual(typeof aging.days61To90, 'number');
    strictEqual(typeof aging.days90Plus, 'number');
  });

  it('includes monthly revenue array', async () => {
    const data = await api<{ data: { monthlyRevenue: unknown[] } }>('/api/dashboard/stats', {
      headers: auth.headers,
    });
    ok(Array.isArray(data.data.monthlyRevenue));
  });

  it('includes rd submission counts', async () => {
    const data = await api<{ data: Record<string, unknown> }>('/api/dashboard/stats', {
      headers: auth.headers,
    });
    strictEqual(typeof data.data.rdSuccessCount, 'number');
    strictEqual(typeof data.data.rdPendingCount, 'number');
    strictEqual(typeof data.data.pendingCount, 'number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-DASH-003: Customer statement generation
// ─────────────────────────────────────────────────────────────────────────────
describe('TC-DASH-003: Customer statement generation', () => {
  let auth: { headers: Record<string, string> };
  let customerId: string;

  before(async () => {
    auth = await adminAuth();
    // Fetch first customer via HTTP API (no Prisma client init in test)
    const base = process.env.API_BASE_URL ?? 'http://localhost:4000';
    const res = await fetch(`${base}/api/customers?limit=1`, { headers: auth.headers });
    if (!res.ok) throw new Error(`Failed to fetch customers: ${res.status}`);
    const json = await res.json() as { data: Array<{ id: string }> };
    if (!Array.isArray(json.data) || !json.data.length) throw new Error('No customer found for company-001 — run seed first');
    customerId = json.data[0].id;
  });

  it('GET /api/customers/:id/statement → 200 with statement data', async () => {
    const data = await api<{ data: Record<string, unknown> }>(
      `/api/customers/${customerId}/statement`,
      { headers: auth.headers },
    );
    ok(data.data);
    ok('entries' in data.data || 'customer' in data.data, 'Expected entries or customer field');
  });

  it('GET /api/customers/:id/statement/pdf → 200 or 302', async () => {
    const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/customers/${customerId}/statement/pdf`, {
      headers: auth.headers,
    });
    notStrictEqual(res.status, 400);
    notStrictEqual(res.status, 401);
    notStrictEqual(res.status, 403);
    ok([200, 302, 303].includes(res.status), `Expected 200/302/303, got ${res.status}`);
  });

  it('GET /api/customers/:id/statement/export → 200 or 302', async () => {
    const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/customers/${customerId}/statement/export`, {
      headers: auth.headers,
    });
    ok([200, 302].includes(res.status), `Expected 200 or 302, got ${res.status}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-DASH-004: Invoice Excel export
// ─────────────────────────────────────────────────────────────────────────────
describe('TC-DASH-004: Invoice Excel export', () => {
  let auth: { headers: Record<string, string> };

  before(async () => {
    auth = await adminAuth();
  });

  it('GET /api/invoices/export/excel → 200 with spreadsheet content', async () => {
    const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/invoices/export/excel`, {
      headers: auth.headers,
    });
    strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type') ?? '';
    ok(
      contentType.includes('spreadsheet') ||
      contentType.includes('excel') ||
      contentType.includes('csv') ||
      contentType.includes('sheet'),
      `Expected spreadsheet content-type, got: ${contentType}`,
    );
  });

  it('GET /api/invoices/export/excel?month=2025-01 → 200 or 204', async () => {
    const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/invoices/export/excel?month=2025-01`, {
      headers: auth.headers,
    });
    ok([200, 204].includes(res.status), `Expected 200 or 204, got ${res.status}`);
  });

  it('unauthenticated → 401', async () => {
    const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/invoices/export/excel`);
    strictEqual(res.status, 401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bonus: GET /api/dashboard/rd-compliance — monthly compliance data
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/dashboard/rd-compliance', () => {
  let auth: { headers: Record<string, string> };

  before(async () => {
    auth = await adminAuth();
  });

  it('returns 200 with compliance array', async () => {
    const data = await api<{ data: unknown[] }>('/api/dashboard/rd-compliance', {
      headers: auth.headers,
    });
    ok(Array.isArray(data.data));
    ok(data.data.length > 0, 'Expected at least one month of compliance data');
    const month = data.data[0] as Record<string, unknown>;
    strictEqual(typeof month.month, 'string');
    strictEqual(typeof month.complianceRate, 'number');
  });
});