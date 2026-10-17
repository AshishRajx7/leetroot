export interface ExtractedSnippet {
  functionName: string;
  codeSnippet: string;
  startLine: number;
  endLine: number;
  sourceUrl: string;
  lineCount: number;
}

export function extractSnippetBounds(
  fileContent: string,
  targetLine: number, // 1-indexed
  repoUrl: string,
  defaultBranch: string,
  filePath: string,
  maxLines: number = 40
): ExtractedSnippet {
  const lines = fileContent.split('\n');
  const totalLines = lines.length;
  const zeroIndex = Math.max(0, targetLine - 1);

  // Find enclosing function/block header by scanning upwards from targetLine
  let startIdx = zeroIndex;
  let endIdx = zeroIndex;
  let functionName = 'anonymous';

  // Look up to 25 lines backwards for function/class/method signature
  const funcRegex = /(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:function|\(.*?\)\s*=>)|def\s+([a-zA-Z0-9_$]+)|func\s+(?:\(.*?\)\s*)?([a-zA-Z0-9_$]+)|(?:public|private|static)?\s*(?:[a-zA-Z0-9_<>[\]*&]+\s+)+([a-zA-Z0-9_$]+)\s*\()/;
  
  for (let i = zeroIndex; i >= Math.max(0, zeroIndex - 25); i--) {
    const match = lines[i].match(funcRegex);
    if (match) {
      functionName = match[1] || match[2] || match[3] || match[4] || match[5] || 'function';
      startIdx = i;
      break;
    }
  }

  // Count braces or indent to estimate block end, or cap at maxLines
  let openBraces = 0;
  let foundBrace = false;
  for (let i = startIdx; i < Math.min(totalLines, startIdx + maxLines + 10); i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') {
        openBraces++;
        foundBrace = true;
      } else if (ch === '}') {
        openBraces--;
      }
    }

    if (foundBrace && openBraces <= 0 && i > startIdx) {
      endIdx = i;
      break;
    }
    endIdx = i;
    if (endIdx - startIdx >= maxLines - 1) {
      break;
    }
  }

  // Strictly enforce maxLines cap (~40 lines)
  if (endIdx - startIdx + 1 > maxLines) {
    endIdx = startIdx + maxLines - 1;
  }

  const snippetLines = lines.slice(startIdx, endIdx + 1);
  const codeSnippet = snippetLines.join('\n');
  const startLine = startIdx + 1;
  const endLine = endIdx + 1;

  // Build GitHub source URL
  const cleanRepoUrl = repoUrl.replace(/\/$/, '');
  const cleanBranch = defaultBranch || 'main';
  const cleanPath = filePath.replace(/^\//, '');
  const sourceUrl = `${cleanRepoUrl}/blob/${cleanBranch}/${cleanPath}#L${startLine}-L${endLine}`;

  return {
    functionName,
    codeSnippet,
    startLine,
    endLine,
    sourceUrl,
    lineCount: snippetLines.length,
  };
}
