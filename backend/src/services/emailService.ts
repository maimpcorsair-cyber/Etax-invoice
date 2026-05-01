import nodemailer from 'nodemailer';
import { logger } from '../config/logger';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT ?? '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface InvoiceEmailData {
  invoiceNumber: string;
  total: number;
  buyerNameTh: string;
  buyerNameEn?: string | null;
  buyerEmail?: string | null;
  sellerNameTh: string;
  language: string;
  pdfUrl?: string | null;
  rdDocId?: string | null;
}

interface StatementEmailData {
  customerNameTh: string;
  customerNameEn?: string | null;
  customerEmail: string;
  companyNameTh: string;
  language: string;
  totalOutstanding: number;
  generatedAt: Date;
  filename: string;
  pdfBuffer: Buffer;
}

interface BillingActivationEmailData {
  companyNameTh: string;
  adminName: string;
  adminEmail: string;
  planName: string;
  amountPaid?: number | null;
  paymentMethod?: string | null;
  loginUrl?: string | null;
  locale?: 'th' | 'en';
}

interface BillingRenewalLinkEmailData {
  companyNameTh: string;
  adminEmail: string;
  planName: string;
  renewalUrl: string;
  expiresAt?: Date | null;
  amountDue?: number | null;
  paymentMethod?: string | null;
  locale?: 'th' | 'en';
}

interface BillingPaymentFailedEmailData {
  companyNameTh: string;
  adminEmail: string;
  planName: string;
  amountDue?: number | null;
  paymentMethod?: string | null;
  retryUrl?: string | null;
  locale?: 'th' | 'en';
}

function formatThb(amount?: number | null) {
  if (amount == null) return null;
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
}

function normalizePaymentMethodLabel(paymentMethod?: string | null) {
  switch (paymentMethod) {
    case 'stripe':
      return 'Stripe / Card';
    case 'stripe_promptpay':
      return 'Stripe PromptPay';
    case 'promptpay_qr':
      return 'PromptPay QR';
    default:
      return paymentMethod ?? 'Online payment';
  }
}

function buildRdSuccessHtml(data: InvoiceEmailData): string {
  const isTh = data.language === 'th' || data.language === 'both';
  const buyerName = isTh ? data.buyerNameTh : (data.buyerNameEn ?? data.buyerNameTh);
  const amount = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(data.total);

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet"/>
<style>body{font-family:'Sarabun',sans-serif;background:#f3f4f6;margin:0;padding:20px}.container{max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}.header{background:#1d4ed8;color:white;padding:24px;text-align:center}.header h1{margin:0;font-size:20px}.body{padding:24px}.badge{display:inline-block;background:#dcfce7;color:#166534;padding:4px 12px;border-radius:20px;font-size:13px;margin-bottom:16px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px}.row .lbl{color:#6b7280}.total{font-size:16px;font-weight:600;color:#1d4ed8}.footer{background:#f9fafb;padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>✅ ${isTh ? 'ส่งกรมสรรพากรสำเร็จ' : 'RD Submission Successful'}</h1>
    <p style="margin:4px 0 0;opacity:.85;font-size:14px">${data.sellerNameTh}</p>
  </div>
  <div class="body">
    <div class="badge">${isTh ? 'ยืนยันแล้ว' : 'Confirmed'}</div>
    <p style="margin:0 0 16px;font-size:15px">${isTh ? `เอกสารของ <strong>${buyerName}</strong> ถูกส่งไปยังกรมสรรพากรเรียบร้อยแล้ว` : `Invoice for <strong>${buyerName}</strong> has been successfully submitted to the Revenue Department.`}</p>
    <div class="row"><span class="lbl">${isTh ? 'เลขที่เอกสาร' : 'Invoice No.'}</span><strong>${data.invoiceNumber}</strong></div>
    <div class="row"><span class="lbl">${isTh ? 'ยอดรวม' : 'Total'}</span><span class="total">${amount}</span></div>
    ${data.rdDocId ? `<div class="row"><span class="lbl">RD Doc ID</span><span style="font-family:monospace;font-size:12px">${data.rdDocId}</span></div>` : ''}
    ${data.pdfUrl ? `<div style="margin-top:20px;text-align:center"><a href="${data.pdfUrl}" style="display:inline-block;padding:10px 20px;background:#1d4ed8;color:white;border-radius:8px;text-decoration:none;font-size:14px">${isTh ? 'ดาวน์โหลด PDF' : 'Download PDF'}</a></div>` : ''}
  </div>
  <div class="footer">ชัชชาติ การบัญชี | ${isTh ? 'ระบบใบกำกับภาษีอิเล็กทรอนิกส์' : 'Thailand Revenue Department Compliant'}</div>
</div>
</body>
</html>`;
}

function buildRdFailedHtml(data: InvoiceEmailData, reason: string): string {
  const isTh = data.language === 'th' || data.language === 'both';
  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet"/>
<style>body{font-family:'Sarabun',sans-serif;background:#f3f4f6;margin:0;padding:20px}.container{max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden}.header{background:#dc2626;color:white;padding:24px;text-align:center}.header h1{margin:0;font-size:20px}.body{padding:24px}.error-box{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin:12px 0;font-size:13px;color:#991b1b;font-family:monospace}.footer{background:#f9fafb;padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>❌ ${isTh ? 'ส่งกรมสรรพากรไม่สำเร็จ' : 'RD Submission Failed'}</h1>
  </div>
  <div class="body">
    <p>${isTh ? `เอกสารเลขที่ <strong>${data.invoiceNumber}</strong> ไม่สามารถส่งไปยังกรมสรรพากรได้ หลังจากลองซ้ำหลายครั้งแล้ว` : `Invoice <strong>${data.invoiceNumber}</strong> could not be submitted to the Revenue Department after multiple retries.`}</p>
    <div class="error-box">${reason}</div>
    <p style="font-size:13px;color:#6b7280">${isTh ? 'กรุณาตรวจสอบและส่งใหม่ด้วยตนเองในระบบ' : 'Please review and resubmit manually in the system.'}</p>
  </div>
  <div class="footer">ชัชชาติ การบัญชี — Admin Alert</div>
</div>
</body>
</html>`;
}

function buildInvoiceForCustomerHtml(data: InvoiceEmailData): string {
  const isTh = data.language === 'th' || data.language === 'both';
  const buyerName = isTh ? data.buyerNameTh : (data.buyerNameEn ?? data.buyerNameTh);
  const amount = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(data.total);

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet"/>
<style>body{font-family:'Sarabun',sans-serif;background:#f3f4f6;margin:0;padding:20px}.container{max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden}.header{background:#1d4ed8;color:white;padding:24px;text-align:center}.body{padding:24px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px}.row .lbl{color:#6b7280}.total{font-size:16px;font-weight:600;color:#1d4ed8}.footer{background:#f9fafb;padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${isTh ? 'ใบกำกับภาษี' : 'Tax Invoice'}</h1>
    <p style="margin:4px 0 0;opacity:.85;font-size:14px">${data.sellerNameTh}</p>
  </div>
  <div class="body">
    <p>${isTh ? `เรียน <strong>${buyerName}</strong>` : `Dear <strong>${buyerName}</strong>,`}</p>
    <p>${isTh ? 'ขอส่งใบกำกับภาษีมาเพื่อดำเนินการต่อไป' : 'Please find the attached tax invoice for your reference.'}</p>
    <div class="row"><span class="lbl">${isTh ? 'เลขที่' : 'Invoice No.'}</span><strong>${data.invoiceNumber}</strong></div>
    <div class="row"><span class="lbl">${isTh ? 'ยอดรวม' : 'Total'}</span><span class="total">${amount}</span></div>
    ${data.pdfUrl ? `<div style="margin-top:20px;text-align:center"><a href="${data.pdfUrl}" style="display:inline-block;padding:10px 20px;background:#1d4ed8;color:white;border-radius:8px;text-decoration:none;font-size:14px">${isTh ? 'ดาวน์โหลดใบกำกับภาษี' : 'Download Invoice'}</a></div>` : ''}
    <p style="margin-top:16px;font-size:13px;color:#6b7280">${isTh ? 'ขอบคุณที่ใช้บริการ' : 'Thank you for your business.'}</p>
  </div>
  <div class="footer">ชัชชาติ การบัญชี | ${data.sellerNameTh}</div>
</div>
</body>
</html>`;
}

function buildStatementForCustomerHtml(data: StatementEmailData): string {
  const isTh = data.language !== 'en';
  const customerName = isTh ? data.customerNameTh : (data.customerNameEn ?? data.customerNameTh);
  const amount = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(data.totalOutstanding);

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet"/>
<style>body{font-family:'Sarabun',sans-serif;background:#f3f4f6;margin:0;padding:20px}.container{max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden}.header{background:#0f766e;color:white;padding:24px;text-align:center}.body{padding:24px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px}.row .lbl{color:#6b7280}.total{font-size:16px;font-weight:600;color:#0f766e}.footer{background:#f9fafb;padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${isTh ? 'Statement of Account' : 'Statement of Account'}</h1>
    <p style="margin:4px 0 0;opacity:.85;font-size:14px">${data.companyNameTh}</p>
  </div>
  <div class="body">
    <p>${isTh ? `เรียน <strong>${customerName}</strong>` : `Dear <strong>${customerName}</strong>,`}</p>
    <p>${isTh ? 'กรุณาพบ Statement of Account แนบมาพร้อมอีเมลนี้ เพื่อใช้ตรวจสอบยอดค้างชำระล่าสุด' : 'Please find the attached Statement of Account for your review of the latest outstanding balances.'}</p>
    <div class="row"><span class="lbl">${isTh ? 'ยอดค้างรวม' : 'Total outstanding'}</span><span class="total">${amount}</span></div>
    <div class="row"><span class="lbl">${isTh ? 'วันที่ออกรายงาน' : 'Generated at'}</span><strong>${data.generatedAt.toLocaleDateString(isTh ? 'th-TH' : 'en-GB')}</strong></div>
    <p style="margin-top:16px;font-size:13px;color:#6b7280">${isTh ? 'หากมีข้อสงสัยเกี่ยวกับยอดคงค้าง กรุณาติดต่อกลับบริษัทผู้ออกเอกสาร' : 'If you have any questions about these balances, please contact the issuing company.'}</p>
  </div>
  <div class="footer">ชัชชาติ การบัญชี | ${data.companyNameTh}</div>
</div>
</body>
</html>`;
}

function buildBillingActivationHtml(data: BillingActivationEmailData): string {
  const isTh = data.locale !== 'en';
  const amountPaid = formatThb(data.amountPaid);
  const paymentMethod = normalizePaymentMethodLabel(data.paymentMethod);

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet"/>
<style>body{font-family:'Sarabun',sans-serif;background:#f3f4f6;margin:0;padding:20px}.container{max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}.header{background:#065f46;color:white;padding:24px;text-align:center}.body{padding:24px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px}.row .lbl{color:#6b7280}.cta{display:inline-block;padding:10px 18px;background:#0f766e;color:white;border-radius:8px;text-decoration:none;font-size:14px;margin-top:20px}.footer{background:#f9fafb;padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin:0;font-size:20px">${isTh ? 'เปิดใช้งานระบบสำเร็จ' : 'Account Activated Successfully'}</h1>
    <p style="margin:6px 0 0;opacity:.9">${data.companyNameTh}</p>
  </div>
  <div class="body">
    <p style="margin-top:0">${isTh ? `สวัสดีคุณ <strong>${data.adminName}</strong>` : `Hello <strong>${data.adminName}</strong>,`}</p>
    <p>${isTh ? `การสมัครใช้งานแพ็กเกจ <strong>${data.planName}</strong> ของบริษัทคุณถูกเปิดใช้งานเรียบร้อยแล้ว สามารถเริ่มใช้งานระบบ ชัชบัญชี ได้ทันที` : `Your <strong>${data.planName}</strong> subscription has been activated successfully. You can start using ชัชบัญชี right away.`}</p>
    <div class="row"><span class="lbl">${isTh ? 'อีเมลผู้ดูแล' : 'Admin email'}</span><strong>${data.adminEmail}</strong></div>
    <div class="row"><span class="lbl">${isTh ? 'แพ็กเกจ' : 'Plan'}</span><strong>${data.planName}</strong></div>
    ${amountPaid ? `<div class="row"><span class="lbl">${isTh ? 'ยอดชำระ' : 'Amount paid'}</span><strong>${amountPaid}</strong></div>` : ''}
    <div class="row"><span class="lbl">${isTh ? 'ช่องทางชำระ' : 'Payment method'}</span><strong>${paymentMethod}</strong></div>
    ${data.loginUrl ? `<div style="text-align:center"><a class="cta" href="${data.loginUrl}">${isTh ? 'เข้าสู่ระบบ' : 'Sign in'}</a></div>` : ''}
  </div>
  <div class="footer">ชัชชาติ การบัญชี | Welcome onboard</div>
</div>
</body>
</html>`;
}

function buildBillingRenewalLinkHtml(data: BillingRenewalLinkEmailData): string {
  const isTh = data.locale !== 'en';
  const amountDue = formatThb(data.amountDue);
  const paymentMethod = normalizePaymentMethodLabel(data.paymentMethod);

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet"/>
<style>body{font-family:'Sarabun',sans-serif;background:#f3f4f6;margin:0;padding:20px}.container{max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden}.header{background:#1d4ed8;color:white;padding:24px;text-align:center}.body{padding:24px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px}.row .lbl{color:#6b7280}.cta{display:inline-block;padding:10px 18px;background:#1d4ed8;color:white;border-radius:8px;text-decoration:none;font-size:14px;margin-top:20px}.footer{background:#f9fafb;padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin:0;font-size:20px">${isTh ? 'ลิงก์ชำระค่าต่ออายุระบบ' : 'Subscription Renewal Link'}</h1>
    <p style="margin:6px 0 0;opacity:.9">${data.companyNameTh}</p>
  </div>
  <div class="body">
    <p style="margin-top:0">${isTh ? `ระบบได้สร้างลิงก์ชำระค่าต่ออายุสำหรับแพ็กเกจ <strong>${data.planName}</strong> แล้ว` : `A renewal payment link for your <strong>${data.planName}</strong> plan is ready.`}</p>
    <div class="row"><span class="lbl">${isTh ? 'อีเมลผู้รับ' : 'Recipient email'}</span><strong>${data.adminEmail}</strong></div>
    <div class="row"><span class="lbl">${isTh ? 'แพ็กเกจ' : 'Plan'}</span><strong>${data.planName}</strong></div>
    ${amountDue ? `<div class="row"><span class="lbl">${isTh ? 'ยอดที่ต้องชำระ' : 'Amount due'}</span><strong>${amountDue}</strong></div>` : ''}
    <div class="row"><span class="lbl">${isTh ? 'ช่องทางชำระ' : 'Payment method'}</span><strong>${paymentMethod}</strong></div>
    ${data.expiresAt ? `<div class="row"><span class="lbl">${isTh ? 'หมดอายุลิงก์' : 'Link expires'}</span><strong>${data.expiresAt.toLocaleString(isTh ? 'th-TH' : 'en-GB')}</strong></div>` : ''}
    <div style="text-align:center"><a class="cta" href="${data.renewalUrl}">${isTh ? 'ชำระค่าต่ออายุ' : 'Pay renewal'}</a></div>
  </div>
  <div class="footer">ชัชชาติ การบัญชี | Renewal</div>
</div>
</body>
</html>`;
}

function buildBillingPaymentFailedHtml(data: BillingPaymentFailedEmailData): string {
  const isTh = data.locale !== 'en';
  const amountDue = formatThb(data.amountDue);
  const paymentMethod = normalizePaymentMethodLabel(data.paymentMethod);

  return `<!DOCTYPE html>
<html lang="${isTh ? 'th' : 'en'}">
<head>
<meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet"/>
<style>body{font-family:'Sarabun',sans-serif;background:#f3f4f6;margin:0;padding:20px}.container{max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden}.header{background:#b91c1c;color:white;padding:24px;text-align:center}.body{padding:24px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px}.row .lbl{color:#6b7280}.cta{display:inline-block;padding:10px 18px;background:#b91c1c;color:white;border-radius:8px;text-decoration:none;font-size:14px;margin-top:20px}.footer{background:#f9fafb;padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin:0;font-size:20px">${isTh ? 'ชำระค่าบริการไม่สำเร็จ' : 'Payment Unsuccessful'}</h1>
    <p style="margin:6px 0 0;opacity:.9">${data.companyNameTh}</p>
  </div>
  <div class="body">
    <p style="margin-top:0">${isTh ? `เราพบว่าการชำระค่าบริการสำหรับแพ็กเกจ <strong>${data.planName}</strong> ไม่สำเร็จ กรุณาดำเนินการอีกครั้งเพื่อให้ระบบใช้งานต่อเนื่องได้ตามปกติ` : `We detected an unsuccessful payment for your <strong>${data.planName}</strong> plan. Please complete payment to keep your service active.`}</p>
    <div class="row"><span class="lbl">${isTh ? 'อีเมลผู้ดูแล' : 'Admin email'}</span><strong>${data.adminEmail}</strong></div>
    <div class="row"><span class="lbl">${isTh ? 'แพ็กเกจ' : 'Plan'}</span><strong>${data.planName}</strong></div>
    ${amountDue ? `<div class="row"><span class="lbl">${isTh ? 'ยอดที่ค้างชำระ' : 'Outstanding amount'}</span><strong>${amountDue}</strong></div>` : ''}
    <div class="row"><span class="lbl">${isTh ? 'ช่องทางชำระ' : 'Payment method'}</span><strong>${paymentMethod}</strong></div>
    ${data.retryUrl ? `<div style="text-align:center"><a class="cta" href="${data.retryUrl}">${isTh ? 'ชำระอีกครั้ง' : 'Retry payment'}</a></div>` : ''}
  </div>
  <div class="footer">ชัชชาติ การบัญชี | Billing alert</div>
</div>
</body>
</html>`;
}

export async function sendRdSuccessEmail(
  adminEmail: string,
  data: InvoiceEmailData,
): Promise<void> {
  if (!process.env.SMTP_HOST) { logger.warn('SMTP not configured, skipping email'); return; }
  const isTh = data.language === 'th' || data.language === 'both';
  try {
    await transporter.sendMail({
      from: `"ชัชบัญชี" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: `✅ ${isTh ? 'ส่งกรมสรรพากรสำเร็จ' : 'RD Submission Success'}: ${data.invoiceNumber}`,
      html: buildRdSuccessHtml(data),
    });
    logger.info(`RD success email sent for ${data.invoiceNumber}`);
  } catch (err) {
    logger.error('Failed to send RD success email', err);
  }
}

export async function sendRdFailedEmail(
  adminEmail: string,
  data: InvoiceEmailData,
  reason: string,
): Promise<void> {
  if (!process.env.SMTP_HOST) { logger.warn('SMTP not configured, skipping email'); return; }
  try {
    await transporter.sendMail({
      from: `"ชัชบัญชี" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: `❌ RD Submission Failed: ${data.invoiceNumber}`,
      html: buildRdFailedHtml(data, reason),
    });
    logger.info(`RD failed email sent for ${data.invoiceNumber}`);
  } catch (err) {
    logger.error('Failed to send RD failed email', err);
  }
}

export async function sendInvoiceToCustomer(
  data: InvoiceEmailData,
): Promise<void> {
  if (!process.env.SMTP_HOST) { logger.warn('SMTP not configured, skipping email'); return; }
  if (!data.buyerEmail) { logger.warn(`No email for buyer, skipping send for ${data.invoiceNumber}`); return; }
  const isTh = data.language === 'th' || data.language === 'both';
  try {
    await transporter.sendMail({
      from: `"${data.sellerNameTh}" <${process.env.SMTP_USER}>`,
      to: data.buyerEmail,
      subject: `${isTh ? 'ใบกำกับภาษี' : 'Tax Invoice'} ${data.invoiceNumber}`,
      html: buildInvoiceForCustomerHtml(data),
    });
    logger.info(`Invoice email sent to ${data.buyerEmail} for ${data.invoiceNumber}`);
  } catch (err) {
    logger.error('Failed to send invoice email', err);
  }
}

export async function sendStatementToCustomer(
  data: StatementEmailData,
): Promise<void> {
  if (!process.env.SMTP_HOST) { logger.warn('SMTP not configured, skipping email'); return; }
  try {
    await transporter.sendMail({
      from: `"${data.companyNameTh}" <${process.env.SMTP_USER}>`,
      to: data.customerEmail,
      subject: `${data.language !== 'en' ? 'Statement of Account' : 'Statement of Account'} - ${data.companyNameTh}`,
      html: buildStatementForCustomerHtml(data),
      attachments: [
        {
          filename: data.filename,
          content: data.pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
    logger.info(`Statement email sent to ${data.customerEmail}`);
  } catch (err) {
    logger.error('Failed to send statement email', err);
  }
}

export async function sendBillingActivationEmail(
  data: BillingActivationEmailData,
): Promise<void> {
  if (!process.env.SMTP_HOST) { logger.warn('SMTP not configured, skipping email'); return; }
  try {
    await transporter.sendMail({
      from: `"ชัชบัญชี" <${process.env.SMTP_USER}>`,
      to: data.adminEmail,
      subject: `${data.locale === 'en' ? 'Account activated' : 'เปิดใช้งานระบบสำเร็จ'}: ${data.companyNameTh}`,
      html: buildBillingActivationHtml(data),
    });
    logger.info(`Billing activation email sent to ${data.adminEmail}`);
  } catch (err) {
    logger.error('Failed to send billing activation email', err);
  }
}

export async function sendRenewalLinkEmail(
  data: BillingRenewalLinkEmailData,
): Promise<void> {
  if (!process.env.SMTP_HOST) { logger.warn('SMTP not configured, skipping email'); return; }
  try {
    await transporter.sendMail({
      from: `"ชัชบัญชี" <${process.env.SMTP_USER}>`,
      to: data.adminEmail,
      subject: `${data.locale === 'en' ? 'Subscription renewal link' : 'ลิงก์ชำระค่าต่ออายุระบบ'}: ${data.companyNameTh}`,
      html: buildBillingRenewalLinkHtml(data),
    });
    logger.info(`Renewal link email sent to ${data.adminEmail}`);
  } catch (err) {
    logger.error('Failed to send renewal link email', err);
  }
}

export async function sendBillingPaymentFailedEmail(
  data: BillingPaymentFailedEmailData,
): Promise<void> {
  if (!process.env.SMTP_HOST) { logger.warn('SMTP not configured, skipping email'); return; }
  try {
    await transporter.sendMail({
      from: `"ชัชบัญชี" <${process.env.SMTP_USER}>`,
      to: data.adminEmail,
      subject: `${data.locale === 'en' ? 'Payment unsuccessful' : 'ชำระค่าบริการไม่สำเร็จ'}: ${data.companyNameTh}`,
      html: buildBillingPaymentFailedHtml(data),
    });
    logger.info(`Billing failure email sent to ${data.adminEmail}`);
  } catch (err) {
    logger.error('Failed to send billing failure email', err);
  }
}
