import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import {
  isDbdConfigured,
  lookupDbdJuristicProfile,
  searchDbdJuristicByName,
} from '../services/dbdService';
import {
  getOpenDataSyncStatus,
  lookupLocalJuristicProfile,
  searchLocalJuristicProfiles,
  syncAllOpenDataCaches,
} from '../services/dbdOpenDataService';
import { logger } from '../config/logger';

export const dbdRouter = Router();

dbdRouter.use(requireRole('accountant', 'admin', 'super_admin'));

dbdRouter.get('/status', (_req, res) => {
  res.json({
    data: {
      configured: isDbdConfigured(),
      provider: 'dga-dbd',
      requiredEnv: ['DGA_CONSUMER_KEY', 'DGA_CONSUMER_SECRET', 'DGA_AGENT_ID'],
      localOpenData: {
        provider: 'open-dbd-rd-vat',
        defaultSync: 'weekly',
        requiredEnv: ['OPEN_DBD_DATA_URL or OPEN_DBD_DATA_FILE', 'RD_VAT_DATA_URL or RD_VAT_DATA_FILE'],
      },
    },
  });
});

dbdRouter.get('/local/status', async (_req, res) => {
  try {
    const data = await getOpenDataSyncStatus();
    res.json({ data });
  } catch (err) {
    logger.error('Failed to load local DBD open-data status', { error: err });
    res.status(500).json({ error: 'Failed to load local DBD open-data status' });
  }
});

dbdRouter.get('/local/lookup', async (req, res) => {
  try {
    const { taxId } = z.object({ taxId: z.string().regex(/^\d{13}$/) }).parse(req.query);
    const data = await lookupLocalJuristicProfile(req.user!, taxId);
    res.json({ data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Tax ID must be 13 digits', details: err.errors });
      return;
    }
    logger.error('Failed to lookup local DBD open-data profile', { error: err, taxId: req.query.taxId });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to lookup local DBD open-data profile' });
  }
});

dbdRouter.get('/local/search', async (req, res) => {
  try {
    const { q, limit } = z.object({
      q: z.string().min(3),
      limit: z.coerce.number().int().min(1).max(10).default(10),
    }).parse(req.query);
    const data = await searchLocalJuristicProfiles(req.user!, q, limit);
    res.json({ data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Search query must be at least 3 characters', details: err.errors });
      return;
    }
    logger.error('Failed to search local DBD open-data profiles', { error: err, q: req.query.q });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to search local DBD open-data profiles' });
  }
});

dbdRouter.post('/sync', requireRole('super_admin'), async (req, res) => {
  try {
    const data = await syncAllOpenDataCaches(`manual:${req.user!.userId}`);
    res.json({ data });
  } catch (err) {
    logger.error('Failed to sync local DBD/RD open data', { error: err });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to sync local DBD/RD open data' });
  }
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
