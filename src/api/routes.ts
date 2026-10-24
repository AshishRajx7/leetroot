import { Router, Request, Response } from 'express';
import {
  getCachedExamplesByTags,
  getCachedExamplesByProblem,
} from '../redis/cache';
import {
  getAllTags,
  getExamplesByProblemSlug,
  getStats,
} from '../db/queries';
import { QueueManager } from '../queues/queue-manager';
import { CURATED_REPOS } from '../config/curated-repos';
import { getIsPostgresConnected } from '../db/db';
import { getIsRedisConnected } from '../redis/client';

export const apiRouter = Router();
export const apiV1Router = Router();

/**
 * Format error responses: sanitize exception details in production to prevent leaking internals.
 */
export function formatErrorResponse(genericMessage: string, err: any): { error: string; details?: string } {
  if (process.env.NODE_ENV === 'production') {
    return { error: genericMessage };
  }
  return { error: genericMessage, details: err?.message || String(err) };
}

// =============================================================
// API V1 CANONICAL ENDPOINTS (Read-Only Examples API)
// =============================================================

/**
 * GET /api/v1/problems/:slug/examples
 * Canonical read-only verified examples endpoint.
 *
 * Requirements:
 * - Resolve problem by slug.
 * - Return verified examples only.
 * - Return up to five canonical examples per tag.
 * - Accept requested limit from 1 through 5; reject invalid limits with 400.
 * - Handle unknown slugs with 404, empty results with 200 { count: 0, examples: [] }.
 */
apiV1Router.get('/problems/:slug/examples', async (req: Request, res: Response) => {
  try {
    const rawSlug = req.params.slug;
    const slug = (typeof rawSlug === 'string' ? rawSlug : String(rawSlug || '')).trim().toLowerCase();
    if (!slug) {
      res.status(400).json({ error: 'Missing problem slug parameter' });
      return;
    }

    // Validate limit parameter: must be integer 1 to 5 if provided
    let limit = 5;
    if (req.query.limit !== undefined) {
      const parsed = Number(req.query.limit);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
        res.status(400).json({
          error: 'Invalid limit parameter. Must be an integer between 1 and 5.',
          providedLimit: req.query.limit,
        });
        return;
      }
      limit = parsed;
    }

    // Query canonical verified examples via Redis cache-aside
    const result = await getCachedExamplesByProblem(slug, limit);

    if (!result.problem) {
      res.status(404).json({
        error: `Problem not found: ${slug}`,
        slug,
      });
      return;
    }

    res.json({
      problem: {
        id: result.problem.id,
        frontendQuestionId: result.problem.frontendQuestionId,
        title: result.problem.title,
        slug: result.problem.titleSlug,
        difficulty: result.problem.difficulty,
        isPaidOnly: result.problem.isPaidOnly,
        url: result.problem.url,
        tags: (result.problem.tags || []).map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
        })),
      },
      count: result.examples.length,
      limit,
      examples: result.examples,
    });
  } catch (err: any) {
    console.error('Error in GET /api/v1/problems/:slug/examples:', err);
    res.status(500).json(formatErrorResponse('Internal server error', err));
  }
});

// =============================================================
// LEGACY / UTILITY API ROUTES (/api)
// =============================================================

/**
 * Health check endpoint reporting Postgres & Redis connectivity
 */
apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    postgresConnected: getIsPostgresConnected(),
    redisConnected: getIsRedisConnected(),
    version: '1.0.0',
  });
});

/**
 * High-performance endpoint for Phase 3 LeetCode extension.
 * Filtered by LeetCode tag slugs.
 * Example: GET /api/examples/by-tag?tags=heap-priority-queue,trie&limit=5
 */
apiRouter.get('/examples/by-tag', async (req: Request, res: Response) => {
  try {
    const rawTags = (req.query.tags as string) || '';
    const limit = Math.min(10, Math.max(1, parseInt((req.query.limit as string) || '5', 10)));

    if (!rawTags.trim()) {
      res.status(400).json({ error: 'Missing tags query parameter. Example: ?tags=heap-priority-queue' });
      return;
    }

    const tagSlugs = rawTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const examples = await getCachedExamplesByTags(tagSlugs, limit);
    res.json({
      tags: tagSlugs,
      count: examples.length,
      examples,
    });
  } catch (err: any) {
    console.error('Error in /examples/by-tag:', err);
    res.status(500).json(formatErrorResponse('Internal server error', err));
  }
});

/**
 * Convenience endpoint for Phase 3 extension: query by LeetCode problem title_slug.
 * Automatically resolves problem -> tags -> cached real-world production examples.
 * Example: GET /api/examples/by-problem?slug=merge-k-sorted-lists&limit=5
 */
apiRouter.get('/examples/by-problem', async (req: Request, res: Response) => {
  try {
    const slug = ((req.query.slug as string) || '').trim().toLowerCase();
    const limit = Math.min(10, Math.max(1, parseInt((req.query.limit as string) || '5', 10)));

    if (!slug) {
      res.status(400).json({ error: 'Missing slug query parameter. Example: ?slug=merge-k-sorted-lists' });
      return;
    }

    const result = await getCachedExamplesByProblem(slug, limit);
    res.json({
      problemSlug: slug,
      problem: result.problem,
      count: result.examples.length,
      examples: result.examples,
    });
  } catch (err: any) {
    console.error('Error in /examples/by-problem:', err);
    res.status(500).json(formatErrorResponse('Internal server error', err));
  }
});

/**
 * List all available LeetCode tags with verified example counts
 */
apiRouter.get('/tags', async (req: Request, res: Response) => {
  try {
    const tags = await getAllTags();
    res.json({
      count: tags.length,
      tags,
    });
  } catch (err: any) {
    res.status(500).json(formatErrorResponse('Internal server error', err));
  }
});

/**
 * Get problem metadata by slug
 */
apiRouter.get('/problems/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    const data = await getExamplesByProblemSlug(slug, 5);
    if (!data.problem) {
      res.status(404).json({ error: 'Problem not found in catalog' });
      return;
    }
    res.json(data);
  } catch (err: any) {
    res.status(500).json(formatErrorResponse('Internal server error', err));
  }
});

/**
 * Overall system statistics
 */
apiRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getStats();
    res.json({
      stats,
      curatedReposCount: CURATED_REPOS.length,
      curatedRepos: CURATED_REPOS.map((r) => ({
        fullName: r.fullName,
        language: r.language,
        stars: r.stars,
        targetPatterns: r.targetPatterns,
      })),
    });
  } catch (err: any) {
    res.status(500).json(formatErrorResponse('Internal server error', err));
  }
});

/**
 * Trigger repo scan job
 */
apiRouter.post('/scans/trigger', async (req: Request, res: Response) => {
  try {
    const repoFullName = req.body?.repoFullName || 'facebook/react';
    const queueManager = QueueManager.getInstance();
    const jobId = await queueManager.addRepoScanJob({ repoFullName });

    res.json({
      message: `Repo scan triggered for ${repoFullName}`,
      jobId,
    });
  } catch (err: any) {
    res.status(500).json(formatErrorResponse('Failed to queue scan', err));
  }
});

/**
 * Trigger LeetCode problem catalog sync
 */
apiRouter.post('/sync/trigger', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.body?.limit || '50', 10);
    const queueManager = QueueManager.getInstance();
    const jobId = await queueManager.addProblemSyncJob({ limit });

    res.json({
      message: `LeetCode sync triggered for ${limit} problems`,
      jobId,
    });
  } catch (err: any) {
    res.status(500).json(formatErrorResponse('Failed to queue sync', err));
  }
});
