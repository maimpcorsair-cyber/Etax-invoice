import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../config/database';
import { authenticate } from '../middleware/auth';
import { withRlsContext, withSystemRlsContext, tenantRlsContext } from '../config/rls';
import { auditLog } from '../services/auditService';
import {
  getDriveAuthUrl,
  exchangeCodeForTokens,
  getDriveRedirectUri,
  isDriveConfigured,
  isDriveServiceAccountConfigured,
  isUserDriveOAuthConfigured,
} from '../services/googleDriveService';
import { logger } from '../config/logger';

export const driveRouter = Router();

function frontendBaseUrl(): string {
  const configured = process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? 'http://localhost:3000';
  return configured.split(',').map((url) => url.trim()).filter(Boolean)[0].replace(/\/+$/, '');
}

function sanitizeReturnPath(value?: string): string {
  if (!value) return '/app/projects';
  if (!value.startsWith('/')) return '/app/projects';
  if (value.startsWith('//')) return '/app/projects';
  if (!value.startsWith('/app/') && value !== '/app') return '/app/projects';
  return value.slice(0, 500);
}

function redirectWithDriveStatus(baseUrl: string, returnPath: string, drive: string): string {
  const url = new URL(`${baseUrl}${sanitizeReturnPath(returnPath)}`);
  url.searchParams.set('drive', drive);
  return url.toString();
}

function requiredOAuthEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!process.env.GOOGLE_DRIVE_REDIRECT_URI) missing.push('GOOGLE_DRIVE_REDIRECT_URI');
  return missing;
}

/* ─── Status ─── */
driveRouter.get('/status', authenticate, async (req, res) => {
  try {
    const user = await withRlsContext(prisma, tenantRlsContext(req.user!), (tx) =>
      tx.user.findUnique({
        where: { id: req.user!.userId },
        select: { googleDriveLinkedAt: true, googleRefreshToken: true },
      }),
    );
    const oauthConfigured = isUserDriveOAuthConfigured();
    const serviceAccountConfigured = isDriveServiceAccountConfigured();
    const connected = !!user?.googleRefreshToken;
    res.json({
      data: {
        configured: oauthConfigured,
        oauthConfigured,
        serviceAccountConfigured,
        driveUsable: isDriveConfigured(),
        connected,
        linkedAt: user?.googleDriveLinkedAt ?? null,
        mode: connected ? 'user_oauth' : serviceAccountConfigured ? 'service_account' : 'not_configured',
        requiredEnv: requiredOAuthEnv(),
        redirectUri: getDriveRedirectUri(),
      },
    });
  } catch (err) {
    logger.error('Failed to get Drive status', { error: err });
    res.status(500).json({ error: 'Failed to get Drive status' });
  }
});

/* ─── Start OAuth flow ─── */
driveRouter.get('/connect', authenticate, async (req, res) => {
  if (!isUserDriveOAuthConfigured()) {
    res.status(503).json({
      error: 'Google Drive OAuth is not configured on this server',
      details: {
        missingEnv: requiredOAuthEnv(),
        redirectUri: getDriveRedirectUri(),
      },
    });
    return;
  }

  try {
    const parsed = z.object({ returnPath: z.string().optional() }).parse(req.query);
    const state = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await tx.driveOAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      await tx.driveOAuthState.create({
        data: {
          state,
          userId: req.user!.userId,
          companyId: req.user!.companyId,
          returnPath: sanitizeReturnPath(parsed.returnPath),
          expiresAt,
        },
      });
    });

    const url = getDriveAuthUrl(state);
    res.json({ data: { url, expiresAt, redirectUri: getDriveRedirectUri() } });
  } catch (err) {
    logger.error('Failed to start Drive OAuth', { error: err });
    res.status(500).json({ error: 'Failed to start Google Drive connection' });
  }
});

/* ─── OAuth callback ─── */
driveRouter.get('/callback', async (req, res) => {
  const frontendUrl = frontendBaseUrl();

  try {
    const { code, state, error: oauthError } = z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
    }).parse(req.query);

    if (oauthError) {
      logger.warn('Drive OAuth denied by user', { error: oauthError });
      res.redirect(redirectWithDriveStatus(frontendUrl, '/app/settings', 'denied'));
      return;
    }

    if (!code || !state) {
      res.redirect(redirectWithDriveStatus(frontendUrl, '/app/settings', 'error'));
      return;
    }

    const pending = await withSystemRlsContext(prisma, (tx) =>
      tx.driveOAuthState.findUnique({ where: { state } }),
    );
    const returnPath = pending?.returnPath ?? '/app/settings';
    if (!pending || pending.expiresAt < new Date()) {
      if (pending) {
        await withSystemRlsContext(prisma, (tx) => tx.driveOAuthState.delete({ where: { id: pending.id } }));
      }
      res.redirect(redirectWithDriveStatus(frontendUrl, returnPath, 'expired'));
      return;
    }

    await withSystemRlsContext(prisma, (tx) => tx.driveOAuthState.delete({ where: { id: pending.id } }));

    const { refreshToken } = await exchangeCodeForTokens(code);

    const user = await withSystemRlsContext(prisma, async (tx) => {
      await tx.user.update({
        where: { id: pending.userId },
        data: { googleRefreshToken: refreshToken, googleDriveLinkedAt: new Date() },
      });
      return tx.user.findUnique({ where: { id: pending.userId }, select: { companyId: true, role: true } });
    });

    await auditLog({
      companyId: user!.companyId,
      userId: pending.userId,
      role: user!.role,
      action: 'user.google_drive_connected',
      resourceType: 'user',
      resourceId: pending.userId,
      details: {},
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    logger.info('Google Drive connected for user', { userId: pending.userId });
    res.redirect(redirectWithDriveStatus(frontendUrl, returnPath, 'connected'));
  } catch (err) {
    logger.error('Drive OAuth callback failed', { error: err });
    res.redirect(redirectWithDriveStatus(frontendUrl, '/app/settings', 'error'));
  }
});

/* ─── Disconnect ─── */
driveRouter.post('/disconnect', authenticate, async (req, res) => {
  try {
    const user = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      await tx.user.update({
        where: { id: req.user!.userId },
        data: { googleRefreshToken: null, googleDriveLinkedAt: null },
      });
      return tx.user.findUnique({ where: { id: req.user!.userId }, select: { companyId: true, role: true } });
    });

    await auditLog({
      companyId: user!.companyId,
      userId: req.user!.userId,
      role: req.user!.role,
      action: 'user.google_drive_disconnected',
      resourceType: 'user',
      resourceId: req.user!.userId,
      details: {},
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent') ?? '',
      language: 'th',
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to disconnect Drive', { error: err });
    res.status(500).json({ error: 'Failed to disconnect Google Drive' });
  }
});
