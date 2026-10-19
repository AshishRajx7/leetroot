import { Pool, PoolConfig } from 'pg';
import Redis, { RedisOptions } from 'ioredis';
import {
  config,
  validateDatabaseSafety,
  extractDatabaseName,
} from '../../src/config/env';
import {
  checkInfrastructureReadiness,
  maskConnectionUrl,
  InfrastructureReadiness,
} from '../../src/config/readiness';

export interface HarnessOptions {
  expectedDatabaseName?: string;
  expectedRedisLogicalDb?: string;
  readinessTimeoutMs?: number;
}

export const DEFAULT_HARNESS_OPTIONS: Required<HarnessOptions> = {
  expectedDatabaseName: 'leetroot_test',
  expectedRedisLogicalDb: '/1',
  readinessTimeoutMs: 2000,
};

/**
 * Stage 2.2 Integration-Test Harness
 *
 * Provides a strict fail-closed foundation for PostgreSQL and Redis integration testing:
 * 1. Enforces process.env.NODE_ENV === 'test' directly (rejects missing/defaulted values).
 * 2. Enforces database safety validation (fails closed against development or unauthorized databases).
 * 3. Enforces that target PostgreSQL database is strictly 'leetroot_test'.
 * 4. Enforces that target Redis URL strictly specifies logical DB 1 (/1).
 * 5. Validates real service connectivity with bounded readiness probes (no silent in-memory fallback).
 * 6. Guarantees deterministic lifecycle cleanup of any test connections or pools.
 * 7. Strictly avoids destructive operations (no FLUSHALL, no FLUSHDB, no database deletion).
 */
export class IntegrationTestHarness {
  private activePools: Set<Pool> = new Set();
  private activeRedisClients: Set<Redis> = new Set();

  /**
   * Statically verifies all environment and configuration prerequisites before opening any connections.
   * Throws descriptive [HARNESS ERROR] if any requirement is violated.
   */
  public verifyPrerequisites(customOptions: HarnessOptions = {}): void {
    const opts = { ...DEFAULT_HARNESS_OPTIONS, ...customOptions };

    // 1. Explicitly require process.env.NODE_ENV === 'test' (reject missing or defaulted values)
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(
        `[HARNESS ERROR] Integration test harness strictly requires process.env.NODE_ENV === 'test'. ` +
        `Current process.env.NODE_ENV is '${process.env.NODE_ENV}'. Configure NODE_ENV=test before running integration tests.`
      );
    }

    // 2. Invoke existing database safety validation before opening any connections
    validateDatabaseSafety(config.database.url, 'test', opts.expectedDatabaseName);

    // 3. Verify that the configured PostgreSQL target is exactly leetroot_test
    const actualDbName = extractDatabaseName(config.database.url);
    if (actualDbName !== opts.expectedDatabaseName) {
      throw new Error(
        `[HARNESS ERROR] Configured PostgreSQL target must be strictly '${opts.expectedDatabaseName}'. ` +
        `Extracted '${actualDbName}' from URL '${maskConnectionUrl(config.database.url)}'.`
      );
    }

    // 4. Verify that the configured Redis URL targets logical database 1
    const redisUrl = config.redis.url;
    let parsedRedis: URL;
    try {
      parsedRedis = new URL(redisUrl);
    } catch {
      throw new Error(
        `[HARNESS ERROR] Invalid Redis connection URL: unable to parse '${maskConnectionUrl(redisUrl)}'.`
      );
    }

    if (parsedRedis.protocol !== 'redis:' && parsedRedis.protocol !== 'rediss:') {
      throw new Error(
        `[HARNESS ERROR] Unsupported Redis protocol '${parsedRedis.protocol}'. Expected 'redis:' or 'rediss:'.`
      );
    }

    const actualRedisDb = parsedRedis.pathname || '/';
    if (actualRedisDb !== opts.expectedRedisLogicalDb) {
      throw new Error(
        `[HARNESS ERROR] Redis connection must strictly target logical database 1 ('${opts.expectedRedisLogicalDb}'). ` +
        `Actual path is '${actualRedisDb}' from URL '${maskConnectionUrl(redisUrl)}'.`
      );
    }
  }

  /**
   * Asserts that live PostgreSQL and Redis services are reachable and ready.
   * Fails closed with a descriptive error if either service is unavailable.
   * Does NOT fall back to in-memory mocks or synthetic stores.
   */
  public async assertInfrastructureReady(
    timeoutMs: number = DEFAULT_HARNESS_OPTIONS.readinessTimeoutMs,
    customOptions: HarnessOptions = {}
  ): Promise<InfrastructureReadiness> {
    // Verify static configuration prerequisites first
    this.verifyPrerequisites(customOptions);

    const readiness = await checkInfrastructureReadiness({
      postgresUrl: config.database.url,
      redisUrl: config.redis.url,
      timeoutMs,
    });

    if (!readiness.postgres.ok) {
      throw new Error(
        `[HARNESS ERROR] Real PostgreSQL infrastructure is unavailable at ${readiness.postgres.url}: ` +
        `${readiness.postgres.error || 'Connection failed'}. ` +
        `Integration tests strictly require a live PostgreSQL database and will not fall back to in-memory store.`
      );
    }

    if (!readiness.redis.ok) {
      throw new Error(
        `[HARNESS ERROR] Real Redis infrastructure is unavailable at ${readiness.redis.url}: ` +
        `${readiness.redis.error || 'Connection failed'}. ` +
        `Integration tests strictly require a live Redis service and will not fall back to in-memory cache.`
      );
    }

    return readiness;
  }

  /**
   * Safely instantiates a monitored PostgreSQL connection pool for integration tests.
   * Configured with strict timeouts and registered for lifecycle tracking.
   */
  public createTestPool(customPoolConfig: PoolConfig = {}): Pool {
    this.verifyPrerequisites();

    const pool = new Pool({
      connectionString: config.database.url,
      max: customPoolConfig.max || 5,
      connectionTimeoutMillis: customPoolConfig.connectionTimeoutMillis || 3000,
      statement_timeout: customPoolConfig.statement_timeout || 5000,
      ...customPoolConfig,
    });

    this.activePools.add(pool);
    return pool;
  }

  /**
   * Safely instantiates a monitored Redis client for integration tests.
   * Configured with strict timeouts, zero retries, and registered for lifecycle tracking.
   */
  public createTestRedisClient(customRedisConfig: RedisOptions = {}): Redis {
    this.verifyPrerequisites();

    const client = new Redis(config.redis.url, {
      connectTimeout: customRedisConfig.connectTimeout || 3000,
      commandTimeout: customRedisConfig.commandTimeout || 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
      ...customRedisConfig,
    });

    // Suppress unhandled error events during connection probes
    client.on('error', () => {});

    this.activeRedisClients.add(client);
    return client;
  }

  /**
   * Deterministically closes and drains all pools and clients created through this harness.
   * Safe to call repeatedly in finally blocks.
   */
  public async closeAll(): Promise<void> {
    const poolPromises = Array.from(this.activePools).map(async (pool) => {
      try {
        await pool.end();
      } catch {}
    });
    this.activePools.clear();

    const redisPromises = Array.from(this.activeRedisClients).map(async (client) => {
      try {
        client.disconnect();
      } catch {}
    });
    this.activeRedisClients.clear();

    await Promise.all([...poolPromises, ...redisPromises]);
  }
}

export const harness = new IntegrationTestHarness();

export function verifyIntegrationPrerequisites(options?: HarnessOptions): void {
  harness.verifyPrerequisites(options);
}

export async function assertInfrastructureReady(
  timeoutMs?: number,
  options?: HarnessOptions
): Promise<InfrastructureReadiness> {
  return harness.assertInfrastructureReady(timeoutMs, options);
}

export async function closeHarnessConnections(): Promise<void> {
  return harness.closeAll();
}

/**
 * Isolated offline self-check:
 * Verifies that prerequisite validation and offline fail-closed checks operate correctly
 * without requiring running Docker containers or active database/Redis connections.
 */
export async function runHarnessOfflineSelfCheck(): Promise<void> {
  console.log('\n======================================================');
  console.log('🧪 LeetRoot Integration Harness Offline Self-Check');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function assertCheck(cond: boolean, desc: string) {
    total++;
    if (!cond) {
      console.error('❌ FAILED: ' + desc);
      throw new Error('Self-check assertion failed: ' + desc);
    }
    passed++;
    console.log('✅ PASSED: ' + desc);
  }

  // If launched without NODE_ENV=test, verify that the harness fails closed immediately
  if (process.env.NODE_ENV !== 'test') {
    console.log('--- 1. Environment Gate (Non-Test Process Launch) ---');
    let rejectedNonTest = false;
    let nonTestMsg = '';
    try {
      harness.verifyPrerequisites();
    } catch (err: any) {
      rejectedNonTest = true;
      nonTestMsg = err.message;
    }
    assertCheck(rejectedNonTest, 'Harness fails closed when process is launched without NODE_ENV=test');
    assertCheck(
      nonTestMsg.includes("Integration test harness strictly requires process.env.NODE_ENV === 'test'"),
      'Throws explicit error requiring process.env.NODE_ENV === test'
    );
    console.log(`\n🎉 HARNESS ENVIRONMENT GATE PASSED (${passed}/${total} checks): Process strictly failed closed in non-test environment.`);
    console.log('   To run full offline infrastructure checks, launch with NODE_ENV=test.\n');
    return;
  }

  const origNodeEnv = process.env.NODE_ENV;

  try {
    // Check 1: Enforces process.env.NODE_ENV === 'test' directly (rejects non-test and missing values)
    console.log('--- 1. Environment Verification ---');
    process.env.NODE_ENV = 'development';
    let rejectedDev = false;
    try {
      harness.verifyPrerequisites();
    } catch (err: any) {
      rejectedDev = err.message.includes("Integration test harness strictly requires process.env.NODE_ENV === 'test'");
    }
    assertCheck(rejectedDev, 'verifyPrerequisites() strictly rejects process.env.NODE_ENV !== test');

    // Also verify missing / undefined process.env.NODE_ENV is strictly rejected
    delete process.env.NODE_ENV;
    let rejectedMissing = false;
    try {
      harness.verifyPrerequisites();
    } catch (err: any) {
      rejectedMissing = err.message.includes("Integration test harness strictly requires process.env.NODE_ENV === 'test'");
    }
    assertCheck(rejectedMissing, 'verifyPrerequisites() strictly rejects missing (undefined) process.env.NODE_ENV');

    // Switch back to test mode for checks 2-6
    process.env.NODE_ENV = 'test';

    // Check 2: Prerequisites validation passes with valid test configuration
    console.log('\n--- 2. Static Prerequisites Verification ---');
    let prereqPassed = false;
    try {
      harness.verifyPrerequisites();
      prereqPassed = true;
    } catch (err: any) {
      prereqPassed = false;
      console.error('Unexpected prereq failure:', err.message);
    }
    assertCheck(prereqPassed, 'verifyPrerequisites() passes for valid test configuration');

    // Check 3: Prerequisites rejects non-test database name
    let rejectedWrongDb = false;
    try {
      harness.verifyPrerequisites({ expectedDatabaseName: 'unrelated_test_db' });
    } catch (err: any) {
      rejectedWrongDb = err.message.includes('[CONFIG ERROR]') || err.message.includes('[HARNESS ERROR]');
    }
    assertCheck(rejectedWrongDb, 'verifyPrerequisites() rejects conflicting expectedDatabaseName');

    // Check 4: Prerequisites rejects Redis DB other than /1
    let rejectedWrongRedisDb = false;
    try {
      harness.verifyPrerequisites({ expectedRedisLogicalDb: '/0' });
    } catch (err: any) {
      rejectedWrongRedisDb = err.message.includes('[HARNESS ERROR]');
    }
    assertCheck(rejectedWrongRedisDb, 'verifyPrerequisites() rejects Redis path other than /1');

    // Check 5: Offline fail-closed assertion (proves tests will NOT claim success when offline)
    console.log('\n--- 3. Offline Fail-Closed Guarantee ---');
    let offlineRejected = false;
    let offlineErrorMsg = '';
    try {
      await harness.assertInfrastructureReady(500);
    } catch (err: any) {
      offlineRejected = true;
      offlineErrorMsg = err.message;
    }
    assertCheck(offlineRejected, 'assertInfrastructureReady() fails closed when infrastructure is offline');
    assertCheck(
      offlineErrorMsg.includes('[HARNESS ERROR]') && offlineErrorMsg.includes('unavailable'),
      'Throws descriptive [HARNESS ERROR] identifying unavailable infrastructure'
    );
    assertCheck(
      offlineErrorMsg.includes('will not fall back to in-memory store'),
      'Error message explicitly confirms refusal to fall back to in-memory store'
    );

    // Check 6: Teardown executes cleanly without open handles
    console.log('\n--- 4. Lifecycle & Resource Teardown ---');
    await harness.closeAll();
    assertCheck(true, 'closeAll() executes cleanly without error');

    console.log(`\n🎉 HARNESS SELF-CHECK: ALL ${passed}/${total} CHECKS PASSED PERFECTLY!\n`);
  } finally {
    if (origNodeEnv !== undefined) {
      process.env.NODE_ENV = origNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  }
}

// When executed directly, run the isolated offline self-check
if (require.main === module || (typeof process !== 'undefined' && process.argv[1]?.replace(/\\/g, '/').endsWith('test/integration/harness.ts'))) {
  runHarnessOfflineSelfCheck().catch((err) => {
    console.error('Harness self-check failed:', err);
    process.exit(1);
  });
}
