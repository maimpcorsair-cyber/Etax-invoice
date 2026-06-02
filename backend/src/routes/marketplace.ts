import { Router } from 'express';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { logger } from '../config/logger';
import { shopeeConnector } from '../services/marketplace/shopeeConnector';
import type { MarketplaceConnector, SalesChannel } from '../services/marketplace/types';

// Marketplace connection registry. Scaffold only: lists connection status per
// channel and lets an admin disconnect. Live OAuth connect + order sync are
// added per platform once partner credentials exist (Shopee first).

export const marketplaceRouter = Router();

// Channels we intend to support, in display order. `connector` is set for
// platforms that have an implementation wired (currently Shopee, as a stub).
const CHANNELS: Array<{ channel: SalesChannel; label: string; connector?: MarketplaceConnector }> = [
  { channel: 'shopee', label: 'Shopee', connector: shopeeConnector },
  { channel: 'lazada', label: 'Lazada' },
  { channel: 'tiktok', label: 'TikTok Shop' },
  { channel: 'line_shopping', label: 'LINE SHOPPING' },
  { channel: 'shopify', label: 'Shopify' },
  { channel: 'woocommerce', label: 'WooCommerce' },
];

// ── List channels + connection status ─────────────────────────────────
marketplaceRouter.get('/connections', async (req, res) => {
  try {
    const rows = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) =>
      tx.marketplaceConnection.findMany({
        where: { companyId: req.user!.companyId },
        select: {
          channel: true, status: true, externalShopName: true,
          lastSyncedAt: true, lastError: true, updatedAt: true,
        },
      }),
    );
    const byChannel = new Map(rows.map((r) => [r.channel, r]));

    const data = CHANNELS.map((c) => {
      const conn = byChannel.get(c.channel) ?? null;
      return {
        channel: c.channel,
        label: c.label,
        // 'available'  → connector wired + credentials present, ready to connect
        // 'coming_soon'→ connector wired but no server credentials yet
        // 'planned'    → no connector implementation yet
        readiness: c.connector ? (c.connector.isConfigured() ? 'available' : 'coming_soon') : 'planned',
        status: conn?.status ?? 'disconnected',
        shopName: conn?.externalShopName ?? null,
        lastSyncedAt: conn?.lastSyncedAt ?? null,
        lastError: conn?.lastError ?? null,
      };
    });
    res.json({ data });
  } catch (err) {
    logger.error('[marketplace] list connections failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to list marketplace connections' });
  }
});

// ── Disconnect a channel ──────────────────────────────────────────────
marketplaceRouter.delete('/connections/:channel', requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const channel = req.params.channel;
    const deleted = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const existing = await tx.marketplaceConnection.findFirst({ where: { companyId: req.user!.companyId, channel } });
      if (!existing) return null;
      await tx.marketplaceConnection.delete({ where: { id: existing.id } });
      return existing;
    });
    if (!deleted) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    res.json({ data: { channel } });
  } catch (err) {
    logger.error('[marketplace] disconnect failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});
