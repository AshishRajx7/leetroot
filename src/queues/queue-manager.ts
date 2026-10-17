import { Queue, Worker, QueueEvents } from 'bullmq';
import { config } from '../config/env';
import { getIsRedisConnected, getRedisClient } from '../redis/client';
import { CandidateSnippet } from '../parser/tree-sitter';

export const QUEUE_NAMES = {
  REPO_SCAN: 'repo-scan',
  LLM_VERIFY: 'llm-verify',
  PROBLEM_SYNC: 'problem-sync',
} as const;

export interface RepoScanJobData {
  repoFullName: string;
  forceRescan?: boolean;
}

export interface LLMVerifyJobData {
  repoFullName: string;
  repoId: number;
  scanId: number;
  candidate: CandidateSnippet;
}

export interface ProblemSyncJobData {
  limit?: number;
}

export class QueueManager {
  private static instance: QueueManager;
  public scanQueue: Queue | null = null;
  public verifyQueue: Queue | null = null;
  public syncQueue: Queue | null = null;

  private constructor() {
    this.initQueues();
  }

  public static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  public initQueues(): void {
    if (getIsRedisConnected()) {
      const redisConnection = {
        url: config.redis.url,
      };

      this.scanQueue = new Queue(QUEUE_NAMES.REPO_SCAN, {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
        },
      });

      this.verifyQueue = new Queue(QUEUE_NAMES.LLM_VERIFY, {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: 500,
        },
      });

      this.syncQueue = new Queue(QUEUE_NAMES.PROBLEM_SYNC, {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'fixed', delay: 10000 },
          removeOnComplete: 50,
        },
      });

      console.log('[BullMQ] Initialized all 3 queues with Redis backend');
    } else {
      console.log('[BullMQ] Running in Direct Mode (Redis disconnected, tasks dispatch asynchronously in-process)');
    }
  }

  public async addRepoScanJob(data: RepoScanJobData): Promise<string> {
    if (this.scanQueue) {
      const job = await this.scanQueue.add('scan', data);
      return job.id || 'job-id';
    }
    // Fallback direct dispatch
    setTimeout(async () => {
      const { processScanJob } = await import('./workers/scan-worker');
      await processScanJob(data);
    }, 100);
    return `local-scan-${Date.now()}`;
  }

  public async addLLMVerifyJob(data: LLMVerifyJobData): Promise<string> {
    if (this.verifyQueue) {
      const job = await this.verifyQueue.add('verify', data);
      return job.id || 'job-id';
    }
    // Fallback direct dispatch
    setTimeout(async () => {
      const { processVerifyJob } = await import('./workers/verify-worker');
      await processVerifyJob(data);
    }, 50);
    return `local-verify-${Date.now()}`;
  }

  public async addProblemSyncJob(data: ProblemSyncJobData = {}): Promise<string> {
    if (this.syncQueue) {
      const job = await this.syncQueue.add('sync', data);
      return job.id || 'job-id';
    }
    // Fallback direct dispatch
    setTimeout(async () => {
      const { processSyncJob } = await import('./workers/sync-worker');
      await processSyncJob(data);
    }, 100);
    return `local-sync-${Date.now()}`;
  }
}
