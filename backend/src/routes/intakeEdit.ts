import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { withSystemRlsContext } from '../config/rls';
import { logger } from '../config/logger';
import { verifyIntakeEditToken } from '../services/intakeEditToken';
import { OcrResult } from '../services/aiService';
import { getPresignedUrl, isStorageConfigured, uploadToStorage } from '../services/storageService';
import { supportedDocumentMimeType } from '../services/documentOcrService';

/**
 * Guest-mode endpoints for editing a pending LINE document intake via a
 * magic-link token (no login). The token is issued by the LINE bot when
 * OCR is uncertain or fields are missing — the user clicks "แก้ไขในเว็บ"
 * and lands on /intake-edit/<token> in the LIFF in-app browser. Because
 * that browser has no Google / app session, login-based auth is not an
 * option — we trust the JWT in the URL instead (24h TTL, audience-scoped).
 */

export const intakeEditRouter = Router();

const editableFieldsSchema = z.object({
  supplierName: z.string().trim().min(1).optional(),
  supplierTaxId: z.string().trim().regex(/^\d{0,13}$/).optional(),
  supplierBranch: z.string().trim().regex(/^\d{0,5}$/).optional(),
  invoiceNumber: z.string().trim().optional(),
  invoiceDate: z.string().trim().optional(),
  subtotal: z.number().nonnegative().optional(),
  vatAmount: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  expenseCategory: z.string().trim().optional(),
  expenseSubcategory: z.string().trim().optional(),
  taxTreatment: z.string().trim().optional(),
  payment: z.object({
    amount: z.number().nonnegative().optional(),
    paidAt: z.string().trim().optional(),
    reference: z.string().trim().optional(),
    fromName: z.string().trim().optional(),
    toName: z.string().trim().optional(),
  }).partial().optional(),
});

type EditableFields = z.infer<typeof editableFieldsSchema>;

function applyEdits(result: OcrResult, edits: EditableFields): OcrResult {
  const merged: OcrResult = { ...result };
  if (edits.supplierName !== undefined) merged.supplierName = edits.supplierName;
  if (edits.supplierTaxId !== undefined) merged.supplierTaxId = edits.supplierTaxId;
  if (edits.supplierBranch !== undefined) merged.supplierBranch = edits.supplierBranch;
  if (edits.invoiceNumber !== undefined) merged.invoiceNumber = edits.invoiceNumber;
  if (edits.invoiceDate !== undefined) merged.invoiceDate = edits.invoiceDate;
  if (edits.subtotal !== undefined) merged.subtotal = edits.subtotal;
  if (edits.vatAmount !== undefined) merged.vatAmount = edits.vatAmount;
  if (edits.total !== undefined) merged.total = edits.total;
  // expenseCategory / expenseSubcategory / taxTreatment are typed as tight
  // string-literal unions on OcrResult — accept any user-typed value here
  // via unknown cast; the save pipeline normalizes unknown values downstream.
  if (edits.expenseCategory !== undefined) merged.expenseCategory = edits.expenseCategory as unknown as OcrResult['expenseCategory'];
  if (edits.expenseSubcategory !== undefined) merged.expenseSubcategory = edits.expenseSubcategory as unknown as OcrResult['expenseSubcategory'];
  if (edits.taxTreatment !== undefined) merged.taxTreatment = edits.taxTreatment as unknown as OcrResult['taxTreatment'];
  if (edits.payment) {
    merged.payment = { ...(merged.payment ?? {}), ...edits.payment } as OcrResult['payment'];
  }
  return merged;
}

intakeEditRouter.get('/:token', async (req, res) => {
  const claims = verifyIntakeEditToken(req.params.token);
  if (!claims) {
    res.status(401).json({ error: 'Link หมดอายุหรือไม่ถูกต้อง — กลับไปอัพโหลดใหม่ใน LINE ได้เลย' });
    return;
  }
  try {
    const [intake, suppliers] = await withSystemRlsContext(prisma, async (tx) => {
      const intakeRow = await tx.documentIntake.findFirst({
        where: { id: claims.intakeId, companyId: claims.companyId },
        select: {
          id: true,
          status: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          ocrResult: true,
          warnings: true,
          error: true,
          createdAt: true,
        },
      });
      // Load user-curated supplier contacts so the frontend can offer
      // autocomplete + auto-fill name/branch when user types the taxId.
      const supplierRows = await tx.customer.findMany({
        where: {
          companyId: claims.companyId,
          isActive: true,
          partyRole: { in: ['supplier', 'both'] },
        },
        orderBy: { updatedAt: 'desc' },
        take: 300,
        select: { nameTh: true, nameEn: true, taxId: true, branchCode: true },
      });
      return [intakeRow, supplierRows] as const;
    });
    if (!intake) {
      res.status(404).json({ error: 'ไม่พบเอกสาร' });
      return;
    }
    res.json({
      data: intake,
      suppliers: suppliers.map((s) => ({
        name: s.nameTh || s.nameEn || '',
        taxId: s.taxId,
        branchCode: s.branchCode || '00000',
      })),
    });
  } catch (err) {
    logger.error('[intakeEdit] GET failed', { error: err instanceof Error ? err.message : String(err), intakeId: claims.intakeId });
    res.status(500).json({ error: 'อ่านข้อมูลไม่สำเร็จ' });
  }
});

intakeEditRouter.get('/:token/file', async (req, res) => {
  const claims = verifyIntakeEditToken(req.params.token);
  if (!claims) {
    res.status(401).json({ error: 'Link หมดอายุหรือไม่ถูกต้อง' });
    return;
  }
  try {
    const item = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
      where: { id: claims.intakeId, companyId: claims.companyId },
      select: { fileBase64: true, fileName: true, mimeType: true, fileUrl: true, storageKey: true },
    }));
    if (!item) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    if (item.storageKey) {
      res.redirect(await getPresignedUrl(item.storageKey, 900));
      return;
    }
    if (item.fileUrl) {
      res.redirect(item.fileUrl);
      return;
    }
    if (!item.fileBase64) {
      res.status(404).json({ error: 'Document file is not available' });
      return;
    }
    const buffer = Buffer.from(item.fileBase64, 'base64');
    res.setHeader('Content-Type', item.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${item.fileName || 'document'}"`);
    res.send(buffer);
  } catch (err) {
    logger.error('[intakeEdit] file stream failed', { error: err instanceof Error ? err.message : String(err), intakeId: claims.intakeId });
    res.status(500).json({ error: 'เปิดไฟล์ไม่สำเร็จ' });
  }
});

const attachmentUploadSchema = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  fileBase64: z.string().min(1),
});

intakeEditRouter.post('/:token/attachments', async (req, res) => {
  const claims = verifyIntakeEditToken(req.params.token);
  if (!claims) {
    res.status(401).json({ error: 'Link หมดอายุหรือไม่ถูกต้อง' });
    return;
  }
  const parsed = attachmentUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไฟล์ไม่ถูกต้อง', details: parsed.error.flatten() });
    return;
  }
  if (!supportedDocumentMimeType(parsed.data.mimeType)) {
    res.status(400).json({ error: 'รองรับเฉพาะ PDF, JPG, PNG, WebP' });
    return;
  }
  const buffer = Buffer.from(parsed.data.fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (buffer.length > 10 * 1024 * 1024) {
    res.status(413).json({ error: 'ไฟล์ใหญ่เกิน 10MB' });
    return;
  }
  try {
    const parent = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
      where: { id: claims.intakeId, companyId: claims.companyId },
      select: { projectId: true, userId: true, lineUserId: true },
    }));
    if (!parent) {
      res.status(404).json({ error: 'ไม่พบเอกสารหลัก' });
      return;
    }

    let storageKey: string | undefined;
    let fileUrl: string | undefined;
    if (isStorageConfigured()) {
      const ext = (parsed.data.fileName.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? '.bin').toLowerCase();
      storageKey = `companies/${claims.companyId}/document-intakes/line-attach/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      fileUrl = await uploadToStorage(storageKey, buffer, parsed.data.mimeType);
    }

    // Create a sibling intake row tagged as 'attachment' via the source
    // field so the inbox can group it under the same conversation. We do
    // NOT run OCR on these — they're supplementary docs the user is
    // attaching to the main intake (e.g. invoice photo alongside slip).
    const child = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.create({
      data: {
        companyId: claims.companyId,
        projectId: parent.projectId,
        userId: parent.userId,
        lineUserId: parent.lineUserId,
        source: 'line_attachment',
        fileName: parsed.data.fileName,
        mimeType: parsed.data.mimeType,
        fileSize: buffer.length,
        fileBase64: storageKey ? undefined : buffer.toString('base64'),
        fileUrl,
        storageKey,
        status: 'received',
        warnings: [`parent_intake:${claims.intakeId}`],
      },
      select: { id: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
    }));

    res.status(201).json({ data: child });
  } catch (err) {
    logger.error('[intakeEdit] attachment upload failed', { error: err instanceof Error ? err.message : String(err), intakeId: claims.intakeId });
    res.status(500).json({ error: 'อัปโหลดไม่สำเร็จ' });
  }
});

intakeEditRouter.get('/:token/attachments', async (req, res) => {
  const claims = verifyIntakeEditToken(req.params.token);
  if (!claims) {
    res.status(401).json({ error: 'Link หมดอายุหรือไม่ถูกต้อง' });
    return;
  }
  try {
    const rows = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findMany({
      where: {
        companyId: claims.companyId,
        source: 'line_attachment',
        warnings: { array_contains: [`parent_intake:${claims.intakeId}`] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
    }));
    res.json({ data: rows });
  } catch (err) {
    logger.error('[intakeEdit] list attachments failed', { error: err instanceof Error ? err.message : String(err), intakeId: claims.intakeId });
    res.status(500).json({ error: 'อ่านรายการไฟล์แนบไม่สำเร็จ' });
  }
});

intakeEditRouter.patch('/:token', async (req, res) => {
  const claims = verifyIntakeEditToken(req.params.token);
  if (!claims) {
    res.status(401).json({ error: 'Link หมดอายุหรือไม่ถูกต้อง' });
    return;
  }
  const parsed = editableFieldsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง', details: parsed.error.flatten() });
    return;
  }
  try {
    const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
      where: { id: claims.intakeId, companyId: claims.companyId },
      select: { id: true, ocrResult: true, status: true },
    }));
    if (!intake) {
      res.status(404).json({ error: 'ไม่พบเอกสาร' });
      return;
    }
    if (intake.status === 'saved') {
      res.status(409).json({ error: 'เอกสารถูกบันทึกไปแล้ว' });
      return;
    }
    const current = (intake.ocrResult ?? {}) as unknown as OcrResult;
    const merged = applyEdits(current, parsed.data);
    await withSystemRlsContext(prisma, (tx) => tx.documentIntake.update({
      where: { id: claims.intakeId },
      data: {
        ocrResult: merged as unknown as Parameters<typeof tx.documentIntake.update>[0]['data']['ocrResult'],
      },
    }));
    res.json({ data: { ocrResult: merged } });
  } catch (err) {
    logger.error('[intakeEdit] PATCH failed', { error: err instanceof Error ? err.message : String(err), intakeId: claims.intakeId });
    res.status(500).json({ error: 'บันทึกไม่สำเร็จ' });
  }
});

intakeEditRouter.post('/:token/confirm', async (req, res) => {
  const claims = verifyIntakeEditToken(req.params.token);
  if (!claims) {
    res.status(401).json({ error: 'Link หมดอายุหรือไม่ถูกต้อง' });
    return;
  }
  const parsed = editableFieldsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง', details: parsed.error.flatten() });
    return;
  }
  try {
    const intake = await withSystemRlsContext(prisma, (tx) => tx.documentIntake.findFirst({
      where: { id: claims.intakeId, companyId: claims.companyId },
      select: {
        id: true,
        companyId: true,
        userId: true,
        projectId: true,
        fileUrl: true,
        status: true,
        ocrResult: true,
      },
    }));
    if (!intake) {
      res.status(404).json({ error: 'ไม่พบเอกสาร' });
      return;
    }
    if (intake.status === 'saved') {
      res.status(409).json({ error: 'เอกสารถูกบันทึกไปแล้ว' });
      return;
    }
    const baseline = (intake.ocrResult ?? {}) as unknown as OcrResult;
    const merged = applyEdits(baseline, parsed.data);

    // Persist edits before triggering the save pipeline, so the LINE flow
    // reads the user-corrected fields when matching slip → bill etc.
    await withSystemRlsContext(prisma, (tx) => tx.documentIntake.update({
      where: { id: claims.intakeId },
      data: { ocrResult: merged as unknown as Parameters<typeof tx.documentIntake.update>[0]['data']['ocrResult'] },
    }));

    // Dynamic import avoids the line.ts ↔ services circular dependency
    // (line.ts imports many services that we may pull in elsewhere).
    const { performConfirmedIntakeSave } = await import('./line');
    await performConfirmedIntakeSave(
      claims.lineUserId,
      {
        id: intake.id,
        companyId: intake.companyId,
        userId: intake.userId ?? '',
        projectId: intake.projectId,
        fileUrl: intake.fileUrl,
      },
      merged,
    );
    res.json({ data: { ok: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[intakeEdit] confirm failed', { error: message, intakeId: claims.intakeId });
    res.status(500).json({ error: 'บันทึกไม่สำเร็จ', detail: message.slice(0, 200) });
  }
});
