import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { tenantRlsContext, withRlsContext, withSystemRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { getCertificateInfo, clearCertCache, signXml } from '../services/signatureService';
import { requestTimestamp } from '../services/tsaService';
import {
  createResendDomain,
  deleteResendDomain,
  getResendDomain,
  verifyResendDomain,
  ResendNotConfiguredError,
} from '../services/resendDomainService';
import {
  encryptConfigValue,
  resolveCompanyRuntimeConfig,
} from '../services/companyConfigService';
import { getOcrPolicyForCompany } from '../services/ocrPolicyService';
import {
  getLimitErrorMessage,
  getUsageLimit,
  getUsageValue,
  hasFeatureAccess,
  resolveCompanyAccessPolicy,
} from '../services/accessPolicyService';

export const adminRouter = Router();

adminRouter.use(requireRole('admin', 'super_admin'));

/* ─── Company ─── */
adminRouter.get('/company', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: {
        id: true,
        nameTh: true,
        nameEn: true,
        taxId: true,
        branchCode: true,
        branchNameTh: true,
        branchNameEn: true,
        addressTh: true,
        addressEn: true,
        phone: true,
        email: true,
        website: true,
        logoUrl: true,
        rdEnvironment: true,
        lineNotifyEnabled: true,
        overdueReminderDays: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json({ data: company });
  } catch {
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

const companySchema = z.object({
  nameTh: z.string().min(1),
  nameEn: z.string().optional(),
  taxId: z.string().length(13),
  branchCode: z.string().default('00000'),
  branchNameTh: z.string().optional(),
  branchNameEn: z.string().optional(),
  addressTh: z.string().min(1),
  addressEn: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().optional(),
});

adminRouter.put('/company', async (req, res) => {
  try {
    const body = companySchema.partial().parse(req.body);
    const company = await prisma.company.update({ where: { id: req.user!.companyId }, data: body });
    res.json({ data: company });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    res.status(500).json({ error: 'Failed to update company' });
  }
});

/* ─── Users ─── */
const userListSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  lastLoginAt: true,
  passwordHash: true,
  googleSub: true,
} as const;

function serializeManagedUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  passwordHash: string | null;
  googleSub: string | null;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    auth: {
      hasPassword: !!user.passwordHash,
      hasGoogle: true,
    },
  };
}

adminRouter.get('/users', async (req, res) => {
  try {
    const users = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.user.findMany({
        where: { companyId: req.user!.companyId },
        select: userListSelect,
        orderBy: { createdAt: 'asc' },
      });
    });
    res.json({ data: users.map(serializeManagedUser) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

const createUserSchema = z.object({
  name: z.string().trim().optional(),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.enum(['admin', 'accountant', 'viewer']),
});

adminRouter.post('/users', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'invite_users')) {
      res.status(403).json({ error: 'Upgrade to Business or Enterprise to add more users' });
      return;
    }
    const limit = getUsageLimit(policy, 'users');
    if (limit !== null && getUsageValue(policy, 'users') >= limit) {
      res.status(403).json({ error: getLimitErrorMessage('users', policy) });
      return;
    }

    const body = createUserSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const existing = await withSystemRlsContext(prisma, (tx) => tx.user.findUnique({ where: { email } }), {
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
    });
    if (existing) { res.status(409).json({ error: 'Email already exists' }); return; }

    const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : null;
    const fallbackName = email.split('@')[0].replace(/[._-]+/g, ' ').trim() || email;
    const user = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.user.create({
        data: {
          name: body.name?.trim() || fallbackName,
          email,
          passwordHash,
          role: body.role,
          companyId: req.user!.companyId,
        },
        select: userListSelect,
      });
    });
    res.status(201).json({ data: serializeManagedUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.enum(['admin', 'accountant', 'viewer']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

adminRouter.patch('/users/:userId', async (req, res) => {
  try {
    const body = updateUserSchema.parse(req.body);
    const targetUser = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.user.findFirst({
        where: {
          id: req.params.userId,
          companyId: req.user!.companyId,
        },
        select: userListSelect,
      });
    });

    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (targetUser.role === 'super_admin' && req.user!.role !== 'super_admin') {
      res.status(403).json({ error: 'Only super admins can modify this account' });
      return;
    }

    if (targetUser.id === req.user!.userId && body.isActive === false) {
      res.status(400).json({ error: 'You cannot deactivate your own account' });
      return;
    }

    const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : undefined;
    const user = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.user.update({
        where: { id: targetUser.id },
        data: {
          name: body.name,
          role: body.role,
          isActive: body.isActive,
          passwordHash,
        },
        select: userListSelect,
      });
    });

    res.json({ data: serializeManagedUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/* ─── Document Templates ─── */
const templateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note', 'debit_note']),
  language: z.enum(['th', 'en', 'both']),
  htmlTh: z.string().min(1),
  htmlEn: z.string().min(1),
  isActive: z.boolean().optional(),
});

adminRouter.get('/templates', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'custom_templates')) {
      res.status(403).json({ error: 'Upgrade to Business or Enterprise to manage custom templates' });
      return;
    }

    const templates = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.documentTemplate.findMany({
        where: { companyId: req.user!.companyId },
        orderBy: { createdAt: 'asc' },
      });
    });
    res.json({ data: templates });
  } catch {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

adminRouter.post('/templates', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'custom_templates')) {
      res.status(403).json({ error: 'Upgrade to Business or Enterprise to manage custom templates' });
      return;
    }

    const body = templateSchema.parse(req.body);
    const template = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const created = await tx.documentTemplate.create({
        data: {
          companyId: req.user!.companyId,
          name: body.name,
          type: body.type,
          language: body.language,
          htmlTh: body.htmlTh,
          htmlEn: body.htmlEn,
          isActive: body.isActive ?? false,
        },
      });
      if (created.isActive) {
        await tx.documentTemplate.updateMany({
          where: {
            companyId: req.user!.companyId,
            type: created.type,
            language: created.language,
            id: { not: created.id },
          },
          data: { isActive: false },
        });
      }
      return created;
    });
    res.status(201).json({ data: template });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    res.status(500).json({ error: 'Failed to create template' });
  }
});

adminRouter.patch('/templates/:templateId', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'custom_templates')) {
      res.status(403).json({ error: 'Upgrade to Business or Enterprise to manage custom templates' });
      return;
    }

    const body = templateSchema.partial().parse(req.body);
    const template = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const current = await tx.documentTemplate.findFirst({
        where: { id: req.params.templateId, companyId: req.user!.companyId },
      });
      if (!current) {
        return null;
      }

      const updated = await tx.documentTemplate.update({
        where: { id: current.id },
        data: body,
      });

      if (body.isActive) {
        await tx.documentTemplate.updateMany({
          where: {
            companyId: req.user!.companyId,
            type: updated.type,
            language: updated.language,
            id: { not: updated.id },
          },
          data: { isActive: false },
        });
      }

      return updated;
    });
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json({ data: template });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: err.errors }); return; }
    res.status(500).json({ error: 'Failed to update template' });
  }
});

adminRouter.delete('/templates/:templateId', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'custom_templates')) {
      res.status(403).json({ error: 'Upgrade to Business or Enterprise to manage custom templates' });
      return;
    }

    const deleted = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      return tx.documentTemplate.deleteMany({
        where: { id: req.params.templateId, companyId: req.user!.companyId },
      });
    });
    if (!deleted.count) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ message: 'Template deleted' });
  } catch {
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

/* ─── Certificate & RD Config ─────────────────────────────────────────── */

/** GET /api/admin/certificate — ตรวจสอบสถานะ certificate */
adminRouter.get('/certificate', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'manage_certificate')) {
      res.status(403).json({ error: 'Upgrade your plan to manage digital certificates' });
      return;
    }

    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: { certificateBlob: true, certificatePath: true, certificatePassword: true },
    });
    const runtimeConfig = resolveCompanyRuntimeConfig(company);
    const info = getCertificateInfo({
      certBlob: runtimeConfig.certBlob,
      certPath: runtimeConfig.certPath,
      certPassword: runtimeConfig.certPassword,
      cacheKey: req.user!.companyId,
    });
    res.json({ data: info });
  } catch {
    res.status(500).json({ error: 'Failed to fetch certificate info' });
  }
});

/** POST /api/admin/certificate — อัพโหลด .p12 certificate ใหม่
 *  Body (JSON): { p12Base64: string, password: string }
 *  เก็บเป็น BYTEA ใน DB เพื่อให้ต่อ company; ของเดิมที่เคย write ไป
 *  certs/company.p12 บน FS ถูกถอด เพราะ Render web disk ephemeral และ
 *  ใช้ path เดียวกันทุก tenant (multi-tenancy leak).
 */
adminRouter.post('/certificate', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'manage_certificate')) {
      res.status(403).json({ error: 'Upgrade your plan to manage digital certificates' });
      return;
    }

    const { p12Base64, password } = req.body as { p12Base64?: string; password?: string };
    if (!p12Base64 || !password) {
      res.status(400).json({ error: 'p12Base64 and password are required' }); return;
    }

    const certBlob = Buffer.from(p12Base64, 'base64');
    if (certBlob.length < 100 || certBlob.length > 1024 * 1024) {
      res.status(400).json({ error: 'Certificate payload size out of range (expected ~5KB .p12)' });
      return;
    }

    // Bust any cached cert for this company before re-validating with the
    // new bytes; otherwise we'd validate against the stale in-memory copy.
    clearCertCache(req.user!.companyId);

    const info = getCertificateInfo({
      certBlob,
      certPassword: password,
      cacheKey: req.user!.companyId,
    });
    if (!info.loaded) {
      res.status(400).json({ error: `Invalid certificate: ${info.error}` }); return;
    }
    if (info.isExpired) {
      res.status(400).json({ error: 'Certificate is expired' }); return;
    }

    await prisma.company.update({
      where: { id: req.user!.companyId },
      data: {
        certificateBlob: certBlob,
        certificateUploadedAt: new Date(),
        certificatePassword: encryptConfigValue(password),
        // Clear legacy path — DB blob is the source of truth now.
        certificatePath: null,
      },
    });

    res.json({ data: info, message: 'Certificate uploaded and validated successfully' });
  } catch (err) {
    res.status(500).json({ error: `Failed to upload certificate: ${(err as Error).message}` });
  }
});

/** GET /api/admin/rd-config — ดูการตั้งค่า RD */
adminRouter.get('/rd-config', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'manage_rd_config')) {
      res.status(403).json({ error: 'Upgrade your plan to configure RD integration' });
      return;
    }

    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: {
        certificateBlob: true,
        certificatePath: true,
        certificatePassword: true,
        rdClientId: true,
        rdClientSecret: true,
        rdEnvironment: true,
      },
    });
    const runtimeConfig = resolveCompanyRuntimeConfig(company);
    res.json({
      data: {
        environment: runtimeConfig.rdEnvironment,
        clientId: runtimeConfig.rdClientId ? '***configured***' : null,
        hasSecret: !!runtimeConfig.rdClientSecret,
        certStatus: getCertificateInfo({
          certBlob: runtimeConfig.certBlob,
          certPath: runtimeConfig.certPath,
          certPassword: runtimeConfig.certPassword,
          cacheKey: req.user!.companyId,
        }),
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to get RD config' });
  }
});

/** PUT /api/admin/rd-config — ตั้งค่า RD credentials */
adminRouter.put('/rd-config', async (req, res) => {
  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'manage_rd_config')) {
      res.status(403).json({ error: 'Upgrade your plan to configure RD integration' });
      return;
    }

    const { clientId, clientSecret, environment } = req.body as {
      clientId?: string; clientSecret?: string; environment?: string;
    };

    await prisma.company.update({
      where: { id: req.user!.companyId },
      data: {
        rdClientId: clientId,
        rdClientSecret: clientSecret ? encryptConfigValue(clientSecret) : undefined,
        rdEnvironment: environment ?? 'sandbox',
      },
    });

    res.json({ message: 'RD config updated' });
  } catch {
    res.status(500).json({ error: 'Failed to update RD config' });
  }
});

/* ─── Brand email domain (send-as) ─────────────────────────────────────
 *
 * Lets an SME route their invoice emails through a domain THEY own —
 * recipients see "From: noreply@theirdomain.com" instead of the platform
 * default. Verification round-trips through Resend's Domains API; we
 * cache the Resend domain id so re-checks don't recreate.
 *
 * When the customer hasn't opted in (brandDomain is null), emailService
 * falls back to SMTP_FROM_DEFAULT — every account starts on the shared
 * platform sender and upgrades when they're ready.
 */

const brandDomainRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?:\.(?!-)[A-Za-z0-9-]{1,63})+$/;

adminRouter.get('/email-domain', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: {
        brandDomain: true,
        brandDomainProviderId: true,
        brandDomainStatus: true,
        brandDomainVerifiedAt: true,
      },
    });
    if (!company?.brandDomain) {
      res.json({ data: { configured: false } });
      return;
    }
    // Best-effort fresh status from Resend; if Resend is down or the
    // domain id has gone missing, fall back to whatever we last saved.
    let liveStatus = company.brandDomainStatus;
    let records: unknown[] = [];
    if (company.brandDomainProviderId) {
      try {
        const live = await getResendDomain(company.brandDomainProviderId);
        liveStatus = live.status;
        records = live.records;
        // Persist a state change so subsequent reads don't depend on Resend.
        if (live.status !== company.brandDomainStatus) {
          await prisma.company.update({
            where: { id: req.user!.companyId },
            data: {
              brandDomainStatus: live.status,
              brandDomainVerifiedAt: live.status === 'verified' ? new Date() : null,
            },
          });
        }
      } catch (err) {
        logger.warn('[admin/email-domain] live status fetch failed; returning cached', { err: err instanceof Error ? err.message : String(err) });
      }
    }
    res.json({
      data: {
        configured: true,
        domain: company.brandDomain,
        status: liveStatus,
        verifiedAt: company.brandDomainVerifiedAt?.toISOString() ?? null,
        dnsRecords: records,
      },
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch email domain: ${(err as Error).message}` });
  }
});

adminRouter.post('/email-domain', async (req, res) => {
  try {
    const { domain } = req.body as { domain?: string };
    const normalized = (domain ?? '').trim().toLowerCase();
    if (!normalized || !brandDomainRegex.test(normalized)) {
      res.status(400).json({ error: 'Provide a valid domain like "yourcompany.com"' });
      return;
    }

    const existing = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: { brandDomain: true, brandDomainProviderId: true },
    });
    // If they already added a domain and want to switch, delete the old
    // one on Resend so we don't accrue abandoned domains under their quota.
    if (existing?.brandDomainProviderId && existing.brandDomain && existing.brandDomain !== normalized) {
      try {
        await deleteResendDomain(existing.brandDomainProviderId);
      } catch (err) {
        logger.warn('[admin/email-domain] failed to delete previous domain', { err: err instanceof Error ? err.message : String(err) });
      }
    }

    const created = await createResendDomain(normalized);
    const updated = await prisma.company.update({
      where: { id: req.user!.companyId },
      data: {
        brandDomain: normalized,
        brandDomainProviderId: created.id,
        brandDomainStatus: created.status,
        brandDomainVerifiedAt: created.status === 'verified' ? new Date() : null,
      },
      select: { brandDomain: true, brandDomainStatus: true },
    });
    res.status(201).json({
      data: {
        configured: true,
        domain: updated.brandDomain,
        status: updated.brandDomainStatus,
        verifiedAt: null,
        dnsRecords: created.records,
        message: 'Add the DNS records above at your domain registrar, then click Verify.',
      },
    });
  } catch (err) {
    if (err instanceof ResendNotConfiguredError) {
      res.status(503).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: `Failed to add email domain: ${(err as Error).message}` });
  }
});

adminRouter.post('/email-domain/verify', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: { brandDomainProviderId: true },
    });
    if (!company?.brandDomainProviderId) {
      res.status(404).json({ error: 'No brand domain configured to verify' });
      return;
    }
    const result = await verifyResendDomain(company.brandDomainProviderId);
    await prisma.company.update({
      where: { id: req.user!.companyId },
      data: {
        brandDomainStatus: result.status,
        brandDomainVerifiedAt: result.status === 'verified' ? new Date() : null,
      },
    });
    res.json({
      data: {
        status: result.status,
        verifiedAt: result.status === 'verified' ? new Date().toISOString() : null,
        dnsRecords: result.records,
      },
    });
  } catch (err) {
    if (err instanceof ResendNotConfiguredError) {
      res.status(503).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: `Verify failed: ${(err as Error).message}` });
  }
});

adminRouter.delete('/email-domain', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: { brandDomainProviderId: true },
    });
    if (company?.brandDomainProviderId) {
      // Best-effort cleanup on Resend; even if it fails we still detach
      // locally so the user isn't stuck with a dead domain in their UI.
      try { await deleteResendDomain(company.brandDomainProviderId); }
      catch (err) { logger.warn('[admin/email-domain] resend delete failed', { err: err instanceof Error ? err.message : String(err) }); }
    }
    await prisma.company.update({
      where: { id: req.user!.companyId },
      data: {
        brandDomain: null,
        brandDomainProviderId: null,
        brandDomainStatus: null,
        brandDomainVerifiedAt: null,
      },
    });
    res.json({ data: { configured: false } });
  } catch (err) {
    res.status(500).json({ error: `Disconnect failed: ${(err as Error).message}` });
  }
});

/** POST /api/admin/signing-test — ทดสอบ sign XML + TSA ด้วย certificate ที่ใช้อยู่ */
adminRouter.post('/signing-test', async (req, res) => {
  const startTime = Date.now();
  const steps: { step: string; status: 'ok' | 'error'; detail?: string; ms?: number }[] = [];

  try {
    const policy = await resolveCompanyAccessPolicy(req.user!.companyId);
    if (!hasFeatureAccess(policy, 'manage_certificate')) {
      res.status(403).json({ success: false, steps, error: 'Upgrade your plan to test certificate signing' });
      return;
    }

    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: { certificateBlob: true, certificatePath: true, certificatePassword: true, rdEnvironment: true },
    });
    const runtimeConfig = resolveCompanyRuntimeConfig(company);

    // Step 1: Check certificate
    const certInfo = getCertificateInfo({
      certBlob: runtimeConfig.certBlob,
      certPath: runtimeConfig.certPath,
      certPassword: runtimeConfig.certPassword,
      cacheKey: req.user!.companyId,
    });
    steps.push({
      step: '① Load Certificate',
      status: certInfo.loaded ? 'ok' : 'error',
      detail: certInfo.loaded
        ? `CN=${certInfo.commonName} | Valid until ${certInfo.validUntil} | ${certInfo.isDev ? 'DEV self-signed' : 'CA-issued'}`
        : certInfo.error,
    });
    if (!certInfo.loaded) {
      res.json({ success: false, steps }); return;
    }

    // Step 2: Sign test XML
    const t2 = Date.now();
    const testXml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:etax:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID xmlns:cbc="urn:etax:names:specification:ubl:schema:xsd:CommonBasicComponents-2">TEST-SIGN-001</cbc:ID>
  <cbc:IssueDate xmlns:cbc="urn:etax:names:specification:ubl:schema:xsd:CommonBasicComponents-2">${new Date().toISOString().split('T')[0]}</cbc:IssueDate>
</Invoice>`;

    let sigResult: Awaited<ReturnType<typeof signXml>>;
    try {
      sigResult = signXml(testXml, {
        certBlob: runtimeConfig.certBlob,
        certPath: runtimeConfig.certPath,
        certPassword: runtimeConfig.certPassword,
        cacheKey: req.user!.companyId,
      });
      steps.push({ step: '② XAdES-BES Sign', status: 'ok', detail: `signatureId=${sigResult.signatureId}`, ms: Date.now() - t2 });
    } catch (e) {
      steps.push({ step: '② XAdES-BES Sign', status: 'error', detail: (e as Error).message });
      res.json({ success: false, steps }); return;
    }

    // Step 3: Request TSA timestamp
    const t3 = Date.now();
    let tstResult: Awaited<ReturnType<typeof requestTimestamp>>;
    try {
      tstResult = await requestTimestamp(sigResult.signatureId);
      steps.push({
        step: '③ TSA Timestamp',
        status: 'ok',
        detail: `tsaUrl=${tstResult.tsaUrl} | isMock=${tstResult.isMock}`,
        ms: Date.now() - t3,
      });
    } catch (e) {
      steps.push({ step: '③ TSA Timestamp', status: 'error', detail: (e as Error).message });
      res.json({ success: false, steps }); return;
    }

    steps.push({
      step: '④ Total',
      status: 'ok',
      detail: 'All signing steps passed ✅',
      ms: Date.now() - startTime,
    });

    res.json({
      success: true,
      steps,
      certInfo,
      environment: runtimeConfig.rdEnvironment,
      signedXmlPreview: sigResult.signedXml.slice(0, 500) + '...',
    });
  } catch (err) {
    steps.push({ step: 'Unexpected error', status: 'error', detail: (err as Error).message });
    res.status(500).json({ success: false, steps });
  }
});

/* ─── OCR Stats (Phase B/E) ─── */
adminRouter.get('/ocr-stats', async (req, res) => {
  try {
    const companyId = req.user!.companyId;
    const since = new Date(Date.now() - 30 * 86_400_000);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [providerMix, recent, monthSpend, policy, budgetSpend] = await Promise.all([
      prisma.ocrBenchmark.groupBy({
        by: ['provider', 'documentType'],
        where: { companyId, createdAt: { gte: since } },
        _count: { _all: true },
        _avg: { latencyMs: true, costUsd: true },
        orderBy: { _count: { provider: 'desc' } },
      }),
      prisma.ocrBenchmark.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          documentType: true,
          provider: true,
          model: true,
          confidence: true,
          stage: true,
          latencyMs: true,
          costThb: true,
          createdAt: true,
        },
      }),
      prisma.ocrCreditLedger.aggregate({
        where: { companyId, createdAt: { gte: monthStart } },
        _sum: { costThb: true, costUsd: true, inputTokens: true, outputTokens: true },
        _count: { _all: true },
      }),
      getOcrPolicyForCompany(companyId),
      prisma.ocrCreditLedger.groupBy({
        by: ['provider'],
        where: { companyId, createdAt: { gte: monthStart } },
        _sum: { costThb: true, costUsd: true },
      }),
    ]);

    res.json({
      data: {
        providerMix: providerMix.map((row) => ({
          provider: row.provider,
          documentType: row.documentType,
          calls: row._count._all,
          avgLatencyMs: Math.round(row._avg.latencyMs ?? 0),
          avgCostUsd: Number((row._avg.costUsd ?? 0).toFixed(4)),
        })),
        recent,
        monthSpend: {
          calls: monthSpend._count._all,
          thb: Number((monthSpend._sum.costThb ?? 0).toFixed(2)),
          usd: Number((monthSpend._sum.costUsd ?? 0).toFixed(4)),
          inputTokens: monthSpend._sum.inputTokens ?? 0,
          outputTokens: monthSpend._sum.outputTokens ?? 0,
        },
        monthSpendByProvider: budgetSpend.map((row) => ({
          provider: row.provider,
          thb: Number((row._sum.costThb ?? 0).toFixed(2)),
          usd: Number((row._sum.costUsd ?? 0).toFixed(4)),
        })),
        quota: {
          tier: policy.tier,
          monthlyDocLimit: policy.monthlyDocLimit,
          docsUsedThisMonth: policy.docsUsedThisMonth,
          overQuota: policy.overQuota,
        },
      },
    });
  } catch (err) {
    void req;
    res.status(500).json({ error: 'Failed to load OCR stats', message: err instanceof Error ? err.message : String(err) });
  }
});
