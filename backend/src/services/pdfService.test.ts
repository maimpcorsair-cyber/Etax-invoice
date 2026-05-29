// Smoke tests for the 7 HTML builders inside pdfService. These are NOT
// visual regression tests (no headless browser, no pixel diff). They
// guard against the worst failure modes:
//   1. A builder throws on valid input (template logic broke)
//   2. A builder returns empty or absurdly short HTML
//   3. Required user-visible fields go missing (invoice number, totals,
//      buyer name) — usually caused by a token typo in the template
//
// When pdfService is later split into per-variant files, these tests
// catch the case where an internal helper isn't re-exported correctly.
//
// Run: cd backend && npm run test:unit

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHtml,
  buildHtmlMinimal,
  buildHtmlCute,
  buildHtmlProfessional,
  buildHtmlDark,
  buildHtmlAnime,
  buildHtmlCrayon,
  buildHtmlMarketplace,
  type PdfInvoiceData,
} from './pdfService';
import { MARKETPLACE_TEMPLATE_TOKENS } from './pdfService/builders/marketplace';

const FIXTURE: PdfInvoiceData = {
  invoiceNumber: 'IV-2026-000128',
  invoiceDate: new Date('2026-04-24T00:00:00Z'),
  dueDate: new Date('2026-04-30T00:00:00Z'),
  type: 'tax_invoice',
  language: 'th',
  seller: {
    nameTh: 'บริษัท สยาม เทคโนโลยี จำกัด',
    nameEn: 'Siam Technology Co., Ltd.',
    taxId: '0105560123456',
    branchCode: '00000',
    branchNameTh: 'สำนักงานใหญ่',
    addressTh: '123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
    addressEn: '123 Sukhumvit Road, Khlong Toei, Bangkok 10110',
    phone: '02-123-4567',
    email: 'contact@siamtech.co.th',
    website: 'siamtech.co.th',
    logoUrl: null,
  },
  buyer: {
    nameTh: 'บริษัท เมฆา คอมเมิร์ซ จำกัด',
    nameEn: 'Mekha Commerce Co., Ltd.',
    taxId: '0107547000293',
    branchCode: '00000',
    addressTh: '456 ถนนพระราม 4 แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
    addressEn: '456 Rama IV Road, Khlong Toei, Bangkok 10110',
  },
  items: [
    {
      nameTh: 'พัฒนาเว็บไซต์',
      nameEn: 'Website development',
      quantity: 1,
      unit: 'งาน',
      unitPrice: 30_000,
      discountAmount: 0,
      vatType: 'vat7',
      amount: 30_000,
      vatAmount: 2_100,
      totalAmount: 32_100,
    },
    {
      nameTh: 'บำรุงรักษารายเดือน',
      nameEn: 'Monthly maintenance',
      quantity: 1,
      unit: 'เดือน',
      unitPrice: 15_000,
      discountAmount: 0,
      vatType: 'vat7',
      amount: 15_000,
      vatAmount: 1_050,
      totalAmount: 16_050,
    },
  ],
  subtotal: 45_000,
  vatAmount: 3_150,
  discountAmount: 0,
  total: 48_150,
  notes: 'กรุณาชำระภายในกำหนด',
  paymentMethod: 'โอนเงินผ่านธนาคาร',
  showCompanyLogo: false,
  documentMode: 'electronic',
};

// Each entry is a name + a () => string callable so we don't fight TS
// over union types of (data) vs (data, variant) signatures.
const builders: Array<[name: string, render: (d: PdfInvoiceData) => string]> = [
  ['buildHtml (standard)', (d) => buildHtml(d)],
  ['buildHtmlMinimal', (d) => buildHtmlMinimal(d, 'minimal-white')],
  ['buildHtmlCute', (d) => buildHtmlCute(d, 'cute-pink')],
  ['buildHtmlProfessional', (d) => buildHtmlProfessional(d, 'pro-blue-modern')],
  ['buildHtmlDark', (d) => buildHtmlDark(d, 'dark-king')],
  ['buildHtmlAnime', (d) => buildHtmlAnime(d, 'anime-ink')],
  ['buildHtmlCrayon', (d) => buildHtmlCrayon(d)],
];

for (const [name, render] of builders) {
  test(`${name} produces non-trivial HTML and contains key fields`, () => {
    const html = render(FIXTURE);

    // Sanity: HTML response is real
    assert.ok(html, 'builder returned empty');
    assert.ok(html.length > 2000, `HTML too short (${html.length} bytes) — likely template logic broke`);
    assert.ok(html.length < 500_000, `HTML too large (${html.length} bytes) — likely template duplication bug`);

    // Required user-facing fields must appear somewhere. If any of these
    // are missing the document is materially broken even if the template
    // renders successfully.
    assert.ok(html.includes('IV-2026-000128'), 'invoice number missing');
    assert.ok(html.includes('48,150') || html.includes('48150'), 'total amount missing');
    assert.ok(html.includes('เมฆา') || html.includes('Mekha'), 'buyer name missing');
    assert.ok(html.includes('สยาม') || html.includes('Siam'), 'seller name missing');
  });
}

test('all builders accept English language without throwing', () => {
  const englishFixture: PdfInvoiceData = { ...FIXTURE, language: 'en' };
  for (const [name, render] of builders) {
    const html = render(englishFixture);
    assert.ok(html.length > 1000, `${name} returned suspiciously short HTML in EN mode`);
  }
});

test('standard ordinary document stays compact and does not show e-Tax labels', () => {
  const html = buildHtml({
    ...FIXTURE,
    documentMode: 'ordinary',
    bankPaymentInfo: 'ธนาคาร: Kbank\nเลขที่บัญชี: 0231367705',
    promptPayQrDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    promptPayTarget: '0819918896',
    signatureImageUrl: null,
    signerName: '',
    signerTitle: '',
  });

  assert.ok(html.includes('compact-one-page'), 'short ordinary invoice should use compact one-page layout');
  assert.ok(html.includes('min-height: calc(297mm - 40px)'), 'standard preview should keep an A4-height page frame');
  assert.ok(html.includes('margin-top: auto'), 'payment/support area should sit toward the bottom on short A4 invoices');
  assert.ok(!html.includes('Electronic Tax Document'), 'ordinary document must not show electronic tax eyebrow');
  assert.ok(!html.includes('ORDINARY DOCUMENT'), 'ordinary document should not spend space on a redundant ordinary badge');
  assert.ok(!html.includes('<div class="signature-grid">'), 'blank signature boxes should not render when no signer is configured');
});

test('standard ordinary document keeps up to eight items in compact one-page layout', () => {
  const eightItems = Array.from({ length: 8 }, (_, idx) => {
    const base = FIXTURE.items[idx % FIXTURE.items.length]!;
    return {
      ...base,
      nameTh: `รายการทดสอบ ${idx + 1}`,
      nameEn: `Test line ${idx + 1}`,
    };
  });

  const html = buildHtml({
    ...FIXTURE,
    items: eightItems,
    documentMode: 'ordinary',
    dueDate: null,
    bankPaymentInfo: 'ธนาคาร: Kbank\nเลขที่บัญชี: 0231367705',
    promptPayQrDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    promptPayTarget: '0819918896',
    signatureImageUrl: null,
    signerName: '',
    signerTitle: '',
  });

  assert.ok(html.includes('compact-one-page'), 'up to eight line items should use the tight one-page A4 layout');
  assert.ok(html.includes('.compact-one-page {\n    padding: 0;'), 'compact one-page layout should not add overflow padding');
  assert.ok(html.includes('height: calc(297mm - 20mm)'), 'printed compact A4 should have a fixed content-height box');
  assert.ok(!html.includes('📱'), 'invoice PDFs should not render emoji labels');
});

test('built-in template themes keep the standard accounting document structure', () => {
  const html = buildHtml({
    ...FIXTURE,
    templateId: 'builtin:minimal-white',
    templateName: 'Minimal White',
    documentMode: 'ordinary',
    dueDate: null,
  });

  assert.ok(html.includes('theme-minimal-white'), 'built-in template should map to a standard document theme');
  assert.ok(html.includes('document-shell'), 'built-in template should keep the standard A4 accounting shell');
  assert.ok(html.includes('items-section'), 'built-in template should keep the standard line-item section');
  assert.ok(!html.includes('poster-panel'), 'built-in template should not switch to a different poster/gallery layout');
});

test('marketplace T01 keeps payment details but hides missing due date', () => {
  const html = buildHtmlMarketplace({
    ...FIXTURE,
    type: 'tax_invoice_receipt',
    dueDate: null,
    documentMode: 'ordinary',
    bankPaymentInfo: 'ธนาคาร: Kbank\nเลขที่บัญชี: 0231367705',
    promptPayQrDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    promptPayTarget: '0819918896',
  }, MARKETPLACE_TEMPLATE_TOKENS['builtin:minimal-white']);

  assert.ok(html.includes('PromptPay'), 'marketplace template should render PromptPay payment details');
  assert.ok(html.includes('0231367705'), 'marketplace template should keep bank transfer details');
  assert.ok(!html.includes('ครบกำหนด</div><div class="meta-val">-'), 'T01 should not render a blank due-date row');
});

test('all builders accept the 5 document types without throwing', () => {
  const types = ['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note', 'debit_note'];
  for (const t of types) {
    const fixture: PdfInvoiceData = { ...FIXTURE, type: t };
    for (const [name, render] of builders) {
      const html = render(fixture);
      assert.ok(html.length > 1000, `${name}/${t} produced tiny HTML`);
    }
  }
});
