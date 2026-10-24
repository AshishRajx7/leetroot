import { fetchLeetCodeProblems, LeetCodeApiProblem } from './api-client';
import { upsertProblem, upsertTag, linkProblemTag } from '../db/queries';
import { invalidateProblemCache } from '../redis/cache';

export async function syncLeetCodeCatalog(limit: number = 100): Promise<{
  syncedProblems: number;
  syncedTags: number;
}> {
  console.log(`[LeetCode Sync] Fetching problem metadata (limit ${limit})...`);
  const problems = await fetchLeetCodeProblems(limit);
  console.log(`[LeetCode Sync] Processing ${problems.length} problems...`);

  let problemCount = 0;
  const tagCache = new Map<string, number>();

  for (const prob of problems) {
    try {
      const problemId = await upsertProblem({
        frontendQuestionId: prob.frontendQuestionId,
        title: prob.title,
        titleSlug: prob.titleSlug,
        difficulty: prob.difficulty,
        isPaidOnly: prob.isPaidOnly,
        url: `https://leetcode.com/problems/${prob.titleSlug}/`,
      });

      for (const tag of prob.topicTags) {
        let tagId = tagCache.get(tag.slug);
        if (!tagId) {
          tagId = await upsertTag({
            name: tag.name,
            slug: tag.slug,
            category: 'LeetCode Topic',
            description: `LeetCode topic tag for ${tag.name}`,
          });
          tagCache.set(tag.slug, tagId);
        }

        await linkProblemTag(problemId, tagId);
      }
      // Invalidate cached problem entry so new/updated tags and examples are served immediately
      await invalidateProblemCache(prob.titleSlug);
      problemCount++;
    } catch (err: any) {
      console.warn(`[LeetCode Sync] Error syncing problem ${prob.titleSlug}:`, err.message);
    }
  }

  console.log(`[LeetCode Sync] Synced ${problemCount} problems and ${tagCache.size} unique tags.`);
  return {
    syncedProblems: problemCount,
    syncedTags: tagCache.size,
  };
}