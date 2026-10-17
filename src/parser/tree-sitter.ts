import { SUPPORTED_PATTERNS, PatternDefinition } from './patterns';
import { extractSnippetBounds, ExtractedSnippet } from './snippet-extractor';

export interface CandidateSnippet {
  filePath: string;
  language: string;
  functionName: string;
  codeSnippet: string;
  startLine: number;
  endLine: number;
  sourceUrl: string;
  detectedPatterns: string[];
  heuristicConfidence: number;
}

export function detectLanguageFromExtension(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'TypeScript';
    case 'js':
    case 'jsx':
    case 'mjs':
      return 'JavaScript';
    case 'py':
      return 'Python';
    case 'go':
      return 'Go';
    case 'c':
    case 'h':
      return 'C';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
      return 'C++';
    case 'java':
      return 'Java';
    case 'rs':
      return 'Rust';
    default:
      return 'Unknown';
  }
}

/**
 * Scans a file's content using AST structural patterns and heuristic rules.
 * Flags candidate snippets for NVIDIA NIM verification.
 */
export function scanFileContent(
  filePath: string,
  content: string,
  repoUrl: string,
  defaultBranch: string = 'main'
): CandidateSnippet[] {
  const language = detectLanguageFromExtension(filePath);
  if (language === 'Unknown') return [];

  const lines = content.split('\n');
  const candidates: CandidateSnippet[] = [];
  const processedRanges = new Set<string>();

  for (const pattern of SUPPORTED_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check keyword signals
      let hasKeyword = false;
      for (const kw of pattern.keywords) {
        if (line.toLowerCase().includes(kw.toLowerCase())) {
          hasKeyword = true;
          break;
        }
      }

      // Check structural signals
      let hasStructural = false;
      for (const sig of pattern.structuralSignals) {
        if (sig.test(line)) {
          hasStructural = true;
          break;
        }
      }

      if (hasKeyword || hasStructural) {
        const bounds = extractSnippetBounds(
          content,
          i + 1,
          repoUrl,
          defaultBranch,
          filePath,
          40
        );

        const rangeKey = `${bounds.startLine}-${bounds.endLine}`;
        if (processedRanges.has(rangeKey)) {
          // Already extracted, add pattern tag if not present
          const existing = candidates.find(
            (c) => c.startLine === bounds.startLine && c.endLine === bounds.endLine
          );
          if (existing && !existing.detectedPatterns.includes(pattern.tagSlug)) {
            existing.detectedPatterns.push(pattern.tagSlug);
            existing.heuristicConfidence = Math.min(1.0, existing.heuristicConfidence + 0.15);
          }
          continue;
        }

        processedRanges.add(rangeKey);

        const score = hasStructural && hasKeyword ? 0.9 : hasStructural ? 0.75 : 0.6;
        candidates.push({
          filePath,
          language,
          functionName: bounds.functionName,
          codeSnippet: bounds.codeSnippet,
          startLine: bounds.startLine,
          endLine: bounds.endLine,
          sourceUrl: bounds.sourceUrl,
          detectedPatterns: [pattern.tagSlug],
          heuristicConfidence: score,
        });

        // Fast forward search cursor past this snippet
        i = Math.min(lines.length - 1, bounds.endLine);
      }
    }
  }

  return candidates;
}
