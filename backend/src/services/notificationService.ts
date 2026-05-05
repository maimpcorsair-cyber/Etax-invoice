/**
 * notificationService.ts
 * FCM push notification service via Firebase Admin SDK.
 *
 * Set FIREBASE_SERVICE_ACCOUNT_JSON in the environment (Render dashboard) to enable.
 * If the env var is absent the service degrades gracefully — all sends return false.
 */

import admin from 'firebase-admin';
import { logger } from '../config/logger';

let initialized = false;

function initFirebase(): void {
  if (initialized) return;
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountKey) {
    logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled');
    return;
  }
  try {
    const serviceAccount = JSON.parse(serviceAccountKey) as admin.ServiceAccount;
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    initialized = true;
    logger.info('Firebase Admin initialized');
  } catch (err) {
    logger.error('Firebase Admin init failed', err);
  }
}

export interface PushPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushNotification(payload: PushPayload): Promise<boolean> {
  initFirebase();
  if (!initialized) return false;
  try {
    await admin.messaging().send({
      token: payload.token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      android: {
        priority: 'high',
        notification: { sound: 'default', channelId: 'etax_alerts' },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    });
    logger.info('FCM send succeeded', { token: payload.token.slice(0, 10) + '...' });
    return true;
  } catch (err) {
    logger.error('FCM send failed', err);
    return false;
  }
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  // Dynamic import to avoid circular dependency with database config
  const { default: prisma } = await import('../config/database');
  const tokens = await prisma.fcmToken.findMany({ where: { userId, isActive: true } });
  if (tokens.length === 0) return;
  await Promise.allSettled(
    tokens.map((t) => sendPushNotification({ token: t.token, title, body, data })),
  );
}

export async function sendRdResultNotification(
  invoiceId: string,
  success: boolean,
  invoiceNumber: string,
  userId: string,
): Promise<void> {
  const title = success ? 'ส่ง RD สำเร็จ' : 'ส่ง RD ไม่สำเร็จ';
  const body = success
    ? `${invoiceNumber} ส่งไปยังกรมสรรพากรเรียบร้อยแล้ว`
    : `${invoiceNumber} ส่งไม่สำเร็จ กรุณาตรวจสอบและลองใหม่`;
  await sendPushToUser(userId, title, body, {
    invoiceId,
    type: 'rd_result',
    success: String(success),
  });
}

/**
 * Notify admins (via FCM push) when a new invoice is officially issued.
 * Triggers right after the invoice number is upgraded from DRAFT-.
 */
export async function sendInvoiceIssuedNotification(
  invoiceId: string,
  invoiceNumber: string,
  companyId: string,
): Promise<void> {
  const { default: prisma } = await import('../config/database');

  // Find admin/super_admin users with active FCM tokens in this company
  const tokens = await prisma.fcmToken.findMany({
    where: {
      user: { companyId, isActive: true, role: { in: ['admin', 'super_admin', 'accountant'] } },
      isActive: true,
    },
    select: { token: true },
  });
  if (tokens.length === 0) return;

  await Promise.allSettled(
    tokens.map(({ token }) =>
      sendPushNotification({
        token,
        title: '📄 ออกเอกสารสำเร็จ',
        body: `${invoiceNumber} พร้อมใช้งานแล้ว`,
        data: { invoiceId, type: 'invoice_issued' },
      }),
    ),
  );
}

/**
 * Notify admins (via LINE push) when a new invoice is officially issued.
 * Triggers right after the invoice number is upgraded from DRAFT-.
 */
export async function sendInvoiceIssuedLineNotification(
  invoiceId: string,
  invoiceNumber: string,
  total: number,
  companyId: string,
): Promise<void> {
  const { default: prisma } = await import('../config/database');
  const { sendLineFlexMessage } = await import('./lineService');

  const lineLinks = await prisma.lineUserLink.findMany({
    where: {
      isActive: true,
      user: { companyId, isActive: true, role: { in: ['admin', 'super_admin', 'accountant'] } },
    },
    select: { lineUserId: true },
  });
  if (lineLinks.length === 0) return;

  const fmt = (n: number) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);

  const card = {
    type: 'bubble',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#2563eb',
      contents: [
        { type: 'text', text: '📄 ออกเอกสารสำเร็จ', color: '#ffffff', size: 'sm' },
        { type: 'text', text: invoiceNumber, color: '#ffffff', size: 'lg', weight: 'bold' },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        {
          type: 'box', layout: 'horizontal',
          contents: [
            { type: 'text', text: 'ยอดรวม', size: 'sm', color: '#888888', flex: 3 },
            { type: 'text', text: fmt(total), size: 'sm', color: '#333333', flex: 4, align: 'end', weight: 'bold' },
          ],
        },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical',
      contents: [
        {
          type: 'button', style: 'primary', color: '#2563eb',
          action: { type: 'uri', label: '🌐 ดูในระบบ', uri: 'https://etax-invoice.vercel.app/app/invoices' },
        },
      ],
    },
  };

  await Promise.allSettled(
    lineLinks.map(({ lineUserId }) =>
      sendLineFlexMessage(lineUserId, `📄 ออกเอกสารสำเร็จ: ${invoiceNumber}`, card),
    ),
  );
}
