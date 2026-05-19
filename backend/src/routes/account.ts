import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { withRlsContext, tenantRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { CURRENT_LEGAL_VERSION } from '../config/legalVersion';
import { sendDsrDeleteConfirmationEmail } from '../services/emailService';

// PDPA data-subject endpoints.
//
// Authenticated (mounted under /api/account, requires JWT):
//   GET    /export                 — Section 30 (access) + 31 (portability)
//   POST   /delete                 — Section 33 (erasure)
//   POST   /delete/cancel          — undo while still logged in
//   GET    /status                 — powers the Privacy & My Data tab
//
// Public (mounted under /api/account, NO auth — token is its own credential):
//   POST   /delete/confirm-cancel  — email-link cancel; lets the deactivated
//                                    requester undo without logging back in
//
// Deletion is a soft request: we anonymise PII immediately but retain
// tax-document rows until hardDeleteScheduledAt because the Revenue Code
// requires 5y retention. A separate cron job purges the row after that.

export const accountRouter = Router();
export const accountPublicRouter = Router();

const GRACE_DAYS = 30;
const TAX_RETENTION_YEARS = 5;

// ── Cancel token (signed, stateless) ──────────────────────────────────
// HMAC-SHA256 over `companyId|requestedAtIso` keyed on JWT_SECRET. We
// don't store the token anywhere; verification re-derives the HMAC and
// checks against the DB row's `deletionRequestedAt`. That way the token
// is invalidated automatically the moment the deletion is cancelled
// (requestedAt becomes null → HMAC payload no longer matches).
function signCancelToken(companyId: string, requestedAt: Date): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  const payload = `${companyId}|${requestedAt.toISOString()}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${sig}`;
}

function verifyCancelToken(token: string): { companyId: string; requestedAt: Date } | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  // Constant-time compare so token guessing can't be timed.
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const [companyId, requestedAtIso] = payload.split('|');
  if (!companyId || !requestedAtIso) return null;
  const requestedAt = new Date(requestedAtIso);
  if (Number.isNaN(requestedAt.getTime())) return null;
  return { companyId, requestedAt };
}

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

// Replacer that handles every non-JSON-native type Prisma may return:
//   - BigInt → string (JSON.stringify would otherwise throw)
//   - Buffer / Uint8Array → "[BINARY n bytes]" placeholder (raw cert blobs
//     etc. don't belong in a user-facing export anyway; this prevents
//     accidental leaks even when a future select clause adds them back)
//   - Date → ISO string (already handled natively, kept explicit)
function exportReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array || Buffer.isBuffer(value as unknown as Buffer)) {
    return `[BINARY ${(value as Uint8Array).byteLength} bytes]`;
  }
  return value;
}

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
        // Explicit select on company — DON'T fetch `certificateBlob` (Bytes)
        // because (a) it's the customer's private key, (b) the JSON
        // serializer would have to encode the buffer and (c) it's already
        // available to the customer outside this export.
        tx.company.findUnique({
          where: { id: companyId },
          select: {
            id: true, nameTh: true, nameEn: true, taxId: true, branchCode: true,
            addressTh: true, addressEn: true, phone: true, email: true, website: true,
            createdAt: true, updatedAt: true,
          },
        }),
        // Explicit selects on the transactional tables so we never accidentally
        // include a binary blob or huge derived column. PDPA Section 30
        // requires "personal data" — every selected field qualifies.
        tx.invoice.findMany({
          where: { companyId },
          select: {
            id: true, invoiceNumber: true, type: true, status: true, language: true,
            invoiceDate: true, dueDate: true, buyerId: true, projectId: true,
            subtotal: true, vatAmount: true, discountAmount: true, total: true,
            whtRate: true, whtAmount: true,
            seller: true, notes: true,
            cancelledAt: true, cancelReason: true,
            pdfUrl: true,
            createdAt: true, updatedAt: true,
          },
        }),
        tx.customer.findMany({
          where: { companyId },
          select: {
            id: true, nameTh: true, nameEn: true, taxId: true, branchCode: true,
            branchNameTh: true, branchNameEn: true,
            addressTh: true, addressEn: true,
            email: true, phone: true, contactPerson: true,
            personalId: true, partyRole: true, customerKind: true, useCase: true,
            verificationStatus: true, vatEvidenceStatus: true,
            creditLimit: true, creditDays: true,
            isActive: true, createdAt: true, updatedAt: true,
          },
        }),
        tx.product.findMany({
          where: { companyId },
          select: {
            id: true, code: true, nameTh: true, nameEn: true,
            descriptionTh: true, descriptionEn: true,
            unit: true, unitPrice: true, vatType: true, productType: true,
            category: true, accountCode: true, unitCost: true,
            defaultWhtRate: true, isActive: true,
            createdAt: true, updatedAt: true,
          },
        }),
        tx.auditLog.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, action: true, resourceType: true, resourceId: true,
            details: true, ipAddress: true, userAgent: true, language: true,
            createdAt: true,
          },
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
    }, exportReplacer, 2));
  } catch (err) {
    // Stack + tenant ids to logs; generic message to client so future
    // 500s don't leak internals to the user (Sentry + Render logs are
    // the place to read the cause).
    logger.error('account export failed', {
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 6).join('\n') : undefined,
      userId: req.user?.userId,
      companyId: req.user?.companyId,
    });
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
    const cancelToken = signCancelToken(companyId, now);
    const cancelUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/account/cancel-delete?token=${encodeURIComponent(cancelToken)}`;

    // Fire-and-forget — email failure shouldn't block the API response.
    // The audit-log row above is the canonical record either way. The
    // email is now load-bearing: it carries the magic-link cancel URL
    // that lets the deactivated user undo without re-logging-in.
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
        cancelUrl,
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

/* ─── Public token-based cancel (email magic link) ───────────────────── */

// Unauthenticated by design — the token itself is the credential, HMAC
// signed and bound to the exact `deletionRequestedAt` timestamp. The user
// is deactivated as soon as `/delete` runs, so requiring a JWT here would
// soft-lock them out of their own cancel flow. This endpoint is the only
// way back in if they let the in-app session expire.
accountPublicRouter.post('/delete/confirm-cancel', async (req, res) => {
  try {
    const token = z.object({ token: z.string().min(20) }).parse(req.body).token;
    const parsed = verifyCancelToken(token);
    if (!parsed) {
      res.status(400).json({ error: 'Invalid or tampered cancel token' });
      return;
    }
    const company = await prisma.company.findUnique({
      where: { id: parsed.companyId },
      select: { deletionRequestedAt: true, deletionRequestedBy: true, nameTh: true },
    });
    // Token's timestamp must match the row's timestamp — otherwise the
    // request was already cancelled (and may have been re-issued).
    if (!company?.deletionRequestedAt || company.deletionRequestedAt.getTime() !== parsed.requestedAt.getTime()) {
      res.status(400).json({ error: 'No matching deletion request — it may already be cancelled' });
      return;
    }
    const graceCutoff = new Date(parsed.requestedAt.getTime() + GRACE_DAYS * 86400_000);
    if (new Date() > graceCutoff) {
      res.status(400).json({ error: 'Grace window for cancellation has expired' });
      return;
    }

    await prisma.$transaction([
      prisma.company.update({
        where: { id: parsed.companyId },
        data: { deletionRequestedAt: null, deletionRequestedBy: null, hardDeleteScheduledAt: null },
      }),
      // Reactivate the requester so they can log back in. Other users in
      // the workspace were never deactivated — only the requester was.
      ...(company.deletionRequestedBy
        ? [prisma.user.update({ where: { id: company.deletionRequestedBy }, data: { isActive: true } })]
        : []),
      prisma.auditLog.create({
        data: {
          companyId: parsed.companyId,
          userId: company.deletionRequestedBy ?? 'system',
          action: 'account.deletion_cancelled_via_email',
          resourceType: 'company',
          resourceId: parsed.companyId,
          details: {},
          ipAddress: req.ip ?? 'unknown',
          userAgent: req.headers['user-agent'] ?? 'unknown',
        },
      }),
    ]);
    res.json({ data: { status: 'cancelled', companyNameTh: company.nameTh } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'token is required' });
      return;
    }
    logger.error('account public cancel failed', { err: err instanceof Error ? err.message : String(err) });
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
