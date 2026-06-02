import type { Prisma } from '@prisma/client';
import { moveStock } from '../inventoryService';
import type { NormalizedOrder } from './types';

// Shared engine: turn a normalized marketplace order into stock movements by
// resolving each line's channel SKU back to one central Product via
// ProductChannelMapping, then decrementing stock through the canonical
// inventoryService.moveStock (same path invoices use). Reused by both the live
// connectors (later) and CSV order import. Pure with respect to its tx — the
// caller owns the transaction so a partial failure rolls back cleanly.
//
// IMPORTANT: nothing calls this yet in production; it lands dormant as the
// foundation. Wire it from a connector or the CSV importer when that ships.

export interface ApplyOrderResult {
  externalOrderId: string;
  appliedSkus: Array<{ externalSku: string; productId: string; qty: number }>;
  // SKUs on the order with no mapping — surfaced so the user can map them.
  unmappedSkus: string[];
  // Mapped but the product isn't inventory-tracked → no movement written.
  untrackedSkus: string[];
}

export async function applyOrderToStock(
  tx: Prisma.TransactionClient,
  companyId: string,
  order: NormalizedOrder,
): Promise<ApplyOrderResult> {
  const result: ApplyOrderResult = {
    externalOrderId: order.externalOrderId,
    appliedSkus: [],
    unmappedSkus: [],
    untrackedSkus: [],
  };

  // Only paid/confirmed/shipped/completed orders consume stock. Unpaid orders
  // could reserve instead (future), and cancelled/returned must not decrement.
  const consumesStock = ['paid', 'shipped', 'completed'].includes(order.status);
  if (!consumesStock) return result;

  for (const item of order.items) {
    if (!item.externalSku || item.quantity <= 0) continue;

    const mapping = await tx.productChannelMapping.findUnique({
      where: {
        companyId_channel_externalSku: {
          companyId,
          channel: order.channel,
          externalSku: item.externalSku,
        },
      },
      select: { productId: true },
    });

    if (!mapping) {
      result.unmappedSkus.push(item.externalSku);
      continue;
    }

    // moveStock returns null when the product isn't inventory-tracked.
    const moved = await moveStock(tx, {
      companyId,
      productId: mapping.productId,
      qty: -Math.abs(item.quantity),
      type: 'sale',
      refType: 'manual',
      note: `${order.channel} order ${order.externalOrderId}`,
    });

    if (moved) {
      result.appliedSkus.push({ externalSku: item.externalSku, productId: mapping.productId, qty: item.quantity });
    } else {
      result.untrackedSkus.push(item.externalSku);
    }
  }

  return result;
}
