import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { logger } from '../config/logger';

// Inventory primitives. Every change to product stock goes through one
// of these functions so the StockMovement ledger stays the source of
// truth and currentStock is the cached sum.
//
// All helpers are tx-aware: pass an existing Prisma transaction client to
// keep the stock write atomic with the invoice/purchase-invoice insert
// that triggered it. Without that atomicity, a failed invoice would leave
// a phantom stock movement.

interface MoveStockInput {
  companyId: string;
  productId: string;
  qty: number; // signed: positive for IN, negative for OUT
  type: 'sale' | 'purchase' | 'adjustment_in' | 'adjustment_out' | 'opening_balance';
  refType?: 'invoice' | 'purchase_invoice' | 'manual' | null;
  refId?: string | null;
  note?: string | null;
  createdBy?: string | null;
}

/**
 * Append a movement to the ledger AND update Product.currentStock atomically.
 * Caller passes their open transaction; we never open one ourselves so the
 * stock write rolls back together with the caller's parent change if it fails.
 *
 * Returns null when the product is not tracked (so callers can no-op the
 * hook without an extra DB read).
 */
export async function moveStock(tx: Prisma.TransactionClient, input: MoveStockInput): Promise<{ movementId: string; newStock: number } | null> {
  const product = await tx.product.findFirst({
    where: { id: input.productId, companyId: input.companyId },
    select: { id: true, trackInventory: true, currentStock: true },
  });
  if (!product) {
    logger.warn('[inventory] moveStock: product not found in tenant', { productId: input.productId, companyId: input.companyId });
    return null;
  }
  if (!product.trackInventory) return null;

  const movement = await tx.stockMovement.create({
    data: {
      companyId: input.companyId,
      productId: input.productId,
      type: input.type,
      qty: input.qty,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    },
  });

  const updated = await tx.product.update({
    where: { id: input.productId },
    data: { currentStock: { increment: input.qty } },
    select: { currentStock: true },
  });

  return { movementId: movement.id, newStock: updated.currentStock };
}

/**
 * Auto-hook called when a sales invoice is issued. Decrement stock for
 * every line that points at a tracked product. Items with null productId
 * (free-text lines) are ignored.
 */
export async function applyInvoiceStockMovements(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    invoiceId: string;
    items: Array<{ productId: string | null; quantity: number }>;
    createdBy?: string | null;
  },
): Promise<void> {
  for (const item of input.items) {
    if (!item.productId || item.quantity <= 0) continue;
    await moveStock(tx, {
      companyId: input.companyId,
      productId: item.productId,
      qty: -Math.abs(item.quantity),
      type: 'sale',
      refType: 'invoice',
      refId: input.invoiceId,
      createdBy: input.createdBy ?? null,
    });
  }
}

/**
 * Auto-hook called when a purchase invoice is recorded. Increment stock
 * for every line tied to a tracked product.
 */
export async function applyPurchaseStockMovements(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    purchaseInvoiceId: string;
    items: Array<{ productId: string | null; quantity: number }>;
    createdBy?: string | null;
  },
): Promise<void> {
  for (const item of input.items) {
    if (!item.productId || item.quantity <= 0) continue;
    await moveStock(tx, {
      companyId: input.companyId,
      productId: item.productId,
      qty: Math.abs(item.quantity),
      type: 'purchase',
      refType: 'purchase_invoice',
      refId: input.purchaseInvoiceId,
      createdBy: input.createdBy ?? null,
    });
  }
}

/**
 * Reverse a previous Invoice / PurchaseInvoice's stock impact. Used when
 * the parent document is cancelled or deleted so the running stock
 * doesn't permanently reflect a transaction that no longer exists.
 */
export async function reverseStockMovementsFor(
  tx: Prisma.TransactionClient,
  refType: 'invoice' | 'purchase_invoice',
  refId: string,
  createdBy?: string | null,
): Promise<void> {
  const movements = await tx.stockMovement.findMany({
    where: { refType, refId },
    select: { id: true, productId: true, qty: true, companyId: true },
  });
  for (const m of movements) {
    await moveStock(tx, {
      companyId: m.companyId,
      productId: m.productId,
      qty: -m.qty, // reverse
      type: m.qty > 0 ? 'adjustment_out' : 'adjustment_in',
      refType: 'manual',
      refId: m.id,
      note: `Reverse of ${refType}:${refId}`,
      createdBy: createdBy ?? null,
    });
  }
}

/**
 * Manual stock adjustment from the UI. Always opens its own transaction
 * since there's no parent document to bind to.
 */
export async function adjustStock(input: {
  companyId: string;
  productId: string;
  delta: number; // signed
  note?: string | null;
  createdBy: string;
}): Promise<{ movementId: string; newStock: number } | null> {
  return prisma.$transaction(async (tx) => {
    const type = input.delta >= 0 ? 'adjustment_in' : 'adjustment_out';
    return moveStock(tx, {
      companyId: input.companyId,
      productId: input.productId,
      qty: input.delta,
      type,
      refType: 'manual',
      note: input.note ?? null,
      createdBy: input.createdBy,
    });
  });
}

/**
 * Initial stock when a tenant first flips trackInventory ON. Writes an
 * opening_balance ledger row so future audits know where the count came
 * from instead of seeing a mysterious starting number.
 */
export async function setOpeningBalance(input: {
  companyId: string;
  productId: string;
  qty: number;
  createdBy: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Reset currentStock to the requested opening balance — this is
    // expected when first enabling tracking, replacing any prior 0 default.
    const product = await tx.product.findFirst({
      where: { id: input.productId, companyId: input.companyId },
      select: { currentStock: true },
    });
    const currentBefore = product?.currentStock ?? 0;
    const delta = input.qty - currentBefore;
    if (delta === 0) return;

    await tx.stockMovement.create({
      data: {
        companyId: input.companyId,
        productId: input.productId,
        type: 'opening_balance',
        qty: delta,
        refType: 'manual',
        note: 'Opening balance',
        createdBy: input.createdBy,
      },
    });
    await tx.product.update({
      where: { id: input.productId },
      data: { currentStock: input.qty },
    });
  });
}
