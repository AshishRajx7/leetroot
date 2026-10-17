import Redis from 'ioredis';
import { config } from '../config/env';

let redisClient: Redis | null = null;
let isRedisAvailable = false;

// In-memory fallback map for cache if Redis is not running
const memoryCache = new Map<string, { value: string; expiry: number }>();

export function getRedisClient(): Redis | null {
  return redisClient;
}

export function getIsRedisConnected(): boolean {
  return isRedisAvailable;
}

export async function initRedis(): Promise<boolean> {
  try {
    redisClient = new Redis(config.redis.url, {
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 2) return null; // stop retrying quickly in dev if no redis
        return Math.min(times * 100, 1000);
      },
    });

    redisClient.on('error', (err) => {
      // Suppress spammy offline connection warnings
      if (isRedisAvailable) {
        console.warn('[Redis] Connection error:', err.message);
      }
    });

    await redisClient.ping();
    isRedisAvailable = true;
    console.log('[Redis] Successfully connected to Redis at', config.redis.url);
    return true;
  } catch (err: any) {
    console.warn('[Redis] Connection failed (will use high-performance in-memory cache):', err.message);
    isRedisAvailable = false;
    return false;
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  if (isRedisAvailable && redisClient) {
    try {
      return await redisClient.get(key);
    } catch {
      // Fall through to memoryCache on error
    }
  }

  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    memoryCache.delete(key);
    return null;
  }
  return item.value;
}

export async function cacheSet(key: string, value: string, ttlSeconds: number = config.redis.cacheTtlSeconds): Promise<void> {
  if (isRedisAvailable && redisClient) {
    try {
      await redisClient.set(key, value, 'EX', ttlSeconds);
      return;
    } catch {
      // Fall through
    }
  }

  memoryCache.set(key, {
    value,
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

export async function cacheDelPattern(pattern: string): Promise<number> {
  let count = 0;
  if (isRedisAvailable && redisClient) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        count = await redisClient.del(...keys);
      }
      return count;
    } catch {
      // Fall through
    }
  }

  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
      count++;
    }
  }
  return count;
}
