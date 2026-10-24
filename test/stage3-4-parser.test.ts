import { RepoDiscoveryService, IGitHubFetcher } from '../src/scanner/repo-discovery';
import { TreeSitterManager, SUPPORTED_LANGUAGES } from '../src/parser/tree-sitter-manager';
import { extractSnippetBounds } from '../src/parser/snippet-extractor';
import {
  scanFileContent,
  scanFileContentAsync,
  initTreeSitter,
  detectLanguageFromExtension,
} from '../src/parser/tree-sitter';

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

/**
 * Mock GitHub fetcher providing deterministic responses without real network access.
 */
class MockGitHubFetcher implements IGitHubFetcher {
  async getLatestCommitSha(repoFullName: string, defaultBranch: string = 'main'): Promise<string> {
    if (repoFullName === 'fail/repo') {
      throw new Error('Simulated network connection reset (ECONNRESET)');
    }
    return 'a1b2c3d4e5f6789012345678901234567890abcd';
  }

  async getGitTree(repoFullName: string, commitSha: string) {
    return [
      { path: 'src/valid.ts', size: 2048, type: 'blob', sha: 'sha1' },
      { path: 'src/large.js', size: 500 * 1024, type: 'blob', sha: 'sha2' }, // > 250 KB (must filter out)
      { path: 'vendor/lib.c', size: 1024, type: 'blob', sha: 'sha3' },     // vendor/ (must filter out)
      { path: 'test/unit.py', size: 1024, type: 'blob', sha: 'sha4' },     // test/ (must filter out)
      { path: 'docs/guide.md', size: 512, type: 'blob', sha: 'sha5' },     // .md (must filter out)
      { path: 'src/bundle.min.js', size: 1024, type: 'blob', sha: 'sha6' },// .min.js (must filter out)
      { path: 'pkg/heap.go', size: 4096, type: 'blob', sha: 'sha7' },      // valid go file
      { path: 'src/main.cpp', size: 8192, type: 'blob', sha: 'sha8' },     // valid cpp file
    ];
  }

  async getFileContent(repoFullName: string, commitSha: string, filePath: string): Promise<string> {
    if (filePath.includes('fail')) {
      throw new Error('Simulated HTTP 404 Not Found');
    }
    return 'function example() { return 42; }';
  }
}

async function runStage3And4Tests() {
  console.log('\n======================================================');
  console.log('🧪 LeetRoot Stage 3 & Stage 4: Discovery & AST Parser Tests');
  console.log('======================================================\n');

  // --- Stage 3: Curated Repo Discovery & Bounded Retrieval ---
  console.log('--- 1. Bounded Repository Discovery & Filtering ---');
  const mockFetcher = new MockGitHubFetcher();
  const discoveryService = new RepoDiscoveryService(mockFetcher);

  const sha = await discoveryService.resolveCommitSha('facebook/react');
  assert(sha === 'a1b2c3d4e5f6789012345678901234567890abcd', 'Resolves exact 40-char commit SHA');

  const files = await discoveryService.discoverFiles('facebook/react', sha);
  assert(files.length === 3, `Filtered files count is 3 (got ${files.length})`);
  assert(files.some((f) => f.path === 'src/valid.ts'), 'Includes valid TypeScript file');
  assert(files.some((f) => f.path === 'pkg/heap.go'), 'Includes valid Go file');
  assert(files.some((f) => f.path === 'src/main.cpp'), 'Includes valid C++ file');
  assert(!files.some((f) => f.path === 'src/large.js'), 'Excludes files exceeding 250 KB limit');
  assert(!files.some((f) => f.path === 'vendor/lib.c'), 'Excludes vendor/ directory paths');
  assert(!files.some((f) => f.path === 'test/unit.py'), 'Excludes test/ directory paths');
  assert(!files.some((f) => f.path === 'docs/guide.md'), 'Excludes non-code files (.md)');
  assert(!files.some((f) => f.path === 'src/bundle.min.js'), 'Excludes minified files (.min.js)');

  // Test network failure resilience in discovery
  console.log('\n--- 2. Discovery Network Failure Handling ---');
  let networkFailed = false;
  try {
    await discoveryService.resolveCommitSha('fail/repo');
  } catch (err: any) {
    networkFailed = true;
    assert(err.message.includes('[DISCOVERY ERROR]'), 'Throws descriptive [DISCOVERY ERROR]');
  }
  assert(networkFailed, 'Fails closed gracefully when commit resolution encounters network error');

  // --- Stage 4: Tree-sitter Language Support & AST Parsing ---
  console.log('\n--- 3. Tree-sitter Multi-Language Grammars ---');
  const tsManager = TreeSitterManager.getInstance();
  await tsManager.init();

  const supportedKeys = ['javascript', 'typescript', 'tsx', 'python', 'c', 'cpp', 'java', 'go'];
  for (const langKey of supportedKeys) {
    const lang = await tsManager.getLanguage(langKey);
    assert(lang !== null, `Successfully loaded grammar for ${langKey}`);
  }

  // Unsupported language handling
  const unsupported = tsManager.detectLanguage('document.pdf');
  assert(unsupported === null, 'detectLanguage returns null for unsupported extension .pdf');
  const unsupportedScan = await scanFileContentAsync('doc.pdf', 'binary data', 'https://github.com/test', sha);
  assert(unsupportedScan.length === 0, 'scanFileContentAsync returns 0 candidates for unsupported language');

  // Malformed source handling
  console.log('\n--- 4. Malformed Source Code Resilience ---');
  const malformedJs = 'function broken(x { return x + ;';
  const malformedResult = await scanFileContentAsync('broken.js', malformedJs, 'https://github.com/test', sha);
  assert(Array.isArray(malformedResult), 'Malformed code parses gracefully without throwing exceptions');

  // --- Stage 4: Structural AST Pattern Detection ---
  console.log('\n--- 5. Structural AST Candidate Detection ---');

  // Sample 1: Heap / Priority Queue (JavaScript / React Scheduler pattern)
  const heapJs = `
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
      if (rightIndex < length && compare(right, left) < 0) {
        heap[index] = right;
        heap[rightIndex] = node;
        index = rightIndex;
      } else {
        heap[index] = left;
        heap[leftIndex] = node;
        index = leftIndex;
      }
    } else {
      return;
    }
  }
}
`;

  const heapCandidates = await scanFileContentAsync('src/scheduler.js', heapJs, 'https://github.com/facebook/react', sha);
  assert(heapCandidates.length > 0, 'Tree-sitter AST scanner detects Heap DSA candidate');
  assert(heapCandidates[0].detectedPatterns.includes('heap-priority-queue'), 'Detected pattern is heap-priority-queue');
  assert(heapCandidates[0].functionName === 'siftDown', `Extracted function name is siftDown (got ${heapCandidates[0].functionName})`);
  assert(heapCandidates[0].sourceUrl.includes(`/blob/${sha}/`), `Source URL is pinned to commit SHA ${sha.slice(0, 7)}`);

  // Sample 2: Python Monotonic Stack
  const monoStackPy = `
def next_greater_element(nums):
    stack = []
    result = [-1] * len(nums)
    for i, num in enumerate(nums):
        while stack and nums[stack[-1]] < num:
            prev_index = stack.pop()
            result[prev_index] = num
        stack.push(i)
    return result
`;
  const pyCandidates = await scanFileContentAsync('algo.py', monoStackPy, 'https://github.com/python/cpython', sha);
  assert(pyCandidates.length > 0, 'Tree-sitter detects Python Monotonic Stack candidate');
  assert(pyCandidates[0].detectedPatterns.includes('monotonic-stack'), 'Detected pattern is monotonic-stack');
  assert(pyCandidates[0].functionName === 'next_greater_element', 'Extracted Python function name correctly');

  // Sample 3: Negative test - Ordinary loop without DSA signals must NOT generate candidate
  const plainLoop = `
function printNumbers(n) {
  for (let i = 0; i < n; i++) {
    console.log(i);
  }
}
`;
  const negativeCandidates = await scanFileContentAsync('loop.js', plainLoop, 'https://github.com/test', sha);
  assert(negativeCandidates.length === 0, 'Ordinary loop without DSA signals correctly yields 0 candidates');

  // --- Snippet Extractor & 40-Line Ceiling ---
  console.log('\n--- 6. Snippet Extraction, Boundary Clamping & URL Encoding ---');
  const longFuncLines: string[] = ['function veryLongFunction(x) {'];
  for (let i = 1; i <= 100; i++) {
    if (i === 50) {
      longFuncLines.push('  const child = 2 * index + 1; // siftDown pattern');
    } else {
      longFuncLines.push(`  let var_${i} = ${i};`);
    }
  }
  longFuncLines.push('}');
  const longFuncCode = longFuncLines.join('\n');

  const clampedSnippet = extractSnippetBounds(
    longFuncCode,
    51,
    'https://github.com/facebook/react',
    sha,
    'src/long.js',
    40
  );

  assert(clampedSnippet.lineCount <= 40, `Clamped lineCount (${clampedSnippet.lineCount}) is <= 40 lines`);
  assert(clampedSnippet.endLine - clampedSnippet.startLine + 1 <= 40, 'Line range difference is <= 40 lines');
  assert(clampedSnippet.isTruncated === true, 'clampedSnippet has isTruncated === true');
  assert(clampedSnippet.sourceUrl.includes(`/blob/${sha}/`), 'Snippet permalink uses pinned commit SHA');
  assert(clampedSnippet.sourceUrl.includes('#L'), 'Snippet permalink has valid line anchor');

  // Test snippet with < 40 lines
  const shortSnippet = extractSnippetBounds(
    'function shortFunc() {\n  return 1;\n}',
    1,
    'https://github.com/facebook/react',
    sha,
    'src/short.js',
    40
  );
  assert(shortSnippet.isTruncated === false, 'Short snippet (< 40 lines) has isTruncated === false');

  // Test safe URL encoding when path has spaces or special characters
  const spaceSnippet = extractSnippetBounds(
    'function f() {}',
    1,
    'https://github.com/test/repo',
    sha,
    'src/data structures/search algo.js',
    40
  );
  assert(spaceSnippet.sourceUrl.includes('src/data%20structures/search%20algo.js'), 'Source URL safely percent-encodes path spaces');

  console.log(`\n🎉 STAGE 3 & STAGE 4 TEST SUITE: ALL ${passed}/${total} CHECKS PASSED PERFECTLY!\n`);
}

runStage3And4Tests().catch((err) => {
  console.error('Stage 3 & 4 tests failed:', err);
  process.exit(1);
});
