import { cacheGet, cacheSet, cacheDelPattern } from './client';
import { getExamplesByTagSlugs, getExamplesByProblemSlug, CodeExampleResult, LeetCodeProblemItem } from '../db/queries';

const CACHE_PREFIX = 'examples:tag:';
const PROBLEM_CACHE_PREFIX = 'examples:problem:';

/**
 * Gets cached examples for a single tag slug, or queries DB and sets cache.
 * Key format: examples:tag:{slug}
 * Always caches canonical top-five examples; slices result to requested limit.
 */
export async function getCachedExamplesByTag(
  tagSlug: string,
  limit: number = 5
): Promise<CodeExampleResult[]> {
  const cacheKey = `${CACHE_PREFIX}${tagSlug.toLowerCase()}`;
  const cached = await cacheGet(cacheKey);

  if (cached) {
    try {
      const parsed: CodeExampleResult[] = JSON.parse(cached);
      return parsed.slice(0, limit);
    } catch (e) {
      // cache corrupted, re-fetch
    }
  }

  // Canonical query up to 5 items
  const examples = await getExamplesByTagSlugs([tagSlug], 5);
  if (examples.length > 0) {
    await cacheSet(cacheKey, JSON.stringify(examples));
  }
  return examples.slice(0, limit);
}

/**
 * Resolves multiple tags with cache-aside pattern.
 * Checks Redis for combined key; if missed, queries DB and populates Redis.
 */
export async function getCachedExamplesByTags(
  tagSlugs: string[],
  limit: number = 5
): Promise<CodeExampleResult[]> {
  if (!tagSlugs || tagSlugs.length === 0) return [];

  // Sort slugs for deterministic key if combined
  const combinedKey = `${CACHE_PREFIX}multi:${[...tagSlugs].sort().join('+')}`;
  const cachedCombined = await cacheGet(combinedKey);
  if (cachedCombined) {
    try {
      return JSON.parse(cachedCombined).slice(0, limit);
    } catch {
      // ignore
    }
  }

  // Canonical query up to 5 items
  const results = await getExamplesByTagSlugs(tagSlugs, 5);
  if (results.length > 0) {
    await cacheSet(combinedKey, JSON.stringify(results));
  }
  return results.slice(0, limit);
}

/**
 * Gets examples for a LeetCode problem by title_slug with caching.
 * Key format: examples:problem:{slug}
 * Always caches canonical top-five verified results; slices to requested limit.
 */
export async function getCachedExamplesByProblem(
  problemSlug: string,
  limit: number = 5
): Promise<{ problem: LeetCodeProblemItem | null; examples: CodeExampleResult[] }> {
  const cacheKey = `${PROBLEM_CACHE_PREFIX}${problemSlug.toLowerCase()}`;
  const cached = await cacheGet(cacheKey);

  if (cached) {
    try {
      const data = JSON.parse(cached);
      return {
        problem: data.problem,
        examples: (data.examples || []).slice(0, limit),
      };
    } catch {
      // ignore
    }
  }

  // Always query canonical 5 from DB for the cache
  const data = await getExamplesByProblemSlug(problemSlug, 5);
  if (data.examples.length > 0 || data.problem) {
    await cacheSet(cacheKey, JSON.stringify(data));
  }
  return {
    problem: data.problem,
    examples: data.examples.slice(0, limit),
  };
}

/**
 * Invalidates tag and problem caches on verified example insert/update.
 * Key patterns invalidated:
 * - examples:tag:{slug}*
 * - examples:problem:*
 */
/**
 * Invalidates a specific problem's cache entry.
 */
export async function invalidateProblemCache(problemSlug: string): Promise<number> {
  const cleanSlug = problemSlug.toLowerCase();
  return await cacheDelPattern(`${PROBLEM_CACHE_PREFIX}${cleanSlug}`);
}

/**
 * Invalidates tag and problem caches on verified example insert/update.
 * Key patterns invalidated:
 * - examples:tag:{slug}
 * - examples:tag:multi:*{slug}*
 * - examples:problem:*
 */
export async function invalidateExamplesCache(tagSlug?: string): Promise<number> {
  if (tagSlug) {
    const cleanTag = tagSlug.toLowerCase();
    const countTag = await cacheDelPattern(`${CACHE_PREFIX}${cleanTag}`);
    const countMulti = await cacheDelPattern(`${CACHE_PREFIX}multi:*${cleanTag}*`);
    const countProb = await cacheDelPattern(`${PROBLEM_CACHE_PREFIX}*`);
    return countTag + countMulti + countProb;
  }
  const countTag = await cacheDelPattern(`${CACHE_PREFIX}*`);
  const countProb = await cacheDelPattern(`${PROBLEM_CACHE_PREFIX}*`);
  console.log(`[Cache] Invalidated ${countTag + countProb} example cache entries.`);
  return countTag + countProb;
}
