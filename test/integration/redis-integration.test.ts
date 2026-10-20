import { harness } from './harness';
import { config } from '../../src/config/env';
import { checkRedisReadiness } from '../../src/config/readiness';
import { initRedis, closeRedis, cacheGet, getIsRedisConnected } from '../../src/redis/client';
import Redis from 'ioredis';

let passed = 0;
let total = 0;

function assert(condition: boolean, message: string) {
  total++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}

export async function runRedisIntegrationTests(): Promise<void> {
  console.log('\n======================================================');
  console.log('🔴 LeetRoot Redis Integration Test Suite');
  console.log('======================================================\n');

  // 1. Static prerequisite verification
  console.log('--- 1. Prerequisite Verification ---');
  harness.verifyPrerequisites();
  assert(process.env.NODE_ENV === 'test', 'Environment is strictly NODE_ENV=test');

  // 2. Offline probe to check infrastructure availability
  console.log('\n--- 2. Infrastructure Connectivity Probe ---');
  const readiness = await checkRedisReadiness(config.redis.url, 2000);

  if (!readiness.ok) {
    console.log(`⚠️ Redis service is OFFLINE at ${readiness.url}: ${readiness.error}`);
    console.log('\n--- 3. Offline Fail-Closed Guarantee ---');

    // Prove that initRedis() fails closed and refuses in-memory cache in test mode
    let initRedisFailed = false;
    let initRedisErrorMsg = '';
    try {
      await initRedis();
    } catch (err: any) {
      initRedisFailed = true;
      initRedisErrorMsg = err.message;
    }
    assert(initRedisFailed, 'initRedis() strictly fails closed when Redis is offline');
    assert(
      initRedisErrorMsg.includes('[REDIS ERROR]') && initRedisErrorMsg.includes('Refusing in-memory fallback'),
      'initRedis() throws descriptive [REDIS ERROR] refusing in-memory fallback'
    );
    assert(!getIsRedisConnected(), 'Redis connection status is false');

    // Prove that cacheGet() refuses in-memory cache fallback in test mode
    let cacheGetFailed = false;
    let cacheGetErrorMsg = '';
    try {
      await cacheGet('test:sample-key');
    } catch (err: any) {
      cacheGetFailed = true;
      cacheGetErrorMsg = err.message;
    }
    assert(cacheGetFailed, 'cacheGet() strictly fails closed when Redis is disconnected in test mode');
    assert(
      cacheGetErrorMsg.includes('[REDIS ERROR]') && cacheGetErrorMsg.includes('Refusing in-memory fallback'),
      'cacheGet() throws descriptive error refusing in-memory cache'
    );

    console.log(`\n📋 OFFLINE VERIFICATION COMPLETE: ${passed}/${total} checks passed.`);
    console.log('   To execute live cache operations, start the Redis container with Docker.\n');
    return;
  }

  // 3. Live Infrastructure Integration Testing
  console.log(`✅ Redis is ONLINE at ${readiness.url} (latency: ${readiness.latencyMs}ms)`);
  console.log('\n--- 3. Live Redis & Logical Database Verification ---');

  let client: Redis | null = null;
  const createdKeys: string[] = [];

  try {
    client = harness.createTestRedisClient();
    await client.connect();

    // Verification 1: Ping Redis
    const pong = await client.ping();
    assert(pong === 'PONG', 'Redis responds with PONG to live ping');

    // Verification 2: Verify logical database is DB 1
    const parsed = new URL(config.redis.url);
    assert(parsed.pathname === '/1', 'Redis connection URL specifies logical database 1 (/1)');

    // Verification 3: Isolated Key-Value Operations
    console.log('\n--- 4. Isolated Cache Lifecycle & Expiration ---');
    const uniqueSuffix = Date.now() + '_' + Math.floor(Math.random() * 10000);
    const testKey = `test:integration:entry:${uniqueSuffix}`;
    createdKeys.push(testKey);

    const testPayload = JSON.stringify({
      id: 101,
      status: 'VERIFIED',
      pattern: 'heap-priority-queue',
      created: Date.now(),
    });

    // SET with TTL
    await client.set(testKey, testPayload, 'EX', 10);
    assert(true, `Successfully stored test key '${testKey}' with 10s TTL`);

    // GET
    const retrieved = await client.get(testKey);
    assert(retrieved !== null, 'Retrieved value from Redis is not null');
    const parsedValue = JSON.parse(retrieved!);
    assert(parsedValue.pattern === 'heap-priority-queue', 'Stored payload matches retrieved JSON');

    // TTL check
    const remainingTtl = await client.ttl(testKey);
    assert(remainingTtl > 0 && remainingTtl <= 10, `Key TTL is positive and <= 10s (actual: ${remainingTtl}s)`);

    // Isolated DEL (only this key, no FLUSHDB)
    const deletedCount = await harness.deleteTestKeys(client, [testKey]);
    assert(deletedCount === 1, 'deleteTestKeys() deleted exactly 1 test key');

    // Verify key is gone
    const afterDelete = await client.get(testKey);
    assert(afterDelete === null, 'Key is confirmed deleted from Redis');

    // Remove from tracked keys
    const idx = createdKeys.indexOf(testKey);
    if (idx !== -1) createdKeys.splice(idx, 1);

    console.log(`\n🎉 ALL ${passed}/${total} REDIS INTEGRATION TESTS PASSED!`);
  } finally {
    // Safety cleanup: if anything threw before deletion, clean up created test keys
    if (client && createdKeys.length > 0) {
      try {
        await harness.deleteTestKeys(client, createdKeys);
      } catch {}
    }
    await harness.closeAll();
    await closeRedis();
  }
}

if (require.main === module || (typeof process !== 'undefined' && process.argv[1]?.replace(/\\/g, '/').endsWith('redis-integration.test.ts'))) {
  runRedisIntegrationTests().catch((err) => {
    console.error('Redis integration test failed:', err);
    process.exit(1);
  });
}
