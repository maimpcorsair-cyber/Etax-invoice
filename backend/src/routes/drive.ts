import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../config/database';
import { authenticate } from '../middleware/auth';
import { auditLog } from '../services/auditService';
import {
  getDriveAuthUrl,
  exchangeCodeForTokens,
  isUserDriveOAuthConfigured,
} from '../services/googleDriveService';
import { logger } from '../config/logger';

export const driveRouter = Router();

// In-memory state tokens (short-lived, per-process). For production use Redis.
const pendingStates = new Map<string, { userId: string; expiresAt: number }>();

/* ─── Status ─── */
driveRouter.get('/status', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { googleDriveLinkedAt: true, googleRefreshToken: true },
    });
    res.json({
      data: {
        configured: isUserDriveOAuthConfigured(),
        connected: !!(user?.googleRefreshToken),
        linkedAt: user?.googleDriveLinkedAt ?? null,
      },
    });
  } catch (err) {
    logger.error('Failed to get Drive status', { error: err });
    res.status(500).json({ error: 'Failed to get Drive status' });
  }
});

/* ─── Start OAuth flow ─── */
driveRouter.get('/connect', authenticate, (req, res) => {
  if (!isUserDriveOAuthConfigured()) {
    res.status(503).json({ error: 'Google OAuth is not configured on this server (GOOGLE_CLIENT_SECRET missing)' });
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { userId: req.user!.userId, expiresAt: Date.now() + 10 * 60 * 1000 });

  const url = getDriveAuthUrl(state);
  res.json({ data: { url } });
});

/* ─── OAuth callback ─── */
driveRouter.get('/callback', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

  try {
    const { code, state, error: oauthError } = z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
    }).parse(req.query);

    if (oauthError) {
      logger.warn('Drive OAuth denied by user', { error: oauthError });
      res.redirect(`${frontendUrl}/app/expenses?drive=denied`);
      return;
    }

    if (!code || !state) {
      res.redirect(`${frontendUrl}/app/expenses?drive=error`);
      return;
    }

    const pending = pendingStates.get(state);
    if (!pending || pending.expiresAt < Date.now()) {
      pendingStates.delete(state);
      res.redirect(`${frontendUrl}/app/expenses?drive=expired`);
      return;
    }

    pendingStates.delete(state);

    const { refreshToken } = await exchangeCodeForTokens(code);

    await prisma.user.update({
      where: { id: pending.userId },
      data: { googleRefreshToken: refreshToken, googleDriveLinkedAt: new Date() },
    });

    const user = await prisma.user.findUnique({ where: { id: pending.userId }, select: { companyId: true, role: true } });

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
    res.redirect(`${frontendUrl}/app/expenses?drive=connected`);
  } catch (err) {
    logger.error('Drive OAuth callback failed', { error: err });
    res.redirect(`${frontendUrl}/app/expenses?drive=error`);
  }
});

/* ─── Disconnect ─── */
driveRouter.post('/disconnect', authenticate, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { googleRefreshToken: null, googleDriveLinkedAt: null },
    });

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { companyId: true, role: true } });

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
