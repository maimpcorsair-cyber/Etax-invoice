import { messagingApi } from '@line/bot-sdk';
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

let _lineClient: messagingApi.MessagingApiClient | null = null;

function getLineClient(): messagingApi.MessagingApiClient | null {
  if (!channelAccessToken) {
    logger.warn('[Line] LINE_CHANNEL_ACCESS_TOKEN not set — Line messaging disabled');
    return null;
  }
  if (!_lineClient) {
    _lineClient = new messagingApi.MessagingApiClient({ channelAccessToken });
  }
  return _lineClient;
}

export async function sendLineText(lineUserId: string, text: string): Promise<boolean> {
  const client = getLineClient();
  if (!client) return false;
  try {
    await client.pushMessage({
      to: lineUserId,
      messages: [{ type: 'text', text }],
    });
    return true;
  } catch (err) {
    logger.error('[Line] sendLineText failed', { err, lineUserId });
    return false;
  }
}

export async function sendLineFlexMessage(
  lineUserId: string,
  altText: string,
  flex: object,
): Promise<boolean> {
  const client = getLineClient();
  if (!client) return false;
  try {
    await client.pushMessage({
      to: lineUserId,
      messages: [
        {
          type: 'flex',
          altText,
          contents: flex as messagingApi.FlexContainer,
        },
      ],
    });
    return true;
  } catch (err) {
    logger.error('[Line] sendLineFlexMessage failed', { err, lineUserId });
    return false;
  }
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
          text: '📄 ตรวจพบใบแจ้งหนี้',
          color: '#ffffff',
          size: 'md',
          weight: 'bold',
        },
        {
          type: 'text',
          text: `ความมั่นใจ: ${result.confidence === 'high' ? 'สูง' : result.confidence === 'medium' ? 'ปานกลาง' : 'ต่ำ'}`,
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
        row('เลขผู้เสียภาษี', result.supplierTaxId || '-'),
        row('เลขที่ใบกำกับ', result.invoiceNumber || '-'),
        row('วันที่', result.invoiceDate || '-'),
        row('ยอดก่อนภาษี', result.subtotal ? fmt(result.subtotal) : '-'),
        row('ภาษีมูลค่าเพิ่ม', result.vatAmount ? fmt(result.vatAmount) : '-'),
        row('ยอดรวม', result.total ? fmt(result.total) : '-'),
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
            label: '✅ บันทึกภาษีซื้อ',
            data: `confirm_purchase:${tempId}`,
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
