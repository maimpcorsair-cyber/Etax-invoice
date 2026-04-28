import crypto from 'crypto';
import { logger } from '../config/logger';
import { OcrResult } from './aiService';

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
const channelSecret = process.env.LINE_CHANNEL_SECRET ?? '';

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

export async function sendLineText(lineUserId: string, text: string): Promise<boolean> {
  return linePush(lineUserId, [{ type: 'text', text }]);
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

export function buildOcrConfirmFlexCard(result: OcrResult, tempId: string): object {
  const fmt = (n: number) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);

  const row = (label: string, value: string) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#888888', flex: 2 },
      { type: 'text', text: value, size: 'sm', color: '#333333', flex: 3, align: 'end', wrap: true },
    ],
  });

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#16a34a',
      contents: [
        {
          type: 'text',
          text: `📄 ตรวจพบ${result.documentTypeLabel || 'เอกสาร'}`,
          color: '#ffffff',
          size: 'md',
          weight: 'bold',
        },
        {
          type: 'text',
          text: `ความมั่นใจ: ${result.confidence === 'high' ? 'สูง' : result.confidence === 'medium' ? 'ปานกลาง' : 'ต่ำ'}${result.extractionProvider ? ` • ${result.extractionProvider}` : ''}`,
          color: '#bbf7d0',
          size: 'xs',
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        row('ผู้ขาย', result.supplierName || '-'),
        row('ประเภท', result.documentTypeLabel || '-'),
        row('เลขผู้เสียภาษี', result.supplierTaxId || '-'),
        row('เลขที่ใบกำกับ', result.invoiceNumber || '-'),
        row('วันที่', result.invoiceDate || '-'),
        row('ยอดก่อนภาษี', result.subtotal ? fmt(result.subtotal) : '-'),
        row('ภาษีมูลค่าเพิ่ม', result.vatAmount ? fmt(result.vatAmount) : '-'),
        row('ยอดรวม', result.total ? fmt(result.total) : '-'),
        ...(result.validationWarnings?.length
          ? [row('หมายเหตุ', result.validationWarnings.slice(0, 2).join(', '))]
          : []),
      ],
    },
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
          action: {
            type: 'postback',
            label: '✅ บันทึก',
            data: `confirm_purchase:${tempId}`,
          },
        },
        {
          type: 'button',
          style: 'secondary',
          flex: 1,
          action: {
            type: 'postback',
            label: '✏️ แก้ไข',
            data: `edit_before_save:${tempId}`,
          },
        },
        {
          type: 'button',
          style: 'secondary',
          flex: 1,
          action: {
            type: 'postback',
            label: '❌ ยกเลิก',
            data: `reject_purchase:${tempId}`,
          },
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
