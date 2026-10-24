import https from 'https';
import { SEED_EXAMPLES } from '../src/seeds/seed-data';

interface VerificationResult {
  index: number;
  repo: string;
  file: string;
  commitSha: string;
  fn: string;
  lines: string;
  tags: string[];
  httpStatus: number;
  functionFound: boolean;
  lineCountMatch: boolean;
  snippetMatch: boolean;
  permalinkValid: boolean;
  tagsValid: boolean;
  error?: string;
}

const KNOWN_DSA_TAGS = new Set([
  'heap-priority-queue',
  'trie',
  'tree',
  'binary-tree',
  'binary-search-tree',
  'graph',
  'topological-sort',
  'depth-first-search',
  'breadth-first-search',
  'union-find',
  'lru-cache',
  'sliding-window',
  'monotonic-stack',
  'design',
  'doubly-linked-list',
  'hash-table',
]);

function fetchRawFile(repoFullName: string, commitSha: string, filePath: string): Promise<{ status: number; body: string }> {
  const url = `https://raw.githubusercontent.com/${repoFullName}/${commitSha}/${filePath}`;
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'LeetRoot-Integrity-Verifier/1.0',
        },
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, body: data });
        });
      }
    );
    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

function normalizeSnippet(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

async function run() {
  console.log('================================================================');
  console.log('🔍 LeetRoot 10-Seed Upstream Source Integrity Pass');
  console.log('================================================================\n');

  if (SEED_EXAMPLES.length !== 10) {
    throw new Error(`Expected exactly 10 seed examples, found ${SEED_EXAMPLES.length}`);
  }

  const results: VerificationResult[] = [];
  let allPassed = true;

  for (let i = 0; i < SEED_EXAMPLES.length; i++) {
    const ex = SEED_EXAMPLES[i];
    console.log(`[${i + 1}/10] Verifying ${ex.repoFullName} -> ${ex.filePath} (${ex.functionName})...`);

    // 1. Commit SHA
    const isSha40 = typeof ex.commitSha === 'string' && /^[0-9a-f]{40}$/i.test(ex.commitSha);
    if (!isSha40) {
      console.error(`  ❌ Invalid commit SHA: ${ex.commitSha}`);
      allPassed = false;
    }

    // 2. Permalink format
    const expectedPermalink = `https://github.com/${ex.repoFullName}/blob/${ex.commitSha}/${ex.filePath}#L${ex.startLine}-L${ex.endLine}`;
    const permalinkValid = ex.sourceUrl === expectedPermalink;
    if (!permalinkValid) {
      console.error(`  ❌ Permalink mismatch:`);
      console.error(`     Stored:   ${ex.sourceUrl}`);
      console.error(`     Expected: ${expectedPermalink}`);
      allPassed = false;
    }

    // 3. Tags validity
    const tagsValid = Array.isArray(ex.tags) && ex.tags.length > 0 && ex.tags.every((t) => KNOWN_DSA_TAGS.has(t));
    if (!tagsValid) {
      console.error(`  ❌ Invalid tags: ${JSON.stringify(ex.tags)}`);
      allPassed = false;
    }

    // 4. Fetch upstream raw file at commit
    try {
      const response = await fetchRawFile(ex.repoFullName, ex.commitSha, ex.filePath);
      if (response.status !== 200) {
        console.error(`  ❌ HTTP ${response.status} when fetching raw file from GitHub!`);
        results.push({
          index: i + 1,
          repo: ex.repoFullName,
          file: ex.filePath,
          commitSha: ex.commitSha,
          fn: ex.functionName || '',
          lines: `L${ex.startLine}-L${ex.endLine}`,
          tags: ex.tags,
          httpStatus: response.status,
          functionFound: false,
          lineCountMatch: false,
          snippetMatch: false,
          permalinkValid,
          tagsValid,
          error: `HTTP ${response.status}`,
        });
        allPassed = false;
        continue;
      }

      // 5. Slice file lines
      const upstreamRawLines = response.body.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      const startIdx = ex.startLine - 1;
      const endIdx = ex.endLine; // slice end is exclusive

      if (startIdx < 0 || endIdx > upstreamRawLines.length || startIdx >= endIdx) {
        console.error(`  ❌ Line range L${ex.startLine}-L${ex.endLine} is out of file bounds (total lines: ${upstreamRawLines.length})`);
        allPassed = false;
      }

      const upstreamSliceLines = upstreamRawLines.slice(startIdx, endIdx);
      const upstreamSliceText = upstreamSliceLines.join('\n');

      // 6. Check function name in slice
      const functionFound = Boolean(ex.functionName && upstreamSliceText.includes(ex.functionName));
      if (!functionFound) {
        console.error(`  ❌ Function name '${ex.functionName}' NOT found in lines L${ex.startLine}-L${ex.endLine}!`);
        allPassed = false;
      }

      // 7. Snippet matching (subject only to newline normalization)
      const normalizedStored = normalizeSnippet(ex.codeSnippet);
      const normalizedUpstream = normalizeSnippet(upstreamSliceText);
      const snippetMatch = normalizedStored === normalizedUpstream;

      if (!snippetMatch) {
        console.error(`  ❌ Snippet mismatch against upstream lines L${ex.startLine}-L${ex.endLine}!`);
        console.error(`     Stored snippet length:   ${normalizedStored.length} chars, ${normalizedStored.split('\n').length} lines`);
        console.error(`     Upstream snippet length: ${normalizedUpstream.length} chars, ${normalizedUpstream.split('\n').length} lines`);

        // Find first differing line
        const storedL = normalizedStored.split('\n');
        const upstreamL = normalizedUpstream.split('\n');
        for (let l = 0; l < Math.max(storedL.length, upstreamL.length); l++) {
          if (storedL[l] !== upstreamL[l]) {
            console.error(`     First differing line ${l + 1}:`);
            console.error(`       Stored:   ${JSON.stringify(storedL[l])}`);
            console.error(`       Upstream: ${JSON.stringify(upstreamL[l])}`);
            break;
          }
        }
        allPassed = false;
      } else {
        console.log(`  ✅ Verified: HTTP 200, function '${ex.functionName}' present, exact line range L${ex.startLine}-L${ex.endLine}, 100% snippet match.`);
      }

      results.push({
        index: i + 1,
        repo: ex.repoFullName,
        file: ex.filePath,
        commitSha: ex.commitSha,
        fn: ex.functionName || '',
        lines: `L${ex.startLine}-L${ex.endLine}`,
        tags: ex.tags,
        httpStatus: response.status,
        functionFound,
        lineCountMatch: upstreamSliceLines.length === (ex.endLine - ex.startLine + 1),
        snippetMatch,
        permalinkValid,
        tagsValid,
      });

    } catch (err: any) {
      console.error(`  ❌ Exception fetching upstream source: ${err.message}`);
      results.push({
        index: i + 1,
        repo: ex.repoFullName,
        file: ex.filePath,
        commitSha: ex.commitSha,
        fn: ex.functionName || '',
        lines: `L${ex.startLine}-L${ex.endLine}`,
        tags: ex.tags,
        httpStatus: 0,
        functionFound: false,
        lineCountMatch: false,
        snippetMatch: false,
        permalinkValid,
        tagsValid,
        error: err.message,
      });
      allPassed = false;
    }
  }

  console.log('\n================================================================');
  console.log('📊 UPSTREAM VERIFICATION SUMMARY TABLE');
  console.log('================================================================');
  console.table(
    results.map((r) => ({
      '#': r.index,
      Repo: r.repo,
      Function: r.fn,
      Lines: r.lines,
      HTTP: r.httpStatus,
      'Fn Found': r.functionFound ? 'YES' : 'NO',
      'Snippet Match': r.snippetMatch ? 'EXACT' : 'MISMATCH',
      Permalink: r.permalinkValid ? 'VALID' : 'INVALID',
      Tags: r.tags.join(', '),
    }))
  );

  if (!allPassed) {
    console.error('\n❌ Upstream integrity pass FAILED. See errors above.\n');
    process.exit(1);
  }

  console.log('\n🎉 ALL 10 SEED EXAMPLES ARE 100% VERIFIED AGAINST REAL UPSTREAM REPOSITORIES!\n');
}

run().catch((err) => {
  console.error('Fatal error in integrity pass:', err);
  process.exit(1);
});
