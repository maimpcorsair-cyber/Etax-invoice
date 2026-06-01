import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { logger } from '../config/logger';
import { isStorageConfigured, uploadToStorage, getPresignedUrl } from '../services/storageService';

// Reusable company library documents (ภ.พ.20, company certificate, bank book,
// company profile, catalog, …). Stored in object storage (R2) — the system of
// record. Quotations attach them by id; the customer share link serves them
// through our own timeout-gated endpoint (never a raw object URL).

export const companyDocumentsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const DOC_TYPES = ['por_por_20', 'company_cert', 'bank_book', 'company_profile', 'catalog', 'other'] as const;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const uploadBodySchema = z.object({
  docType: z.enum(DOC_TYPES).optional(),
  label: z.string().trim().max(120).optional(),
  attachByDefault: z.union([z.boolean(), z.string()]).optional(),
});

const patchBodySchema = z.object({
  docType: z.enum(DOC_TYPES).optional(),
  label: z.string().trim().max(120).nullable().optional(),
  attachByDefault: z.boolean().optional(),
});

function toBool(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

// ── List ──────────────────────────────────────────────────────────────
companyDocumentsRouter.get('/', async (req, res) => {
  try {
    const docs = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) =>
      tx.companyDocument.findMany({
        where: { companyId: req.user!.companyId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, docType: true, label: true, fileName: true,
          mimeType: true, fileSize: true, attachByDefault: true, createdAt: true,
        },
      }),
    );
    res.json({ data: docs });
  } catch (err) {
    logger.error('[companyDocuments] list failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to list company documents' });
  }
});

// ── Upload ────────────────────────────────────────────────────────────
companyDocumentsRouter.post(
  '/',
  requireRole('admin', 'super_admin', 'accountant'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'File is required' });
        return;
      }
      if (!ALLOWED_MIME.has(req.file.mimetype)) {
        res.status(400).json({ error: 'รองรับเฉพาะ PDF, รูปภาพ, Word และ Excel' });
        return;
      }
      if (!isStorageConfigured()) {
        res.status(503).json({ error: 'File storage is not configured' });
        return;
      }

      const body = uploadBodySchema.parse(req.body);
      const safeName = req.file.originalname.replace(/[^A-Za-z0-9._-]+/g, '_');
      const s3Key = `companies/${req.user!.companyId}/company-documents/${Date.now()}-${safeName}`;
      await uploadToStorage(s3Key, req.file.buffer, req.file.mimetype);

      const created = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) =>
        tx.companyDocument.create({
          data: {
            companyId: req.user!.companyId,
            docType: body.docType ?? 'other',
            label: body.label ?? null,
            fileName: req.file!.originalname,
            mimeType: req.file!.mimetype,
            fileSize: req.file!.size,
            s3Key,
            attachByDefault: toBool(body.attachByDefault),
          },
          select: {
            id: true, docType: true, label: true, fileName: true,
            mimeType: true, fileSize: true, attachByDefault: true, createdAt: true,
          },
        }),
      );
      res.status(201).json({ data: created });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', details: err.errors });
        return;
      }
      logger.error('[companyDocuments] upload failed', { err: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: 'Upload failed' });
    }
  },
);

// ── Update metadata ───────────────────────────────────────────────────
companyDocumentsRouter.patch('/:id', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = patchBodySchema.parse(req.body);
    const updated = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const existing = await tx.companyDocument.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
      if (!existing) return null;
      return tx.companyDocument.update({
        where: { id: existing.id },
        data: {
          ...(body.docType !== undefined ? { docType: body.docType } : {}),
          ...(body.label !== undefined ? { label: body.label } : {}),
          ...(body.attachByDefault !== undefined ? { attachByDefault: body.attachByDefault } : {}),
        },
        select: {
          id: true, docType: true, label: true, fileName: true,
          mimeType: true, fileSize: true, attachByDefault: true, createdAt: true,
        },
      });
    });
    if (!updated) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: err.errors });
      return;
    }
    logger.error('[companyDocuments] patch failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Update failed' });
  }
});

// ── Owner download (presigned) ────────────────────────────────────────
companyDocumentsRouter.get('/:id/download', async (req, res) => {
  try {
    const doc = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) =>
      tx.companyDocument.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId }, select: { s3Key: true } }),
    );
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const url = await getPresignedUrl(doc.s3Key, 300);
    res.redirect(url);
  } catch (err) {
    logger.error('[companyDocuments] download failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Download failed' });
  }
});

// ── Delete ────────────────────────────────────────────────────────────
companyDocumentsRouter.delete('/:id', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const deleted = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const existing = await tx.companyDocument.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
      if (!existing) return null;
      await tx.companyDocument.delete({ where: { id: existing.id } });
      return existing;
    });
    if (!deleted) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json({ data: { id: deleted.id } });
  } catch (err) {
    logger.error('[companyDocuments] delete failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Delete failed' });
  }
});
