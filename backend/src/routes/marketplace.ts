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
import {
  guessSettlementMapping,
  parseCsvRows as parseSettlementCsvRows,
  parseSettlementCsv,
} from '../services/marketplace/settlementCsvService';

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
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
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

const salesChannelSchema = z.enum(['shopee', 'lazada', 'tiktok', 'facebook', 'instagram', 'line_shopping', 'shopify', 'woocommerce', 'pos', 'other']);

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

// ── Imported orders list ──────────────────────────────────────────────
marketplaceRouter.get('/orders', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
    const channel = typeof req.query.channel === 'string' && req.query.channel ? req.query.channel : undefined;
    const where = { companyId: req.user!.companyId, ...(channel ? { channel } : {}) };
    const result = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [rows, total] = await Promise.all([
        tx.marketplaceOrder.findMany({
          where,
          orderBy: { importedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true, channel: true, externalOrderId: true, status: true, buyerName: true,
            total: true, itemsJson: true, stockApplied: true, unmappedSkus: true, source: true, importedAt: true,
          },
        }),
        tx.marketplaceOrder.count({ where }),
      ]);
      return { rows, total };
    });
    res.json({ data: result.rows, pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) } });
  } catch (err) {
    logger.error('[marketplace] list orders failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to list orders' });
  }
});

// ── Sales summary per channel + low-stock alerts ──────────────────────
marketplaceRouter.get('/summary', async (req, res) => {
  try {
    const data = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [totals, applied, withUnmapped, trackedProducts] = await Promise.all([
        tx.marketplaceOrder.groupBy({ by: ['channel'], where: { companyId: req.user!.companyId }, _count: { _all: true } }),
        tx.marketplaceOrder.groupBy({ by: ['channel'], where: { companyId: req.user!.companyId, stockApplied: true }, _count: { _all: true } }),
        tx.marketplaceOrder.count({ where: { companyId: req.user!.companyId, NOT: { unmappedSkus: { isEmpty: true } } } }),
        tx.product.findMany({
          where: { companyId: req.user!.companyId, trackInventory: true, reorderPoint: { not: null }, isActive: true },
          select: { id: true, code: true, nameTh: true, nameEn: true, currentStock: true, reorderPoint: true },
        }),
      ]);
      const appliedMap = new Map(applied.map((a) => [a.channel, a._count._all]));
      const channels = totals
        .map((t) => ({ channel: t.channel, orders: t._count._all, stockApplied: appliedMap.get(t.channel) ?? 0 }))
        .sort((a, b) => b.orders - a.orders);
      const lowStock = trackedProducts
        .filter((p) => p.reorderPoint != null && p.currentStock <= p.reorderPoint)
        .sort((a, b) => a.currentStock - b.currentStock);
      return {
        channels,
        totalOrders: totals.reduce((s, t) => s + t._count._all, 0),
        ordersWithUnmapped: withUnmapped,
        lowStock,
      };
    });
    res.json({ data });
  } catch (err) {
    logger.error('[marketplace] summary failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to build summary' });
  }
});

// ── Marketplace settlement / payout list ─────────────────────────────
marketplaceRouter.get('/settlements', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
    const channel = typeof req.query.channel === 'string' && req.query.channel ? req.query.channel : undefined;
    const where = { companyId: req.user!.companyId, ...(channel ? { channel } : {}) };
    const result = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const [rows, total] = await Promise.all([
        tx.marketplaceSettlement.findMany({
          where,
          orderBy: [{ settledAt: 'desc' }, { importedAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.marketplaceSettlement.count({ where }),
      ]);
      return { rows, total };
    });
    res.json({ data: result.rows, pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) } });
  } catch (err) {
    logger.error('[marketplace] list settlements failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to list settlements' });
  }
});

// ── Marketplace settlement summary ───────────────────────────────────
marketplaceRouter.get('/settlements/summary', async (req, res) => {
  try {
    const data = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const rows = await tx.marketplaceSettlement.groupBy({
        by: ['channel'],
        where: { companyId: req.user!.companyId },
        _count: { _all: true },
        _sum: { gross: true, fee: true, refund: true, adjustment: true, net: true },
      });
      const channels = rows
        .map((row) => {
          const gross = row._sum.gross ?? 0;
          const fee = row._sum.fee ?? 0;
          const refund = row._sum.refund ?? 0;
          const adjustment = row._sum.adjustment ?? 0;
          const net = row._sum.net ?? 0;
          return {
            channel: row.channel,
            count: row._count._all,
            gross,
            fee,
            refund,
            adjustment,
            net,
            takeRate: gross > 0 ? fee / gross : 0,
            gap: gross - net,
          };
        })
        .sort((a, b) => b.net - a.net);
      return {
        channels,
        total: channels.reduce((sum, row) => ({
          count: sum.count + row.count,
          gross: sum.gross + row.gross,
          fee: sum.fee + row.fee,
          refund: sum.refund + row.refund,
          adjustment: sum.adjustment + row.adjustment,
          net: sum.net + row.net,
          gap: sum.gap + row.gap,
        }), { count: 0, gross: 0, fee: 0, refund: 0, adjustment: 0, net: 0, gap: 0 }),
      };
    });
    res.json({ data });
  } catch (err) {
    logger.error('[marketplace] settlements summary failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to build settlement summary' });
  }
});

// ── CSV settlement import: preview ───────────────────────────────────
marketplaceRouter.post('/settlements/import/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'File is required' });
      return;
    }
    const { headers, rows } = parseSettlementCsvRows(req.file.buffer);
    if (headers.length === 0) {
      res.status(400).json({ error: 'ไฟล์ว่างหรืออ่านไม่ได้' });
      return;
    }
    res.json({
      data: {
        headers,
        sampleRows: rows.slice(0, 15),
        rowCount: rows.length,
        guessedMapping: guessSettlementMapping(headers),
      },
    });
  } catch (err) {
    logger.error('[marketplace] settlement import preview failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'อ่านไฟล์ settlement ไม่สำเร็จ' });
  }
});

const settlementImportCommitSchema = z.object({
  channel: salesChannelSchema,
  mapping: z.object({
    externalRef: z.string().min(1),
    settledAt: z.string().optional().nullable(),
    gross: z.string().optional().nullable(),
    fee: z.string().optional().nullable(),
    refund: z.string().optional().nullable(),
    adjustment: z.string().optional().nullable(),
    net: z.string().optional().nullable(),
  }).refine((m) => !!m.gross || !!m.net, { message: 'gross or net column is required' }),
});

// ── CSV settlement import: commit (parse → dedupe → persist) ─────────
marketplaceRouter.post('/settlements/import/commit', requireRole('admin', 'super_admin', 'accountant'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'File is required' });
      return;
    }
    const parsedBody = settlementImportCommitSchema.parse({
      channel: req.body.channel,
      mapping: typeof req.body.mapping === 'string' ? JSON.parse(req.body.mapping) : req.body.mapping,
    });
    const parsedRows = parseSettlementCsv(req.file.buffer, parsedBody.mapping);
    const seen = new Set<string>();
    const rows = parsedRows.filter((row) => {
      if (seen.has(row.externalRef)) return false;
      seen.add(row.externalRef);
      return true;
    });

    const result = await withRlsContext(prisma, tenantRlsContext(req.user!), async (tx) => {
      const existing = rows.length
        ? await tx.marketplaceSettlement.findMany({
          where: {
            companyId: req.user!.companyId,
            channel: parsedBody.channel,
            externalRef: { in: rows.map((row) => row.externalRef) },
          },
          select: { externalRef: true },
        })
        : [];
      const existingRefs = new Set(existing.map((row) => row.externalRef));
      const toCreate = rows.filter((row) => !existingRefs.has(row.externalRef));
      if (toCreate.length) {
        await tx.marketplaceSettlement.createMany({
          data: toCreate.map((row) => ({
            companyId: req.user!.companyId,
            channel: parsedBody.channel,
            externalRef: row.externalRef,
            settledAt: row.settledAt,
            gross: row.gross,
            fee: row.fee,
            refund: row.refund,
            adjustment: row.adjustment,
            net: row.net,
            source: 'csv',
          })),
        });
      }
      return { toCreate, existingCount: existingRefs.size };
    });

    const totals = result.toCreate.reduce((sum, row) => ({
      gross: sum.gross + row.gross,
      fee: sum.fee + row.fee,
      refund: sum.refund + row.refund,
      adjustment: sum.adjustment + row.adjustment,
      net: sum.net + row.net,
    }), { gross: 0, fee: 0, refund: 0, adjustment: 0, net: 0 });

    res.json({
      data: {
        totalRows: parsedRows.length,
        uniqueRows: rows.length,
        imported: result.toCreate.length,
        skippedDuplicate: result.existingCount + (parsedRows.length - rows.length),
        totals,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'ข้อมูล settlement ไม่ถูกต้อง', details: err.errors });
      return;
    }
    logger.error('[marketplace] settlement import commit failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'นำเข้า settlement ไม่สำเร็จ' });
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
  channel: salesChannelSchema,
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
