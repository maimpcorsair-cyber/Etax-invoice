import { Request, Response, NextFunction, RequestHandler } from 'express';
import { redis } from '../config/redis';
import { logger } from '../config/logger';

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10);
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '1000', 10);

export interface RateLimitOptions {
  /** Bucket name used in the Redis key, e.g. "login", "signup". */
  bucket: string;
  /** Max requests allowed per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /**
   * Per-request key extractor. Lets a caller scope login attempts by
   * `ip + email` so two users behind one NAT don't share a budget,
   * while still throttling distributed credential-stuffing from one IP.
   * Return a stable string; falsy = skip rate limiting for this request.
   */
  keyOf: (req: Request) => string | undefined;
  /**
   * Custom 429 body. Defaults to a generic JSON; pass a fn when you
   * want a locale-aware or feature-specific message.
   */
  onLimit?: (req: Request, res: Response, retryAfterSec: number) => void;
}

/**
 * Factory for per-endpoint rate limiters that share the sliding-window
 * implementation. Use the default `rateLimitMiddleware` export below for
 * global API throttling; mount `createRateLimit({...})` on individual
 * routes that need stricter caps (login brute-force, signup spam).
 *
 * All limiters fail OPEN on Redis errors — preferable to locking real
 * users out during a Redis outage. Logs each failure so ops can spot
 * the degradation in Sentry / Render.
 */
export function createRateLimit(opts: RateLimitOptions): RequestHandler {
  return async (req, res, next) => {
    const subKey = opts.keyOf(req);
    if (!subKey) return next();
    const redisKey = `ratelimit:${opts.bucket}:${subKey}`;
    try {
      const now = Date.now();
      const windowStart = now - opts.windowMs;
      await redis.zremrangebyscore(redisKey, 0, windowStart);
      const count = await redis.zcard(redisKey);
      if (count >= opts.max) {
        const oldest = await redis.zrange(redisKey, 0, 0, 'WITHSCORES');
        const resetAt = oldest.length >= 2 ? parseInt(oldest[1], 10) + opts.windowMs : now + opts.windowMs;
        const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
        res.set({
          'X-RateLimit-Limit': String(opts.max),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
          'Retry-After': String(retryAfterSec),
        });
        logger.warn(`[rate-limit:${opts.bucket}] exceeded`, { subKey, count });
        if (opts.onLimit) opts.onLimit(req, res, retryAfterSec);
        else res.status(429).json({ error: 'Too many requests. Please try again later.', retryAfterSec });
        return;
      }
      await redis.zadd(redisKey, now, `${now}:${Math.random()}`);
      await redis.expire(redisKey, Math.ceil(opts.windowMs / 1000) + 1);
      res.set({
        'X-RateLimit-Limit': String(opts.max),
        'X-RateLimit-Remaining': String(Math.max(0, opts.max - count - 1)),
        'X-RateLimit-Reset': String(Math.ceil((now + opts.windowMs) / 1000)),
      });
      next();
    } catch (err) {
      logger.error(`[rate-limit:${opts.bucket}] check failed — failing open`, { error: err });
      next();
    }
  };
}

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Use companyId for authenticated requests, IP for unauthenticated
  const key = req.user?.companyId
    ? `ratelimit:company:${req.user.companyId}`
    : `ratelimit:ip:${req.ip}`;

  try {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    // Use Redis sorted set for sliding window
    const redisKey = `ratelimit:${key}`;

    // Remove old entries outside the window
    await redis.zremrangebyscore(redisKey, 0, windowStart);

    // Count requests in current window
    const requestCount = await redis.zcard(redisKey);

    if (requestCount >= MAX_REQUESTS) {
      const oldestEntry = await redis.zrange(redisKey, 0, 0, 'WITHSCORES');
      const resetAt = oldestEntry.length >= 2
        ? parseInt(oldestEntry[1], 10) + WINDOW_MS
        : now + WINDOW_MS;

      res.set({
        'X-RateLimit-Limit': MAX_REQUESTS.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': Math.ceil(resetAt / 1000).toString(),
        'Retry-After': Math.ceil((resetAt - now) / 1000).toString(),
      });

      logger.warn(`Rate limit exceeded for ${key}`);
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return;
    }

    // Add current request
    await redis.zadd(redisKey, now, `${now}:${Math.random()}`);
    // Set expiry on the key
    await redis.expire(redisKey, Math.ceil(WINDOW_MS / 1000) + 1);

    const remaining = Math.max(0, MAX_REQUESTS - requestCount - 1);
    res.set({
      'X-RateLimit-Limit': MAX_REQUESTS.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': Math.ceil((now + WINDOW_MS) / 1000).toString(),
    });

    next();
  } catch (err) {
    // If Redis fails, allow the request (fail open) but log the error
    logger.error('Rate limit check failed', { error: err });
    next();
  }
}

/** 5 failed attempts per 15 min per (ip + lowercased email).
 *  Stops vertical credential stuffing without locking out real users on shared
 *  IPs — combo key means attacker rotating emails still gets one slot per try. */
export const loginRateLimit = createRateLimit({
  bucket: 'login',
  max: 5,
  windowMs: 15 * 60_000,
  keyOf: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email ? `${req.ip}:${email}` : req.ip;
  },
});

/** 3 free-signup creations per hour per IP. Prevents tenant-spam from a
 *  single source; legitimate users almost never sign up >1x/hour. */
export const freeSignupRateLimit = createRateLimit({
  bucket: 'signup',
  max: 3,
  windowMs: 60 * 60_000,
  keyOf: (req) => req.ip,
});