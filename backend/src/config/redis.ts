import { Redis } from 'ioredis';
import { logger } from './logger';

const configuredRedisUrl = process.env.REDIS_URL?.trim();
const isProduction = process.env.NODE_ENV === 'production';
const redisUrl = configuredRedisUrl || 'redis://localhost:6379';

if (!configuredRedisUrl && isProduction) {
  logger.error('REDIS_URL is not configured in production. Redis features will fail until a managed Redis URL is set.');
}

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  connectTimeout: 2000,
  retryStrategy(times) {
    if (!configuredRedisUrl && isProduction) return null;
    return Math.min(times * 100, 2000);
  },
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error', err));

export default redis;
