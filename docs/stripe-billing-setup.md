# Stripe Billing Setup

This project now supports real package checkout from the landing page using Stripe Checkout.

## 1. Create products and recurring prices in Stripe

Create 2 monthly recurring prices in your Stripe dashboard:

- `Starter` — THB `990.00` / month
- `Business` — THB `2,490.00` / month

Copy the resulting Stripe Price IDs, for example `price_123...`.

## 2. Fill backend environment variables

Set these values in [backend/.env](../backend/.env):

```env
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_STARTER_MONTHLY="price_..."
STRIPE_PRICE_BUSINESS_MONTHLY="price_..."
```

## 3. Register the webhook endpoint

Stripe must call:

```text
http://localhost:4000/api/billing/stripe/webhook
```

Listen for these events:

- `checkout.session.completed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

## 4. Local testing with Stripe CLI

Forward Stripe events to local backend:

```bash
stripe listen --forward-to localhost:4000/api/billing/stripe/webhook
```

Stripe CLI prints a webhook secret like `whsec_...`; place it in `STRIPE_WEBHOOK_SECRET`.

## 5. What happens after payment

When checkout succeeds, the backend:

1. Stores the paid checkout session in `pending_signups`
2. Creates the company
3. Creates the admin user from the checkout email
4. Creates or updates `company_subscriptions`
5. Lets the admin sign in with Google using the same email

## 6. Admin billing portal

Once a company has a Stripe customer, admins can open the Stripe Billing Portal from:

- `Admin Panel > Billing & Plans`

This lets them update their card and manage invoices/subscriptions.
