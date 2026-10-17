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
    res.status(500).json({ error: 'Internal server error', details: err.message });
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
    res.status(500).json({ error: 'Internal server error', details: err.message });
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
    res.status(500).json({ error: 'Internal server error', details: err.message });
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
    res.status(500).json({ error: 'Internal server error', details: err.message });
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
    res.status(500).json({ error: 'Internal server error', details: err.message });
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
    res.status(500).json({ error: 'Failed to queue scan', details: err.message });
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
    res.status(500).json({ error: 'Failed to queue sync', details: err.message });
  }
});
