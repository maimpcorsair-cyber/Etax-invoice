import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { logger } from '../config/logger';
import { askPinuch } from '../services/aiService';

export const aiChatRouter = Router();

const chatMessageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

aiChatRouter.post('/message', async (req, res) => {
  try {
    const body = chatMessageSchema.parse(req.body);
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: { id: true, nameTh: true, taxId: true },
    });

    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    const answer = await askPinuch(
      company.id,
      company.nameTh,
      company.taxId,
      body.message,
    );

    res.json({
      data: {
        answer,
        source: 'web',
        model: 'pinuch',
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    logger.error('[AI Chat] message failed', { error: err, companyId: req.user?.companyId, userId: req.user?.userId });
    res.status(500).json({ error: 'AI chat failed' });
  }
});
