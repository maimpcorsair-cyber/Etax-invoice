import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer, { type Browser, type Page } from 'puppeteer';

type AuthPayload = {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'super_admin' | 'admin' | 'accountant' | 'viewer';
    companyId: string;
    auth?: {
      hasPassword: boolean;
      hasGoogle: boolean;
    };
    company?: {
      nameTh: string;
      nameEn?: string | null;
      taxId: string;
    };
  };
};

const apexOrigin = process.env.TEST_APEX_ORIGIN ?? 'http://localhost:3000';
const appOrigin = process.env.TEST_APP_ORIGIN ?? 'http://app.localhost:3000';
const opsOrigin = process.env.TEST_OPS_ORIGIN ?? 'http://ops.localhost:3000';

const superAdminEmail = process.env.TEST_ADMIN_EMAIL ?? 'admin@siamtech.co.th';
const superAdminPassword = process.env.TEST_ADMIN_PASSWORD ?? 'Admin@123456';
const tenantEmail = process.env.TEST_ACCOUNTANT_EMAIL ?? 'accountant@siamtech.co.th';
const tenantPassword = process.env.TEST_ACCOUNTANT_PASSWORD ?? 'Account@123456';

const superAdmin: AuthPayload = {
  token: 'test-super-admin-token',
  user: {
    id: 'user-admin-001',
    email: superAdminEmail,
    name: 'ผู้ดูแลระบบ',
    role: 'super_admin',
    companyId: 'company-demo-001',
    auth: { hasPassword: true, hasGoogle: true },
    company: {
      nameTh: 'บริษัท สยาม เทคโนโลยี จำกัด',
      nameEn: 'Siam Technology Co., Ltd.',
      taxId: '0105560123456',
    },
  },
};

const tenant: AuthPayload = {
  token: 'test-accountant-token',
  user: {
    id: 'user-acct-001',
    email: tenantEmail,
    name: 'สมชาย บัญชี',
    role: 'accountant',
    companyId: 'company-demo-001',
    auth: { hasPassword: true, hasGoogle: true },
    company: {
      nameTh: 'บริษัท สยาม เทคโนโลยี จำกัด',
      nameEn: 'Siam Technology Co., Ltd.',
      taxId: '0105560123456',
    },
  },
};

async function createPage(browser: Browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(20_000);
  return page;
}

async function mockAuthApi(page: Page) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();

    if (url.endsWith('/api/auth/me')) {
      const authHeader = request.headers().authorization ?? '';
      const payload = authHeader.includes(superAdmin.token) ? superAdmin : tenant;
      void request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload.user),
      });
      return;
    }

    if (url.endsWith('/api/auth/login') && request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as { email?: string; password?: string };
      const payload =
        body.email === superAdminEmail && body.password === superAdminPassword
          ? superAdmin
          : body.email === tenantEmail && body.password === tenantPassword
            ? tenant
            : null;

      void request.respond({
        status: payload ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify(payload ?? { error: 'Invalid credentials' }),
      });
      return;
    }

    void request.continue();
  });
}

async function installAuthState(page: Page, payload: AuthPayload) {
  await page.evaluateOnNewDocument((authPayload) => {
    const appWindow = globalThis as unknown as {
      localStorage: {
        setItem: (key: string, value: string) => void;
      };
    };

    appWindow.localStorage.setItem(
      'etax_auth',
      JSON.stringify({
        state: {
          token: authPayload.token,
          user: authPayload.user,
        },
        version: 0,
      })
    );
  }, payload);
}

async function openWithAuth(page: Page, origin: string, path: string, payload: AuthPayload) {
  await installAuthState(page, payload);
  await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body');
}

async function openAnonymous(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForSelector('body');
}

async function waitForExactUrl(page: Page, expectedUrl: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (page.url() === expectedUrl) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  assert.equal(page.url(), expectedUrl);
}

async function submitLoginForm(page: Page, url: string, email: string, password: string) {
  await page.evaluateOnNewDocument(() => {
    (
      globalThis as unknown as { localStorage: { removeItem: (key: string) => void } }
    ).localStorage.removeItem('etax_auth');
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  const initialUrl = page.url();
  await page.click('button[type="submit"]');

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (page.url() !== initialUrl) {
      return;
    }
  }

  throw new Error(`Login redirect did not occur for ${url}`);
}

test('domain split routes users to the correct surface', async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const anonymousPage = await createPage(browser);
    await openAnonymous(anonymousPage, apexOrigin);
    assert.equal(anonymousPage.url(), `${apexOrigin}/`);

    const anonymousBody = await anonymousPage.$eval('body', (element) => element.innerText);
    assert.match(anonymousBody, /Sign In/i);
    assert.match(anonymousBody, /Owner Login/i);
    await anonymousPage.close();

    const ctaPage = await createPage(browser);
    await openAnonymous(ctaPage, apexOrigin);
    const links = await ctaPage.$$eval('a', (anchors) =>
      anchors.map((anchor) => ({
        text: anchor.textContent?.trim() ?? '',
        href: anchor.href,
      }))
    );
    assert.ok(
      links.some(
        (link) => /Owner Login/i.test(link.text) && link.href === 'http://ops.localhost:3000/login'
      )
    );
    assert.ok(
      links.some(
        (link) => /Sign In/i.test(link.text) && link.href === 'http://app.localhost:3000/login'
      )
    );
    await ctaPage.close();

    const appAnonymousPage = await createPage(browser);
    await openAnonymous(appAnonymousPage, appOrigin);
    assert.equal(appAnonymousPage.url(), `${appOrigin}/login`);
    await appAnonymousPage.close();

    const opsAnonymousPage = await createPage(browser);
    await openAnonymous(opsAnonymousPage, opsOrigin);
    assert.equal(opsAnonymousPage.url(), `${opsOrigin}/ops/login`);
    await opsAnonymousPage.close();

    const apexSuperAdminPage = await createPage(browser);
    await mockAuthApi(apexSuperAdminPage);
    await openWithAuth(apexSuperAdminPage, apexOrigin, '/', superAdmin);
    await waitForExactUrl(apexSuperAdminPage, `${opsOrigin}/ops/overview`);
    await apexSuperAdminPage.close();

    const apexTenantPage = await createPage(browser);
    await mockAuthApi(apexTenantPage);
    await openWithAuth(apexTenantPage, apexOrigin, '/', tenant);
    await waitForExactUrl(apexTenantPage, `${appOrigin}/app/dashboard`);
    await apexTenantPage.close();

    const appSuperAdminPage = await createPage(browser);
    await mockAuthApi(appSuperAdminPage);
    await openWithAuth(appSuperAdminPage, appOrigin, '/app/dashboard', superAdmin);
    await waitForExactUrl(appSuperAdminPage, `${opsOrigin}/ops/overview`);
    await appSuperAdminPage.close();

    const opsTenantPage = await createPage(browser);
    await mockAuthApi(opsTenantPage);
    await openWithAuth(opsTenantPage, opsOrigin, '/ops/overview', tenant);
    await waitForExactUrl(opsTenantPage, `${appOrigin}/app/dashboard`);
    await opsTenantPage.close();

    const opsSuperAdminPage = await createPage(browser);
    await mockAuthApi(opsSuperAdminPage);
    await openWithAuth(opsSuperAdminPage, opsOrigin, '/ops/overview', superAdmin);
    await waitForExactUrl(opsSuperAdminPage, `${opsOrigin}/ops/overview`);
    await opsSuperAdminPage.close();

    const appLoginPage = await createPage(browser);
    await mockAuthApi(appLoginPage);
    await submitLoginForm(appLoginPage, `${appOrigin}/login`, superAdminEmail, superAdminPassword);
    await waitForExactUrl(appLoginPage, `${opsOrigin}/ops/overview`);
    await appLoginPage.close();

    const opsLoginPage = await createPage(browser);
    await mockAuthApi(opsLoginPage);
    await submitLoginForm(
      opsLoginPage,
      `${opsOrigin}/ops/login`,
      superAdminEmail,
      superAdminPassword
    );
    await waitForExactUrl(opsLoginPage, `${opsOrigin}/ops/overview`);
    await opsLoginPage.close();

    const opsTenantLoginPage = await createPage(browser);
    await mockAuthApi(opsTenantLoginPage);
    await submitLoginForm(
      opsTenantLoginPage,
      `${opsOrigin}/ops/login`,
      tenantEmail,
      tenantPassword
    );
    await waitForExactUrl(opsTenantLoginPage, `${appOrigin}/app/dashboard`);
    await opsTenantLoginPage.close();
  } finally {
    await browser.close();
  }
});
