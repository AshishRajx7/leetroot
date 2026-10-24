import { Worker, Job } from 'bullmq';
import { config } from '../../config/env';
import { getIsRedisConnected } from '../../redis/client';
import { QUEUE_NAMES, LLMVerifyJobData } from '../queue-manager';
import { verifySnippetWithNIM, VerificationStatus } from '../../llm/nim-client';
import {
  insertCodeExample,
  upsertTag,
  linkExampleTag,
  updateScan,
} from '../../db/queries';
import { invalidateExamplesCache } from '../../redis/cache';

export async function processVerifyJob(data: LLMVerifyJobData): Promise<{
  verified: boolean;
  status: VerificationStatus;
  exampleId?: number;
  error?: string;
}> {
  const { repoFullName, repoId, scanId, candidate } = data;

  console.log(`[LLM Verify] Verifying candidate in ${repoFullName}:${candidate.filePath} (hypotheses: ${candidate.detectedPatterns.join(', ')})`);

  const verification = await verifySnippetWithNIM({
    repoFullName,
    filePath: candidate.filePath,
    functionName: candidate.functionName,
    language: candidate.language,
    detectedPatterns: candidate.detectedPatterns,
    codeSnippet: candidate.codeSnippet,
  });

  if (verification.status === VerificationStatus.FAILED_TRANSIENT) {
    console.warn(`[LLM Verify] Transient verification failure for ${candidate.filePath}: ${verification.error}`);
    // Throw error so BullMQ can manage retry lifecycle
    throw new Error(`Transient verification failure: ${verification.error}`);
  }

  if (verification.status !== VerificationStatus.VERIFIED || !verification.isGenuineDSA || verification.confidence < 0.7) {
    console.log(`[LLM Verify] Candidate not verified (status: ${verification.status}, reason: ${verification.error || 'confidence < 0.7 or not genuine DSA'})`);
    return { verified: false, status: verification.status, error: verification.error };
  }

  // Insert verified code example (idempotent across duplicate verification jobs / retries)
  const exampleId = await insertCodeExample({
    repoId,
    scanId,
    filePath: candidate.filePath,
    functionName: candidate.functionName,
    language: candidate.language,
    codeSnippet: candidate.codeSnippet,
    startLine: candidate.startLine,
    endLine: candidate.endLine,
    sourceUrl: candidate.sourceUrl,
    rationale: verification.rationale,
    productionContext: verification.productionContext,
    confidenceScore: verification.confidence,
    isTruncated: candidate.isTruncated,
  });

  // Link all verified tags
  for (const tagSlug of verification.allTags) {
    const tagName = formatTagName(tagSlug);
    const tagId = await upsertTag({
      name: tagName,
      slug: tagSlug,
    });
    await linkExampleTag(exampleId, tagId);

    // Invalidate Redis cache immediately for this tag and affected problems so Phase 3 gets fresh data!
    await invalidateExamplesCache(tagSlug);
  }

  console.log(`[LLM Verify] Saved verified example #${exampleId} (${verification.allTags.join(', ')}) for ${repoFullName}`);
  return { verified: true, status: VerificationStatus.VERIFIED, exampleId };
}

function formatTagName(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function startVerifyWorker(): Worker | null {
  if (!getIsRedisConnected()) return null;

  // BullMQ Rate limiter: strictly 40 jobs per 60,000ms (NVIDIA NIM 40 RPM limit)
  const worker = new Worker<LLMVerifyJobData>(
    QUEUE_NAMES.LLM_VERIFY,
    async (job: Job<LLMVerifyJobData>) => {
      return await processVerifyJob(job.data);
    },
    {
      connection: { url: config.redis.url },
      concurrency: 1,
      limiter: {
        max: config.nim.rateLimitRpm, // 40
        duration: 60000,              // 60 seconds
      },
    }
  );

  worker.on('completed', (job) => {
    // console.log(`[LLM Verify Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[LLM Verify Worker] Job ${job?.id} failed:`, err.message);
  });

  console.log(`[BullMQ] Started llm-verify worker with rate limit ${config.nim.rateLimitRpm} RPM`);
  return worker;
}
