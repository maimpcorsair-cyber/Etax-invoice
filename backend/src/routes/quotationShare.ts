import { Router } from 'express';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';
import { logger } from '../config/logger';
import { buildHtmlForCompany, generatePdfFromHtml } from '../services/pdfService';
import { buildQuotationPdfData } from '../services/quotationPdfService';
import { verifyQuotationShareToken } from '../services/quotationShareToken';
import { getPresignedUrl } from '../services/storageService';

export const quotationSharePublicRouter = Router();

function isPastValidUntil(validUntil: Date | null): boolean {
  if (!validUntil) return false;
  const inclusiveEnd = new Date(validUntil);
  inclusiveEnd.setHours(23, 59, 59, 999);
  return inclusiveEnd < new Date();
}

async function findSharedQuotation(token: string) {
  const payload = verifyQuotationShareToken(token);
  if (!payload) return { payload: null, quotation: null };

  const quotation = await withSystemRlsContext(prisma, async (tx) => {
    return tx.quotation.findFirst({
      where: { id: payload.quotationId, companyId: payload.companyId },
      include: {
        buyer: true,
        items: true,
        project: { select: { id: true, code: true, name: true, description: true, startDate: true, endDate: true } },
        company: { select: { nameTh: true, nameEn: true, taxId: true, logoUrl: true, phone: true, email: true } },
      },
    });
  });

  return { payload, quotation };
}

quotationSharePublicRouter.get('/quotation/:token', async (req, res) => {
  try {
    const { payload, quotation } = await findSharedQuotation(req.params.token);
    if (!payload) {
      res.status(401).json({ error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว' });
      return;
    }
    if (!quotation) {
      res.status(404).json({ error: 'ไม่พบใบเสนอราคานี้' });
      return;
    }

    // Customer-facing supporting files (company library docs the seller chose to
    // attach). Served only through our timeout-gated download endpoint below.
    const attachmentIds = quotation.attachmentDocumentIds ?? [];
    const attachments = attachmentIds.length > 0
      ? await withSystemRlsContext(prisma, async (tx) =>
        tx.companyDocument.findMany({
          where: { id: { in: attachmentIds }, companyId: payload.companyId },
          select: { id: true, docType: true, label: true, fileName: true, mimeType: true, fileSize: true },
        }),
      )
      : [];

    res.json({
      quotation: {
        id: quotation.id,
        quotationNumber: quotation.quotationNumber,
        status: quotation.status,
        language: quotation.language,
        quotationDate: quotation.quotationDate,
        validUntil: quotation.validUntil,
        subtotal: quotation.subtotal,
        vatAmount: quotation.vatAmount,
        discountAmount: quotation.discountAmount,
        total: quotation.total,
        revisionNo: quotation.revisionNo,
        supersededById: quotation.supersededById,
        supersededAt: quotation.supersededAt,
        notes: quotation.notes,
        paymentTerms: quotation.paymentTerms,
        deliveryTerms: quotation.deliveryTerms,
        kind: quotation.kind,
        serviceDetails: quotation.serviceDetails,
        project: quotation.project,
        pdfUrl: `/api/share/quotation/${encodeURIComponent(req.params.token)}/pdf`,
      },
      attachments: attachments.map((doc) => ({
        id: doc.id,
        docType: doc.docType,
        label: doc.label,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        downloadUrl: `/api/share/quotation/${encodeURIComponent(req.params.token)}/attachment/${doc.id}`,
      })),
      buyer: quotation.buyer,
      seller: {
        nameTh: quotation.company.nameTh,
        nameEn: quotation.company.nameEn,
        taxId: quotation.company.taxId,
        logoUrl: quotation.company.logoUrl ?? null,
        phone: quotation.company.phone ?? null,
        email: quotation.company.email ?? null,
      },
      items: quotation.items.map((item) => ({
        id: item.id,
        sectionTitle: item.sectionTitle,
        nameTh: item.nameTh,
        nameEn: item.nameEn,
        descriptionTh: item.descriptionTh,
        descriptionEn: item.descriptionEn,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        vatType: item.vatType,
        amount: item.amount,
        vatAmount: item.vatAmount,
        totalAmount: item.totalAmount,
      })),
      tokenExp: payload.exp,
    });
  } catch (err) {
    logger.error('[quotationShare] fetch failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'ดึงข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง' });
  }
});

quotationSharePublicRouter.get('/quotation/:token/pdf', async (req, res) => {
  try {
    const { payload, quotation } = await findSharedQuotation(req.params.token);
    if (!payload) {
      res.status(401).json({ error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว' });
      return;
    }
    if (!quotation) {
      res.status(404).json({ error: 'ไม่พบใบเสนอราคานี้' });
      return;
    }

    const pdfData = buildQuotationPdfData(quotation);
    const html = await buildHtmlForCompany(pdfData, payload.companyId);
    const pdf = await generatePdfFromHtml(html);
    const safeName = quotation.quotationNumber.replace(/[^A-Za-z0-9._-]+/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(pdf.length));
    res.setHeader('Content-Disposition', `inline; filename="${safeName}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(pdf);
  } catch (err) {
    logger.error('[quotationShare] pdf download failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'โหลด PDF ไม่สำเร็จ' });
  }
});

quotationSharePublicRouter.get('/quotation/:token/attachment/:docId', async (req, res) => {
  try {
    const { payload, quotation } = await findSharedQuotation(req.params.token);
    if (!payload) {
      res.status(401).json({ error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว' });
      return;
    }
    if (!quotation) {
      res.status(404).json({ error: 'ไม่พบใบเสนอราคานี้' });
      return;
    }
    // Only serve a document the seller actually attached to THIS quotation.
    if (!(quotation.attachmentDocumentIds ?? []).includes(req.params.docId)) {
      res.status(404).json({ error: 'ไม่พบเอกสารแนบนี้' });
      return;
    }

    const doc = await withSystemRlsContext(prisma, async (tx) =>
      tx.companyDocument.findFirst({
        where: { id: req.params.docId, companyId: payload.companyId },
        select: { s3Key: true, driveUrl: true },
      }),
    );
    if (!doc) {
      res.status(404).json({ error: 'ไม่พบเอกสารแนบนี้' });
      return;
    }

    // Drive-hosted docs are shared "anyone with link", so the customer opens
    // them directly. R2-hosted docs go through a short-lived presigned URL
    // (egress is free); the raw object URL is never exposed.
    if (doc.driveUrl) {
      res.redirect(doc.driveUrl);
      return;
    }
    if (!doc.s3Key) {
      res.status(404).json({ error: 'ไม่พบไฟล์เอกสารแนบ' });
      return;
    }
    const url = await getPresignedUrl(doc.s3Key, 300);
    res.redirect(url);
  } catch (err) {
    logger.error('[quotationShare] attachment download failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'โหลดเอกสารแนบไม่สำเร็จ' });
  }
});

quotationSharePublicRouter.post('/quotation/:token/respond', async (req, res) => {
  const action = req.body?.action;
  if (action !== 'accept' && action !== 'reject') {
    res.status(400).json({ error: 'กรุณาเลือกยอมรับหรือปฏิเสธใบเสนอราคา' });
    return;
  }

  try {
    const payload = verifyQuotationShareToken(req.params.token);
    if (!payload) {
      res.status(401).json({ error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว' });
      return;
    }

    const updated = await withSystemRlsContext(prisma, async (tx) => {
      const quotation = await tx.quotation.findFirst({
        where: { id: payload.quotationId, companyId: payload.companyId },
        select: { id: true, status: true, validUntil: true, supersededById: true },
      });
      if (!quotation) return null;
      if (quotation.supersededById) {
        throw new Error('ใบเสนอราคานี้มีฉบับใหม่กว่าแล้ว กรุณาขอลิงก์ล่าสุดจากผู้ขาย');
      }
      if (quotation.status === 'accepted' || quotation.status === 'rejected') return quotation;
      if (quotation.status !== 'sent') {
        throw new Error(`Cannot respond to a ${quotation.status} quotation`);
      }
      if (isPastValidUntil(quotation.validUntil)) {
        throw new Error('Cannot respond to an expired quotation');
      }
      return tx.quotation.update({
        where: { id: quotation.id },
        data: { status: action === 'accept' ? 'accepted' : 'rejected' },
        select: { id: true, status: true },
      });
    });

    if (!updated) {
      res.status(404).json({ error: 'ไม่พบใบเสนอราคานี้' });
      return;
    }

    res.json({ data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ตอบกลับใบเสนอราคาไม่สำเร็จ';
    const status = message.startsWith('Cannot respond') ? 409 : 500;
    res.status(status).json({ error: message });
  }
});
