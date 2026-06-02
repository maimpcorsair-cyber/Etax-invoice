// Channel-agnostic marketplace types. Each platform connector normalizes its
// own order payload into NormalizedOrder so the rest of the system (stock
// decrement, future sales summary) never depends on a specific marketplace.

export type SalesChannel =
  | 'shopee'
  | 'lazada'
  | 'tiktok'
  | 'line_shopping'
  | 'shopify'
  | 'woocommerce'
  | 'pos'
  | 'other';

export interface NormalizedOrderItem {
  externalSku: string;
  quantity: number;
  // Optional, for future sales-summary use; stock sync only needs sku + qty.
  unitPrice?: number;
  externalProductId?: string | null;
}

export interface NormalizedOrder {
  channel: SalesChannel;
  externalOrderId: string;
  status: 'paid' | 'unpaid' | 'cancelled' | 'shipped' | 'completed' | 'returned' | 'unknown';
  items: NormalizedOrderItem[];
  buyerName?: string | null;
  total?: number;
  orderedAt?: Date | null;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  externalShopId?: string | null;
  externalShopName?: string | null;
}

// Contract every live connector (Shopee/Lazada/TikTok/…) implements. Kept
// minimal for the scaffold; connectors are added one platform at a time once
// real partner credentials + a shop authorization are available.
export interface MarketplaceConnector {
  channel: SalesChannel;
  isConfigured(): boolean;
  /** Build the URL the seller visits to authorize their shop. */
  getAuthorizeUrl(state: string, redirectUri: string): string;
  /** Exchange the authorization callback code for access/refresh tokens. */
  exchangeCode(code: string, shopId?: string): Promise<OAuthTokens>;
  /** Refresh an expiring access token. */
  refreshTokens(refreshToken: string, shopId?: string): Promise<OAuthTokens>;
  /** Pull recent orders and normalize them for the stock pipeline. */
  fetchRecentOrders(tokens: OAuthTokens, sinceMs: number): Promise<NormalizedOrder[]>;
}
