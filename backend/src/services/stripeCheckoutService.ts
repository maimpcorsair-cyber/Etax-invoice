export type StripeCheckoutPaymentEvent =
  | 'checkout.session.completed'
  | 'checkout.session.async_payment_succeeded';

/**
 * Stripe can emit checkout.session.completed before a delayed payment method
 * settles. Provision paid access only after Stripe reports a paid session or
 * sends the dedicated async success event.
 */
export function shouldFulfillStripeCheckout(
  eventType: StripeCheckoutPaymentEvent,
  paymentStatus?: string | null,
) {
  return eventType === 'checkout.session.async_payment_succeeded'
    || paymentStatus === 'paid'
    || paymentStatus === 'no_payment_required';
}
