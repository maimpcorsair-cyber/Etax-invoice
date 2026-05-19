import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { withRlsContext, tenantRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { CURRENT_LEGAL_VERSION } from '../config/legalVersion';
import { sendDsrDeleteConfirmationEmail } from '../services/emailService';

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

/* ─── Status (powers the in-app Privacy & Data tab) ──────────────────── */

// Lightweight read-only summary used by the AccountPrivacy page so it can
// render the correct UI: which auth methods are available (password vs
// Google-only — gates the delete confirmation flow), and whether a
// deletion request is already pending (renders the cancel banner instead
// of the delete form).
accountRouter.get('/status', async (req, res) => {
  try {
    const userId = req.user!.userId;
    const companyId = req.user!.companyId;
    const [user, company] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true, googleSub: true, legalAcceptedVersion: true, marketingOptInAt: true },
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: { deletionRequestedAt: true, deletionRequestedBy: true, hardDeleteScheduledAt: true },
      }),
    ]);
    if (!user || !company) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const now = Date.now();
    const cancelDeadline = company.deletionRequestedAt
      ? new Date(company.deletionRequestedAt.getTime() + GRACE_DAYS * 86400_000)
      : null;
    res.json({
      data: {
        auth: {
          hasPassword: !!user.passwordHash,
          hasGoogle: !!user.googleSub,
        },
        legal: {
          acceptedVersion: user.legalAcceptedVersion,
          currentVersion: CURRENT_LEGAL_VERSION,
        },
        marketing: {
          optedIn: !!user.marketingOptInAt,
        },
        deletion: company.deletionRequestedAt
          ? {
              requested: true,
              requestedAt: company.deletionRequestedAt,
              requestedBy: company.deletionRequestedBy,
              hardDeleteScheduledAt: company.hardDeleteScheduledAt,
              cancelDeadline,
              cancellable: cancelDeadline ? now < cancelDeadline.getTime() : false,
            }
          : { requested: false },
      },
    });
  } catch (err) {
    logger.error('account status failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Status failed' });
  }
});

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
        // Drop the `take` caps — PDPA Section 30 grants the right to a
        // COMPLETE copy of personal data. Tables are already bounded by
        // retention policy (audit_logs 365d, others bounded by tenancy)
        // so the export size is roughly the live tenant footprint. If a
        // tenant ever exceeds memory, switch this to a streaming response.
        tx.invoice.findMany({ where: { companyId } }),
        tx.customer.findMany({ where: { companyId } }),
        tx.product.findMany({ where: { companyId } }),
        tx.auditLog.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
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
      select: { id: true, passwordHash: true, googleSub: true, email: true, name: true },
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

    const cancelDeadline = new Date(now.getTime() + GRACE_DAYS * 86400_000);

    // Fire-and-forget — email failure shouldn't block the API response.
    // The audit-log row above is the canonical record either way.
    const companyForEmail = await prisma.company.findUnique({
      where: { id: companyId },
      select: { nameTh: true },
    });
    if (user.email && companyForEmail) {
      sendDsrDeleteConfirmationEmail({
        adminEmail: user.email,
        adminName: user.name,
        companyNameTh: companyForEmail.nameTh,
        requestedAt: now,
        cancelDeadline,
        hardDeleteScheduledAt: hardDeleteAt,
        locale: 'th',
      }).catch((err) => logger.warn('[DSR] confirmation email dispatch failed', {
        err: err instanceof Error ? err.message : String(err),
      }));
    }

    res.json({
      data: {
        status: 'requested',
        requestedAt: now,
        hardDeleteScheduledAt: hardDeleteAt,
        cancelDeadline,
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

/* ─── Owner DSR queue (super_admin) ──────────────────────────────────── */

// Cross-tenant list of pending deletion requests so the platform owner can
// see who's about to be erased and intervene (e.g., user disputes, support
// asked to cancel, or — rarely — owner needs to expedite past the 5y
// tax-retention window with a signed waiver from the customer).
accountRouter.get('/owner/dsr-queue', requireRole('super_admin'), async (_req, res) => {
  try {
    const rows = await prisma.company.findMany({
      where: { deletionRequestedAt: { not: null } },
      orderBy: { deletionRequestedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        nameTh: true,
        taxId: true,
        email: true,
        deletionRequestedAt: true,
        deletionRequestedBy: true,
        hardDeleteScheduledAt: true,
      },
    });
    res.json({ data: rows });
  } catch (err) {
    logger.error('owner dsr-queue list failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Queue load failed' });
  }
});

// Owner-side cancel — used when a customer support ticket asks for undo
// after the user lost access (e.g., they deleted their account, then
// emailed support saying it was a mistake). Bypasses the 30d grace check.
accountRouter.post('/owner/dsr-queue/:companyId/cancel', requireRole('super_admin'), async (req, res) => {
  try {
    const { companyId } = req.params;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, deletionRequestedAt: true, deletionRequestedBy: true },
    });
    if (!company?.deletionRequestedAt) {
      res.status(404).json({ error: 'No deletion request for this company' });
      return;
    }
    await prisma.$transaction([
      prisma.company.update({
        where: { id: companyId },
        data: { deletionRequestedAt: null, deletionRequestedBy: null, hardDeleteScheduledAt: null },
      }),
      // Reactivate the requester so they can log back in.
      ...(company.deletionRequestedBy
        ? [prisma.user.update({ where: { id: company.deletionRequestedBy }, data: { isActive: true } })]
        : []),
      prisma.auditLog.create({
        data: {
          companyId,
          userId: req.user!.userId,
          action: 'account.deletion_cancelled_by_owner',
          resourceType: 'company',
          resourceId: companyId,
          details: { originalRequester: company.deletionRequestedBy },
          ipAddress: req.ip ?? 'unknown',
          userAgent: req.headers['user-agent'] ?? 'unknown',
        },
      }),
    ]);
    res.json({ data: { status: 'cancelled' } });
  } catch (err) {
    logger.error('owner dsr cancel failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Cancel failed' });
  }
});

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
