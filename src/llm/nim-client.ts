import OpenAI from 'openai';
import { config } from '../config/env';
import { SYSTEM_PROMPT, buildVerificationPrompt } from './prompts';

/**
 * Standard verification state transitions
 */
export enum VerificationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  FAILED_TRANSIENT = 'FAILED_TRANSIENT',
  FAILED_PERMANENT = 'FAILED_PERMANENT',
}

export interface NIMVerificationResult {
  status: VerificationStatus;
  isGenuineDSA: boolean;
  primaryTag: string;
  allTags: string[];
  rationale: string;
  productionContext: string;
  confidence: number;
  error?: string;
  errorCode?: string;
}

export interface VerificationParams {
  repoFullName: string;
  filePath: string;
  functionName: string;
  language: string;
  detectedPatterns: string[];
  codeSnippet: string;
}

let openaiClient: OpenAI | null = null;
let cachedApiKey: string | null = null;
let cachedBaseURL: string | null = null;
let testMockClient: any = null;

export function getClient(): OpenAI | null {
  const currentKey = config.nim.apiKey?.trim();
  const currentBaseURL = config.nim.baseURL;

  // If credentials are unset, empty, or placeholder, invalidate any cached client and return null
  if (!currentKey || currentKey.includes('replace-with-yours')) {
    openaiClient = null;
    cachedApiKey = null;
    cachedBaseURL = null;
    return null;
  }

  // If credentials or baseURL changed, invalidate existing client and reinitialize
  if (!openaiClient || cachedApiKey !== currentKey || cachedBaseURL !== currentBaseURL) {
    openaiClient = new OpenAI({
      apiKey: currentKey,
      baseURL: currentBaseURL,
    });
    cachedApiKey = currentKey;
    cachedBaseURL = currentBaseURL;
  }

  return openaiClient;
}

/**
 * Reset cached OpenAI client state (useful in tests for credential rotation)
 */
export function resetClientForTesting(): void {
  openaiClient = null;
  cachedApiKey = null;
  cachedBaseURL = null;
}

/**
 * Explicitly inject a mock OpenAI client for testing purposes only.
 * Production configuration strictly prohibits mock injection.
 */
export function setMockClientForTesting(mockClient: any): void {
  if (config.nodeEnv === 'production') {
    throw new Error('Security violation: Mock verification client cannot be injected in production');
  }
  testMockClient = mockClient;
}

export function resetMockClientForTesting(): void {
  testMockClient = null;
}

function validateVerificationPayload(parsed: any): {
  valid: boolean;
  error?: string;
  data?: {
    isGenuineDSA: boolean;
    primaryTag: string;
    allTags: string[];
    rationale: string;
    productionContext: string;
    confidence: number;
  };
} {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, error: 'Response payload must be a JSON object' };
  }

  if (typeof parsed.isGenuineDSA !== 'boolean') {
    return { valid: false, error: 'Missing or invalid boolean field: isGenuineDSA' };
  }

  if (typeof parsed.primaryTag !== 'string' || !parsed.primaryTag.trim()) {
    return { valid: false, error: 'Missing or empty string field: primaryTag' };
  }

  if (!Array.isArray(parsed.allTags) || !parsed.allTags.every((t: any) => typeof t === 'string')) {
    return { valid: false, error: 'Missing or invalid array of strings: allTags' };
  }

  if (typeof parsed.rationale !== 'string' || !parsed.rationale.trim()) {
    return { valid: false, error: 'Missing or empty string field: rationale' };
  }

  if (typeof parsed.confidence !== 'number' || isNaN(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1) {
    return { valid: false, error: 'Missing or out-of-range number field (0.0 to 1.0): confidence' };
  }

  const productionContext = typeof parsed.productionContext === 'string' ? parsed.productionContext.trim() : '';

  return {
    valid: true,
    data: {
      isGenuineDSA: parsed.isGenuineDSA,
      primaryTag: parsed.primaryTag.trim(),
      allTags: parsed.allTags.map((t: string) => t.trim()),
      rationale: parsed.rationale.trim(),
      productionContext,
      confidence: parsed.confidence,
    },
  };
}

function classifyError(error: any): { status: VerificationStatus; errorCode: string; message: string } {
  const message = error?.message || 'Unknown verification error';
  const status = error?.status;
  const code = error?.code;
  const name = error?.name;

  // Transient network errors
  if (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN'
  ) {
    return { status: VerificationStatus.FAILED_TRANSIENT, errorCode: code, message };
  }

  // Timeout errors
  if (name === 'AbortError' || name === 'TimeoutError' || message.toLowerCase().includes('timeout')) {
    return { status: VerificationStatus.FAILED_TRANSIENT, errorCode: 'TIMEOUT', message };
  }

  // HTTP status codes
  if (status === 429) {
    return { status: VerificationStatus.FAILED_TRANSIENT, errorCode: 'RATE_LIMIT_EXCEEDED', message };
  }

  if (status >= 500 && status <= 599) {
    return { status: VerificationStatus.FAILED_TRANSIENT, errorCode: `HTTP_${status}`, message };
  }

  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return { status: VerificationStatus.FAILED_PERMANENT, errorCode: `HTTP_${status}`, message };
  }

  return { status: VerificationStatus.FAILED_PERMANENT, errorCode: code || 'UNKNOWN_ERROR', message };
}

/**
 * Calls NVIDIA NIM API to verify a candidate DSA code snippet.
 * Rate-limited to 40 RPM via BullMQ.
 * Strict fail-closed semantics: failures NEVER produce VERIFIED or isGenuineDSA: true.
 */
export async function verifySnippetWithNIM(
  params: VerificationParams
): Promise<NIMVerificationResult> {
  // Production isolation: NEVER use testMockClient when config.nodeEnv === 'production'
  let client = config.nodeEnv === 'production' ? null : testMockClient;

  // Otherwise, use real OpenAI client configured with NIM credentials
  if (!client) {
    client = getClient();
  }

  // If no credentials and no mock client is explicitly injected, fail permanently closed
  if (!client) {
    return {
      status: VerificationStatus.FAILED_PERMANENT,
      isGenuineDSA: false,
      primaryTag: params.detectedPatterns[0] || 'algorithms',
      allTags: params.detectedPatterns,
      rationale: '',
      productionContext: '',
      confidence: 0,
      error: 'NVIDIA NIM API key is not configured or uses placeholder value',
      errorCode: 'MISSING_CREDENTIALS',
    };
  }

  try {
    const prompt = buildVerificationPrompt(params);

    const completion = await client.chat.completions.create({
      model: config.nim.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const rawContent = completion.choices?.[0]?.message?.content;
    if (!rawContent || typeof rawContent !== 'string') {
      return {
        status: VerificationStatus.FAILED_PERMANENT,
        isGenuineDSA: false,
        primaryTag: params.detectedPatterns[0] || 'algorithms',
        allTags: params.detectedPatterns,
        rationale: '',
        productionContext: '',
        confidence: 0,
        error: 'NVIDIA NIM returned empty response content',
        errorCode: 'EMPTY_RESPONSE',
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch (parseError: any) {
      return {
        status: VerificationStatus.FAILED_PERMANENT,
        isGenuineDSA: false,
        primaryTag: params.detectedPatterns[0] || 'algorithms',
        allTags: params.detectedPatterns,
        rationale: '',
        productionContext: '',
        confidence: 0,
        error: `Malformed JSON from NVIDIA NIM: ${parseError.message}`,
        errorCode: 'MALFORMED_JSON',
      };
    }

    const validation = validateVerificationPayload(parsed);
    if (!validation.valid || !validation.data) {
      return {
        status: VerificationStatus.FAILED_PERMANENT,
        isGenuineDSA: false,
        primaryTag: params.detectedPatterns[0] || 'algorithms',
        allTags: params.detectedPatterns,
        rationale: '',
        productionContext: '',
        confidence: 0,
        error: `Schema validation failed: ${validation.error}`,
        errorCode: 'INVALID_SCHEMA',
      };
    }

    const { isGenuineDSA, primaryTag, allTags, rationale, productionContext, confidence } = validation.data;

    // Genuine DSA verification requires model confirmation AND confidence >= 0.7
    if (isGenuineDSA && confidence >= 0.7) {
      return {
        status: VerificationStatus.VERIFIED,
        isGenuineDSA: true,
        primaryTag,
        allTags,
        rationale,
        productionContext: productionContext || `${params.repoFullName} Subsystem`,
        confidence,
      };
    } else {
      return {
        status: VerificationStatus.REJECTED,
        isGenuineDSA: false,
        primaryTag,
        allTags,
        rationale,
        productionContext: productionContext || `${params.repoFullName} Subsystem`,
        confidence,
      };
    }
  } catch (error: any) {
    const classified = classifyError(error);
    return {
      status: classified.status,
      isGenuineDSA: false,
      primaryTag: params.detectedPatterns[0] || 'algorithms',
      allTags: params.detectedPatterns,
      rationale: '',
      productionContext: '',
      confidence: 0,
      error: classified.message,
      errorCode: classified.errorCode,
    };
  }
}
