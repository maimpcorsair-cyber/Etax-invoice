import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { logger } from '../config/logger';

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10);
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '1000', 10);

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