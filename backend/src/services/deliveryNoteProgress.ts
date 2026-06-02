export interface DeliveryQuantity {
  quantity: number;
  deliveredQty: number;
}

export type DeliveryProgressState = 'not-started' | 'partial' | 'complete';

export function validateDeliveryQuantities(items: DeliveryQuantity[]): string | null {
  if (items.some((item) => item.deliveredQty < 0)) {
    return 'จำนวนส่งต้องไม่ต่ำกว่า 0';
  }
  if (items.some((item) => item.deliveredQty > item.quantity)) {
    return 'จำนวนส่งต้องไม่เกินจำนวนสั่ง';
  }
  return null;
}

export function deliveryProgressState(items: DeliveryQuantity[]): DeliveryProgressState {
  const delivered = items.reduce((sum, item) => sum + item.deliveredQty, 0);
  if (delivered <= 0) return 'not-started';
  if (items.every((item) => item.deliveredQty === item.quantity)) return 'complete';
  return 'partial';
}
