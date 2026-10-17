import { Worker, Job } from 'bullmq';
import axios from 'axios';
import { config } from '../../config/env';
import { getIsRedisConnected } from '../../redis/client';
import { QUEUE_NAMES, RepoScanJobData, QueueManager } from '../queue-manager';
import { CURATED_REPOS } from '../../config/curated-repos';
import { scanFileContent } from '../../parser/tree-sitter';
import {
  upsertRepo,
  insertScan,
  updateScan,
} from '../../db/queries';

export async function processScanJob(data: RepoScanJobData): Promise<{
  candidatesCount: number;
}> {
  const repoMeta = CURATED_REPOS.find((r) => r.fullName === data.repoFullName) || {
    name: data.repoFullName.split('/')[1] || data.repoFullName,
    fullName: data.repoFullName,
    url: `https://github.com/${data.repoFullName}`,
    defaultBranch: 'main',
    language: 'TypeScript',
    stars: 1000,
    description: 'Repository',
    samplePaths: [],
    targetPatterns: [],
  };

  const repoId = await upsertRepo({
    name: repoMeta.name,
    fullName: repoMeta.fullName,
    url: repoMeta.url,
    defaultBranch: repoMeta.defaultBranch,
    language: repoMeta.language,
    stars: repoMeta.stars,
    description: repoMeta.description,
  });

  const scanId = await insertScan({
    repoId,
    status: 'running',
  });

  console.log(`[Scan Worker] Starting scan for ${repoMeta.fullName} (Scan ID: ${scanId})`);

  let totalCandidates = 0;
  const queueManager = QueueManager.getInstance();

  try {
    // Scan sample target paths or fetch repository files via GitHub Raw / API
    for (const filePath of repoMeta.samplePaths) {
      try {
        const rawUrl = `https://raw.githubusercontent.com/${repoMeta.fullName}/${repoMeta.defaultBranch}/${filePath}`;
        const headers: Record<string, string> = {};
        if (config.github.token) {
          headers['Authorization'] = `token ${config.github.token}`;
        }

        const res = await axios.get(rawUrl, {
          headers,
          timeout: 8000,
          responseType: 'text',
        });

        const fileContent = res.data;
        if (typeof fileContent === 'string' && fileContent.length > 0) {
          const candidates = scanFileContent(
            filePath,
            fileContent,
            repoMeta.url,
            repoMeta.defaultBranch
          );

          totalCandidates += candidates.length;

          for (const cand of candidates) {
            await queueManager.addLLMVerifyJob({
              repoFullName: repoMeta.fullName,
              repoId,
              scanId,
              candidate: cand,
            });
          }
        }
      } catch (err: any) {
        console.warn(`[Scan Worker] Note: Could not fetch ${filePath} directly (${err.message})`);
      }
    }

    await updateScan(scanId, {
      status: 'completed',
      candidatesFound: totalCandidates,
    });

    console.log(`[Scan Worker] Completed scan for ${repoMeta.fullName}. Found ${totalCandidates} candidates queued for NIM verification.`);
    return { candidatesCount: totalCandidates };
  } catch (err: any) {
    console.error(`[Scan Worker] Failed scan for ${repoMeta.fullName}:`, err.message);
    await updateScan(scanId, {
      status: 'failed',
      errorMessage: err.message,
    });
    return { candidatesCount: 0 };
  }
}

export function startScanWorker(): Worker | null {
  if (!getIsRedisConnected()) return null;

  const worker = new Worker<RepoScanJobData>(
    QUEUE_NAMES.REPO_SCAN,
    async (job: Job<RepoScanJobData>) => {
      return await processScanJob(job.data);
    },
    {
      connection: { url: config.redis.url },
      concurrency: 2, // Slow scheduled background scans
    }
  );

  console.log('[BullMQ] Started repo-scan worker');
  return worker;
}
