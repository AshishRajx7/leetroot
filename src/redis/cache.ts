import { cacheGet, cacheSet, cacheDelPattern } from './client';
import { getExamplesByTagSlugs, getExamplesByProblemSlug, CodeExampleResult, LeetCodeProblemItem } from '../db/queries';

const CACHE_PREFIX = 'examples:tag:';
const PROBLEM_CACHE_PREFIX = 'examples:problem:';

/**
 * Gets cached examples for a single tag slug, or queries DB and sets cache.
 * Key format: examples:tag:{slug}
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

  const examples = await getExamplesByTagSlugs([tagSlug], limit);
  if (examples.length > 0) {
    await cacheSet(cacheKey, JSON.stringify(examples));
  }
  return examples;
}

/**
 * Resolves multiple tags with cache-aside pattern.
 * Checks Redis for each tag; if missed, queries DB and populates Redis.
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

  const results = await getExamplesByTagSlugs(tagSlugs, limit);
  if (results.length > 0) {
    await cacheSet(combinedKey, JSON.stringify(results));
  }
  return results;
}

/**
 * Gets examples for a LeetCode problem by title_slug with caching.
 */
export async function getCachedExamplesByProblem(
  problemSlug: string,
  limit: number = 5
): Promise<{ problem: LeetCodeProblemItem | null; examples: CodeExampleResult[] }> {
  const cacheKey = `${PROBLEM_CACHE_PREFIX}${problemSlug.toLowerCase()}`;
  const cached = await cacheGet(cacheKey);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // ignore
    }
  }

  const data = await getExamplesByProblemSlug(problemSlug, limit);
  if (data.examples.length > 0 || data.problem) {
    await cacheSet(cacheKey, JSON.stringify(data));
  }
  return data;
}

/**
 * Invalidates tag caches on scan completion.
 * Requirement: invalidated on scan completion rather than waiting out the TTL.
 */
export async function invalidateExamplesCache(tagSlug?: string): Promise<number> {
  if (tagSlug) {
    const count1 = await cacheDelPattern(`${CACHE_PREFIX}${tagSlug.toLowerCase()}*`);
    const count2 = await cacheDelPattern(`${PROBLEM_CACHE_PREFIX}*`);
    return count1 + count2;
  }
  const countTag = await cacheDelPattern(`${CACHE_PREFIX}*`);
  const countProb = await cacheDelPattern(`${PROBLEM_CACHE_PREFIX}*`);
  console.log(`[Cache] Invalidated ${countTag + countProb} example cache entries.`);
  return countTag + countProb;
}
