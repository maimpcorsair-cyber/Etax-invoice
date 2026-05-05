/**
 * k6 Load Test Script for Thai e-Tax Invoice System
 * =================================================
 * Multi-phase load test covering baseline, scale-up, sustained, spike, and target scenarios.
 *
 * Usage:
 *   k6 run load-test.js
 *   k6 run load-test.js -e BASE_URL=http://localhost:4000
 *   k6 run load-test.js -e LOAD_PROFILE=baseline
 *   k6 run load-test.js -e LOAD_PROFILE=sustained -e WRITE_TESTS=true
 *
 * Environment variables:
 *   BASE_URL         - API base URL (default: http://localhost:4000)
 *   ADMIN_EMAIL     - Admin login email (default: admin@siamtech.co.th)
 *   ADMIN_PASSWORD  - Admin login password (default: Admin@123456)
 *   DURATION_MULT   - Speed multiplier for faster test runs (default: 1)
 *   LOAD_PROFILE    - smoke | baseline | scale | sustained | spike | target | all (default: smoke)
 *   WRITE_TESTS     - Set true to create draft invoices during the test (default: false)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import encoding from 'k6/encoding';
import { Counter, Rate, Trend } from 'k6/metrics';

// ─── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@siamtech.co.th';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'Admin@123456';
const DURATION_MULT = parseFloat(__ENV.DURATION_MULT || '1');
const LOAD_PROFILE = __ENV.LOAD_PROFILE || 'smoke';
const WRITE_TESTS = (__ENV.WRITE_TESTS || '').toLowerCase() === 'true';

// ─── Custom Metrics ────────────────────────────────────────────────────────────

const appHttpReqDuration = new Trend('app_http_req_duration');
const appHttpReqFailed = new Rate('app_http_req_failed');
const loginDuration = new Trend('login_duration');
const invoicesListDuration = new Trend('invoices_list_duration');
const dashboardStatsDuration = new Trend('dashboard_stats_duration');
const customersListDuration = new Trend('customers_list_duration');
const invoiceCreateDuration = new Trend('invoice_create_duration');

const loginSuccess = new Counter('login_success');
const loginFailure = new Counter('login_failure');
const tokenRefresh = new Counter('token_refresh');
const unauthorizedErrors = new Counter('unauthorized_errors');

// ─── Shared State ─────────────────────────────────────────────────────────────

let authToken = '';
let userId = '';
let companyId = '';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Performs login and stores the token for subsequent requests.
 * Re-logins automatically if token is invalid (401 response).
 */
function ensureAuth() {
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  loginDuration.add(loginRes.timings.duration);

  if (loginRes.status === 200) {
    const body = loginRes.json();
    authToken = body.token;
    const payload = parseJwt(body.token);
    userId = payload.userId;
    companyId = payload.companyId;
    loginSuccess.add(1);
    return true;
  }

  loginFailure.add(1);
  console.error(`Login failed: ${loginRes.status} ${loginRes.body}`);
  return false;
}

/**
 * Minimal JWT parser (avoids external dependencies in k6).
 */
function parseJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return {};
  const payloadSegment = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const paddedPayload = payloadSegment.padEnd(payloadSegment.length + ((4 - payloadSegment.length % 4) % 4), '=');
  const payload = JSON.parse(encoding.b64decode(paddedPayload, 'std', 's'));
  return payload;
}

/**
 * Makes an authenticated GET request with built-in 401 re-login handling.
 */
function authGet(path, metrics) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${authToken}` },
    tags: { name: path },
  });

  metrics.add(res.timings.duration);
  appHttpReqDuration.add(res.timings.duration);
  appHttpReqFailed.add(res.status >= 400 ? 1 : 0);

  // Handle token expiration
  if (res.status === 401) {
    unauthorizedErrors.add(1);
    if (ensureAuth()) {
      return authGet(path, metrics);
    }
  }

  return res;
}

/**
 * Makes an authenticated POST request with built-in 401 re-login handling.
 */
function authPost(path, body, metrics) {
  const res = http.post(
    `${BASE_URL}${path}`,
    JSON.stringify(body),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      tags: { name: path },
    }
  );

  metrics.add(res.timings.duration);
  appHttpReqDuration.add(res.timings.duration);
  appHttpReqFailed.add(res.status >= 400 ? 1 : 0);

  // Handle token expiration
  if (res.status === 401) {
    unauthorizedErrors.add(1);
    if (ensureAuth()) {
      return authPost(path, body, metrics);
    }
  }

  return res;
}

// ─── Test Scenarios ───────────────────────────────────────────────────────────

/**
 * Default smoke test.
 * Low traffic, read-only, safe enough for a quick local/deployment health check.
 */
export const smokeScenario = {
  executor: 'shared-iterations',
  vus: 1,
  iterations: 1,
  maxDuration: `${30 * DURATION_MULT}s`,
  tags: { phase: 'smoke' },
};

/**
 * Phase 1: Baseline
 * 100 VUs, 2 minutes
 * Tests core read endpoints at moderate load.
 */
export const baselineScenario = {
  executor: 'ramping-vus',
  startVUs: 0,
  stages: [
    { duration: `${30 * DURATION_MULT}s`, target: 100 },
    { duration: `${90 * DURATION_MULT}s`, target: 100 },
  ],
  tags: { phase: 'baseline' },
};

/**
 * Phase 2: Scale Up
 * 500 VUs, 3 minutes
 * Tests system behavior as load increases 5x.
 */
export const scaleUpScenario = {
  executor: 'ramping-vus',
  startVUs: 100,
  stages: [
    { duration: `${30 * DURATION_MULT}s`, target: 300 },
    { duration: `${30 * DURATION_MULT}s`, target: 500 },
    { duration: `${120 * DURATION_MULT}s`, target: 500 },
  ],
  tags: { phase: 'scale_up' },
};

/**
 * Phase 3: Sustained
 * 1000 VUs, 5 minutes
 * Tests system under high sustained load including write operations.
 * Threshold: http_req_duration p(95) < 500ms
 */
export const sustainedScenario = {
  executor: 'ramping-vus',
  startVUs: 500,
  stages: [
    { duration: `${60 * DURATION_MULT}s`, target: 1000 },
    { duration: `${240 * DURATION_MULT}s`, target: 1000 },
  ],
  tags: { phase: 'sustained' },
};

/**
 * Phase 4: Spike
 * 5000 VUs instant spike, 1 minute
 * Tests system resilience to sudden traffic bursts.
 */
export const spikeScenario = {
  executor: 'ramping-arrival-rate',
  startRate: 1,
  timeUnit: '1s',
  preAllocatedVUs: 5000,
  maxVUs: 6000,
  stages: [
    { duration: `${10 * DURATION_MULT}s`, target: 5000 },
    { duration: `${50 * DURATION_MULT}s`, target: 5000 },
  ],
  tags: { phase: 'spike' },
};

/**
 * Phase 5: Target
 * 10000 VUs, 10 minutes
 * Full 10K concurrent users test — the ultimate stress test.
 */
export const targetScenario = {
  executor: 'ramping-vus',
  startVUs: 0,
  stages: [
    { duration: `${60 * DURATION_MULT}s`, target: 3000 },
    { duration: `${120 * DURATION_MULT}s`, target: 7000 },
    { duration: `${300 * DURATION_MULT}s`, target: 10000 },
    { duration: `${120 * DURATION_MULT}s`, target: 10000 },
  ],
  tags: { phase: 'target' },
};

// ─── Per-VU Logic ─────────────────────────────────────────────────────────────

function getScenarios() {
  switch (LOAD_PROFILE) {
    case 'smoke':
      return { smoke: smokeScenario };
    case 'baseline':
      return { baseline: baselineScenario };
    case 'scale':
    case 'scale_up':
      return { scale_up: scaleUpScenario };
    case 'sustained':
      return { sustained: sustainedScenario };
    case 'spike':
      return { spike: spikeScenario };
    case 'target':
      return { target: targetScenario };
    case 'all':
      return {
        baseline: baselineScenario,
        scale_up: scaleUpScenario,
        sustained: sustainedScenario,
        spike: spikeScenario,
        target: targetScenario,
      };
    default:
      throw new Error(`Unknown LOAD_PROFILE "${LOAD_PROFILE}". Use smoke, baseline, scale, sustained, spike, target, or all.`);
  }
}

function getThresholds() {
  if (LOAD_PROFILE === 'smoke') {
    return {
      'http_req_failed': ['rate<0.01'],
    };
  }

  return {
    // Global thresholds
    'http_req_duration{cr:false}': ['p(95)<500'],
    'http_req_duration': ['p(95)<800'],
    'http_req_failed': ['rate<0.05'],
    // Endpoint-specific thresholds
    'invoices_list_duration': ['p(95)<500', 'p(99)<1000'],
    'dashboard_stats_duration': ['p(95)<500', 'p(99)<1000'],
    'customers_list_duration': ['p(95)<500', 'p(99)<1000'],
    'invoice_create_duration': ['p(95)<1000', 'p(99)<2000'],
  };
}

export const options = {
  scenarios: getScenarios(),
  thresholds: getThresholds(),
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
};

export function setup() {
  console.log(`[setup] Connecting to: ${BASE_URL}`);
  console.log(`[setup] Duration multiplier: ${DURATION_MULT}x`);
  console.log(`[setup] Load profile: ${LOAD_PROFILE}`);
  console.log(`[setup] Write tests: ${WRITE_TESTS ? 'enabled' : 'disabled'}`);

  // Initial login to verify credentials and obtain token
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (res.status !== 200) {
    console.error(`[setup] Login failed: ${res.status} ${res.body}`);
    throw new Error(`Setup failed: admin login returned ${res.status}`);
  }

  const body = res.json();
  authToken = body.token;
  const payload = parseJwt(body.token);
  userId = payload.userId;
  companyId = payload.companyId;

  console.log(`[setup] Login successful — userId: ${userId}, companyId: ${companyId}`);

  return { token: authToken, userId, companyId };
}

export function handleSummary(data) {
  // Build pass/fail summary per endpoint
  const endpointSummary = {};
  for (const [key, value] of Object.entries(data.metrics)) {
    if (key.startsWith('http_req_duration') && value.type === 'Trend') {
      const name = key.replace('http_req_duration{', '').replace('}', '') || 'ALL';
      endpointSummary[name] = {
        avg: value.values.avg?.toFixed(2) ?? 'N/A',
        p95: value.values['p(95)']?.toFixed(2) ?? 'N/A',
        p99: value.values['p(99)']?.toFixed(2) ?? 'N/A',
        failRate: data.metrics['http_req_failed']?.values?.rate?.toFixed(4) ?? 'N/A',
      };
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  k6 Load Test Summary — Thai e-Tax Invoice System');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Base URL:      ${BASE_URL}`);
  console.log(`  Test Email:    ${ADMIN_EMAIL}`);
  console.log(`  Total VUs:     ${data.state['test_run_duration']}`);
  console.log('');

  for (const [name, stats] of Object.entries(endpointSummary)) {
    const p95 = parseFloat(stats.p95);
    const threshold = name === 'invoice_create_duration' ? 1000 : 500;
    const status = p95 < threshold ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status}  ${name.padEnd(30)} p(95): ${stats.p95}ms`);
  }

  console.log('');
  console.log(`  ✅ login_success:     ${data.metrics['login_success']?.values?.count ?? 0}`);
  console.log(`  ❌ login_failure:     ${data.metrics['login_failure']?.values?.count ?? 0}`);
  console.log(`  ↻ token_refresh:       ${data.metrics['token_refresh']?.values?.count ?? 0}`);
  console.log(`  ⚠️  unauthorized_errors: ${data.metrics['unauthorized_errors']?.values?.count ?? 0}`);
  console.log('═══════════════════════════════════════════════════\n');

  return {};
}

export default function(data) {
  authToken = data.token;
  userId = data.userId;
  companyId = data.companyId;

  // ── GET /api/invoices (list) ──────────────────────────────────────────────

  const invoiceRes = authGet('/api/invoices', invoicesListDuration);
  check(invoiceRes, {
    'invoices list: status is 200': (r) => r.status === 200,
    'invoices list: has data array': (r) => Array.isArray(r.json().data),
    'invoices list: response time < 1s': (r) => r.timings.duration < 1000,
  });

  sleep(Math.random() * 2 + 0.5); // 0.5–2.5s think time

  // ── GET /api/dashboard/stats ─────────────────────────────────────────────

  const statsRes = authGet('/api/dashboard/stats', dashboardStatsDuration);
  check(statsRes, {
    'dashboard stats: status is 200': (r) => r.status === 200,
    'dashboard stats: is object': (r) => typeof r.json() === 'object',
    'dashboard stats: response time < 1s': (r) => r.timings.duration < 1000,
  });

  sleep(Math.random() * 1.5 + 0.5); // 0.5–2s think time

  // ── GET /api/customers ────────────────────────────────────────────────────

  const customersRes = authGet('/api/customers', customersListDuration);
  check(customersRes, {
    'customers list: status is 200': (r) => r.status === 200,
    'customers list: has data array': (r) => Array.isArray(r.json().data),
    'customers list: response time < 1s': (r) => r.timings.duration < 1000,
  });

  sleep(Math.random() * 1 + 0.5); // 0.5–1.5s think time

  // ── Optional write test: POST /api/invoices (create draft) ───────────────
  // Disabled by default so a quick smoke/deployment test never creates data.

  if (WRITE_TESTS && authToken) {
    const invoiceBody = {
      type: 'T01',
      customerId: null, // Will use first available customer
      seller: {
        nameTh: 'บริษัท สยามเทค จำกัด',
        taxId: '0105545123456',
        branchId: '00000',
        email: 'invoices@siamtech.co.th',
      },
      lineItems: [
        {
          description: 'Load test item',
          quantity: 1,
          unitPrice: 1000,
          vatRate: 7,
        },
      ],
      paymentMethod: 'cash',
    };

    const createRes = authPost('/api/invoices', invoiceBody, invoiceCreateDuration);
    check(createRes, {
      'invoice create: status is 200 or 201': (r) => r.status === 200 || r.status === 201,
      'invoice create: has id or invoiceId': (r) => !!(r.json().id || r.json().invoiceId),
      'invoice create: response time < 2s': (r) => r.timings.duration < 2000,
    });

    sleep(Math.random() * 2 + 1); // 1–3s think time after write
  }
}
