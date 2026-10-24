import { Worker, Job } from 'bullmq';
import { config } from '../../config/env';
import { getIsRedisConnected } from '../../redis/client';
import { QUEUE_NAMES, RepoScanJobData, QueueManager } from '../queue-manager';
import { RepoDiscoveryService, IGitHubFetcher } from '../../scanner/repo-discovery';
import { scanFileContentAsync, scanFileContent } from '../../parser/tree-sitter';
import {
  upsertRepo,
  insertScan,
  updateScan,
} from '../../db/queries';

export async function processScanJob(
  data: RepoScanJobData,
  customFetcher?: IGitHubFetcher
): Promise<{
  candidatesCount: number;
  commitSha: string;
}> {
  const discoveryService = new RepoDiscoveryService(customFetcher);
  const repoMeta = discoveryService.getCuratedRepo(data.repoFullName);

  const repoId = await upsertRepo({
    name: repoMeta.name,
    fullName: repoMeta.fullName,
    url: repoMeta.url,
    defaultBranch: repoMeta.defaultBranch,
    language: repoMeta.language,
    stars: repoMeta.stars,
    description: repoMeta.description,
  });

  // Resolve immutable commit SHA
  let commitSha = 'main';
  try {
    commitSha = await discoveryService.resolveCommitSha(repoMeta.fullName, repoMeta.defaultBranch);
  } catch (err: any) {
    console.warn(`[Scan Worker] Note: Could not resolve commit SHA for ${repoMeta.fullName} (${err.message}). Using branch ref.`);
  }

  const scanId = await insertScan({
    repoId,
    status: 'running',
    commitHash: commitSha,
  });

  console.log(`[Scan Worker] Starting scan for ${repoMeta.fullName}@${commitSha.slice(0, 7)} (Scan ID: ${scanId})`);

  let totalCandidates = 0;
  const queueManager = QueueManager.getInstance();

  try {
    // Perform bounded file discovery
    let filesToScan: Array<{ path: string }> = [];
    try {
      filesToScan = await discoveryService.discoverFiles(repoMeta.fullName, commitSha, {
        maxFiles: 50,
      });
    } catch {
      // Fallback to samplePaths if git tree fails
      filesToScan = repoMeta.samplePaths.map((p) => ({ path: p }));
    }

    console.log(`[Scan Worker] Discovered ${filesToScan.length} eligible source files in ${repoMeta.fullName}`);

    for (const file of filesToScan) {
      try {
        const fileContent = await discoveryService.fetchFile(repoMeta.fullName, commitSha, file.path);
        if (typeof fileContent === 'string' && fileContent.length > 0) {
          // Parse using real Tree-sitter AST
          const candidates = await scanFileContentAsync(
            file.path,
            fileContent,
            repoMeta.url,
            commitSha
          );

          // If async found none or grammar wasn't loaded, try sync parser
          const effectiveCandidates = candidates.length > 0
            ? candidates
            : scanFileContent(file.path, fileContent, repoMeta.url, commitSha);

          totalCandidates += effectiveCandidates.length;

          for (const cand of effectiveCandidates) {
            await queueManager.addLLMVerifyJob({
              repoFullName: repoMeta.fullName,
              repoId,
              scanId,
              candidate: cand,
            });
          }
        }
      } catch (err: any) {
        console.warn(`[Scan Worker] Skipping ${file.path} (${err.message})`);
      }
    }

    await updateScan(scanId, {
      status: 'completed',
      candidatesFound: totalCandidates,
    });

    console.log(`[Scan Worker] Completed scan for ${repoMeta.fullName}. Found ${totalCandidates} candidates queued for verification.`);
    return { candidatesCount: totalCandidates, commitSha };
  } catch (err: any) {
    console.error(`[Scan Worker] Failed scan for ${repoMeta.fullName}:`, err.message);
    await updateScan(scanId, {
      status: 'failed',
      errorMessage: err.message,
    });
    return { candidatesCount: 0, commitSha };
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
      concurrency: 2,
    }
  );

  console.log('[BullMQ] Started repo-scan worker');
  return worker;
}
