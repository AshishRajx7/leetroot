import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// If NODE_ENV is explicitly 'test', attempt loading .env.test first if present
const initialNodeEnv = process.env.NODE_ENV || 'development';
if (initialNodeEnv === 'test') {
  const testEnvPath = path.resolve(process.cwd(), '.env.test');
  if (fs.existsSync(testEnvPath)) {
    dotenv.config({ path: testEnvPath });
  }
}
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isTest = nodeEnv === 'test';

// Resolve database settings
const devDbName = process.env.POSTGRES_DB || 'leetroot';
const testDbName = process.env.POSTGRES_TEST_DB || 'leetroot_test';

const defaultDevDbUrl = `postgresql://leetroot:leetroot_secret@localhost:5432/${devDbName}`;
const defaultTestDbUrl = `postgresql://leetroot:leetroot_secret@localhost:5432/${testDbName}`;

const resolvedDbName = isTest ? testDbName : devDbName;

/**
 * Supported database URL protocols for PostgreSQL
 */
export const SUPPORTED_DB_PROTOCOLS = ['postgres:', 'postgresql:'] as const;

/**
 * Safely decodes a URI component without throwing on malformed percent-encoding.
 * Returns empty string if decoding fails.
 */
function safeDecodeUriComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return '';
  }
}

/**
 * Extracts and decodes the database name from a PostgreSQL connection string.
 * Strips query parameters, trailing slashes, and hash fragments.
 * Returns empty string if the URL is invalid, empty, contains malformed percent-encoding,
 * or uses an unsupported database protocol.
 */
export function extractDatabaseName(url: string): string {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    if (!SUPPORTED_DB_PROTOCOLS.includes(parsed.protocol as any)) {
      return '';
    }
    const pathname = parsed.pathname.trim();
    const cleanPath = pathname.replace(/^\/+|\/+$/g, '');
    const firstSegment = cleanPath.split('/')[0]?.split('?')[0]?.split('#')[0] || '';
    if (!firstSegment) return '';
    return safeDecodeUriComponent(firstSegment).trim();
  } catch {
    const match = url.match(/(?:(?:postgres|postgresql):\/\/[^/]+(?::\d+)?\/)([^?#/\s]+)/);
    if (!match || !match[1]) return '';
    const segment = match[1].replace(/\/+$/, '').trim();
    return safeDecodeUriComponent(segment).trim();
  }
}

/**
 * Database URL selector with strict database-name awareness and fail-closed guarantees:
 * 1. In non-test modes: uses DATABASE_URL or defaultDevDbUrl.
 * 2. In test mode with explicit TEST_DATABASE_URL: preserves it as-is (even if empty, whitespace, or invalid)
 *    so validateDatabaseSafety() can fail closed.
 * 3. In test mode when TEST_DATABASE_URL is absent (undefined):
 *    - Selects DATABASE_URL only if its parsed DB name exactly matches expectedTestDb.
 *    - Otherwise, safely uses defaultTestDbUrl.
 */
export function selectDatabaseUrl(
  isTestMode: boolean = isTest,
  testDbUrl: string | undefined = process.env.TEST_DATABASE_URL,
  devDbUrl: string | undefined = process.env.DATABASE_URL,
  expectedTestDb: string = testDbName,
  fallbackTestUrl: string = defaultTestDbUrl,
  fallbackDevUrl: string = defaultDevDbUrl
): string {
  if (!isTestMode) {
    return devDbUrl || fallbackDevUrl;
  }

  // If TEST_DATABASE_URL is explicitly provided (even if empty, whitespace, or invalid),
  // preserve it as-is so validateDatabaseSafety() fails closed.
  if (testDbUrl !== undefined) {
    return testDbUrl;
  }

  // When TEST_DATABASE_URL is absent (undefined), select DATABASE_URL only if parsed DB name matches expectedTestDb
  if (devDbUrl && devDbUrl.trim() !== '') {
    const parsedDbName = extractDatabaseName(devDbUrl);
    if (parsedDbName === expectedTestDb) {
      return devDbUrl.trim();
    }
  }

  // Otherwise, default to dedicated test database URL
  return fallbackTestUrl;
}

const resolvedDatabaseUrl = selectDatabaseUrl();

// Resolve Redis settings (test mode targets dedicated Redis logical DB 1)
const defaultDevRedisUrl = 'redis://localhost:6379';
const defaultTestRedisUrl = 'redis://localhost:6379/1';

const resolvedRedisUrl = isTest
  ? (process.env.TEST_REDIS_URL || (process.env.REDIS_URL && process.env.REDIS_URL.includes('/1') ? process.env.REDIS_URL : defaultTestRedisUrl))
  : (process.env.REDIS_URL || defaultDevRedisUrl);

export const DEFAULT_NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';

/**
 * Validates the NVIDIA NIM base URL:
 * - Empty / whitespace / undefined safely defaults to DEFAULT_NIM_BASE_URL.
 * - Structurally valid HTTP and HTTPS URLs are accepted.
 * - Markdown formatting, malformed URLs, and non-HTTP/HTTPS protocols are rejected with a [CONFIG ERROR].
 */
export function validateNimBaseUrl(rawUrl?: string): string {
  if (rawUrl === undefined || rawUrl === null || (typeof rawUrl === 'string' && rawUrl.trim() === '')) {
    return DEFAULT_NIM_BASE_URL;
  }

  const trimmed = rawUrl.trim();

  // Reject Markdown link syntax explicitly
  if (/\[.*?\]\(.*?\)/.test(trimmed)) {
    throw new Error(
      `[CONFIG ERROR] Invalid NVIDIA NIM base URL: Markdown link formatting is not permitted. ` +
      `Provide a plain URL (e.g. '${DEFAULT_NIM_BASE_URL}').`
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `[CONFIG ERROR] Invalid NVIDIA NIM base URL: '${trimmed}' is not a structurally valid URL.`
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `[CONFIG ERROR] Invalid NVIDIA NIM base URL: Unsupported protocol '${parsed.protocol}'. ` +
      `Only HTTP and HTTPS are supported.`
    );
  }

  return trimmed;
}

export const config = {
  port: parseInt(process.env.PORT || (isTest ? '4001' : '4000'), 10),
  nodeEnv,
  isTest,
  database: {
    url: resolvedDatabaseUrl,
    user: process.env.POSTGRES_USER || 'leetroot',
    password: process.env.POSTGRES_PASSWORD || 'leetroot_secret',
    db: resolvedDbName,
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  },
  testDatabase: {
    url: process.env.TEST_DATABASE_URL !== undefined ? process.env.TEST_DATABASE_URL : defaultTestDbUrl,
    db: testDbName,
  },
  redis: {
    url: resolvedRedisUrl,
    cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || (isTest ? '300' : '86400'), 10),
  },
  testRedis: {
    url: process.env.TEST_REDIS_URL !== undefined ? process.env.TEST_REDIS_URL : defaultTestRedisUrl,
  },
  nim: {
    apiKey: process.env.NVIDIA_NIM_API_KEY || '',
    baseURL: validateNimBaseUrl(process.env.NVIDIA_NIM_BASE_URL),
    model: process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.3-70b-instruct',
    rateLimitRpm: 40, // NVIDIA NIM free tier limit
  },
  github: {
    token: process.env.GITHUB_TOKEN || '',
  },
};

/**
 * Strict database safety validator:
 * In test mode (NODE_ENV === 'test'), execution must fail closed unless targetUrl
 * points strictly to the configured test database via a supported protocol (postgres/postgresql).
 * Rejects development, unauthorized, malformed, and non-PostgreSQL database URLs.
 */
export function validateDatabaseSafety(
  targetUrl: string = config.database.url,
  env: string = config.nodeEnv,
  overrideExpectedTestDb?: string
): void {
  if (env === 'test') {
    const configuredTestDb = (overrideExpectedTestDb || process.env.POSTGRES_TEST_DB || 'leetroot_test').trim();
    const defaultDevDb = 'leetroot';
    const envDevDb = (process.env.POSTGRES_DB || defaultDevDb).trim();

    // 1. If TEST_DATABASE_URL environment variable is explicitly provided, verify it is well-formed, supported, and does not conflict
    if (process.env.TEST_DATABASE_URL !== undefined) {
      const rawTestUrl = process.env.TEST_DATABASE_URL;
      if (!rawTestUrl || rawTestUrl.trim() === '') {
        throw new Error(
          `[CONFIG ERROR] Malformed TEST_DATABASE_URL: explicitly configured TEST_DATABASE_URL cannot be empty or whitespace.`
        );
      }
      try {
        const parsed = new URL(rawTestUrl.trim());
        if (!SUPPORTED_DB_PROTOCOLS.includes(parsed.protocol as any)) {
          throw new Error(
            `[CONFIG ERROR] Unsupported database protocol '${parsed.protocol}' in TEST_DATABASE_URL: only 'postgres:' and 'postgresql:' URLs are supported.`
          );
        }
      } catch (err: any) {
        if (err.message.includes('[CONFIG ERROR]')) throw err;
        throw new Error(
          `[CONFIG ERROR] Malformed TEST_DATABASE_URL: unable to extract a valid database name from '${rawTestUrl}'.`
        );
      }

      const envTestDb = extractDatabaseName(rawTestUrl);
      if (!envTestDb) {
        throw new Error(
          `[CONFIG ERROR] Malformed TEST_DATABASE_URL: unable to extract a valid database name from '${rawTestUrl}'.`
        );
      }
      if (envTestDb !== configuredTestDb) {
        throw new Error(
          `[CONFIG ERROR] Conflicting TEST_DATABASE_URL: URL specifies database '${envTestDb}', ` +
          `which conflicts with configured test database '${configuredTestDb}'.`
        );
      }
    }

    // 2. Validate targetUrl protocol scheme
    if (!targetUrl || typeof targetUrl !== 'string' || targetUrl.trim() === '') {
      throw new Error(
        `[CONFIG ERROR] Invalid database URL: target database URL cannot be empty or whitespace.`
      );
    }

    try {
      const parsedTarget = new URL(targetUrl.trim());
      if (!SUPPORTED_DB_PROTOCOLS.includes(parsedTarget.protocol as any)) {
        throw new Error(
          `[CONFIG ERROR] Unsupported database protocol '${parsedTarget.protocol}': only 'postgres:' and 'postgresql:' URLs are supported.`
        );
      }
    } catch (err: any) {
      if (err.message.includes('[CONFIG ERROR]')) throw err;
      throw new Error(
        `[CONFIG ERROR] Invalid database URL: unable to determine target database from '${targetUrl}'.`
      );
    }

    // 3. Extract database from targetUrl
    const targetDb = extractDatabaseName(targetUrl);
    if (!targetDb) {
      throw new Error(
        `[CONFIG ERROR] Invalid database URL: unable to determine target database from '${targetUrl}'.`
      );
    }

    // 4. Reject development database (both default 'leetroot' and any configured POSTGRES_DB)
    if (targetDb === defaultDevDb || targetDb === envDevDb) {
      throw new Error(
        `[CONFIG ERROR] Unsafe test database configuration: integration tests cannot run against development database '${targetDb}'. ` +
        `Configure TEST_DATABASE_URL or POSTGRES_TEST_DB to point to a dedicated test database (e.g. '${configuredTestDb}').`
      );
    }

    // 5. Reject any unauthorized database (fail closed unless targetDb === configuredTestDb)
    if (targetDb !== configuredTestDb) {
      throw new Error(
        `[CONFIG ERROR] Unauthorized database for test mode: integration tests are strictly restricted to '${configuredTestDb}', ` +
        `but target database is '${targetDb}'.`
      );
    }
  }
}

// Enforce safety validation on startup
validateDatabaseSafety();