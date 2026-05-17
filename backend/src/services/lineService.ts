import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import { logger } from '../config/logger';
import { OcrResult } from './aiService';

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
const channelSecret = process.env.LINE_CHANNEL_SECRET ?? '';
const replyContext = new AsyncLocalStorage<{ replyToken: string; used: boolean; replyOnly?: boolean; pushTarget?: string }>();
const lineDiagnostics: {
  lastPushOkAt?: string;
  lastReplyOkAt?: string;
  lastPushFailure?: { at: string; status?: number; body?: string; error?: string };
  lastReplyFailure?: { at: string; status?: number; body?: string; error?: string };
} = {};

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
    if (ctx.replyOnly) {
      logger.warn('[Line] replyToken send failed; reply-only mode skipped push fallback', { lineUserId });
      return false;
    }
    logger.warn('[Line] replyToken send failed; falling back to push', { lineUserId });
  }
  if (ctx?.replyOnly) {
    logger.warn('[Line] reply-only mode skipped push fallback', { lineUserId });
    return false;
  }
  // When the message originated from a group/room and the reply token is
  // already used, push to the group/room (not the sender's private chat) so
  // the rest of the conversation stays where the user expects.
  const pushTo = ctx?.pushTarget ?? lineUserId;
  try {
    const body = JSON.stringify({ to: pushTo, messages });
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
      lineDiagnostics.lastPushFailure = { at: new Date().toISOString(), status: res.status, body: txt.slice(0, 500) };
      logger.error('[Line] push failed', { status: res.status, body: txt, lineUserId });
      return false;
    }
    lineDiagnostics.lastPushOkAt = new Date().toISOString();
    return true;
  } catch (err) {
    lineDiagnostics.lastPushFailure = { at: new Date().toISOString(), error: String(err) };
    logger.error('[Line] push error', { error: String(err), lineUserId });
    return false;
  }
}

export async function withLineReplyToken<T>(
  replyToken: string | undefined,
  fn: () => Promise<T>,
  options?: { replyOnly?: boolean; pushTarget?: string },
): Promise<T> {
  if (!replyToken) {
    if (options?.replyOnly) {
      return replyContext.run({ replyToken: '', used: true, replyOnly: true, pushTarget: options.pushTarget }, fn);
    }
    if (options?.pushTarget) {
      return replyContext.run({ replyToken: '', used: true, pushTarget: options.pushTarget }, fn);
    }
    return fn();
  }
  return replyContext.run({ replyToken, used: false, replyOnly: options?.replyOnly, pushTarget: options?.pushTarget }, fn);
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
      lineDiagnostics.lastReplyFailure = { at: new Date().toISOString(), status: res.status, body: txt.slice(0, 500) };
      logger.error('[Line] reply failed', { status: res.status, body: txt });
      return false;
    }
    lineDiagnostics.lastReplyOkAt = new Date().toISOString();
    return true;
  } catch (err) {
    lineDiagnostics.lastReplyFailure = { at: new Date().toISOString(), error: String(err) };
    logger.error('[Line] reply error', { error: String(err) });
    return false;
  }
}

export function getLineMessagingDiagnostics() {
  return {
    configured: !!channelAccessToken && !!channelSecret,
    hasChannelAccessToken: !!channelAccessToken,
    hasChannelSecret: !!channelSecret,
    ...lineDiagnostics,
  };
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

export async function sendLineFlexCarousel(
  lineUserId: string,
  altText: string,
  bubbles: object[],
): Promise<boolean> {
  if (bubbles.length === 0) return false;
  if (bubbles.length === 1) {
    return sendLineFlexMessage(lineUserId, altText, bubbles[0]);
  }
  // LINE allows up to 12 bubbles per carousel
  const capped = bubbles.slice(0, 12);
  return linePush(lineUserId, [{
    type: 'flex',
    altText,
    contents: { type: 'carousel', contents: capped },
  }]);
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

async function lineGetJson<T>(url: string): Promise<T | null> {
  if (!channelAccessToken) return null;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${channelAccessToken}` },
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn('[Line] API GET failed', { url, status: res.status, body: body.slice(0, 500) });
      return null;
    }
    return await res.json() as T;
  } catch (err) {
    logger.warn('[Line] API GET error', { url, error: String(err) });
    return null;
  }
}

export async function getLineGroupSummary(lineGroupId: string): Promise<{ groupName?: string; pictureUrl?: string } | null> {
  return lineGetJson<{ groupName?: string; pictureUrl?: string }>(
    `https://api.line.me/v2/bot/group/${encodeURIComponent(lineGroupId)}/summary`,
  );
}

export async function getLineUserProfile(lineUserId: string): Promise<{ displayName?: string; pictureUrl?: string; userId?: string } | null> {
  return lineGetJson<{ displayName?: string; pictureUrl?: string; userId?: string }>(
    `https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`,
  );
}

export async function getLineGroupMemberCount(lineGroupId: string): Promise<number | null> {
  const json = await lineGetJson<{ count?: number }>(
    `https://api.line.me/v2/bot/group/${encodeURIComponent(lineGroupId)}/members/count`,
  );
  return typeof json?.count === 'number' ? json.count : null;
}

export async function getLineRoomMemberCount(lineRoomId: string): Promise<number | null> {
  const json = await lineGetJson<{ count?: number }>(
    `https://api.line.me/v2/bot/room/${encodeURIComponent(lineRoomId)}/members/count`,
  );
  return typeof json?.count === 'number' ? json.count : null;
}

export async function getLineGroupMemberProfile(
  lineGroupId: string,
  lineUserId: string,
): Promise<{ displayName?: string; pictureUrl?: string; userId?: string } | null> {
  return lineGetJson<{ displayName?: string; pictureUrl?: string; userId?: string }>(
    `https://api.line.me/v2/bot/group/${encodeURIComponent(lineGroupId)}/member/${encodeURIComponent(lineUserId)}`,
  );
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
            label: 'ดูทั้งหมดใน ชัชบัญชี',
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

function formatForeignAmount(currency: string, amount: number): string {
  // Use Intl.NumberFormat for currencies we know LINE renders cleanly.
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency.toUpperCase()}`;
  }
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

  const category = result.expenseCategory || result.postingSuggestion;
  const subcategory = result.expenseSubcategory;

  // Foreign currency display — show '$2,765.55 USD ≈ ฿90,116.93' when the
  // doc was originally in a non-THB currency. The Thai amount is the
  // converted value (auto-computed via fxRateService).
  const isForeign = !!(result.originalCurrency && result.originalCurrency !== 'THB' && result.originalTotal);
  const totalDisplay = isForeign && result.originalTotal
    ? `${formatForeignAmount(result.originalCurrency!, result.originalTotal)} ≈ ${fmt(result.total)}`
    : (result.total ? fmt(result.total) : '-');

  const bodyContents: object[] = [
    row('ยอดรวม', totalDisplay, true),
    row('ประเภทเอกสาร', result.documentTypeLabel || '-'),
    row('วันที่', result.invoiceDate || '-'),
    { type: 'separator', margin: 'sm' },
    row('ผู้ขาย/ร้านค้า', result.supplierName || '-'),
    row('เลขผู้เสียภาษี', taxIdDisplay),
    row('เลขที่เอกสาร', result.invoiceNumber || '-'),
  ];

  if (isForeign && result.exchangeRate) {
    bodyContents.push(row('💱 อัตราแลกเปลี่ยน', `${result.originalCurrency} → THB @ ${result.exchangeRate.toLocaleString('th-TH', { maximumFractionDigits: 6 })}`));
  }

  if (category || subcategory) {
    bodyContents.push({ type: 'separator', margin: 'sm' });
    if (category) bodyContents.push(row('หมวดหมู่', category));
    if (subcategory) bodyContents.push(row('หมวดหมู่ย่อย', subcategory));
  }

  if (result.subtotal || result.vatAmount) {
    bodyContents.push({ type: 'separator', margin: 'sm' });
    bodyContents.push(row('ยอดก่อน VAT', result.subtotal ? fmt(result.subtotal) : '-'));
    bodyContents.push(row('ภาษีมูลค่าเพิ่ม', result.vatAmount ? fmt(result.vatAmount) : '-'));
  }

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

export function buildIntakeConfirmFlexCard(result: OcrResult, intakeId: string, opts: { editUrl?: string } = {}): object {
  const { header, body } = buildOcrFlexCardContents(result);
  const editButton = opts.editUrl
    ? {
        type: 'button',
        style: 'secondary',
        action: { type: 'uri', label: '✏️ แก้ไขในเว็บ', uri: opts.editUrl },
      }
    : {
        type: 'button',
        style: 'secondary',
        action: { type: 'postback', label: '✏️ แก้ไข', data: `edit_intake:${intakeId}` },
      };
  return {
    type: 'bubble',
    header,
    body,
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#16a34a',
          action: { type: 'postback', label: '✅ บันทึก', data: `confirm_intake:${intakeId}` },
        },
        editButton,
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'postback', label: '❌ ยกเลิก', data: `cancel_intake:${intakeId}` },
        },
      ],
    },
  };
}

export function buildIntakeSavedFlexCard(result: OcrResult, opts: { viewUrl?: string; editPostback?: string; submittedBy?: string; approvedBy?: string } = {}): object {
  const { body: baseBody } = buildOcrFlexCardContents(result);
  // Append submitter/approver attribution rows to the existing body so the
  // saved card matches paypers UX ('ผู้ขออนุญาตเบิก: ...'). Both are
  // optional — caller only passes them when LINE conversation context
  // provides the sender's user.name.
  type BoxObj = { type: string; layout: string; spacing?: string; contents: object[] };
  const body = baseBody as BoxObj;
  const attributionRow = (label: string, value: string) => ({
    type: 'box', layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'xs', color: '#888888', flex: 3 },
      { type: 'text', text: value, size: 'sm', color: '#111111', flex: 5, align: 'end' as const, wrap: true },
    ],
  });
  if (opts.submittedBy || opts.approvedBy) {
    body.contents.push({ type: 'separator', margin: 'sm' });
    if (opts.submittedBy) body.contents.push(attributionRow('👤 ส่งโดย', opts.submittedBy));
    if (opts.approvedBy) body.contents.push(attributionRow('✅ อนุมัติโดย', opts.approvedBy));
  }
  const footerButtons: object[] = [];
  if (opts.viewUrl) {
    footerButtons.push({
      type: 'button',
      style: 'link',
      flex: 1,
      action: { type: 'uri', label: '🧾 ดูใบแทนใบเสร็จ', uri: opts.viewUrl },
    });
  }
  if (opts.editPostback) {
    footerButtons.push({
      type: 'button',
      style: 'link',
      flex: 1,
      action: { type: 'postback', label: '✏️ แก้ไข', data: opts.editPostback },
    });
  }
  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#16a34a',
      contents: [
        {
          type: 'text',
          text: '✅ บันทึกค่าใช้จ่ายสำเร็จ',
          color: '#ffffff',
          size: 'md',
          weight: 'bold' as const,
        },
      ],
    },
    body,
    ...(footerButtons.length > 0
      ? {
          footer: {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: footerButtons,
          },
        }
      : {}),
  };
}

export interface MatchCandidate {
  type: 'sales_invoice' | 'purchase_invoice';
  id: string;
  invoiceNumber: string;
  partyName: string;
  total: number;
  invoiceDate: string | null;
  score: number;
  amountDelta: number;
}

export function buildMatchCandidateBubble(
  candidate: MatchCandidate,
  intakeId: string,
): object {
  const fmt = (n: number) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);
  const typeBadge = candidate.type === 'sales_invoice'
    ? { label: '📥 ใบขายเงินเข้า', bg: '#dcfce7', fg: '#166534' }
    : { label: '📤 ใบซื้อต้องจ่าย', bg: '#dbeafe', fg: '#1e40af' };
  const deltaLabel = candidate.amountDelta === 0
    ? '🎯 ยอดตรงเป๊ะ'
    : `±฿${Math.abs(candidate.amountDelta).toLocaleString('th-TH')}`;

  const row = (label: string, value: string, bold = false) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'xs', color: '#888888', flex: 3 },
      { type: 'text', text: value, size: bold ? 'md' : 'sm', color: '#111111', flex: 5, align: 'end' as const, wrap: true, weight: bold ? 'bold' as const : 'regular' as const },
    ],
  });

  return {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: typeBadge.bg,
          cornerRadius: '4px',
          paddingAll: '6px',
          contents: [{ type: 'text', text: typeBadge.label, color: typeBadge.fg, size: 'xs', weight: 'bold' as const, align: 'center' as const }],
        },
        row('💵 ยอด', fmt(candidate.total), true),
        row('📄 เลขที่', candidate.invoiceNumber),
        row(candidate.type === 'sales_invoice' ? '👤 ลูกค้า' : '🏢 ผู้ขาย', candidate.partyName || '-'),
        row('📅 วันที่', candidate.invoiceDate ?? '-'),
        { type: 'separator', margin: 'sm' },
        row('ตรงกัน', `${deltaLabel} · ⭐ ${candidate.score}%`),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#16a34a',
          action: {
            type: 'postback',
            label: '✅ เลือกใบนี้',
            data: `select_match:${intakeId}:${candidate.type}:${candidate.id}`,
          },
        },
      ],
    },
  };
}

export function buildMatchOptionsBubble(intakeId: string, options: { askDirection?: boolean; allowUpload?: boolean } = {}): object {
  const buttons: object[] = [];
  if (options.askDirection) {
    buttons.push({
      type: 'button', style: 'primary', color: '#16a34a',
      action: { type: 'postback', label: '📥 รับเงินจากลูกค้า', data: `match_direction:${intakeId}:incoming` },
    });
    buttons.push({
      type: 'button', style: 'primary', color: '#1e40af',
      action: { type: 'postback', label: '📤 จ่ายให้ผู้ขาย', data: `match_direction:${intakeId}:outgoing` },
    });
  }
  if (options.allowUpload) {
    buttons.push({
      type: 'button', style: 'secondary',
      action: { type: 'postback', label: '📤 อัพโหลดบิลเพิ่ม', data: `upload_bill_for_slip:${intakeId}` },
    });
  }
  buttons.push({
    type: 'button', style: 'secondary',
    action: { type: 'postback', label: '⏭ ข้ามไปก่อน (ยังไม่จับคู่)', data: `skip_match:${intakeId}` },
  });

  return {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'สลิปนี้คู่กับบิลไหน?', weight: 'bold' as const, size: 'md', align: 'center' as const },
        { type: 'text', text: 'เลือกประเภท หรือข้ามไปก่อน', size: 'xs', color: '#888888', align: 'center' as const, wrap: true },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: buttons,
    },
  };
}

export type PaymentSlipStatus = 'matched' | 'shortlist' | 'unmatched' | 'saved' | 'pending';

export function buildPaymentSlipFlexCard(
  result: OcrResult,
  status: PaymentSlipStatus,
  opts: {
    matchedInvoiceNumber?: string;
    matchedCustomerName?: string;
    matchedSupplierName?: string;
    matchScore?: number;
    intakeId?: string;
    purchaseInvoiceId?: string;
    invoiceId?: string;
  } = {},
): object {
  const fmt = (n: number) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);

  const payment = result.payment ?? {};
  const amount = Number(payment.amount ?? result.total ?? 0);
  const direction = payment.direction ?? 'unknown';

  const headerByStatus: Record<PaymentSlipStatus, { color: string; text: string }> = {
    matched:   { color: '#16a34a', text: '✅ จับคู่สลิปกับเอกสารแล้ว' },
    saved:     { color: '#16a34a', text: '✅ บันทึกสลิปโอนเงิน' },
    shortlist: { color: '#d97706', text: '🟡 พบเอกสารคล้าย — ช่วยยืนยัน' },
    pending:   { color: '#d97706', text: '🟡 รอตรวจสอบ' },
    unmatched: { color: '#dc2626', text: '🔍 สลิปโอนเงิน — ยังไม่พบคู่' },
  };

  const directionBadge = direction === 'incoming'
    ? { label: '🟢 เงินเข้า (รับจากลูกค้า)', bg: '#dcfce7', fg: '#166534' }
    : direction === 'outgoing'
      ? { label: '🔵 เงินออก (จ่ายผู้ขาย)', bg: '#dbeafe', fg: '#1e40af' }
      : null;

  const row = (label: string, value: string, bold = false) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#888888', flex: 3 },
      { type: 'text', text: value, size: bold ? 'lg' : 'sm', color: '#111111', flex: 5, align: 'end' as const, wrap: true, weight: bold ? 'bold' as const : 'regular' as const },
    ],
  });

  const partyLine = (party?: { name?: string; account?: string }) => {
    if (!party?.name && !party?.account) return '-';
    if (party.name && party.account) return `${party.name}\n${party.account}`;
    return party.name || party.account || '-';
  };

  const bodyContents: object[] = [];

  if (directionBadge) {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: directionBadge.bg,
      cornerRadius: '4px',
      paddingAll: '6px',
      contents: [{ type: 'text', text: directionBadge.label, color: directionBadge.fg, size: 'xs', weight: 'bold' as const, align: 'center' as const }],
    });
  }

  bodyContents.push(row('💵 ยอด', amount ? fmt(amount) : '-', true));
  if (payment.bankName) bodyContents.push(row('🏦 ธนาคาร/แอป', payment.bankName));
  bodyContents.push({ type: 'separator', margin: 'sm' });
  bodyContents.push(row('📤 จาก', partyLine({ name: payment.fromName, account: payment.fromAccount })));
  bodyContents.push(row('📥 ถึง',  partyLine({ name: payment.toName,   account: payment.toAccount })));
  if (payment.paidAt) bodyContents.push(row('📅 วันเวลา', payment.paidAt));
  if (payment.reference) bodyContents.push(row('🔢 เลขอ้างอิง', payment.reference));

  if (status === 'matched' || status === 'saved') {
    if (opts.matchedInvoiceNumber || opts.matchedCustomerName || opts.matchedSupplierName) {
      bodyContents.push({ type: 'separator', margin: 'sm' });
      if (opts.matchedInvoiceNumber) bodyContents.push(row('📄 เลขที่เอกสาร', opts.matchedInvoiceNumber));
      if (opts.matchedCustomerName) bodyContents.push(row('👤 ลูกค้า', opts.matchedCustomerName));
      if (opts.matchedSupplierName) bodyContents.push(row('🏢 ผู้ขาย', opts.matchedSupplierName));
      if (typeof opts.matchScore === 'number') bodyContents.push(row('⭐ คะแนน', `${opts.matchScore}%`));
    }
  }

  const footerButtons: object[] = [];
  if (status === 'matched' || status === 'saved') {
    if (opts.invoiceId) {
      footerButtons.push({
        type: 'button', style: 'link', flex: 1,
        action: { type: 'postback', label: '📄 ดูใบแจ้งหนี้', data: `view_invoice:${opts.invoiceId}` },
      });
    } else if (opts.purchaseInvoiceId) {
      footerButtons.push({
        type: 'button', style: 'link', flex: 1,
        action: { type: 'postback', label: '📄 ดูเอกสาร', data: `edit_purchase:${opts.purchaseInvoiceId}` },
      });
    }
    if (opts.intakeId) {
      footerButtons.push({
        type: 'button', style: 'link', flex: 1,
        action: { type: 'postback', label: '✏️ แก้ไข', data: `edit_intake:${opts.intakeId}` },
      });
    }
  } else if (status === 'shortlist') {
    if (opts.invoiceId) {
      footerButtons.push({
        type: 'button', style: 'primary', color: '#16a34a', flex: 1,
        action: { type: 'postback', label: '✅ ใช่ใบนี้', data: `confirm_match:${opts.intakeId ?? ''}:${opts.invoiceId}` },
      });
    }
    footerButtons.push({
      type: 'button', style: 'secondary', flex: 1,
      action: { type: 'postback', label: '❌ ไม่ใช่', data: `reject_match:${opts.intakeId ?? ''}` },
    });
  } else if (status === 'unmatched' && opts.intakeId) {
    footerButtons.push({
      type: 'button', style: 'primary', color: '#16a34a', flex: 1,
      action: { type: 'postback', label: '🔗 จับคู่ด้วยมือ', data: `manual_match:${opts.intakeId}` },
    });
    footerButtons.push({
      type: 'button', style: 'secondary', flex: 1,
      action: { type: 'postback', label: '✏️ แก้ไข', data: `edit_intake:${opts.intakeId}` },
    });
  } else if (status === 'pending' && opts.intakeId) {
    footerButtons.push({
      type: 'button', style: 'primary', color: '#16a34a', flex: 1,
      action: { type: 'postback', label: '✅ บันทึก', data: `confirm_intake:${opts.intakeId}` },
    });
    footerButtons.push({
      type: 'button', style: 'secondary', flex: 1,
      action: { type: 'postback', label: '✏️ แก้ไข', data: `edit_intake:${opts.intakeId}` },
    });
    footerButtons.push({
      type: 'button', style: 'secondary', flex: 1,
      action: { type: 'postback', label: '❌ ยกเลิก', data: `cancel_intake:${opts.intakeId}` },
    });
  }

  const headerCfg = headerByStatus[status];
  // 3 buttons in a horizontal row makes LINE truncate Thai labels to "บั..." "แ..." "ย...".
  // Switch to vertical (1 per row, full width) once we have 3+ buttons.
  const footerLayout = footerButtons.length >= 3 ? 'vertical' : 'horizontal';
  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: headerCfg.color,
      contents: [
        { type: 'text', text: headerCfg.text, color: '#ffffff', size: 'md', weight: 'bold' as const },
      ],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: bodyContents },
    ...(footerButtons.length > 0
      ? { footer: { type: 'box', layout: footerLayout, spacing: 'sm', contents: footerButtons } }
      : {}),
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
