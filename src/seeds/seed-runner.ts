import { SEED_EXAMPLES } from './seed-data';
import {
  upsertRepo,
  upsertTag,
  insertCodeExample,
  linkExampleTag,
} from '../db/queries';
import { syncLeetCodeCatalog } from '../leetcode/sync';
import { invalidateExamplesCache } from '../redis/cache';

export async function runSeeds(): Promise<{
  examplesCount: number;
  tagsCount: number;
}> {
  console.log('[Seed Runner] Populating verified production DSA examples...');
  const tagCache = new Map<string, number>();
  let count = 0;

  // 1. First sync core LeetCode problems catalog
  try {
    await syncLeetCodeCatalog(50);
  } catch (err: any) {
    console.warn('[Seed Runner] LeetCode catalog initial sync warning:', err.message);
  }

  // 2. Insert verified production examples
  for (const ex of SEED_EXAMPLES) {
    try {
      const repoId = await upsertRepo({
        name: ex.repoName,
        fullName: ex.repoFullName,
        url: ex.repoUrl,
        stars: ex.stars,
        description: `Curated repository ${ex.repoFullName}`,
      });

      const exampleId = await insertCodeExample({
        repoId,
        filePath: ex.filePath,
        functionName: ex.functionName,
        language: ex.language,
        codeSnippet: ex.codeSnippet,
        startLine: ex.startLine,
        endLine: ex.endLine,
        sourceUrl: ex.sourceUrl,
        rationale: ex.rationale,
        productionContext: ex.productionContext,
        confidenceScore: ex.confidenceScore,
      });

      for (const tagSlug of ex.tags) {
        let tagId = tagCache.get(tagSlug);
        if (!tagId) {
          tagId = await upsertTag({
            name: formatTagName(tagSlug),
            slug: tagSlug,
            category: 'Data Structures & Algorithms',
          });
          tagCache.set(tagSlug, tagId);
        }
        await linkExampleTag(exampleId, tagId);
      }
      count++;
    } catch (err: any) {
      console.warn(`[Seed Runner] Error inserting seed example ${ex.repoFullName}: ${err.message}`);
    }
  }

  // 3. Invalidate Redis cache so all lookups immediately reflect seeded data
  await invalidateExamplesCache();

  console.log(`[Seed Runner] Successfully loaded ${count} verified production examples across ${tagCache.size} tags.`);
  return {
    examplesCount: count,
    tagsCount: tagCache.size,
  };
}

function formatTagName(slug: string): string {
  const map: Record<string, string> = {
    'heap-priority-queue': 'Heap (Priority Queue)',
    'trie': 'Trie',
    'tree': 'Tree',
    'binary-tree': 'Binary Tree',
    'binary-search-tree': 'Binary Search Tree',
    'graph': 'Graph',
    'topological-sort': 'Topological Sort',
    'depth-first-search': 'Depth-First Search',
    'breadth-first-search': 'Breadth-First Search',
    'union-find': 'Union Find',
    'lru-cache': 'LRU Cache',
    'sliding-window': 'Sliding Window',
    'monotonic-stack': 'Monotonic Stack',
    'design': 'Design',
    'doubly-linked-list': 'Doubly-Linked List',
    'hash-table': 'Hash Table',
  };
  return map[slug] || slug.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}
