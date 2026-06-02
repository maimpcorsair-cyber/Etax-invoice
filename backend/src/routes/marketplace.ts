import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { tenantRlsContext, withRlsContext } from '../config/rls';
import { requireRole } from '../middleware/auth';
import { logger } from '../config/logger';
import { shopeeConnector } from '../services/marketplace/shopeeConnector';
import { applyOrderToStock } from '../services/marketplace/applyOrderToStock';
import type { MarketplaceConnector, NormalizedOrder, SalesChannel } from '../services/marketplace/types';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Minimal RFC-4180-ish CSV line splitter (handles quoted cells + escaped "").
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsvRows(buffer: Buffer): { headers: string[]; rows: string[][] } {
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(splitCsvLine);
  return { headers, rows };
}

// Best-effort auto-mapping of CSV headers to the fields we need.
function guessMapping(headers: string[]): Record<string, string> {
  const find = (patterns: RegExp[]) =>
    headers.find((h) => patterns.some((p) => p.test(h.toLowerCase()))) ?? '';
  return {
    orderId: find([/order.?sn/, /order.?id/, /order.?no/, /order.?number/, /เลขที่.?คำสั่ง/, /เลขออเดอร์/]),
    sku: find([/seller.?sku/, /variation.?sku/, /\bsku\b/, /รหัสสินค้า/]),
    quantity: find([/quantity/, /\bqty\b/, /จำนวน/]),
    status: find([/order.?status/, /\bstatus\b/, /สถานะ/]),
    buyerName: find([/buyer.?name/, /\bbuyer\b/, /recipient/, /ชื่อผู้ซื้อ/, /ผู้รับ/]),
  };
}

function normalizeStatus(raw: string): NormalizedOrder['status'] {
  const s = (raw || '').toLowerCase();
  if (/cancel|refund|return|ยกเลิก|คืนเงิน|คืนสินค้า/.test(s)) return 'cancelled';
  if (/paid|complete|ship|deliver|ชำระ|สำเร็จ|จัดส่ง|ส่งแล้ว/.test(s)) return 'paid';
  return 'unknown';
}

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
  { channel: 'facebook', label: 'Facebook Shop' },
  { channel: 'instagram', label: 'Instagram Shop' },
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

// ── CSV order import: preview (headers + auto-guessed column mapping) ──
marketplaceRouter.post('/import/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'File is required' });
      return;
    }
    const { headers, rows } = parseCsvRows(req.file.buffer);
    if (headers.length === 0) {
      res.status(400).json({ error: 'ไฟล์ว่างหรืออ่านไม่ได้' });
      return;
    }
    res.json({
      data: {
        headers,
        sampleRows: rows.slice(0, 15),
        rowCount: rows.length,
        guessedMapping: guessMapping(headers),
      },
    });
  } catch (err) {
    logger.error('[marketplace] import preview failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'อ่านไฟล์ไม่สำเร็จ' });
  }
});

const importCommitSchema = z.object({
  channel: z.enum(['shopee', 'lazada', 'tiktok', 'facebook', 'instagram', 'line_shopping', 'shopify', 'woocommerce', 'pos', 'other']),
  mapping: z.object({
    orderId: z.string().min(1),
    sku: z.string().min(1),
    quantity: z.string().min(1),
    status: z.string().optional().nullable(),
    buyerName: z.string().optional().nullable(),
  }),
  // When no status column is mapped (or value unrecognized), treat orders as paid → decrement stock.
  assumePaid: z.boolean().optional().default(true),
});

// ── CSV order import: commit (group → dedup → decrement stock → persist) ──
marketplaceRouter.post('/import/commit', requireRole('admin', 'super_admin', 'accountant'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'File is required' });
      return;
    }
    const parsedBody = importCommitSchema.parse({
      channel: req.body.channel,
      mapping: typeof req.body.mapping === 'string' ? JSON.parse(req.body.mapping) : req.body.mapping,
      assumePaid: req.body.assumePaid === undefined ? true : req.body.assumePaid === 'true' || req.body.assumePaid === true,
    });
    const { channel, mapping, assumePaid } = parsedBody;

    const { headers, rows } = parseCsvRows(req.file.buffer);
    const idx = (name: string) => headers.indexOf(name);
    const orderIdIdx = idx(mapping.orderId);
    const skuIdx = idx(mapping.sku);
    const qtyIdx = idx(mapping.quantity);
    const statusIdx = mapping.status ? idx(mapping.status) : -1;
    const buyerIdx = mapping.buyerName ? idx(mapping.buyerName) : -1;
    if (orderIdIdx < 0 || skuIdx < 0 || qtyIdx < 0) {
      res.status(400).json({ error: 'คอลัมน์ที่เลือกไม่ตรงกับหัวตารางในไฟล์' });
      return;
    }

    // Group rows by external order id → normalized orders.
    const grouped = new Map<string, NormalizedOrder>();
    for (const cells of rows) {
      const externalOrderId = (cells[orderIdIdx] ?? '').trim();
      const externalSku = (cells[skuIdx] ?? '').trim();
      const quantity = Math.abs(parseInt((cells[qtyIdx] ?? '').replace(/[^\d-]/g, ''), 10) || 0);
      if (!externalOrderId || !externalSku || quantity <= 0) continue;
      const statusRaw = statusIdx >= 0 ? (cells[statusIdx] ?? '') : '';
      const status = statusIdx >= 0 ? normalizeStatus(statusRaw) : (assumePaid ? 'paid' : 'unknown');

      let order = grouped.get(externalOrderId);
      if (!order) {
        order = {
          channel,
          externalOrderId,
          status,
          items: [],
          buyerName: buyerIdx >= 0 ? (cells[buyerIdx] ?? null) : null,
        };
        grouped.set(externalOrderId, order);
      }
      order.items.push({ externalSku, quantity });
    }

    const summary = {
      totalOrders: grouped.size,
      imported: 0,
      skippedDuplicate: 0,
      stockMovements: 0,
      unmappedSkus: new Set<string>(),
    };

    // Process each order in its own transaction so one failure doesn't void all.
    for (const order of grouped.values()) {
      await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
        const existing = await tx.marketplaceOrder.findUnique({
          where: { companyId_channel_externalOrderId: { companyId: req.user!.companyId, channel, externalOrderId: order.externalOrderId } },
          select: { id: true },
        });
        if (existing) {
          summary.skippedDuplicate += 1;
          return;
        }
        const result = await applyOrderToStock(tx, req.user!.companyId, order);
        result.unmappedSkus.forEach((s) => summary.unmappedSkus.add(s));
        summary.stockMovements += result.appliedSkus.length;
        await tx.marketplaceOrder.create({
          data: {
            companyId: req.user!.companyId,
            channel,
            externalOrderId: order.externalOrderId,
            status: order.status,
            buyerName: order.buyerName ?? null,
            itemsJson: order.items as unknown as Prisma.InputJsonValue,
            stockApplied: result.appliedSkus.length > 0,
            unmappedSkus: result.unmappedSkus,
            source: 'csv',
          },
        });
        summary.imported += 1;
      });
    }

    res.json({
      data: {
        totalOrders: summary.totalOrders,
        imported: summary.imported,
        skippedDuplicate: summary.skippedDuplicate,
        stockMovements: summary.stockMovements,
        unmappedSkus: [...summary.unmappedSkus],
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'ข้อมูลนำเข้าไม่ถูกต้อง', details: err.errors });
      return;
    }
    logger.error('[marketplace] import commit failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'นำเข้าออเดอร์ไม่สำเร็จ' });
  }
});
