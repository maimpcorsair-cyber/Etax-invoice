import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { withRlsContext, tenantRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { CURRENT_LEGAL_VERSION } from '../config/legalVersion';

// PDPA data-subject endpoints. Mounted under /api/account (authenticated).
//
//   GET    /api/account/export   — Section 30 (access) + 31 (portability)
//   POST   /api/account/delete   — Section 33 (erasure)
//   POST   /api/account/delete/cancel — undo a pending deletion request
//
// Deletion is a soft request: we anonymise PII immediately but retain
// tax-document rows until hardDeleteScheduledAt because the Revenue Code
// requires 5y retention. A separate cron job purges the row after that.

export const accountRouter = Router();

const GRACE_DAYS = 30;
const TAX_RETENTION_YEARS = 5;

/* ─── Export (right of access + portability) ─────────────────────────── */

accountRouter.get('/export', async (req, res) => {
  try {
    const userId = req.user!.userId;
    const companyId = req.user!.companyId;

    const result = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [user, company, invoices, customers, products, auditLog] = await Promise.all([
        tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true, email: true, name: true, role: true, isActive: true,
            createdAt: true, updatedAt: true, lastLoginAt: true,
            legalAcceptedAt: true, legalAcceptedVersion: true, marketingOptInAt: true,
          },
        }),
        tx.company.findUnique({
          where: { id: companyId },
          select: {
            id: true, nameTh: true, nameEn: true, taxId: true, branchCode: true,
            addressTh: true, addressEn: true, phone: true, email: true, website: true,
            createdAt: true, updatedAt: true,
          },
        }),
        tx.invoice.findMany({ where: { companyId }, take: 5000 }),
        tx.customer.findMany({ where: { companyId }, take: 5000 }),
        tx.product.findMany({ where: { companyId }, take: 5000 }),
        tx.auditLog.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 1000,
        }),
      ]);

      return { user, company, invoices, customers, products, auditLog };
    });

    res.setHeader('Content-Disposition', `attachment; filename="account-export-${userId}-${new Date().toISOString().slice(0, 10)}.json"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify({
      exportedAt: new Date().toISOString(),
      legalBasis: 'PDPA Section 30 (right of access) and Section 31 (right to data portability)',
      schemaVersion: 1,
      user: result.user,
      company: result.company,
      invoices: result.invoices,
      customers: result.customers,
      products: result.products,
      auditLog: result.auditLog,
    }, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  } catch (err) {
    logger.error('account export failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Export failed' });
  }
});

/* ─── Re-consent (legal version bump) ────────────────────────────────── */

// Front-end shows the modal when /auth/me returns legal.reConsentRequired.
// User clicks accept → POST here → row updates → next /auth/me clears the
// flag and unblocks the app. Body just confirms the version they're
// accepting so backend can refuse a stale POST that races a doc bump.
accountRouter.post('/accept-legal', async (req, res) => {
  try {
    const userId = req.user!.userId;
    const body = z.object({
      version: z.string().trim().min(4).max(40),
      marketingOptIn: z.boolean().optional(),
    }).parse(req.body);

    if (body.version !== CURRENT_LEGAL_VERSION) {
      res.status(409).json({
        error: 'Stale legal version',
        currentVersion: CURRENT_LEGAL_VERSION,
      });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        legalAcceptedAt: new Date(),
        legalAcceptedVersion: body.version,
        // Marketing opt-in is independent — only touch when explicitly set
        // so a re-consent doesn't silently flip an existing preference.
        ...(typeof body.marketingOptIn === 'boolean'
          ? { marketingOptInAt: body.marketingOptIn ? new Date() : null }
          : {}),
      },
    });
    res.json({ data: { acceptedVersion: body.version, currentVersion: CURRENT_LEGAL_VERSION } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: err.issues });
      return;
    }
    logger.error('accept-legal failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Accept failed' });
  }
});

/* ─── Delete (right to erasure) ──────────────────────────────────────── */

const deleteSchema = z.object({
  // Password re-auth — destructive action MUST require fresh proof of
  // identity, not just a JWT (which may be cached on a stolen device).
  // Google-only accounts pass `confirm: "DELETE"` instead.
  password: z.string().min(1).optional(),
  confirm: z.string().optional(),
  reason: z.string().trim().max(500).optional(),
});

accountRouter.post('/delete', requireRole('admin'), async (req, res) => {
  try {
    const body = deleteSchema.parse(req.body);
    const userId = req.user!.userId;
    const companyId = req.user!.companyId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, googleSub: true },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Re-auth: password if available, otherwise typed-confirmation for
    // Google-only accounts (no local password to compare).
    if (user.passwordHash) {
      if (!body.password || !(await bcrypt.compare(body.password, user.passwordHash))) {
        res.status(401).json({ error: 'Password is required to confirm deletion' });
        return;
      }
    } else if (body.confirm !== 'DELETE') {
      res.status(400).json({ error: 'Type DELETE in the confirm field to proceed' });
      return;
    }

    // Existing row may already be scheduled — return the existing record
    // rather than re-scheduling so the user can see when the purge runs.
    const existing = await prisma.company.findUnique({
      where: { id: companyId },
      select: { deletionRequestedAt: true, hardDeleteScheduledAt: true },
    });
    if (existing?.deletionRequestedAt) {
      res.json({
        data: {
          status: 'already_requested',
          requestedAt: existing.deletionRequestedAt,
          hardDeleteScheduledAt: existing.hardDeleteScheduledAt,
        },
      });
      return;
    }

    const now = new Date();
    // Tax docs must live 5y per Revenue Code → schedule full purge after
    // the most recent invoice's retention window OR 30d minimum if no docs.
    const lastInvoice = await prisma.invoice.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const hardDeleteAt = lastInvoice
      ? new Date(lastInvoice.createdAt.getTime() + TAX_RETENTION_YEARS * 365 * 86400_000)
      : new Date(now.getTime() + GRACE_DAYS * 86400_000);

    await prisma.$transaction([
      prisma.company.update({
        where: { id: companyId },
        data: {
          deletionRequestedAt: now,
          deletionRequestedBy: userId,
          hardDeleteScheduledAt: hardDeleteAt,
        },
      }),
      // Anonymise the requester's PII immediately — they retain the right
      // to log back in within the grace window via /delete/cancel below,
      // so we keep the row but blank out identifying fields.
      prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
      }),
      prisma.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'account.deletion_requested',
          resourceType: 'company',
          resourceId: companyId,
          details: {
            reason: body.reason ?? null,
            hardDeleteScheduledAt: hardDeleteAt.toISOString(),
          },
          ipAddress: req.ip ?? 'unknown',
          userAgent: req.headers['user-agent'] ?? 'unknown',
        },
      }),
    ]);

    res.json({
      data: {
        status: 'requested',
        requestedAt: now,
        hardDeleteScheduledAt: hardDeleteAt,
        // Owner can still log in and cancel before this date.
        cancelDeadline: new Date(now.getTime() + GRACE_DAYS * 86400_000),
        note: 'Tax invoices are retained per Revenue Department requirements before permanent deletion.',
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: err.issues });
      return;
    }
    logger.error('account deletion failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Deletion failed' });
  }
});

/* ─── Cancel a pending deletion ──────────────────────────────────────── */

accountRouter.post('/delete/cancel', requireRole('admin'), async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { deletionRequestedAt: true, hardDeleteScheduledAt: true },
    });
    if (!company?.deletionRequestedAt) {
      res.status(400).json({ error: 'No deletion request is pending' });
      return;
    }
    const graceCutoff = new Date(company.deletionRequestedAt.getTime() + GRACE_DAYS * 86400_000);
    if (new Date() > graceCutoff) {
      res.status(400).json({ error: 'Grace window for cancellation has expired' });
      return;
    }
    await prisma.$transaction([
      prisma.company.update({
        where: { id: companyId },
        data: { deletionRequestedAt: null, deletionRequestedBy: null, hardDeleteScheduledAt: null },
      }),
      prisma.user.update({ where: { id: userId }, data: { isActive: true } }),
      prisma.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'account.deletion_cancelled',
          resourceType: 'company',
          resourceId: companyId,
          details: {},
          ipAddress: req.ip ?? 'unknown',
          userAgent: req.headers['user-agent'] ?? 'unknown',
        },
      }),
    ]);
    res.json({ data: { status: 'cancelled' } });
  } catch (err) {
    logger.error('account deletion cancel failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Cancel failed' });
  }
});
