import { Worker, Job } from 'bullmq';
import { config } from '../../config/env';
import { getIsRedisConnected } from '../../redis/client';
import { QUEUE_NAMES, ProblemSyncJobData } from '../queue-manager';
import { syncLeetCodeCatalog } from '../../leetcode/sync';

export async function processSyncJob(data: ProblemSyncJobData = {}): Promise<{
  syncedProblems: number;
  syncedTags: number;
}> {
  console.log('[Sync Worker] Running LeetCode catalog refresh...');
  const result = await syncLeetCodeCatalog(data.limit || 100);
  console.log(`[Sync Worker] Successfully synced ${result.syncedProblems} problems.`);
  return result;
}

export function startSyncWorker(): Worker | null {
  if (!getIsRedisConnected()) return null;

  const worker = new Worker<ProblemSyncJobData>(
    QUEUE_NAMES.PROBLEM_SYNC,
    async (job: Job<ProblemSyncJobData>) => {
      return await processSyncJob(job.data);
    },
    {
      connection: { url: config.redis.url },
      concurrency: 1,
    }
  );

  console.log('[BullMQ] Started problem-sync worker');
  return worker;
}
