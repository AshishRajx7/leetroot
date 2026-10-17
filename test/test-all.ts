import { initDb, closeDb } from '../src/db/db';
import { initRedis } from '../src/redis/client';
import { scanFileContent } from '../src/parser/tree-sitter';
import { extractSnippetBounds } from '../src/parser/snippet-extractor';
import { verifySnippetWithNIM, VerificationStatus, setMockClientForTesting, resetMockClientForTesting } from '../src/llm/nim-client';
import { runSeeds } from '../src/seeds/seed-runner';
import {
  getExamplesByTagSlugs,
  getExamplesByProblemSlug,
  getAllTags,
  getStats,
} from '../src/db/queries';
import {
  getCachedExamplesByTags,
  getCachedExamplesByProblem,
  invalidateExamplesCache,
} from '../src/redis/cache';
import { createServer } from '../src/api/server';
import { AddressInfo } from 'net';
import axios from 'axios';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`âŒ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`âœ… PASSED: ${message}`);
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('ðŸ§ª LeetRoot (Phase 1 + Phase 3) Comprehensive Test Suite');
  console.log('======================================================\n');

  // Test 1: DB Initialization
  console.log('--- 1. Testing Database & Seeds ---');
  await initDb();
  await initRedis();
  const seedResult = await runSeeds();
  assert(seedResult.examplesCount > 0, `Seeded ${seedResult.examplesCount} verified production examples`);
  assert(seedResult.tagsCount > 0, `Seeded ${seedResult.tagsCount} unique LeetCode tags`);

  // Test 2: Covering Index O(log n) Query Path
  console.log('\n--- 2. Testing Covering Index Query Path (Phase 3 Hot Path) ---');
  const t0 = Date.now();
  const heapExamples = await getExamplesByTagSlugs(['heap-priority-queue'], 5);
  const duration = Date.now() - t0;
  assert(heapExamples.length > 0, `Found ${heapExamples.length} heap examples in ${duration}ms`);
  assert(heapExamples[0].repo.fullName === 'facebook/react', `Identified Facebook React Scheduler heap example`);
  assert(Boolean(heapExamples[0].sourceUrl.includes('#L')), `Contains exact GitHub line range anchor: ${heapExamples[0].sourceUrl}`);
  assert(Boolean(heapExamples[0].rationale.length > 20), `Contains non-generic engineering rationale: "${heapExamples[0].rationale.slice(0, 60)}..."`);

  // Test 3: Problem Slug Lookup
  console.log('\n--- 3. Testing Problem Slug Lookup ---');
  const problemResult = await getExamplesByProblemSlug('merge-k-sorted-lists', 5);
  assert(Boolean(problemResult.problem), `Resolved LeetCode problem: ${problemResult.problem?.title}`);
  assert(problemResult.examples.length > 0, `Associated ${problemResult.examples.length} production examples with problem`);

  // Test 4: Tree-sitter & AST Static Pattern Scanner
  console.log('\n--- 4. Testing Tree-sitter Static Pattern Scanner ---');
  const sampleReactCode = `
    function siftDown(heap, node, i) {
      let index = i;
      const length = heap.length;
      const halfLength = length >>> 1;
      while (index < halfLength) {
        const leftIndex = (index + 1) * 2 - 1;
        const left = heap[leftIndex];
        const rightIndex = leftIndex + 1;
        const right = heap[rightIndex];
        if (compare(left, node) < 0) {
          heap[index] = left;
          index = leftIndex;
        }
      }
    }
  `;
  const candidates = scanFileContent(
    'packages/scheduler/src/forks/SchedulerMinHeap.js',
    sampleReactCode,
    'https://github.com/facebook/react',
    'main'
  );
  assert(candidates.length > 0, `AST scanner detected ${candidates.length} DSA candidate snippet(s)`);
  assert(candidates[0].detectedPatterns.includes('heap-priority-queue'), `Detected correct pattern: heap-priority-queue`);
  assert(candidates[0].functionName === 'siftDown', `Extracted function name: ${candidates[0].functionName}`);

  // Test 5: Snippet Clamping
  console.log('\n--- 5. Testing Snippet Line Cap Clamping (~40 Lines) ---');
  const longCode = Array.from({ length: 100 }, (_, i) => `  const line_${i} = ${i};`).join('\n');
  const bounds = extractSnippetBounds(
    `function testLarge() {\n${longCode}\n}`,
    10,
    'https://github.com/example/repo',
    'main',
    'src/large.js',
    40
  );
  assert(bounds.lineCount <= 40, `Clamped snippet line count to ${bounds.lineCount} <= 40 lines`);
  assert(bounds.sourceUrl.includes('#L'), `Calculated valid GitHub source range: ${bounds.sourceUrl}`);

  // Test 6: NVIDIA NIM Verification Logic (Fail-Closed & Explicit Test Mock Verification)
  console.log('\n--- 6. Testing NVIDIA NIM Verification Logic ---');
  // 6a: Test fail-closed behavior when credentials are unset / missing
  const unconfiguredVerification = await verifySnippetWithNIM({
    repoFullName: 'facebook/react',
    filePath: 'packages/scheduler/src/forks/SchedulerMinHeap.js',
    functionName: 'siftDown',
    language: 'JavaScript',
    detectedPatterns: ['heap-priority-queue'],
    codeSnippet: sampleReactCode,
  });
  assert(unconfiguredVerification.status === VerificationStatus.FAILED_PERMANENT, 'Unconfigured NIM fails closed with FAILED_PERMANENT');
  assert(unconfiguredVerification.isGenuineDSA === false, 'Unconfigured NIM yields isGenuineDSA: false');

  // 6b: Test verification logic with explicitly injected test mock client
  setMockClientForTesting({
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  isGenuineDSA: true,
                  primaryTag: 'heap-priority-queue',
                  allTags: ['heap-priority-queue'],
                  rationale: 'React Scheduler uses a binary min-heap to keep track of concurrent tasks.',
                  productionContext: 'Priority Scheduling & Event Loop Execution',
                  confidence: 0.95,
                }),
              },
            },
          ],
        }),
      },
    },
  });

  const verification = await verifySnippetWithNIM({
    repoFullName: 'facebook/react',
    filePath: 'packages/scheduler/src/forks/SchedulerMinHeap.js',
    functionName: 'siftDown',
    language: 'JavaScript',
    detectedPatterns: ['heap-priority-queue'],
    codeSnippet: sampleReactCode,
  });
  assert(verification.status === VerificationStatus.VERIFIED, 'NIM verified snippet status is VERIFIED');
  assert(verification.isGenuineDSA === true, 'NIM verified snippet as genuine DSA');
  assert(verification.confidence >= 0.7, 'NIM confidence score: ' + verification.confidence);
  assert(Boolean(verification.rationale), 'Generated engineering rationale: ' + verification.rationale);
  resetMockClientForTesting();

  // Test 7: Redis Cache & Invalidation
  console.log('\n--- 7. Testing Redis Caching & Invalidation ---');
  const cached = await getCachedExamplesByTags(['heap-priority-queue'], 5);
  assert(cached.length > 0, `Cached examples returned ${cached.length} items`);
  const invalidated = await invalidateExamplesCache('heap-priority-queue');
  assert(invalidated >= 0, `Invalidated cache entries upon scan completion: count = ${invalidated}`);

  // Test 8: Read-Only HTTP API Endpoints
  console.log('\n--- 8. Testing Phase 1 Read-Only HTTP API ---');
  const app = createServer();
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    const healthRes = await axios.get(`${baseUrl}/health`);
    assert(healthRes.data.status === 'ok', `GET /api/health returned 200 OK`);

    const tagRes = await axios.get(`${baseUrl}/examples/by-tag?tags=heap-priority-queue`);
    assert(tagRes.data.examples.length > 0, `GET /api/examples/by-tag returned ${tagRes.data.examples.length} examples`);

    const probRes = await axios.get(`${baseUrl}/examples/by-problem?slug=merge-k-sorted-lists`);
    assert(probRes.data.examples.length > 0, `GET /api/examples/by-problem returned ${probRes.data.examples.length} examples for merge-k-sorted-lists`);

    const statsRes = await axios.get(`${baseUrl}/stats`);
    assert(statsRes.data.stats.totalExamples > 0, `GET /api/stats reported ${statsRes.data.stats.totalExamples} total examples across ${statsRes.data.curatedReposCount} curated repos`);
  } finally {
    server.close();
    await closeDb();
  }

  console.log(`\nðŸŽ‰ ALL ${passedTests}/${totalTests} TESTS PASSED PERFECTLY!\n`);
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

