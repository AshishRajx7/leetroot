import { harness } from './harness';
import { config } from '../../src/config/env';
import { checkPostgresReadiness } from '../../src/config/readiness';
import { initDb, closeDb, getIsPostgresConnected } from '../../src/db/db';
import { Pool } from 'pg';

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

export async function runPostgresIntegrationTests(): Promise<void> {
  console.log('\n======================================================');
  console.log('🐘 LeetRoot PostgreSQL Integration Test Suite');
  console.log('======================================================\n');

  // 1. Static prerequisite verification
  console.log('--- 1. Prerequisite Verification ---');
  harness.verifyPrerequisites();
  assert(process.env.NODE_ENV === 'test', 'Environment is strictly NODE_ENV=test');

  // 2. Offline probe to check infrastructure availability
  console.log('\n--- 2. Infrastructure Connectivity Probe ---');
  const readiness = await checkPostgresReadiness(config.database.url, 2000);

  if (!readiness.ok) {
    console.log(`⚠️ PostgreSQL service is OFFLINE at ${readiness.url}: ${readiness.error}`);
    console.log('\n--- 3. Offline Fail-Closed Guarantee ---');

    // Prove that initDb() fails closed and refuses in-memory store in test mode
    let initDbFailed = false;
    let initDbErrorMsg = '';
    try {
      await initDb();
    } catch (err: any) {
      initDbFailed = true;
      initDbErrorMsg = err.message;
    }
    assert(initDbFailed, 'initDb() strictly fails closed when PostgreSQL is offline');
    assert(
      initDbErrorMsg.includes('[DB ERROR]') && initDbErrorMsg.includes('Refusing in-memory fallback'),
      'initDb() throws descriptive [DB ERROR] refusing in-memory fallback'
    );
    assert(!getIsPostgresConnected(), 'Postgres connection status is false');

    console.log(`\n📋 OFFLINE VERIFICATION COMPLETE: ${passed}/${total} checks passed.`);
    console.log('   To execute live database queries, start the PostgreSQL container with Docker.\n');
    return;
  }

  // 3. Live Infrastructure Integration Testing
  console.log(`✅ PostgreSQL is ONLINE at ${readiness.url} (latency: ${readiness.latencyMs}ms)`);
  console.log('\n--- 3. Live Database & Schema Verification ---');

  let pool: Pool | null = null;
  let testRepoId: number | null = null;

  try {
    await initDb();
    assert(getIsPostgresConnected(), 'Postgres connection status is true after initDb()');
    pool = harness.createTestPool();

    // Verification 1: Verify current connected database is strictly leetroot_test
    const dbRes = await pool.query('SELECT current_database() AS db, current_user AS usr;');
    const currentDb = dbRes.rows[0]?.db;
    assert(currentDb === 'leetroot_test', `Connected database is strictly 'leetroot_test' (actual: '${currentDb}')`);

    // Verification 2: Verify all required schema tables exist
    const requiredTables = [
      'repos',
      'scans',
      'leetcode_tags',
      'code_examples',
      'code_example_tags',
      'leetcode_problems',
      'leetcode_problem_tags',
    ];

    const tablesRes = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
    );
    const existingTables = new Set(tablesRes.rows.map((r: any) => r.table_name));

    for (const table of requiredTables) {
      assert(existingTables.has(table), `Schema table '${table}' exists in leetroot_test`);
    }

    // Verification 3: Verify mandatory covering index for O(log n) Phase 3 query path
    const indexRes = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'code_example_tags' AND indexname = 'idx_code_example_tags_covering';`
    );
    assert(
      indexRes.rows.length > 0,
      'Mandatory covering index idx_code_example_tags_covering exists on code_example_tags'
    );

    // Verification 4: Isolated, Non-Destructive CRUD Execution
    console.log('\n--- 4. Isolated CRUD Operations & Cleanup ---');
    const uniqueSuffix = Date.now() + '_' + Math.floor(Math.random() * 10000);
    const testFullName = `leetroot-test/integration-${uniqueSuffix}`;

    // Insert
    const insertRes = await pool.query(
      `INSERT INTO repos (name, full_name, url, default_branch, language, stars, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, full_name, stars;`,
      [
        'integration-test-repo',
        testFullName,
        'https://github.com/' + testFullName,
        'main',
        'typescript',
        10,
        'Temporary integration test record',
      ]
    );

    testRepoId = insertRes.rows[0]?.id;
    assert(typeof testRepoId === 'number' && testRepoId > 0, `Successfully inserted isolated test repo row with id=${testRepoId}`);
    assert(insertRes.rows[0]?.full_name === testFullName, 'Inserted full_name matches test input');

    // Query back
    const selectRes = await pool.query('SELECT * FROM repos WHERE id = $1;', [testRepoId]);
    assert(selectRes.rows.length === 1, 'Query by id returns exactly 1 row');
    assert(selectRes.rows[0]?.stars === 10, 'Queried stars field equals 10');

    // Update
    const updateRes = await pool.query('UPDATE repos SET stars = 50 WHERE id = $1 RETURNING stars;', [testRepoId]);
    assert(updateRes.rows[0]?.stars === 50, 'Updated stars field equals 50');

    // Clean up specifically inserted record (no TRUNCATE, no DROP)
    await harness.deleteTestRepo(pool, testRepoId);
    const verifyDeleteRes = await pool.query('SELECT id FROM repos WHERE id = $1;', [testRepoId]);
    assert(verifyDeleteRes.rows.length === 0, `Verified test row id=${testRepoId} was deleted completely`);
    testRepoId = null; // Marked clean

    console.log(`\n🎉 ALL ${passed}/${total} POSTGRESQL INTEGRATION TESTS PASSED!`);
  } finally {
    // Safety fallback: if anything threw before deletion, ensure the specific test row is deleted
    if (pool && testRepoId) {
      try {
        await pool.query('DELETE FROM repos WHERE id = $1;', [testRepoId]);
      } catch {}
    }
    await harness.closeAll();
    await closeDb();
  }
}

if (require.main === module || (typeof process !== 'undefined' && process.argv[1]?.replace(/\\/g, '/').endsWith('postgres-integration.test.ts'))) {
  runPostgresIntegrationTests().catch((err) => {
    console.error('PostgreSQL integration test failed:', err);
    process.exit(1);
  });
}
