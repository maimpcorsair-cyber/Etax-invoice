import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deliveryProgressState,
  validateDeliveryQuantities,
} from './deliveryNoteProgress';

test('delivery progress reports partial shipment when at least one ordered item remains', () => {
  assert.equal(
    deliveryProgressState([
      { quantity: 10, deliveredQty: 4 },
      { quantity: 2, deliveredQty: 2 },
    ]),
    'partial',
  );
});

test('delivery quantities reject delivered values above the ordered quantity', () => {
  assert.equal(
    validateDeliveryQuantities([{ quantity: 3, deliveredQty: 4 }]),
    'จำนวนส่งต้องไม่เกินจำนวนสั่ง',
  );
});

test('delivery progress reports complete only when every ordered item is fully delivered', () => {
  assert.equal(
    deliveryProgressState([
      { quantity: 3, deliveredQty: 3 },
      { quantity: 1, deliveredQty: 1 },
    ]),
    'complete',
  );
});
