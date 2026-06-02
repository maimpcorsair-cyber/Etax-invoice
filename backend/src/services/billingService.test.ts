import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldFulfillStripeCheckout } from './stripeCheckoutService';

test('Stripe checkout completion waits for delayed payment confirmation', () => {
  assert.equal(shouldFulfillStripeCheckout('checkout.session.completed', 'unpaid'), false);
});

test('Stripe checkout completion fulfills sessions Stripe marks paid', () => {
  assert.equal(shouldFulfillStripeCheckout('checkout.session.completed', 'paid'), true);
  assert.equal(shouldFulfillStripeCheckout('checkout.session.completed', 'no_payment_required'), true);
});

test('Stripe async payment success fulfills delayed PromptPay checkout', () => {
  assert.equal(shouldFulfillStripeCheckout('checkout.session.async_payment_succeeded', 'unpaid'), true);
});
