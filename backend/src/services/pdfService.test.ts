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
  type PdfInvoiceData,
} from './pdfService';

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
      descriptionTh: 'ออกแบบ UX/UI\nรองรับมือถือและเดสก์ท็อป',
      descriptionEn: 'UX/UI design\nResponsive desktop and mobile',
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
// All built-in templates render through the single formal base builder,
// themed per templateId. Exercise a representative theme from each family
// (professional / cute / dark / anime) to confirm the base renders them all.
const builders: Array<[name: string, render: (d: PdfInvoiceData) => string]> = [
  ['standard', (d) => buildHtml(d)],
  ['minimal-white', (d) => buildHtml({ ...d, templateId: 'builtin:minimal-white' })],
  ['cute-pink', (d) => buildHtml({ ...d, templateId: 'builtin:cute-pink' })],
  ['pro-blue-modern', (d) => buildHtml({ ...d, templateId: 'builtin:pro-blue-modern' })],
  ['dark-king', (d) => buildHtml({ ...d, templateId: 'builtin:dark-king' })],
  ['anime-tokyo', (d) => buildHtml({ ...d, templateId: 'builtin:anime-tokyo' })],
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
  assert.ok(html.includes('grid-template-columns: minmax(0, 1.3fr) minmax(285px, 0.9fr)'), 'document metadata should have enough width for an unbroken document number');
  assert.ok(html.includes('white-space: nowrap;\n    word-break: normal;'), 'emphasized document numbers should stay on one line');
  assert.ok(html.includes('.words-card .section-label {\n    letter-spacing: 0;'), 'Thai amount-in-words heading should not use spaced uppercase label styling');
  assert.ok(html.includes('width: 100%;\n      min-height: calc(297mm - 20mm);'), 'printed A4 content should use the full width left after Puppeteer margins');
  assert.ok(html.includes('data-document-number="IV-2026-000128"'), 'PDF HTML should expose its document number for the printed page footer');
  assert.ok(html.includes('border: 0 !important'), 'the printable A4 page should not render a decorative outer frame');
  assert.ok(html.includes('.party-grid { display: block; }'), 'buyer details should use a flat accounting block');
  assert.ok(html.includes('min-height: 0;\n    padding: 0;'), 'buyer details should not render a wasteful nested box');
  assert.ok(!html.includes('Electronic Tax Document'), 'ordinary document must not show electronic tax eyebrow');
  assert.ok(!html.includes('ORDINARY DOCUMENT'), 'ordinary document should not spend space on a redundant ordinary badge');
  assert.ok(!html.includes('class="watermark"'), 'document PDF should not render decorative background watermarks');
  assert.ok(!html.includes('>STANDARD<'), 'standard theme name should not appear as a watermark');
  // Accounting standard: signature LINES are always present so the document
  // can be signed by hand, even when no signature image/name is configured.
  assert.ok(html.includes('<div class="signature-grid">'), 'signature lines should always render for manual signing');
  assert.ok(html.includes('ผู้รับสินค้า / ลูกค้า'), 'received-by signature line should render');
  assert.ok(html.includes('ผู้มีอำนาจลงนาม'), 'authorized signatory line should render');
  assert.ok(
    html.indexOf('ผู้มีอำนาจลงนาม') < html.indexOf('ผู้รับสินค้า / ลูกค้า'),
    'issuer signature should render on the left before the customer signature',
  );
  assert.ok(html.includes('ได้รับสินค้า/บริการ'), 'received-goods acknowledgement statement should render on non-quotation docs');
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

test('standard multi-page document keeps a document-number hook for repeated PDF footers', () => {
  const html = buildHtml({
    ...FIXTURE,
    type: 'quotation',
    invoiceNumber: 'QT-2026-000010',
    items: Array.from({ length: 11 }, (_, idx) => ({
      ...FIXTURE.items[idx % FIXTURE.items.length]!,
      nameTh: `รายการหลายหน้า ${idx + 1}`,
    })),
    documentMode: 'ordinary',
  });

  assert.ok(!html.includes(' compact-one-page" data-document-number'), 'more than eight items should use the multi-page flow');
  assert.ok(html.includes('data-document-number="QT-2026-000010"'), 'multi-page HTML should expose the quotation number to Puppeteer');
  assert.ok(html.includes('body:not(.compact-one-page) thead { display: table-header-group; }'), 'multi-page tables should repeat their column header');
});

test('standard document hides empty discount column and keeps it only when needed', () => {
  const htmlWithoutDiscounts = buildHtml({
    ...FIXTURE,
    type: 'quotation',
    invoiceNumber: 'QT-2026-000010',
    documentMode: 'ordinary',
  });

  assert.ok(htmlWithoutDiscounts.includes('line-items no-discount'), 'line items should mark the no-discount table state');
  assert.ok(!htmlWithoutDiscounts.includes(`<th style="width:52px;text-align:center">ส่วนลด</th>`), 'empty discount column should not render');
  assert.ok(!htmlWithoutDiscounts.includes(`<th style="width:52px;text-align:center">VAT</th>`), 'line-item VAT type should not render');
  assert.ok(!htmlWithoutDiscounts.includes(`<th style="width:72px;text-align:right">ภาษี</th>`), 'line-item tax amount column should not render');
  assert.ok(!htmlWithoutDiscounts.includes(`<th style="width:96px;text-align:right">รวม</th>`), 'line-item VAT-inclusive total should not render');

  const htmlWithDiscount = buildHtml({
    ...FIXTURE,
    type: 'quotation',
    invoiceNumber: 'QT-2026-000011',
    documentMode: 'ordinary',
    items: [
      {
        ...FIXTURE.items[0]!,
        discountAmount: 5,
      },
      FIXTURE.items[1]!,
    ],
  });

  assert.ok(htmlWithDiscount.includes('line-items has-discount'), 'discounted documents should keep the discount table state');
  assert.ok(htmlWithDiscount.includes(`<th style="width:52px;text-align:center">ส่วนลด</th>`), 'discount column should render when any line has discount');
  assert.ok(htmlWithDiscount.includes('>5%</td>'), 'discount value should render for the discounted line');
});

test('standard document keeps mixed VAT details in the summary instead of the line-item table', () => {
  const html = buildHtml({
    ...FIXTURE,
    type: 'quotation',
    invoiceNumber: 'QT-2026-000012',
    documentMode: 'ordinary',
    items: [
      FIXTURE.items[0]!,
      {
        ...FIXTURE.items[1]!,
        vatType: 'vatExempt',
        vatAmount: 0,
        totalAmount: FIXTURE.items[1]!.amount,
      },
      {
        ...FIXTURE.items[1]!,
        nameTh: 'รายการ VAT 0%',
        vatType: 'vatZero',
        amount: 5_000,
        vatAmount: 0,
        totalAmount: 5_000,
      },
    ],
  });

  assert.ok(!html.includes(`<th style="width:52px;text-align:center">VAT</th>`), 'mixed VAT documents should not render per-line VAT type');
  assert.ok(!html.includes('>ยกเว้น</td>'), 'mixed VAT documents should keep VAT details out of line-item rows');
  assert.ok(!html.includes(`<th style="width:72px;text-align:right">ภาษี</th>`), 'per-line tax amount should remain summary-only even for mixed VAT');
  assert.ok(html.includes('ฐานภาษี VAT 7%'), 'mixed VAT summary should identify the VAT 7% base');
  assert.ok(html.includes('30,000.00 THB'), 'mixed VAT summary should show the VAT 7% base amount');
  assert.ok(html.includes('รายการยกเว้น VAT'), 'mixed VAT summary should identify the exempt base');
  assert.ok(html.includes('15,000.00 THB'), 'mixed VAT summary should show the exempt base amount');
  assert.ok(html.includes('ฐานภาษี VAT 0%'), 'mixed VAT summary should identify the VAT 0% base');
  assert.ok(html.includes('5,000.00 THB'), 'mixed VAT summary should show the VAT 0% base amount');
});

test('standard multi-page T02 keeps the full invoice header on page one and uses compact continuation headers after it', () => {
  const html = buildHtml({
    ...FIXTURE,
    type: 'tax_invoice',
    invoiceNumber: 'T02-2026-000010',
    items: Array.from({ length: 11 }, (_, idx) => ({
      ...FIXTURE.items[idx % FIXTURE.items.length]!,
      nameTh: `รายการใบกำกับภาษีหลายหน้า ${idx + 1}`,
    })),
    documentMode: 'ordinary',
  });

  assert.ok(html.includes(' tax-multi-page" data-document-number'), 'long T02 should use the controlled tax multi-page flow');
  assert.equal((html.match(/class="tax-page-header"/g) ?? []).length, 1, 'only continuation pages should use the compact accounting header');
  assert.ok(!html.includes('.tax-multi-page .hero,\n  .tax-multi-page .overview-grid { display: none; }'), 'page one should retain the full invoice header and document overview');
  assert.equal((html.match(/มีหน้าต่อไป/g) ?? []).length, 1, 'only the intermediate tax page should say that another page follows');
  assert.ok(html.indexOf('รายการใบกำกับภาษีหลายหน้า 8') < html.indexOf('มีหน้าต่อไป'), 'the first page should use its full eight-row capacity');
  assert.ok(html.indexOf('รายการใบกำกับภาษีหลายหน้า 9') > html.indexOf('มีหน้าต่อไป'), 'remaining rows should move to the final summary page');
  assert.equal((html.match(/T02-2026-000010/g) ?? []).length >= 2, true, 'document number should appear in the body metadata and continuation headers');
  assert.equal((html.match(/class="totals-card"/g) ?? []).length, 1, 'tax totals should render once after the final item page');
});

test('standard quotation document uses quotation copy and valid-until wording', () => {
  const html = buildHtml({
    ...FIXTURE,
    type: 'quotation',
    invoiceNumber: 'QT-2026-000001',
    dueDate: new Date('2026-06-30T00:00:00Z'),
    documentMode: 'ordinary',
    paymentMethod: 'ชำระภายใน 30 วันหลังได้รับใบกำกับภาษี',
  });

  assert.ok(html.includes('ใบเสนอราคา'), 'quotation PDF should use quotation title');
  assert.ok(html.includes('Sales Quotation'), 'quotation PDF should identify itself as a quotation');
  assert.ok(html.includes('ออกแบบ UX/UI'), 'quotation PDF should render line-item detail text');
  assert.ok(html.includes('รองรับมือถือและเดสก์ท็อป'), 'quotation PDF should preserve multi-line item details');
  assert.ok(html.includes('ใช้ได้ถึง'), 'quotation PDF should label the expiry date as valid until');
  assert.ok(html.includes('เงื่อนไขการชำระเงิน'), 'quotation PDF should label payment terms clearly');
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

test('built-in quotation template keeps quotation copy and applies the selected theme', () => {
  const html = buildHtml({
    ...FIXTURE,
    type: 'quotation',
    invoiceNumber: 'QT-2026-000009',
    dueDate: new Date('2026-06-30T00:00:00Z'),
    templateId: 'builtin:minimal-sans',
    documentMode: 'ordinary',
  });

  assert.ok(html.includes('ใบเสนอราคา'), 'quotation template should keep quotation title');
  assert.ok(html.includes('theme-minimal-sans'), 'quotation template should apply selected built-in theme');
  assert.ok(html.includes('ใช้ได้ถึง'), 'quotation template should keep valid-until wording');
});

test('built-in template T01 keeps payment details but hides missing due date', () => {
  const html = buildHtml({
    ...FIXTURE,
    templateId: 'builtin:minimal-white',
    type: 'tax_invoice_receipt',
    dueDate: null,
    documentMode: 'ordinary',
    bankPaymentInfo: 'ธนาคาร: Kbank\nเลขที่บัญชี: 0231367705',
    promptPayQrDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    promptPayTarget: '0819918896',
  });

  assert.ok(html.includes('PromptPay'), 'template should render PromptPay payment details');
  assert.ok(html.includes('0231367705'), 'template should keep bank transfer details');
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
