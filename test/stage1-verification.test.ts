import {
  verifySnippetWithNIM,
  VerificationStatus,
  getClient,
  setMockClientForTesting,
  resetMockClientForTesting,
  resetClientForTesting,
} from '../src/llm/nim-client';
import { config } from '../src/config/env';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${testName}`);
    failed++;
    throw new Error(`Assertion failed: ${testName}`);
  }
  passed++;
  console.log(`✅ PASSED: ${testName}`);
}

const sampleParams = {
  repoFullName: 'facebook/react',
  filePath: 'packages/scheduler/src/forks/SchedulerMinHeap.js',
  functionName: 'siftDown',
  language: 'JavaScript',
  detectedPatterns: ['heap-priority-queue'],
  codeSnippet: 'function siftDown(heap, node, i) { /* ... */ }',
};

async function runStage1Tests() {
  console.log('\n======================================================');
  console.log('🧪 LeetRoot Stage 1: Fail-Closed & Refinements Test Suite');
  console.log('======================================================\n');

  // Baseline state cleanup
  resetMockClientForTesting();
  resetClientForTesting();

  // Test 1: Missing Credentials Initial State
  console.log('--- 1. Missing Credentials Initial State ---');
  const origKey1 = config.nim.apiKey;
  config.nim.apiKey = ''; // simulate unconfigured
  let missingCredsRes: any;
  try {
    missingCredsRes = await verifySnippetWithNIM(sampleParams);
    assert(missingCredsRes.status === VerificationStatus.FAILED_PERMANENT, 'Missing credentials yields FAILED_PERMANENT');
    assert(missingCredsRes.isGenuineDSA === false, 'Missing credentials yields isGenuineDSA: false');
    assert(missingCredsRes.errorCode === 'MISSING_CREDENTIALS', 'ErrorCode is MISSING_CREDENTIALS');
  } finally {
    config.nim.apiKey = origKey1;
    resetClientForTesting();
    resetMockClientForTesting();
  }

  // Test 2: Production Mock Isolation
  console.log('\n--- 2. Production Mock Isolation ---');
  const origEnv2 = config.nodeEnv;
  const origKey2 = config.nim.apiKey;
  try {
    // 2a: setMockClientForTesting throws security violation if called when NODE_ENV === 'production'
    config.nodeEnv = 'production';
    let threw = false;
    try {
      setMockClientForTesting({});
    } catch (e: any) {
      threw = true;
      assert(e.message.includes('Security violation'), 'Throws security violation when injecting mock in production');
    }
    assert(threw, 'Mock injection strictly disallowed in production');

    // 2b: verifySnippetWithNIM() cannot use testMockClient when config.nodeEnv === 'production'
    // Even if testMockClient was somehow populated before nodeEnv became 'production':
    config.nodeEnv = 'development';
    setMockClientForTesting({
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: JSON.stringify({ isGenuineDSA: true, primaryTag: 'mock', allTags: ['mock'], rationale: 'mock', confidence: 1.0 }) } }],
          }),
        },
      },
    });

    // Switch to production with unconfigured key:
    config.nodeEnv = 'production';
    config.nim.apiKey = '';

    const prodIsolationRes = await verifySnippetWithNIM(sampleParams);
    assert(prodIsolationRes.status === VerificationStatus.FAILED_PERMANENT, 'Production ignores testMockClient and fails permanently if unconfigured');
    assert(prodIsolationRes.isGenuineDSA === false, 'Production refuses to use mock client');
    assert(prodIsolationRes.errorCode === 'MISSING_CREDENTIALS', 'Production yields MISSING_CREDENTIALS instead of mock result');
  } finally {
    config.nodeEnv = origEnv2;
    config.nim.apiKey = origKey2;
    resetMockClientForTesting();
    resetClientForTesting();
  }

  // Test 3: Missing Credentials After Client Initialization (No Stale Client Reuse)
  console.log('\n--- 3. Missing Credentials After Client Initialization ---');
  const origKey3 = config.nim.apiKey;
  try {
    resetMockClientForTesting();
    resetClientForTesting();

    // Step A: Initialize client with a valid dummy key
    config.nim.apiKey = 'initial-dummy-key-for-test';
    const clientA = getClient();
    assert(clientA !== null, 'Client successfully initialized with test key');

    // Step B: Clear credentials (simulate credential loss / unset)
    config.nim.apiKey = '';
    const clientB = getClient();
    assert(clientB === null, 'getClient() returns null when key is cleared (stale client invalidated)');

    // Step C: verifySnippetWithNIM must fail closed without reusing old client
    const resAfterLoss = await verifySnippetWithNIM(sampleParams);
    assert(resAfterLoss.status === VerificationStatus.FAILED_PERMANENT, 'Returns FAILED_PERMANENT when key cleared after initialization');
    assert(resAfterLoss.isGenuineDSA === false, 'isGenuineDSA is false when key cleared after initialization');
    assert(resAfterLoss.errorCode === 'MISSING_CREDENTIALS', 'ErrorCode is MISSING_CREDENTIALS when key cleared after initialization');
  } finally {
    config.nim.apiKey = origKey3;
    resetMockClientForTesting();
    resetClientForTesting();
  }

  // Test 4: API-Key Rotation Correctness (Without depending on undocumented SDK internals)
  console.log('\n--- 4. API-Key Rotation Correctness ---');
  const origKey4 = config.nim.apiKey;
  try {
    resetMockClientForTesting();
    resetClientForTesting();

    // Step A: Initialize with key-alpha
    config.nim.apiKey = 'key-alpha-11111';
    const clientAlpha = getClient();
    assert(clientAlpha !== null, 'clientAlpha successfully created');

    // Step B: Rotate to key-beta
    config.nim.apiKey = 'key-beta-22222';
    const clientBeta = getClient();
    assert(clientBeta !== null, 'clientBeta successfully created after rotation');
    assert(clientAlpha !== clientBeta, 'clientBeta is a distinct new client instance (old client replaced)');

    // Step C: Rotate to key-gamma
    config.nim.apiKey = 'key-gamma-33333';
    const clientGamma = getClient();
    assert(clientGamma !== null, 'clientGamma successfully created after second rotation');
    assert(clientBeta !== clientGamma, 'clientGamma is a distinct new client instance (previous client replaced)');

    // Step D: Re-query with key-gamma unchanged (verifies client reuse)
    const clientGammaCached = getClient();
    assert(clientGamma === clientGammaCached, 'Identical client instance reused when key is unchanged');

    // Step E: Clear key (verifies client invalidation on empty credential)
    config.nim.apiKey = '';
    const clientCleared = getClient();
    assert(clientCleared === null, 'Client is invalidated and returns null when key is cleared');
  } finally {
    config.nim.apiKey = origKey4;
    resetMockClientForTesting();
    resetClientForTesting();
  }

  // Test 5: Successful Valid Verification via Injected Test Client
  console.log('\n--- 5. Successful Valid Verification (Explicit Test Mock) ---');
  let validRes: any;
  try {
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
                    rationale: 'React Scheduler uses a binary min-heap for O(log n) task scheduling.',
                    productionContext: 'Concurrent Task Scheduler',
                    confidence: 0.95,
                  }),
                },
              },
            ],
          }),
        },
      },
    });

    validRes = await verifySnippetWithNIM(sampleParams);
    assert(validRes.status === VerificationStatus.VERIFIED, 'Valid response yields status: VERIFIED');
    assert(validRes.isGenuineDSA === true, 'Valid response yields isGenuineDSA: true');
    assert(validRes.confidence === 0.95, 'Preserves valid confidence score');
    assert(validRes.primaryTag === 'heap-priority-queue', 'Preserves valid primaryTag');
    assert(validRes.rationale.length > 20, 'Preserves engineering rationale');
  } finally {
    resetMockClientForTesting();
  }

  // Test 6: Model Rejection (isGenuineDSA: false)
  console.log('\n--- 6. Model Rejection ---');
  let rejectRes: any;
  try {
    setMockClientForTesting({
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    isGenuineDSA: false,
                    primaryTag: 'none',
                    allTags: [],
                    rationale: 'Naming collision; not a real DSA algorithm implementation.',
                    productionContext: 'Generic Helper',
                    confidence: 0.9,
                  }),
                },
              },
            ],
          }),
        },
      },
    });

    rejectRes = await verifySnippetWithNIM(sampleParams);
    assert(rejectRes.status === VerificationStatus.REJECTED, 'Model false response yields status: REJECTED');
    assert(rejectRes.isGenuineDSA === false, 'Model false response yields isGenuineDSA: false');
  } finally {
    resetMockClientForTesting();
  }

  // Test 7: Low Confidence Rejection (confidence < 0.7)
  console.log('\n--- 7. Low Confidence Rejection ---');
  let lowConfRes: any;
  try {
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
                    rationale: 'Ambiguous code structure.',
                    productionContext: 'Unknown',
                    confidence: 0.5, // Below 0.7 threshold
                  }),
                },
              },
            ],
          }),
        },
      },
    });

    lowConfRes = await verifySnippetWithNIM(sampleParams);
    assert(lowConfRes.status === VerificationStatus.REJECTED, 'Confidence < 0.7 yields status: REJECTED');
    assert(lowConfRes.isGenuineDSA === false, 'Confidence < 0.7 yields isGenuineDSA: false');
  } finally {
    resetMockClientForTesting();
  }

  // Test 8: Network Failure (ECONNRESET) -> FAILED_TRANSIENT
  console.log('\n--- 8. Network Failure (Transient) ---');
  let netRes: any;
  try {
    setMockClientForTesting({
      chat: {
        completions: {
          create: async () => {
            const err: any = new Error('Connection reset by peer');
            err.code = 'ECONNRESET';
            throw err;
          },
        },
      },
    });

    netRes = await verifySnippetWithNIM(sampleParams);
    assert(netRes.status === VerificationStatus.FAILED_TRANSIENT, 'Network reset yields status: FAILED_TRANSIENT');
    assert(netRes.isGenuineDSA === false, 'Network failure yields isGenuineDSA: false');
    assert(netRes.errorCode === 'ECONNRESET', 'Preserves ECONNRESET error code');
  } finally {
    resetMockClientForTesting();
  }

  // Test 9: Request Timeout -> FAILED_TRANSIENT
  console.log('\n--- 9. Request Timeout (Transient) ---');
  let timeoutRes: any;
  try {
    setMockClientForTesting({
      chat: {
        completions: {
          create: async () => {
            const err: any = new Error('Request timed out after 30000ms');
            err.name = 'TimeoutError';
            throw err;
          },
        },
      },
    });

    timeoutRes = await verifySnippetWithNIM(sampleParams);
    assert(timeoutRes.status === VerificationStatus.FAILED_TRANSIENT, 'Timeout yields status: FAILED_TRANSIENT');
    assert(timeoutRes.isGenuineDSA === false, 'Timeout yields isGenuineDSA: false');
    assert(timeoutRes.errorCode === 'TIMEOUT', 'ErrorCode is TIMEOUT');
  } finally {
    resetMockClientForTesting();
  }

  // Test 10: HTTP 429 Rate Limit Exceeded -> FAILED_TRANSIENT
  console.log('\n--- 10. HTTP 429 Rate Limit (Transient) ---');
  let rateLimitRes: any;
  try {
    setMockClientForTesting({
      chat: {
        completions: {
          create: async () => {
            const err: any = new Error('Rate limit exceeded: 40 requests per minute');
            err.status = 429;
            throw err;
          },
        },
      },
    });

    rateLimitRes = await verifySnippetWithNIM(sampleParams);
    assert(rateLimitRes.status === VerificationStatus.FAILED_TRANSIENT, 'HTTP 429 yields status: FAILED_TRANSIENT');
    assert(rateLimitRes.isGenuineDSA === false, 'HTTP 429 yields isGenuineDSA: false');
    assert(rateLimitRes.errorCode === 'RATE_LIMIT_EXCEEDED', 'ErrorCode is RATE_LIMIT_EXCEEDED');
  } finally {
    resetMockClientForTesting();
  }

  // Test 11: HTTP 503 Service Unavailable -> FAILED_TRANSIENT
  console.log('\n--- 11. HTTP 503 Server Error (Transient) ---');
  let serverErrorRes: any;
  try {
    setMockClientForTesting({
      chat: {
        completions: {
          create: async () => {
            const err: any = new Error('Service Unavailable');
            err.status = 503;
            throw err;
          },
        },
      },
    });

    serverErrorRes = await verifySnippetWithNIM(sampleParams);
    assert(serverErrorRes.status === VerificationStatus.FAILED_TRANSIENT, 'HTTP 503 yields status: FAILED_TRANSIENT');
    assert(serverErrorRes.isGenuineDSA === false, 'HTTP 503 yields isGenuineDSA: false');
  } finally {
    resetMockClientForTesting();
  }

  // Test 12: HTTP 401 Unauthorized -> FAILED_PERMANENT
  console.log('\n--- 12. HTTP 401 Unauthorized (Permanent) ---');
  let authErrorRes: any;
  try {
    setMockClientForTesting({
      chat: {
        completions: {
          create: async () => {
            const err: any = new Error('Unauthorized: Invalid API Key');
            err.status = 401;
            throw err;
          },
        },
      },
    });

    authErrorRes = await verifySnippetWithNIM(sampleParams);
    assert(authErrorRes.status === VerificationStatus.FAILED_PERMANENT, 'HTTP 401 yields status: FAILED_PERMANENT');
    assert(authErrorRes.isGenuineDSA === false, 'HTTP 401 yields isGenuineDSA: false');
  } finally {
    resetMockClientForTesting();
  }

  // Test 13: Malformed Non-JSON Response -> FAILED_PERMANENT
  console.log('\n--- 13. Malformed Response (Permanent) ---');
  let malformedRes: any;
  try {
    setMockClientForTesting({
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: 'I analyzed your code and it looks like a heap structure.', // Not valid JSON
                },
              },
            ],
          }),
        },
      },
    });

    malformedRes = await verifySnippetWithNIM(sampleParams);
    assert(malformedRes.status === VerificationStatus.FAILED_PERMANENT, 'Non-JSON response yields status: FAILED_PERMANENT');
    assert(malformedRes.isGenuineDSA === false, 'Non-JSON response yields isGenuineDSA: false');
    assert(malformedRes.errorCode === 'MALFORMED_JSON', 'ErrorCode is MALFORMED_JSON');
  } finally {
    resetMockClientForTesting();
  }

  // Test 14: Schema-Invalid Response (Missing required fields) -> FAILED_PERMANENT
  console.log('\n--- 14. Schema-Invalid Response (Permanent) ---');
  let schemaInvalidRes: any;
  try {
    setMockClientForTesting({
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    // Missing isGenuineDSA and confidence
                    primaryTag: 'heap',
                    rationale: 'Incomplete payload',
                  }),
                },
              },
            ],
          }),
        },
      },
    });

    schemaInvalidRes = await verifySnippetWithNIM(sampleParams);
    assert(schemaInvalidRes.status === VerificationStatus.FAILED_PERMANENT, 'Missing required fields yields status: FAILED_PERMANENT');
    assert(schemaInvalidRes.isGenuineDSA === false, 'Missing required fields yields isGenuineDSA: false');
    assert(schemaInvalidRes.errorCode === 'INVALID_SCHEMA', 'ErrorCode is INVALID_SCHEMA');
  } finally {
    resetMockClientForTesting();
  }

  // Test 15: Universal Fail-Closed Invariant Check
  console.log('\n--- 15. Universal Fail-Closed Invariant Check ---');
  const failureResults = [
    missingCredsRes,
    rejectRes,
    lowConfRes,
    netRes,
    timeoutRes,
    rateLimitRes,
    serverErrorRes,
    authErrorRes,
    malformedRes,
    schemaInvalidRes,
  ];

  for (let i = 0; i < failureResults.length; i++) {
    const r = failureResults[i];
    assert(r.status !== VerificationStatus.VERIFIED, `Invariant ${i + 1}: status (${r.status}) !== VERIFIED`);
    assert(r.isGenuineDSA !== true, `Invariant ${i + 1}: isGenuineDSA (${r.isGenuineDSA}) !== true`);
  }

  // Final cleanup of state
  resetMockClientForTesting();
  resetClientForTesting();

  console.log(`\n🎉 STAGE 1 VERIFICATION & REFINEMENTS: ALL ${passed}/${passed + failed} ASSERTIONS PASSED!\n`);
}

runStage1Tests().catch((err) => {
  console.error('\n❌ STAGE 1 TEST SUITE FAILED:', err);
  process.exit(1);
});
