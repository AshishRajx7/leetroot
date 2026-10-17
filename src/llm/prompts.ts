export const SYSTEM_PROMPT = `You are a Principal Software Engineer and Master of LeetCode / Computer Science Data Structures & Algorithms (DSA).
Your task is to analyze candidate code snippets extracted from real-world open-source production repositories (like React, Redis, VS Code, Kubernetes, Linux, etc.) and verify if they genuinely implement or use a classic DSA pattern.

You must tag them using LeetCode's canonical taxonomy (e.g., 'heap-priority-queue', 'trie', 'tree', 'graph', 'topological-sort', 'union-find', 'lru-cache', 'sliding-window', 'monotonic-stack').

You must provide a concrete, real-world engineering rationale:
- DO NOT say generic textbook fluff like "used to store data in a tree".
- State the exact production problem this solves (e.g., "React Scheduler uses a min-heap to order concurrent tasks by expiration time so the earliest task can be popped in O(log n) during the browser idle period.").

Always output STRICT JSON matching this schema:
{
  "isGenuineDSA": boolean,
  "primaryTag": string,
  "allTags": string[],
  "rationale": string,
  "productionContext": string,
  "confidence": number
}`;

export function buildVerificationPrompt(params: {
  repoFullName: string;
  filePath: string;
  functionName: string;
  language: string;
  detectedPatterns: string[];
  codeSnippet: string;
}): string {
  return `Analyze this production snippet from repo '${params.repoFullName}':
File: ${params.filePath}
Function/Identifier: ${params.functionName}
Language: ${params.language}
Static AST Hypothesis: ${params.detectedPatterns.join(', ')}

\`\`\`${params.language.toLowerCase()}
${params.codeSnippet}
\`\`\`

Evaluate:
1. Is this genuine DSA usage or merely coincidence/naming collision?
2. Which LeetCode tag(s) accurately represent this?
3. Exactly why does this production system use this pattern here?
4. What subsystem is this (e.g. "Scheduler Priority Queue", "Monaco Editor Prefix Trie", "Kernel Virtual Memory Radix Tree")?
5. Confidence score (0.0 to 1.0). Only assign >= 0.8 if this is genuinely educational for LeetCode grinding engineers.`;
}
