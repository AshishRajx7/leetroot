import Parser from 'web-tree-sitter';
import { TreeSitterManager, SUPPORTED_LANGUAGES, SupportedLanguageInfo } from './tree-sitter-manager';
import { extractSnippetBounds, ExtractedSnippet, AstNodeBounds } from './snippet-extractor';
import { SUPPORTED_PATTERNS, PatternDefinition } from './patterns';

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
  isTruncated?: boolean;
}

/**
 * Returns the detected language name from a file path.
 */
export function detectLanguageFromExtension(filePath: string): string {
  const manager = TreeSitterManager.getInstance();
  const info = manager.detectLanguage(filePath);
  return info ? info.displayName : 'Unknown';
}

/**
 * Initializes Tree-sitter and preloads core grammars.
 */
export async function initTreeSitter(): Promise<void> {
  const manager = TreeSitterManager.getInstance();
  await manager.init();
  // Preload common grammars
  for (const lang of ['javascript', 'typescript', 'python', 'c', 'cpp', 'java', 'go']) {
    await manager.getLanguage(lang).catch(() => null);
  }
}

/**
 * Traverses an AST node recursively to identify enclosing function/method declarations.
 */
function findEnclosingFunction(node: Parser.SyntaxNode | null): Parser.SyntaxNode | null {
  let curr = node;
  const functionNodeTypes = new Set([
    'function_declaration',
    'function_definition',
    'method_definition',
    'method_declaration',
    'arrow_function',
    'function_expression',
    'func_literal',
  ]);

  while (curr) {
    if (functionNodeTypes.has(curr.type)) {
      return curr;
    }
    curr = curr.parent;
  }
  return null;
}

/**
 * Extracts the function name from a function/method AST node.
 */
function extractFunctionNameFromNode(node: Parser.SyntaxNode): string {
  const nameNode = node.childForFieldName('name') || node.children.find((c) => c.type === 'identifier' || c.type === 'property_identifier');
  if (nameNode) return nameNode.text;

  // Check parent for variable assignment: const func = () => {}
  if (node.parent && (node.parent.type === 'variable_declarator' || node.parent.type === 'assignment_expression')) {
    const parentName = node.parent.childForFieldName('name') || node.parent.childForFieldName('left');
    if (parentName) return parentName.text;
  }

  return 'anonymous';
}

/**
 * Analyzes an AST to detect structural DSA patterns.
 */
export function analyzeAstForDsaPatterns(
  tree: Parser.Tree,
  filePath: string,
  content: string,
  repoUrl: string,
  commitOrBranch: string = 'main'
): CandidateSnippet[] {
  const candidates: CandidateSnippet[] = [];
  const processedRanges = new Set<string>();

  // Collect all function/method nodes in the AST
  const functionNodes: Parser.SyntaxNode[] = [];
  function collectFunctions(node: Parser.SyntaxNode) {
    const functionNodeTypes = new Set([
      'function_declaration',
      'function_definition',
      'method_definition',
      'method_declaration',
      'arrow_function',
      'function_expression',
    ]);
    if (functionNodeTypes.has(node.type)) {
      functionNodes.push(node);
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) collectFunctions(child);
    }
  }

  collectFunctions(tree.rootNode);

  // If the file has no functions, inspect the root node (e.g. script level)
  const targetNodes = functionNodes.length > 0 ? functionNodes : [tree.rootNode];

  for (const fNode of targetNodes) {
    const nodeText = fNode.text;
    const startLine = fNode.startPosition.row + 1;
    const endLine = fNode.endPosition.row + 1;
    const funcName = extractFunctionNameFromNode(fNode);

    const matchedPatterns: string[] = [];
    let bestConfidence = 0.5;

    for (const pattern of SUPPORTED_PATTERNS) {
      // 1. Keyword pre-filter
      const hasKeyword = pattern.keywords.some((kw) => nodeText.includes(kw));

      // 2. Structural AST signals
      const structuralMatches = pattern.structuralSignals.filter((signal) => signal.test(nodeText));

      if (hasKeyword && structuralMatches.length > 0) {
        matchedPatterns.push(pattern.tagSlug);
        bestConfidence = Math.min(0.95, 0.7 + structuralMatches.length * 0.1);
      } else if (structuralMatches.length >= 2) {
        matchedPatterns.push(pattern.tagSlug);
        bestConfidence = Math.min(0.9, 0.65 + structuralMatches.length * 0.1);
      }
    }

    if (matchedPatterns.length > 0) {
      const rangeKey = `${startLine}-${endLine}`;
      if (!processedRanges.has(rangeKey)) {
        processedRanges.add(rangeKey);

        const bounds: AstNodeBounds = {
          startLine,
          endLine,
          functionName: funcName,
        };

        const snippet = extractSnippetBounds(
          content,
          startLine,
          repoUrl,
          commitOrBranch,
          filePath,
          40,
          bounds
        );

        candidates.push({
          filePath,
          language: detectLanguageFromExtension(filePath),
          functionName: snippet.functionName,
          codeSnippet: snippet.codeSnippet,
          startLine: snippet.startLine,
          endLine: snippet.endLine,
          sourceUrl: snippet.sourceUrl,
          detectedPatterns: matchedPatterns,
          heuristicConfidence: bestConfidence,
          isTruncated: snippet.isTruncated,
        });
      }
    }
  }

  return candidates;
}

/**
 * Scans a file's content asynchronously using real Tree-sitter language grammars.
 * Produces candidate snippets with commit-pinned GitHub permalinks.
 */
export async function scanFileContentAsync(
  filePath: string,
  content: string,
  repoUrl: string,
  commitOrBranch: string = 'main'
): Promise<CandidateSnippet[]> {
  const manager = TreeSitterManager.getInstance();
  const { tree, error } = await manager.parseSource(filePath, content);

  if (error || !tree) {
    return [];
  }

  return analyzeAstForDsaPatterns(tree, filePath, content, repoUrl, commitOrBranch);
}

/**
 * Synchronous scanner entry point.
 * Parses and extracts structural candidates using heuristic analysis aligned with Tree-sitter bounds.
 * Maintains complete signature compatibility with existing callers.
 */
export function scanFileContent(
  filePath: string,
  content: string,
  repoUrl: string,
  commitOrBranch: string = 'main'
): CandidateSnippet[] {
  const language = detectLanguageFromExtension(filePath);
  if (language === 'Unknown') return [];

  const lines = content.split('\n');
  const candidates: CandidateSnippet[] = [];
  const processedRanges = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of SUPPORTED_PATTERNS) {
      const keywordHit = pattern.keywords.some((kw) => line.includes(kw));
      const structuralHit = pattern.structuralSignals.some((sig) => sig.test(line));

      if (keywordHit || structuralHit) {
        const bounds = extractSnippetBounds(
          content,
          i + 1,
          repoUrl,
          commitOrBranch,
          filePath,
          40
        );

        const rangeKey = `${bounds.startLine}-${bounds.endLine}`;
        if (!processedRanges.has(rangeKey)) {
          processedRanges.add(rangeKey);

          candidates.push({
            filePath,
            language,
            functionName: bounds.functionName,
            codeSnippet: bounds.codeSnippet,
            startLine: bounds.startLine,
            endLine: bounds.endLine,
            sourceUrl: bounds.sourceUrl,
            detectedPatterns: [pattern.tagSlug],
            heuristicConfidence: keywordHit && structuralHit ? 0.9 : 0.75,
            isTruncated: bounds.isTruncated,
          });

          i = Math.min(lines.length - 1, bounds.endLine);
        }
      }
    }
  }

  return candidates;
}
