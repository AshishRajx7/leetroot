import { Pool } from 'pg';
import Redis from 'ioredis';
import { config, extractDatabaseName } from './env';

export interface ReadinessResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface InfrastructureReadiness {
  postgres: ReadinessResult & { url: string; database: string };
  redis: ReadinessResult & { url: string };
  allReady: boolean;
}

/**
 * Safely masks passwords and sensitive credentials in database and cache URLs.
 */
export function maskConnectionUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return rawUrl.replace(/:([^@/]+)@/, ':****@');
  }
}

/**
 * Checks PostgreSQL connectivity by executing a lightweight query.
 * Safe to call against any database URL without modifying any schema or records.
 * Ensures strict timeout bounding and deterministic connection pool cleanup.
 */
export async function checkPostgresReadiness(
  connectionUrl?: string,
  timeoutMs: number = 3000
): Promise<ReadinessResult & { url: string; database: string }> {
  const url = connectionUrl || config.database.url;
  const maskedUrl = maskConnectionUrl(url);
  const dbName = extractDatabaseName(url) || config.database.db;
  const start = Date.now();

  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: timeoutMs,
    statement_timeout: timeoutMs,
    max: 1,
  });

  try {
    await pool.query('SELECT 1 AS readiness_check;');
    return {
      ok: true,
      latencyMs: Date.now() - start,
      url: maskedUrl,
      database: dbName,
    };
  } catch (err: any) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err.message,
      url: maskedUrl,
      database: dbName,
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

/**
 * Checks Redis connectivity by executing a PING command.
 * Safe to call against any Redis URL without reading or writing keys.
 * Ensures connect and command timeouts and immediate socket disconnection.
 */
export async function checkRedisReadiness(
  connectionUrl?: string,
  timeoutMs: number = 3000
): Promise<ReadinessResult & { url: string }> {
  const url = connectionUrl || config.redis.url;
  const maskedUrl = maskConnectionUrl(url);
  const start = Date.now();

  const redis = new Redis(url, {
    connectTimeout: timeoutMs,
    commandTimeout: timeoutMs,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    lazyConnect: true,
  });

  // Attach error handler to prevent unhandled EventEmitter warnings during failed probes
  redis.on('error', () => {});

  try {
    await redis.connect();
    const pong = await redis.ping();
    return {
      ok: pong === 'PONG',
      latencyMs: Date.now() - start,
      url: maskedUrl,
    };
  } catch (err: any) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err.message,
      url: maskedUrl,
    };
  } finally {
    try {
      redis.disconnect();
    } catch {}
  }
}

/**
 * Checks overall infrastructure readiness across both PostgreSQL and Redis.
 */
export async function checkInfrastructureReadiness(
  options?: { postgresUrl?: string; redisUrl?: string; timeoutMs?: number }
): Promise<InfrastructureReadiness> {
  const [pgResult, redisResult] = await Promise.all([
    checkPostgresReadiness(options?.postgresUrl, options?.timeoutMs),
    checkRedisReadiness(options?.redisUrl, options?.timeoutMs),
  ]);

  return {
    postgres: pgResult,
    redis: redisResult,
    allReady: pgResult.ok && redisResult.ok,
  };
}