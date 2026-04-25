/**
 * notifications.ts
 * Routes for managing FCM device tokens.
 *
 * POST   /api/notifications/fcm-token  — register / re-activate a device token
 * DELETE /api/notifications/fcm-token  — soft-delete (deactivate) a device token
 */

import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { logger } from '../config/logger';

export const notificationsRouter = Router();

const platformValues = ['android', 'ios', 'web'] as const;

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(platformValues),
});

const deregisterSchema = z.object({
  token: z.string().min(1),
});

// POST /api/notifications/fcm-token
notificationsRouter.post('/fcm-token', async (req, res) => {
  try {
    const body = registerSchema.parse(req.body);
    const userId = req.user!.userId;

    await prisma.fcmToken.upsert({
      where: { token: body.token },
      create: {
        userId,
        token: body.token,
        platform: body.platform,
        isActive: true,
      },
      update: {
        // Re-activate if previously deactivated; update platform in case it changed.
        userId,
        platform: body.platform,
        isActive: true,
      },
    });

    logger.info('FCM token registered', { userId, platform: body.platform });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to register FCM token', err);
    res.status(500).json({ error: 'Failed to register FCM token' });
  }
});

// DELETE /api/notifications/fcm-token
notificationsRouter.delete('/fcm-token', async (req, res) => {
  try {
    const body = deregisterSchema.parse(req.body);
    const userId = req.user!.userId;

    // Only deactivate tokens that belong to the requesting user.
    await prisma.fcmToken.updateMany({
      where: { token: body.token, userId },
      data: { isActive: false },
    });

    logger.info('FCM token deregistered', { userId });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('Failed to deregister FCM token', err);
    res.status(500).json({ error: 'Failed to deregister FCM token' });
  }
});
