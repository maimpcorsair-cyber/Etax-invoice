import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import { logger } from '../config/logger';
import { OcrResult } from './aiService';

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
const channelSecret = process.env.LINE_CHANNEL_SECRET ?? '';
const replyContext = new AsyncLocalStorage<{ replyToken: string; used: boolean }>();

export interface OverdueInvoice {
  invoiceNumber: string;
  customerName: string;
  total: number;
  dueDate: Date;
  daysOverdue: number;
}

async function linePush(lineUserId: string, messages: object[]): Promise<boolean> {
  if (!channelAccessToken) {
    logger.warn('[Line] LINE_CHANNEL_ACCESS_TOKEN not set — Line messaging disabled');
    return false;
  }
  const ctx = replyContext.getStore();
  if (ctx && !ctx.used) {
    ctx.used = true;
    const replied = await lineReply(ctx.replyToken, messages);
    if (replied) return true;
    logger.warn('[Line] replyToken send failed; falling back to push', { lineUserId });
  }
  try {
    const body = JSON.stringify({ to: lineUserId, messages });
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    if (!res.ok) {
      const txt = await res.text();
      logger.error('[Line] push failed', { status: res.status, body: txt, lineUserId });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('[Line] push error', { error: String(err), lineUserId });
    return false;
  }
}

export async function withLineReplyToken<T>(replyToken: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!replyToken) return fn();
  return replyContext.run({ replyToken, used: false }, fn);
}

async function lineReply(replyToken: string, messages: object[]): Promise<boolean> {
  if (!channelAccessToken) {
    logger.warn('[Line] LINE_CHANNEL_ACCESS_TOKEN not set — Line messaging disabled');
    return false;
  }
  try {
    const body = JSON.stringify({ replyToken, messages });
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    if (!res.ok) {
      const txt = await res.text();
      logger.error('[Line] reply failed', { status: res.status, body: txt });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('[Line] reply error', { error: String(err) });
    return false;
  }
}

export async function sendLineText(lineUserId: string, text: string): Promise<boolean> {
  return linePush(lineUserId, [{ type: 'text', text }]);
}

export async function replyLineText(replyToken: string, text: string): Promise<boolean> {
  return lineReply(replyToken, [{ type: 'text', text }]);
}

export async function sendLineFlexMessage(
  lineUserId: string,
  altText: string,
  flex: object,
): Promise<boolean> {
  return linePush(lineUserId, [{ type: 'flex', altText, contents: flex }]);
}

export async function sendLineTextWithQuickReply(
  lineUserId: string,
  text: string,
  buttons: Array<{ label: string; text?: string; data?: string; displayText?: string }>,
): Promise<boolean> {
  const items = buttons.map((b) => ({
    type: 'action',
    action: b.data
      ? { type: 'postback', label: b.label, data: b.data, displayText: b.displayText ?? b.label }
      : { type: 'message', label: b.label, text: b.text ?? b.label },
  }));
  return linePush(lineUserId, [{ type: 'text', text, quickReply: { items } }]);
}

export function buildOverdueFlexCard(invoices: OverdueInvoice[]): object {
  const displayInvoices = invoices.slice(0, 5);

  const rows = displayInvoices.map((inv) => ({
    type: 'box',
    layout: 'vertical',
    margin: 'sm',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: inv.invoiceNumber,
            size: 'sm',
            color: '#333333',
            flex: 2,
            weight: 'bold',
          },
          {
            type: 'text',
            text: `${inv.daysOverdue} วัน`,
            size: 'sm',
            color: '#dc2626',
            flex: 1,
            align: 'end',
          },
        ],
      },
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: inv.customerName,
            size: 'xs',
            color: '#888888',
            flex: 2,
          },
          {
            type: 'text',
            text: new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(inv.total),
            size: 'xs',
            color: '#555555',
            flex: 1,
            align: 'end',
          },
        ],
      },
    ],
  }));

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#dc2626',
      contents: [
        {
          type: 'text',
          text: '⚠️ ใบแจ้งหนี้เกินกำหนด',
          color: '#ffffff',
          size: 'md',
          weight: 'bold',
        },
        {
          type: 'text',
          text: `${invoices.length} รายการ`,
          color: '#fecaca',
          size: 'sm',
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: rows.length > 0 ? rows : [
        { type: 'text', text: 'ไม่มีใบแจ้งหนี้เกินกำหนด', color: '#888888', size: 'sm' },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#dc2626',
          action: {
            type: 'uri',
            label: 'ดูทั้งหมดใน e-Tax',
            uri: 'https://etax-invoice.vercel.app/app/invoices',
          },
        },
      ],
    },
  };
}

export interface InvoiceSummary {
  invoiceNumber: string;
  buyerName: string;
  total: number;
  vatAmount: number;
  invoiceDate: Date;
  dueDate: Date | null;
  status: string;
  isPaid: boolean;
  pdfUrl: string | null;
}

export function buildInvoiceFlexCard(inv: InvoiceSummary): object {
  const fmt = (n: number) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);

  const statusLabel: Record<string, string> = {
    draft: '📝 ร่าง', pending: '⏳ รอดำเนินการ', approved: '✅ อนุมัติ',
    submitted: '📤 ส่ง RD แล้ว', cancelled: '❌ ยกเลิก',
  };

  const headerColor = inv.isPaid ? '#16a34a' : inv.status === 'cancelled' ? '#6b7280' : '#2563eb';

  const row = (label: string, value: string) => ({
    type: 'box', layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#888888', flex: 3 },
      { type: 'text', text: value, size: 'sm', color: '#333333', flex: 4, align: 'end', wrap: true },
    ],
  });

  const footerButtons: object[] = [];
  if (inv.pdfUrl) {
    footerButtons.push({
      type: 'button', style: 'primary', color: headerColor, flex: 1,
      action: { type: 'uri', label: '📄 เปิด PDF', uri: inv.pdfUrl },
    });
  }
  footerButtons.push({
    type: 'button', style: 'secondary', flex: 1,
    action: {
      type: 'uri', label: '🌐 ดูในระบบ',
      uri: `https://etax-invoice.vercel.app/app/invoices`,
    },
  });

  return {
    type: 'bubble',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: headerColor,
      contents: [
        { type: 'text', text: '📄 ใบกำกับภาษี', color: '#ffffff', size: 'sm' },
        { type: 'text', text: inv.invoiceNumber, color: '#ffffff', size: 'lg', weight: 'bold' },
        { type: 'text', text: inv.isPaid ? '✅ ชำระแล้ว' : (statusLabel[inv.status] ?? inv.status), color: '#dbeafe', size: 'xs' },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        row('ลูกค้า', inv.buyerName),
        row('วันที่', new Date(inv.invoiceDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })),
        inv.dueDate ? row('ครบกำหนด', new Date(inv.dueDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })) : null,
        { type: 'separator', margin: 'sm' },
        row('ภาษีมูลค่าเพิ่ม', fmt(inv.vatAmount)),
        row('ยอดรวม', fmt(inv.total)),
      ].filter(Boolean),
    },
    footer: {
      type: 'box', layout: 'horizontal', spacing: 'sm',
      contents: footerButtons,
    },
  };
}

function buildOcrFlexCardContents(result: OcrResult): { header: object; body: object } {
  const fmt = (n: number) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);

  const headerColor =
    result.confidence === 'high' ? '#16a34a' :
    result.confidence === 'medium' ? '#d97706' :
    '#dc2626';

  const confidenceLabel =
    result.confidence === 'high' ? 'สูง' :
    result.confidence === 'medium' ? 'กลาง' :
    'ต่ำ';

  const row = (label: string, value: string, bold = false) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#888888', flex: 3 },
      { type: 'text', text: value, size: bold ? 'md' : 'sm', color: '#111111', flex: 4, align: 'end' as const, wrap: true, weight: bold ? 'bold' as const : 'regular' as const },
    ],
  });

  const taxIdDisplay = result.supplierTaxId && result.supplierTaxId.length > 4
    ? `****${result.supplierTaxId.slice(-4)}`
    : (result.supplierTaxId || '-');

  const bodyContents: object[] = [
    row('ผู้ขาย', result.supplierName || '-'),
    row('เลขผู้เสียภาษี', taxIdDisplay),
    row('เลขที่เอกสาร', result.invoiceNumber || '-'),
    row('วันที่', result.invoiceDate || '-'),
    { type: 'separator', margin: 'sm' },
    row('ยอดก่อน VAT', result.subtotal ? fmt(result.subtotal) : '-'),
    row('ภาษีมูลค่าเพิ่ม', result.vatAmount ? fmt(result.vatAmount) : '-'),
    row('ยอดรวม', result.total ? fmt(result.total) : '-', true),
  ];

  if (result.validationWarnings?.length) {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      margin: 'sm',
      backgroundColor: '#fff7ed',
      cornerRadius: '4px',
      paddingAll: '8px',
      contents: [
        {
          type: 'text',
          text: `⚠️ ข้อควรตรวจ:\n${result.validationWarnings.join('\n')}`,
          size: 'xs',
          color: '#92400e',
          wrap: true,
        },
      ],
    });
  }

  return {
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: headerColor,
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: `📄 ${result.documentTypeLabel || 'เอกสาร'}`,
              color: '#ffffff',
              size: 'md',
              weight: 'bold' as const,
              flex: 1,
            },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: 'rgba(0,0,0,0.25)',
              cornerRadius: '4px',
              paddingAll: '4px',
              contents: [
                { type: 'text', text: confidenceLabel, color: '#ffffff', size: 'xs', align: 'center' as const },
              ],
            },
          ],
        },
        ...(result.extractionProvider ? [{
          type: 'text',
          text: result.extractionProvider,
          color: 'rgba(255,255,255,0.75)',
          size: 'xs',
        }] : []),
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: bodyContents,
    },
  };
}

export function buildIntakeConfirmFlexCard(result: OcrResult, intakeId: string): object {
  const { header, body } = buildOcrFlexCardContents(result);
  return {
    type: 'bubble',
    header,
    body,
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#16a34a',
          flex: 1,
          action: { type: 'postback', label: '✅ บันทึก', data: `confirm_intake:${intakeId}` },
        },
        {
          type: 'button',
          style: 'secondary',
          flex: 1,
          action: { type: 'postback', label: '✏️ แก้ไข', data: `edit_intake:${intakeId}` },
        },
        {
          type: 'button',
          style: 'secondary',
          flex: 1,
          action: { type: 'postback', label: '❌ ยกเลิก', data: `cancel_intake:${intakeId}` },
        },
      ],
    },
  };
}

export function buildOcrConfirmFlexCard(result: OcrResult, tempId: string): object {
  const { header, body } = buildOcrFlexCardContents(result);
  return {
    type: 'bubble',
    header,
    body,
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#16a34a',
          flex: 1,
          action: { type: 'postback', label: '✅ บันทึก', data: `confirm_purchase:${tempId}` },
        },
        {
          type: 'button',
          style: 'secondary',
          flex: 1,
          action: { type: 'postback', label: '✏️ แก้ไข', data: `edit_before_save:${tempId}` },
        },
        {
          type: 'button',
          style: 'secondary',
          flex: 1,
          action: { type: 'postback', label: '❌ ยกเลิก', data: `reject_purchase:${tempId}` },
        },
      ],
    },
  };
}

export function verifyLineSignature(body: Buffer, signature: string): boolean {
  if (!channelSecret) {
    logger.warn('[Line] LINE_CHANNEL_SECRET not set — cannot verify signature');
    return false;
  }
  try {
    const hmac = crypto.createHmac('sha256', channelSecret);
    hmac.update(body);
    const digest = hmac.digest('base64');
    return digest === signature;
  } catch (err) {
    logger.error('[Line] verifyLineSignature error', { error: String(err) });
    return false;
  }
}
