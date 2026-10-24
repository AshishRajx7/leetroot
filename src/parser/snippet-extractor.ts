export interface ExtractedSnippet {
  functionName: string;
  codeSnippet: string;
  startLine: number;
  endLine: number;
  sourceUrl: string;
  lineCount: number;
  isTruncated: boolean;
}

export interface AstNodeBounds {
  startLine: number; // 1-indexed
  endLine: number;   // 1-indexed
  functionName?: string;
}

/**
 * Extracts a candidate source snippet bounded at 40 lines maximum.
 * Avoids naive brace-counting; strictly respects AST node boundaries when available
 * and generates immutable commit-pinned GitHub permalinks with safe path encoding.
 */
export function extractSnippetBounds(
  fileContent: string,
  targetLine: number, // 1-indexed line where pattern was matched
  repoUrl: string,
  commitOrBranch: string,
  filePath: string,
  maxLines: number = 40,
  astNodeBounds?: AstNodeBounds
): ExtractedSnippet {
  const lines = fileContent.split('\n');
  const totalLines = lines.length;

  let startLine: number;
  let endLine: number;
  let functionName = astNodeBounds?.functionName || 'anonymous';
  let isTruncated = false;

  if (astNodeBounds && astNodeBounds.startLine >= 1 && astNodeBounds.endLine >= astNodeBounds.startLine) {
    const nodeStart = Math.max(1, Math.min(totalLines, astNodeBounds.startLine));
    const nodeEnd = Math.max(nodeStart, Math.min(totalLines, astNodeBounds.endLine));
    const nodeLineCount = nodeEnd - nodeStart + 1;

    if (nodeLineCount <= maxLines) {
      // Entire function/block fits within maxLines ceiling
      startLine = nodeStart;
      endLine = nodeEnd;
      isTruncated = false;
    } else {
      // Centered snippet window up to maxLines
      isTruncated = true;
      startLine = Math.max(nodeStart, targetLine - 5);
      endLine = Math.min(nodeEnd, startLine + maxLines - 1);

      // Re-align if end reached nodeEnd
      if (endLine - startLine + 1 < maxLines && startLine > nodeStart) {
        startLine = Math.max(nodeStart, endLine - maxLines + 1);
      }
    }
  } else {
    // Fallback: bounded window around targetLine without naive brace counting
    isTruncated = totalLines > maxLines;
    startLine = Math.max(1, targetLine - 5);
    endLine = Math.min(totalLines, startLine + maxLines - 1);

    // Look upwards for function name identifier
    const funcRegex = /(?:function\s+([a-zA-Z0-9_$]+)|def\s+([a-zA-Z0-9_$]+)|func\s+(?:\(.*?\)\s*)?([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=)/;
    for (let i = targetLine - 1; i >= Math.max(0, targetLine - 25); i--) {
      const match = lines[i]?.match(funcRegex);
      if (match) {
        functionName = match[1] || match[2] || match[3] || match[4] || functionName;
        break;
      }
    }
  }

  // Ensure strict enforcement of maxLines ceiling
  if (endLine - startLine + 1 > maxLines) {
    endLine = startLine + maxLines - 1;
    isTruncated = true;
  }

  const snippetLines = lines.slice(startLine - 1, endLine);
  const codeSnippet = snippetLines.join('\n');

  // Build immutable commit-pinned or branch-pinned GitHub source URL with safe segment encoding
  const cleanRepoUrl = repoUrl.replace(/\/$/, '');
  const cleanRef = commitOrBranch || 'main';
  const cleanPath = filePath.replace(/^\//, '');
  const encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');
  const sourceUrl = `${cleanRepoUrl}/blob/${cleanRef}/${encodedPath}#L${startLine}-L${endLine}`;

  return {
    functionName,
    codeSnippet,
    startLine,
    endLine,
    sourceUrl,
    lineCount: snippetLines.length,
    isTruncated,
  };
}
