import { logger } from '../config/logger';
import redis from '../config/redis';

/**
 * Look up the exchange rate from a foreign currency to THB.
 *
 * Strategy (in priority order):
 *   1. The rate printed on the document itself (handled by callers — they
 *      pass `documentRate` if extracted)
 *   2. Cached rate in Redis (24h TTL)
 *   3. Live rate from exchangerate.host (free, no API key required)
 *   4. Conservative fallback table (only for the most common currencies, so
 *      we can still ship a number when both Redis and the API are down)
 *
 * Returns the rate AND the source so the OCR result can record which path
 * we used (useful for audit + UI explanation).
 */

export type FxRateSource = 'document' | 'cache' | 'fx_api' | 'fallback' | 'manual';

export interface FxRateLookupResult {
  rate: number;
  source: FxRateSource;
  asOf: string; // ISO date
}

const FX_CACHE_TTL_SECONDS = 24 * 60 * 60;
const FX_API_TIMEOUT_MS = 4_000;

// Sane defaults so a foreign invoice can still be converted to a (rough)
// THB amount when the live API is down. Updated periodically — these are
// last-resort, NOT precise.
const FX_FALLBACK_RATES: Record<string, number> = {
  USD: 33,
  EUR: 36,
  GBP: 42,
  JPY: 0.22,
  CNY: 4.5,
  SGD: 24,
  MYR: 7.2,
  HKD: 4.2,
  KRW: 0.024,
  AUD: 21,
  TWD: 1.0,
  VND: 0.0013,
  IDR: 0.0021,
  PHP: 0.59,
  INR: 0.39,
};

const FX_API_URL = 'https://api.exchangerate.host/convert';

function fxCacheKey(from: string, to: string, dateIso: string): string {
  return `fx:${from.toUpperCase()}:${to.toUpperCase()}:${dateIso}`;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchFromExchangerateHost(from: string, to: string): Promise<number | null> {
  try {
    const url = `${FX_API_URL}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FX_API_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      logger.warn('[fxRate] exchangerate.host non-200', { status: res.status, from, to });
      return null;
    }
    const json = await res.json() as { success?: boolean; result?: number; info?: { rate?: number } };
    const rate = json.result ?? json.info?.rate;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      logger.warn('[fxRate] exchangerate.host returned invalid rate', { json, from, to });
      return null;
    }
    return rate;
  } catch (err) {
    logger.warn('[fxRate] exchangerate.host fetch failed', { error: err instanceof Error ? err.message : String(err), from, to });
    return null;
  }
}

export async function lookupFxRateToThb(
  currency: string,
  options: { documentRate?: number; dateIso?: string } = {},
): Promise<FxRateLookupResult> {
  const from = currency.toUpperCase();
  const to = 'THB';
  const dateIso = options.dateIso ?? todayIsoDate();

  // (1) Document rate wins if present and plausible
  if (options.documentRate && options.documentRate > 0 && Number.isFinite(options.documentRate)) {
    return { rate: options.documentRate, source: 'document', asOf: dateIso };
  }

  // Same-currency edge case
  if (from === to) {
    return { rate: 1, source: 'document', asOf: dateIso };
  }

  // (2) Redis cache
  const key = fxCacheKey(from, to, dateIso);
  try {
    const cached = await redis.get(key);
    if (cached) {
      const rate = Number(cached);
      if (Number.isFinite(rate) && rate > 0) {
        return { rate, source: 'cache', asOf: dateIso };
      }
    }
  } catch (err) {
    logger.warn('[fxRate] redis get failed', { err });
  }

  // (3) Live API
  const live = await fetchFromExchangerateHost(from, to);
  if (live !== null) {
    try {
      await redis.set(key, String(live), 'EX', FX_CACHE_TTL_SECONDS);
    } catch (err) {
      logger.warn('[fxRate] redis set failed', { err });
    }
    return { rate: live, source: 'fx_api', asOf: dateIso };
  }

  // (4) Fallback table
  const fallback = FX_FALLBACK_RATES[from];
  if (fallback) {
    logger.warn('[fxRate] using fallback table — exchangerate.host unreachable', { from, fallback });
    return { rate: fallback, source: 'fallback', asOf: dateIso };
  }

  // Unsupported currency — return rate=1 with fallback source so callers
  // can still set originalTotal = total (better than dropping the doc).
  logger.warn('[fxRate] no rate available for currency, returning 1.0', { from });
  return { rate: 1, source: 'fallback', asOf: dateIso };
}
