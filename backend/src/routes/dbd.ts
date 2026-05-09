import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import {
  isDbdConfigured,
  lookupDbdJuristicProfile,
  searchDbdJuristicByName,
} from '../services/dbdService';
import { logger } from '../config/logger';

export const dbdRouter = Router();

dbdRouter.use(requireRole('accountant', 'admin', 'super_admin'));

dbdRouter.get('/status', (_req, res) => {
  res.json({
    data: {
      configured: isDbdConfigured(),
      provider: 'dga-dbd',
      requiredEnv: ['DGA_CONSUMER_KEY', 'DGA_CONSUMER_SECRET', 'DGA_AGENT_ID'],
    },
  });
});

dbdRouter.get('/juristic/:juristicId', async (req, res) => {
  try {
    if (!isDbdConfigured()) {
      res.status(503).json({
        error: 'DBD API is not configured',
        requiredEnv: ['DGA_CONSUMER_KEY', 'DGA_CONSUMER_SECRET', 'DGA_AGENT_ID'],
      });
      return;
    }

    const { juristicId } = z.object({ juristicId: z.string().regex(/^\d{13}$/) }).parse(req.params);
    const data = await lookupDbdJuristicProfile(juristicId);
    res.json({ data });
  } catch (err) {
    logger.error('Failed to lookup DBD juristic profile', { error: err, juristicId: req.params.juristicId });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to lookup DBD juristic profile' });
  }
});

dbdRouter.get('/juristic-search', async (req, res) => {
  try {
    if (!isDbdConfigured()) {
      res.status(503).json({
        error: 'DBD API is not configured',
        requiredEnv: ['DGA_CONSUMER_KEY', 'DGA_CONSUMER_SECRET', 'DGA_AGENT_ID'],
      });
      return;
    }

    const { name } = z.object({ name: z.string().min(2) }).parse(req.query);
    const data = await searchDbdJuristicByName(name);
    res.json({ data });
  } catch (err) {
    logger.error('Failed to search DBD juristic profile', { error: err, name: req.query.name });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to search DBD juristic profile' });
  }
});
