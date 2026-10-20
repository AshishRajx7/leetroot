import Redis from 'ioredis';
import { config } from '../config/env';
import { maskConnectionUrl } from '../config/readiness';

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
  const isTest = process.env.NODE_ENV === 'test' || config.isTest;

  if (isTest) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(
        `[REDIS ERROR] Redis initialization in test mode strictly requires process.env.NODE_ENV === 'test'. ` +
        `Current process.env.NODE_ENV is '${process.env.NODE_ENV}'.`
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(config.redis.url);
    } catch {
      throw new Error(
        `[REDIS ERROR] Invalid Redis connection URL in test mode: ${maskConnectionUrl(config.redis.url)}`
      );
    }
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
      throw new Error(
        `[REDIS ERROR] Unsupported Redis protocol '${parsed.protocol}' in test mode.`
      );
    }
    const actualRedisDb = parsed.pathname || '/';
    if (actualRedisDb !== '/1') {
      throw new Error(
        `[REDIS ERROR] Redis connection must strictly target logical database 1 ('/1') in test mode. Found '${actualRedisDb}'.`
      );
    }
  }

  try {
    redisClient = new Redis(config.redis.url, {
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (isTest) return null; // zero retry in test mode
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
    console.log('[Redis] Successfully connected to Redis at', maskConnectionUrl(config.redis.url));
    return true;
  } catch (err: any) {
    isRedisAvailable = false;
    if (redisClient) {
      try {
        redisClient.disconnect();
      } catch {}
      redisClient = null;
    }
    if (isTest) {
      throw new Error(
        `[REDIS ERROR] Redis connection failed in test mode: ${err.message}. Refusing in-memory fallback.`
      );
    }
    console.warn('[Redis] Connection failed (will use high-performance in-memory cache):', err.message);
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      redisClient.disconnect();
    } catch {}
    redisClient = null;
  }
  isRedisAvailable = false;
}

export async function cacheGet(key: string): Promise<string | null> {
  const isTest = process.env.NODE_ENV === 'test' || config.isTest;

  if (isTest && (!isRedisAvailable || !redisClient)) {
    throw new Error(
      '[REDIS ERROR] Redis operation attempted while disconnected in test mode. Refusing in-memory fallback.'
    );
  }

  if (isRedisAvailable && redisClient) {
    try {
      return await redisClient.get(key);
    } catch (err) {
      if (isTest) {
        throw err;
      }
      // Fall through to memoryCache on error in dev
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

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds: number = config.redis.cacheTtlSeconds
): Promise<void> {
  const isTest = process.env.NODE_ENV === 'test' || config.isTest;

  if (isTest && (!isRedisAvailable || !redisClient)) {
    throw new Error(
      '[REDIS ERROR] Redis operation attempted while disconnected in test mode. Refusing in-memory fallback.'
    );
  }

  if (isRedisAvailable && redisClient) {
    try {
      await redisClient.set(key, value, 'EX', ttlSeconds);
      return;
    } catch (err) {
      if (isTest) {
        throw err;
      }
      // Fall through in dev
    }
  }

  memoryCache.set(key, {
    value,
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

export async function cacheDelPattern(pattern: string): Promise<number> {
  const isTest = process.env.NODE_ENV === 'test' || config.isTest;

  if (isTest && (!isRedisAvailable || !redisClient)) {
    throw new Error(
      '[REDIS ERROR] Redis operation attempted while disconnected in test mode. Refusing in-memory fallback.'
    );
  }

  let count = 0;
  if (isRedisAvailable && redisClient) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        count = await redisClient.del(...keys);
      }
      return count;
    } catch (err) {
      if (isTest) {
        throw err;
      }
      // Fall through in dev
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
