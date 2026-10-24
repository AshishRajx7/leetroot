/**
 * Strengthened tests for LeetRoot Stage 5 Remediation:
 * 1. Seed data integrity & immutable SHA-pinned GitHub source permalinks
 * 2. Idempotent seed execution preserving database row & tag association counts
 * 3. Unique index uq_code_examples_location verification
 * 4. Prevention of duplicate examples in queries & API responses
 */

import { SEED_EXAMPLES, buildSeedPermalink } from '../src/seeds/seed-data';
import { runSeeds } from '../src/seeds/seed-runner';
import { getExamplesByProblemSlug, getExamplesByTagSlugs } from '../src/db/queries';
import { initDb, closeDb, query, getIsPostgresConnected } from '../src/db/db';
import { initRedis, closeRedis } from '../src/redis/client';

let passed = 0;
let total = 0;

function assert(cond: boolean, msg: string) {
  total++;
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  passed++;
  console.log(`✅ PASSED: ${msg}`);
}

async function run() {
  console.log('\n======================================================');
  console.log('🚀 LeetRoot Strengthened Idempotent Seeds & Integrity Suite');
  console.log('======================================================\n');

  // Test 1: SEED_EXAMPLES Contract & SHA-Pinned Permalinks
  console.log('--- 1. Testing SEED_EXAMPLES SHA-Pinned Permalinks Contract ---');
  assert(SEED_EXAMPLES.length === 10, `SEED_EXAMPLES contains exactly 10 curated examples`);

  for (const ex of SEED_EXAMPLES) {
    assert(
      typeof ex.commitSha === 'string' && /^[0-9a-f]{40}$/i.test(ex.commitSha),
      `Example ${ex.repoFullName}:${ex.functionName} has a valid 40-character commit SHA: ${ex.commitSha}`
    );

    assert(
      ex.sourceUrl.includes(`/blob/${ex.commitSha}/`),
      `sourceUrl embeds verified 40-character commit SHA: ${ex.sourceUrl}`
    );

    assert(
      !ex.sourceUrl.includes('/blob/main/') &&
      !ex.sourceUrl.includes('/blob/master/') &&
      !ex.sourceUrl.includes('/blob/unstable/'),
      `sourceUrl does NOT use moving branches (main/master/unstable): ${ex.sourceUrl}`
    );

    assert(
      ex.sourceUrl.includes(`#L${ex.startLine}-L${ex.endLine}`),
      `sourceUrl includes exact line range anchor #L${ex.startLine}-L${ex.endLine}`
    );
  }

  // Test 2: Specific verified seed example details
  console.log('\n--- 2. Testing Specific Repaired Seed Attributes ---');
  const react = SEED_EXAMPLES.find((e) => e.repoFullName === 'facebook/react')!;
  assert(
    react.filePath === 'packages/scheduler/src/SchedulerMinHeap.js',
    `React path points to real location without forks: ${react.filePath}`
  );
  assert(react.startLine === 59 && react.endLine === 88, `React lines match siftDown: L${react.startLine}-L${react.endLine}`);

  const vscode = SEED_EXAMPLES.find((e) => e.repoFullName === 'microsoft/vscode')!;
  assert(
    vscode.filePath === 'src/vs/base/common/ternarySearchTree.ts',
    `VS Code path points to TernarySearchTree: ${vscode.filePath}`
  );
  assert(vscode.functionName === 'findSubstr', `VS Code function is findSubstr: ${vscode.functionName}`);
  assert(vscode.startLine === 682 && vscode.endLine === 704, `VS Code lines match: L${vscode.startLine}-L${vscode.endLine}`);

  const node = SEED_EXAMPLES.find((e) => e.repoFullName === 'nodejs/node')!;
  assert(node.functionName === 'percolateDown', `Node.js function is percolateDown: ${node.functionName}`);
  assert(node.startLine === 38 && node.endLine === 69, `Node.js lines match: L${node.startLine}-L${node.endLine}`);

  const git = SEED_EXAMPLES.find((e) => e.repoFullName === 'git/git')!;
  assert(git.filePath === 'commit.c', `Git file path points to definition in commit.c: ${git.filePath}`);
  assert(git.startLine === 938 && git.endLine === 1047, `Git lines match sort_in_topological_order: L${git.startLine}-L${git.endLine}`);

  const cpython = SEED_EXAMPLES.find((e) => e.repoFullName === 'python/cpython')!;
  assert(cpython.startLine === 221 && cpython.endLine === 233, `CPython lines match _siftdown: L${cpython.startLine}-L${cpython.endLine}`);

  const networkx = SEED_EXAMPLES.find((e) => e.repoFullName === 'networkx/networkx')!;
  assert(networkx !== undefined, `NetworkX entry is present resolving example 10`);
  assert(
    networkx.filePath === 'networkx/utils/union_find.py',
    `NetworkX path points to union_find.py: ${networkx.filePath}`
  );
  assert(networkx.functionName === 'union', `NetworkX function is union: ${networkx.functionName}`);
  assert(networkx.startLine === 91 && networkx.endLine === 106, `NetworkX lines match: L${networkx.startLine}-L${networkx.endLine}`);
  assert(networkx.tags.includes('union-find'), `NetworkX has tag union-find: ${networkx.tags}`);

  // Test 3: buildSeedPermalink Helper
  console.log('\n--- 3. Testing buildSeedPermalink Helper ---');
  const dummyUrl = buildSeedPermalink(
    'https://github.com/example/repo/',
    'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    '/src/dir/file.ts',
    10,
    25
  );
  assert(
    dummyUrl === 'https://github.com/example/repo/blob/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2/src/dir/file.ts#L10-L25',
    `buildSeedPermalink formats canonical immutable URL correctly: ${dummyUrl}`
  );

  // Test 4: Idempotent Seed Execution with Direct Row Count Assertions
  console.log('\n--- 4. Testing Seed Runner Idempotency & Database Row Invariants ---');
  await initDb();
  await initRedis();

  const isPg = getIsPostgresConnected();
  console.log(`[Test Environment] Live PostgreSQL connected: ${isPg}`);

  // Run 1
  const run1 = await runSeeds();
  assert(run1.examplesCount === 10, `Run 1 loaded ${run1.examplesCount} verified examples`);

  if (isPg) {
    const resCount1 = await query('SELECT COUNT(*)::int as cnt FROM code_examples;');
    const rowCount1 = resCount1.rows[0].cnt;
    assert(rowCount1 === 10, `Database contains exactly 10 code_examples after Run 1 (found ${rowCount1})`);

    const resTags1 = await query('SELECT COUNT(*)::int as cnt FROM code_example_tags;');
    const tagCount1 = resTags1.rows[0].cnt;
    assert(tagCount1 === 23, `Database contains exactly 23 code_example_tags after Run 1 (found ${tagCount1})`);

    // Verify unique index is present and valid
    const idxRes = await query(`
      SELECT i.indisvalid
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname = 'uq_code_examples_location';
    `);
    assert(idxRes.rows[0]?.indisvalid === true, `Unique index uq_code_examples_location is valid in PostgreSQL`);
  }

  // Run 2 (Idempotency check)
  const run2 = await runSeeds();
  assert(run2.examplesCount === 10, `Run 2 loaded ${run2.examplesCount} verified examples (idempotent)`);

  if (isPg) {
    const resCount2 = await query('SELECT COUNT(*)::int as cnt FROM code_examples;');
    const rowCount2 = resCount2.rows[0].cnt;
    assert(
      rowCount2 === 10,
      `Database STILL contains exactly 10 code_examples after Run 2 (no duplicates created): ${rowCount2}`
    );

    const resTags2 = await query('SELECT COUNT(*)::int as cnt FROM code_example_tags;');
    const tagCount2 = resTags2.rows[0].cnt;
    assert(
      tagCount2 === 23,
      `Database STILL contains exactly 23 code_example_tags after Run 2 (tag associations preserved): ${tagCount2}`
    );

    const dupesRes = await query(`
      SELECT repo_id, file_path, start_line, end_line, COUNT(*)::int as cnt
      FROM code_examples
      GROUP BY repo_id, file_path, start_line, end_line
      HAVING COUNT(*) > 1;
    `);
    assert(dupesRes.rows.length === 0, `Zero duplicate example locations in database after repeated seed runs`);
  }

  // Test 5: Querying Examples Produces Correct, Distinct Non-Duplicated Results
  console.log('\n--- 5. Testing Read-Only Query Deduplication & Content ---');
  const heapExamples = await getExamplesByTagSlugs(['heap-priority-queue'], 5);
  const heapIds = heapExamples.map((e) => e.id);
  const uniqueHeapIds = new Set(heapIds);
  assert(
    heapIds.length === uniqueHeapIds.size,
    `All returned heap examples have distinct IDs (no duplicates): [${heapIds.join(', ')}]`
  );

  const reactExamples = heapExamples.filter((e) => e.repo.fullName === 'facebook/react');
  assert(reactExamples.length === 1, `Only 1 facebook/react example returned: ${reactExamples.length}`);
  assert(
    reactExamples[0].filePath === 'packages/scheduler/src/SchedulerMinHeap.js',
    `React returned example has corrected filePath: ${reactExamples[0].filePath}`
  );
  assert(
    reactExamples[0].startLine === 59 && reactExamples[0].endLine === 88,
    `React returned example has corrected lines 59-88: ${reactExamples[0].startLine}-${reactExamples[0].endLine}`
  );

  const probRes = await getExamplesByProblemSlug('merge-k-sorted-lists', 5);
  const probExamples = probRes.examples;
  const probIds = probExamples.map((e) => e.id);
  const uniqueProbIds = new Set(probIds);
  assert(
    probIds.length === uniqueProbIds.size,
    `All returned problem examples have distinct IDs: [${probIds.join(', ')}]`
  );

  for (const ex of probExamples) {
    assert(
      /blob\/[0-9a-f]{40}\//i.test(ex.sourceUrl),
      `Problem example ${ex.repo.fullName} sourceUrl is SHA-pinned: ${ex.sourceUrl}`
    );
  }

  await closeDb();
  await closeRedis();

  console.log(`\n🎉 ALL ${passed}/${total} STRENGTHENED REMEDIATION TESTS PASSED!\n`);
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
