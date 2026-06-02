import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { logger } from '../config/logger';

// Product ↔ marketplace SKU mappings. The foundation for multi-channel stock
// sync: one central Product can carry the SKU it uses on each channel so a
// future order connector resolves an incoming channel SKU to one Product and
// never oversells. Recording mappings needs no external API.

export const channelMappingsRouter = Router();

const CHANNELS = ['shopee', 'lazada', 'tiktok', 'line_shopping', 'shopify', 'woocommerce', 'pos', 'other'] as const;

const createSchema = z.object({
  productId: z.string().min(1),
  channel: z.enum(CHANNELS),
  externalSku: z.string().trim().min(1).max(120),
  externalProductId: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
});

const mappingSelect = {
  id: true, productId: true, channel: true, externalSku: true,
  externalProductId: true, note: true, createdAt: true,
} as const;

// ── List (optionally by product) ──────────────────────────────────────
channelMappingsRouter.get('/', async (req, res) => {
  try {
    const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
    const rows = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) =>
      tx.productChannelMapping.findMany({
        where: { companyId: req.user!.companyId, ...(productId ? { productId } : {}) },
        orderBy: [{ productId: 'asc' }, { channel: 'asc' }],
        select: mappingSelect,
      }),
    );
    res.json({ data: rows });
  } catch (err) {
    logger.error('[channelMappings] list failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to list channel mappings' });
  }
});

// ── Create ────────────────────────────────────────────────────────────
channelMappingsRouter.post('/', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const body = createSchema.parse(req.body);
    const created = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const product = await tx.product.findFirst({ where: { id: body.productId, companyId: req.user!.companyId }, select: { id: true } });
      if (!product) return { error: 'not_found' as const };
      try {
        const row = await tx.productChannelMapping.create({
          data: {
            companyId: req.user!.companyId,
            productId: body.productId,
            channel: body.channel,
            externalSku: body.externalSku,
            externalProductId: body.externalProductId ?? null,
            note: body.note ?? null,
          },
          select: mappingSelect,
        });
        return { row };
      } catch (e) {
        // Unique violation: this external SKU is already mapped on this channel.
        if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') {
          return { error: 'duplicate' as const };
        }
        throw e;
      }
    });
    if ('error' in created) {
      if (created.error === 'not_found') {
        res.status(404).json({ error: 'Product not found' });
        return;
      }
      res.status(409).json({ error: 'SKU นี้ถูกผูกกับสินค้าอื่นในช่องทางนี้แล้ว' });
      return;
    }
    res.status(201).json({ data: created.row });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: err.errors });
      return;
    }
    logger.error('[channelMappings] create failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to create channel mapping' });
  }
});

// ── Delete ────────────────────────────────────────────────────────────
channelMappingsRouter.delete('/:id', requireRole('admin', 'super_admin', 'accountant'), async (req, res) => {
  try {
    const deleted = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const existing = await tx.productChannelMapping.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
      if (!existing) return null;
      await tx.productChannelMapping.delete({ where: { id: existing.id } });
      return existing;
    });
    if (!deleted) {
      res.status(404).json({ error: 'Mapping not found' });
      return;
    }
    res.json({ data: { id: deleted.id } });
  } catch (err) {
    logger.error('[channelMappings] delete failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to delete channel mapping' });
  }
});
