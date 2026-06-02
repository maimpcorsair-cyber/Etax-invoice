import type { MarketplaceConnector, OAuthTokens, NormalizedOrder } from './types';

// Shopee Open Platform connector — STUB. Implements the connector contract so
// the wiring is in place, but every live call throws until real credentials are
// configured (SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY) and a shop authorizes.
//
// To finish this connector you will need (all external, seller/owner side):
//   1. A Shopee Open Platform account + app → Partner ID + Partner Key
//   2. A whitelisted redirect URL (our /api/marketplace/shopee/callback)
//   3. The shop owner to authorize (OAuth) → shop_id + code → tokens
//   4. HMAC-SHA256 request signing (partner key + path + timestamp[+access_token+shop_id])
// Build + verify against Shopee's sandbox before going live.

const NOT_CONFIGURED = 'Shopee connector is not configured yet — add SHOPEE_PARTNER_ID/SHOPEE_PARTNER_KEY and connect a shop.';

export const shopeeConnector: MarketplaceConnector = {
  channel: 'shopee',

  isConfigured(): boolean {
    return Boolean(process.env.SHOPEE_PARTNER_ID && process.env.SHOPEE_PARTNER_KEY);
  },

  getAuthorizeUrl(): string {
    throw new Error(NOT_CONFIGURED);
  },

  async exchangeCode(): Promise<OAuthTokens> {
    throw new Error(NOT_CONFIGURED);
  },

  async refreshTokens(): Promise<OAuthTokens> {
    throw new Error(NOT_CONFIGURED);
  },

  async fetchRecentOrders(): Promise<NormalizedOrder[]> {
    throw new Error(NOT_CONFIGURED);
  },
};
