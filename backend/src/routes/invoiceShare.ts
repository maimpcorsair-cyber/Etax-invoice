import { Router } from 'express';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';
import { logger } from '../config/logger';
import { verifyInvoiceShareToken } from '../services/invoiceShareToken';
import { buildPromptPayQr } from '../services/promptPayService';

// Public viewer for an invoice that the seller shared via LINE / email /
// SMS using a magic link. Unauthenticated by design — the JWT IS the
// credential. Read-only. No tenant context cookie; we resolve scope
// from the token's companyId claim and read with the system RLS role.

export const invoiceSharePublicRouter = Router();

invoiceSharePublicRouter.get('/invoice/:token', async (req, res) => {
  const payload = verifyInvoiceShareToken(req.params.token);
  if (!payload) {
    res.status(401).json({ error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว' });
    return;
  }

  try {
    const invoice = await withSystemRlsContext(prisma, async (tx) => {
      return tx.invoice.findFirst({
        where: { id: payload.invoiceId, companyId: payload.companyId },
        include: {
          buyer: { select: { nameTh: true, nameEn: true, taxId: true } },
          company: {
            select: {
              nameTh: true,
              nameEn: true,
              taxId: true,
              documentBankAccounts: true,
            },
          },
        },
      });
    });
    if (!invoice) {
      res.status(404).json({ error: 'ไม่พบเอกสารนี้' });
      return;
    }

    // Resolve PromptPay target from the seller's first bank account that
    // has one. If none configured, we return null and the viewer page
    // hides the QR section silently.
    const accounts = Array.isArray(invoice.company.documentBankAccounts)
      ? (invoice.company.documentBankAccounts as Array<Record<string, unknown>>)
      : [];
    const ppAccount = accounts.find((a) => typeof a.promptPayId === 'string' && (a.promptPayId as string).trim().length > 0);

    let promptPay: { qrImageDataUrl: string; target: string } | null = null;
    if (ppAccount && invoice.total > 0 && !invoice.isPaid && invoice.status !== 'cancelled') {
      try {
        const target = String(ppAccount.promptPayId).trim();
        const qr = await buildPromptPayQr(target, invoice.total, invoice.invoiceNumber);
        promptPay = { qrImageDataUrl: qr.imageDataUrl, target };
      } catch (err) {
        logger.warn('[invoiceShare] PromptPay QR build failed', { err: err instanceof Error ? err.message : String(err) });
      }
    }

    res.json({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        type: invoice.type,
        status: invoice.status,
        isPaid: invoice.isPaid,
        language: invoice.language,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        subtotal: invoice.subtotal,
        vatAmount: invoice.vatAmount,
        total: invoice.total,
        pdfUrl: invoice.pdfUrl,
      },
      buyer: invoice.buyer,
      seller: {
        nameTh: invoice.company.nameTh,
        nameEn: invoice.company.nameEn,
        taxId: invoice.company.taxId,
      },
      promptPay,
      tokenExp: payload.exp,
    });
  } catch (err) {
    logger.error('[invoiceShare] fetch failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'ดึงข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง' });
  }
});

// Public PDF download — same token validates, but we stream the issued
// PDF blob directly so the buyer can save/share it. If pdfUrl is an S3
// URL we redirect to a presigned URL; if it's null (cancelled / draft)
// we 404.
invoiceSharePublicRouter.get('/invoice/:token/pdf', async (req, res) => {
  const payload = verifyInvoiceShareToken(req.params.token);
  if (!payload) {
    res.status(401).json({ error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว' });
    return;
  }

  try {
    const invoice = await withSystemRlsContext(prisma, async (tx) => {
      return tx.invoice.findFirst({
        where: { id: payload.invoiceId, companyId: payload.companyId },
        select: { pdfUrl: true, invoiceNumber: true },
      });
    });
    if (!invoice?.pdfUrl) {
      res.status(404).json({ error: 'PDF ยังไม่พร้อม กรุณารอสักครู่' });
      return;
    }
    // If the stored pdfUrl is an absolute URL (Drive / S3 with presigning
    // already applied or public), redirect. We avoid streaming through
    // our server for bandwidth reasons.
    res.redirect(invoice.pdfUrl);
  } catch (err) {
    logger.error('[invoiceShare] pdf download failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'โหลด PDF ไม่สำเร็จ' });
  }
});
