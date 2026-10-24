import { query, getIsPostgresConnected, inMemoryDb, getNextId } from './db';

export interface CodeExampleResult {
  id: number;
  filePath: string;
  functionName: string;
  language: string;
  codeSnippet: string;
  startLine: number;
  endLine: number;
  sourceUrl: string;
  rationale: string;
  productionContext: string;
  confidenceScore: number;
  isTruncated: boolean;
  repo: {
    name: string;
    fullName: string;
    url: string;
    stars: number;
  };
  tags: {
    name: string;
    slug: string;
  }[];
}

export interface LeetCodeTagItem {
  id: number;
  name: string;
  slug: string;
  category: string;
  description: string;
  exampleCount?: number;
}

export interface LeetCodeProblemItem {
  id: number;
  frontendQuestionId: number;
  title: string;
  titleSlug: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  url: string;
  tags: {
    id: number;
    name: string;
    slug: string;
  }[];
}

// -------------------------------------------------------------
// READ QUERIES (Phase 1 & Phase 3 Core Path)
// -------------------------------------------------------------

/**
 * Hot path for Phase 3 LeetCode browser extension.
 * O(log n) path via covering index on code_example_tags(leetcode_tag_id, code_example_id).
 * Always LIMIT 5 to keep payloads tiny and render instantly.
 */
export async function getExamplesByTagSlugs(
  tagSlugs: string[],
  limit: number = 5
): Promise<CodeExampleResult[]> {
  if (!tagSlugs || tagSlugs.length === 0) return [];

  if (getIsPostgresConnected()) {
    const sql = `
      SELECT 
        ce.id,
        ce.file_path AS "filePath",
        ce.function_name AS "functionName",
        ce.language,
        ce.code_snippet AS "codeSnippet",
        ce.start_line AS "startLine",
        ce.end_line AS "endLine",
        ce.source_url AS "sourceUrl",
        ce.rationale,
        ce.production_context AS "productionContext",
        ce.confidence_score::float AS "confidenceScore",
        COALESCE(ce.is_truncated, FALSE) AS "isTruncated",
        json_build_object(
          'name', r.name,
          'fullName', r.full_name,
          'url', r.url,
          'stars', r.stars
        ) AS repo,
        json_agg(DISTINCT jsonb_build_object('name', lt.name, 'slug', lt.slug)) AS tags
      FROM code_examples ce
      JOIN repos r ON r.id = ce.repo_id
      JOIN code_example_tags cet ON cet.code_example_id = ce.id
      JOIN leetcode_tags lt ON lt.id = cet.leetcode_tag_id
      WHERE lt.slug = ANY($1)
      GROUP BY ce.id, r.name, r.full_name, r.url, r.stars
      ORDER BY ce.confidence_score DESC, r.stars DESC
      LIMIT $2;
    `;
    const res = await query(sql, [tagSlugs, limit]);
    return res.rows;
  }

  // In-memory fallback
  const matchingTagIds = inMemoryDb.leetcode_tags
    .filter((t) => tagSlugs.includes(t.slug))
    .map((t) => t.id);

  if (matchingTagIds.length === 0) return [];

  const exampleIds = new Set<number>();
  for (const cet of inMemoryDb.code_example_tags) {
    if (matchingTagIds.includes(cet.leetcode_tag_id)) {
      exampleIds.add(cet.code_example_id);
    }
  }

  const examples = inMemoryDb.code_examples.filter((e) => exampleIds.has(e.id));
  
  const results: CodeExampleResult[] = examples.map((e) => {
    const repo = inMemoryDb.repos.find((r) => r.id === e.repo_id) || {
      name: 'repo',
      full_name: 'repo/repo',
      url: 'https://github.com',
      stars: 0,
    };
    const tagLinks = inMemoryDb.code_example_tags.filter((cet) => cet.code_example_id === e.id);
    const tags = tagLinks
      .map((tl) => inMemoryDb.leetcode_tags.find((t) => t.id === tl.leetcode_tag_id))
      .filter(Boolean)
      .map((t) => ({ name: t.name, slug: t.slug }));

    return {
      id: e.id,
      filePath: e.file_path,
      functionName: e.function_name,
      language: e.language,
      codeSnippet: e.code_snippet,
      startLine: e.start_line,
      endLine: e.end_line,
      sourceUrl: e.source_url,
      rationale: e.rationale,
      productionContext: e.production_context,
      confidenceScore: parseFloat(e.confidence_score || '1.0'),
      isTruncated: Boolean(e.is_truncated),
      repo: {
        name: repo.name,
        fullName: repo.full_name,
        url: repo.url,
        stars: repo.stars || 0,
      },
      tags,
    };
  });

  return results
    .sort((a, b) => b.confidenceScore - a.confidenceScore || b.repo.stars - a.repo.stars)
    .slice(0, limit);
}

/**
 * Looks up problem by slug, extracts its tags, and returns top real-world examples
 */
export async function getExamplesByProblemSlug(
  problemSlug: string,
  limit: number = 5
): Promise<{ problem: LeetCodeProblemItem | null; examples: CodeExampleResult[] }> {
  let problem: LeetCodeProblemItem | null = null;

  if (getIsPostgresConnected()) {
    const probSql = `
      SELECT 
        lp.id,
        lp.frontend_question_id AS "frontendQuestionId",
        lp.title,
        lp.title_slug AS "titleSlug",
        lp.difficulty,
        lp.is_paid_only AS "isPaidOnly",
        lp.url,
        COALESCE(
          json_agg(
            json_build_object('id', lt.id, 'name', lt.name, 'slug', lt.slug)
          ) FILTER (WHERE lt.id IS NOT NULL), '[]'
        ) AS tags
      FROM leetcode_problems lp
      LEFT JOIN leetcode_problem_tags lpt ON lpt.leetcode_problem_id = lp.id
      LEFT JOIN leetcode_tags lt ON lt.id = lpt.leetcode_tag_id
      WHERE lp.title_slug = $1
      GROUP BY lp.id;
    `;
    const res = await query(probSql, [problemSlug]);
    if (res.rows.length > 0) {
      problem = res.rows[0];
    }
  } else {
    const prob = inMemoryDb.leetcode_problems.find((p) => p.title_slug === problemSlug);
    if (prob) {
      const tagLinks = inMemoryDb.leetcode_problem_tags.filter(
        (lpt) => lpt.leetcode_problem_id === prob.id
      );
      const tags = tagLinks
        .map((tl) => inMemoryDb.leetcode_tags.find((t) => t.id === tl.leetcode_tag_id))
        .filter(Boolean)
        .map((t) => ({ id: t.id, name: t.name, slug: t.slug }));

      problem = {
        id: prob.id,
        frontendQuestionId: prob.frontend_question_id,
        title: prob.title,
        titleSlug: prob.title_slug,
        difficulty: prob.difficulty,
        isPaidOnly: prob.is_paid_only,
        url: prob.url,
        tags,
      };
    }
  }

  if (!problem || !problem.tags || problem.tags.length === 0) {
    // If problem not found directly in catalog, fall back to matching problem slug if it is a tag
    const examples = await getExamplesByTagSlugs([problemSlug], limit);
    return { problem, examples };
  }

  const tagSlugs = problem.tags.map((t) => t.slug);
  const examples = await getExamplesByTagSlugs(tagSlugs, limit);
  return { problem, examples };
}

/**
 * Get all available LeetCode tags with counts of verified examples
 */
export async function getAllTags(): Promise<LeetCodeTagItem[]> {
  if (getIsPostgresConnected()) {
    const sql = `
      SELECT 
        lt.id,
        lt.name,
        lt.slug,
        lt.category,
        lt.description,
        COUNT(DISTINCT cet.code_example_id)::int AS "exampleCount"
      FROM leetcode_tags lt
      LEFT JOIN code_example_tags cet ON cet.leetcode_tag_id = lt.id
      GROUP BY lt.id
      ORDER BY "exampleCount" DESC, lt.name ASC;
    `;
    const res = await query(sql);
    return res.rows;
  }

  return inMemoryDb.leetcode_tags.map((t) => {
    const count = inMemoryDb.code_example_tags.filter(
      (cet) => cet.leetcode_tag_id === t.id
    ).length;
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      category: t.category,
      description: t.description,
      exampleCount: count,
    };
  }).sort((a, b) => (b.exampleCount || 0) - (a.exampleCount || 0));
}

/**
 * Get overall system stats
 */
export async function getStats(): Promise<{
  totalRepos: number;
  totalScans: number;
  totalExamples: number;
  totalTags: number;
  totalProblems: number;
}> {
  if (getIsPostgresConnected()) {
    const sql = `
      SELECT 
        (SELECT COUNT(*)::int FROM repos) AS "totalRepos",
        (SELECT COUNT(*)::int FROM scans) AS "totalScans",
        (SELECT COUNT(*)::int FROM code_examples) AS "totalExamples",
        (SELECT COUNT(*)::int FROM leetcode_tags) AS "totalTags",
        (SELECT COUNT(*)::int FROM leetcode_problems) AS "totalProblems";
    `;
    const res = await query(sql);
    return res.rows[0];
  }

  return {
    totalRepos: inMemoryDb.repos.length,
    totalScans: inMemoryDb.scans.length,
    totalExamples: inMemoryDb.code_examples.length,
    totalTags: inMemoryDb.leetcode_tags.length,
    totalProblems: inMemoryDb.leetcode_problems.length,
  };
}

// -------------------------------------------------------------
// WRITE / UPSERT QUERIES (Used by Scanners, NIM, LeetCode Sync)
// -------------------------------------------------------------

export async function upsertRepo(repo: {
  name: string;
  fullName: string;
  url: string;
  defaultBranch?: string;
  language?: string;
  stars?: number;
  description?: string;
}): Promise<number> {
  if (getIsPostgresConnected()) {
    const sql = `
      INSERT INTO repos (name, full_name, url, default_branch, language, stars, description, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (full_name) 
      DO UPDATE SET 
        stars = EXCLUDED.stars,
        description = EXCLUDED.description,
        updated_at = NOW()
      RETURNING id;
    `;
    const res = await query(sql, [
      repo.name,
      repo.fullName,
      repo.url,
      repo.defaultBranch || 'main',
      repo.language || 'Unknown',
      repo.stars || 0,
      repo.description || '',
    ]);
    return res.rows[0].id;
  }

  const existing = inMemoryDb.repos.find((r) => r.full_name === repo.fullName);
  if (existing) {
    existing.stars = repo.stars ?? existing.stars;
    existing.description = repo.description ?? existing.description;
    return existing.id;
  }
  const id = getNextId('repos');
  inMemoryDb.repos.push({
    id,
    name: repo.name,
    full_name: repo.fullName,
    url: repo.url,
    default_branch: repo.defaultBranch || 'main',
    language: repo.language || 'Unknown',
    stars: repo.stars || 0,
    description: repo.description || '',
  });
  return id;
}

export async function upsertTag(tag: {
  name: string;
  slug: string;
  category?: string;
  description?: string;
}): Promise<number> {
  if (getIsPostgresConnected()) {
    const sql = `
      INSERT INTO leetcode_tags (name, slug, category, description)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (slug) 
      DO UPDATE SET 
        name = EXCLUDED.name,
        category = COALESCE(EXCLUDED.category, leetcode_tags.category),
        description = COALESCE(EXCLUDED.description, leetcode_tags.description)
      RETURNING id;
    `;
    const res = await query(sql, [
      tag.name,
      tag.slug,
      tag.category || 'Algorithms',
      tag.description || '',
    ]);
    return res.rows[0].id;
  }

  const existing = inMemoryDb.leetcode_tags.find((t) => t.slug === tag.slug);
  if (existing) {
    existing.name = tag.name;
    return existing.id;
  }
  const id = getNextId('leetcode_tags');
  inMemoryDb.leetcode_tags.push({
    id,
    name: tag.name,
    slug: tag.slug,
    category: tag.category || 'Algorithms',
    description: tag.description || '',
  });
  return id;
}

export async function insertScan(scan: {
  repoId: number;
  commitHash?: string;
  status: string;
}): Promise<number> {
  if (getIsPostgresConnected()) {
    const sql = `
      INSERT INTO scans (repo_id, commit_hash, status, started_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id;
    `;
    const res = await query(sql, [scan.repoId, scan.commitHash || '', scan.status]);
    return res.rows[0].id;
  }

  const id = getNextId('scans');
  inMemoryDb.scans.push({
    id,
    repo_id: scan.repoId,
    commit_hash: scan.commitHash || '',
    status: scan.status,
    candidates_found: 0,
    examples_verified: 0,
    started_at: new Date(),
  });
  return id;
}

export async function updateScan(
  id: number,
  updates: {
    status?: string;
    candidatesFound?: number;
    examplesVerified?: number;
    errorMessage?: string;
  }
): Promise<void> {
  if (getIsPostgresConnected()) {
    const sql = `
      UPDATE scans 
      SET 
        status = COALESCE($2, status),
        candidates_found = COALESCE($3, candidates_found),
        examples_verified = COALESCE($4, examples_verified),
        error_message = COALESCE($5, error_message),
        completed_at = CASE WHEN $2 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
      WHERE id = $1;
    `;
    await query(sql, [
      id,
      updates.status,
      updates.candidatesFound,
      updates.examplesVerified,
      updates.errorMessage,
    ]);
    return;
  }

  const scan = inMemoryDb.scans.find((s) => s.id === id);
  if (scan) {
    if (updates.status) scan.status = updates.status;
    if (updates.candidatesFound !== undefined) scan.candidates_found = updates.candidatesFound;
    if (updates.examplesVerified !== undefined) scan.examples_verified = updates.examplesVerified;
    if (updates.errorMessage) scan.error_message = updates.errorMessage;
    if (['completed', 'failed'].includes(updates.status || '')) {
      scan.completed_at = new Date();
    }
  }
}

export async function insertCodeExample(example: {
  repoId: number;
  scanId?: number | null;
  filePath: string;
  functionName?: string;
  language: string;
  codeSnippet: string;
  startLine: number;
  endLine: number;
  sourceUrl: string;
  rationale: string;
  productionContext?: string;
  confidenceScore?: number;
  isTruncated?: boolean;
}): Promise<number> {
  // Enforce snippet line cap (~40 lines) to keep table lean
  const lines = example.codeSnippet.split('\n');
  const cappedSnippet = lines.slice(0, 42).join('\n');
  const isTruncated = example.isTruncated !== undefined ? example.isTruncated : lines.length > 40;

  if (getIsPostgresConnected()) {
    const sql = `
      INSERT INTO code_examples (
        repo_id, scan_id, file_path, function_name, language, code_snippet,
        start_line, end_line, source_url, rationale, production_context, confidence_score, is_truncated
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (repo_id, file_path, start_line, end_line)
      DO UPDATE SET
        scan_id = COALESCE(EXCLUDED.scan_id, code_examples.scan_id),
        function_name = EXCLUDED.function_name,
        language = EXCLUDED.language,
        code_snippet = EXCLUDED.code_snippet,
        source_url = EXCLUDED.source_url,
        rationale = EXCLUDED.rationale,
        production_context = EXCLUDED.production_context,
        confidence_score = EXCLUDED.confidence_score,
        is_truncated = EXCLUDED.is_truncated
      RETURNING id;
    `;
    const res = await query(sql, [
      example.repoId,
      example.scanId || null,
      example.filePath,
      example.functionName || '',
      example.language,
      cappedSnippet,
      example.startLine,
      example.endLine,
      example.sourceUrl,
      example.rationale,
      example.productionContext || '',
      example.confidenceScore || 1.0,
      isTruncated,
    ]);
    return res.rows[0].id;
  }

  // In-memory duplicate check to ensure idempotency across duplicate jobs / retries
  const existing = inMemoryDb.code_examples.find(
    (e) =>
      e.repo_id === example.repoId &&
      e.file_path === example.filePath &&
      e.start_line === example.startLine &&
      e.end_line === example.endLine
  );
  if (existing) {
    existing.scan_id = example.scanId || existing.scan_id;
    existing.function_name = example.functionName || existing.function_name;
    existing.language = example.language;
    existing.code_snippet = cappedSnippet;
    existing.source_url = example.sourceUrl;
    existing.rationale = example.rationale;
    existing.production_context = example.productionContext || existing.production_context;
    existing.confidence_score = example.confidenceScore || existing.confidence_score;
    existing.is_truncated = isTruncated;
    return existing.id;
  }

  const id = getNextId('code_examples');
  inMemoryDb.code_examples.push({
    id,
    repo_id: example.repoId,
    scan_id: example.scanId || null,
    file_path: example.filePath,
    function_name: example.functionName || '',
    language: example.language,
    code_snippet: cappedSnippet,
    start_line: example.startLine,
    end_line: example.endLine,
    source_url: example.sourceUrl,
    rationale: example.rationale,
    production_context: example.productionContext || '',
    confidence_score: example.confidenceScore || 1.0,
    is_truncated: isTruncated,
  });
  return id;
}

export async function linkExampleTag(exampleId: number, tagId: number): Promise<void> {
  if (getIsPostgresConnected()) {
    const sql = `
      INSERT INTO code_example_tags (code_example_id, leetcode_tag_id)
      VALUES ($1, $2)
      ON CONFLICT (code_example_id, leetcode_tag_id) DO NOTHING;
    `;
    await query(sql, [exampleId, tagId]);
    return;
  }

  const exists = inMemoryDb.code_example_tags.some(
    (cet) => cet.code_example_id === exampleId && cet.leetcode_tag_id === tagId
  );
  if (!exists) {
    inMemoryDb.code_example_tags.push({
      id: getNextId('code_example_tags'),
      code_example_id: exampleId,
      leetcode_tag_id: tagId,
    });
  }
}

export async function upsertProblem(problem: {
  frontendQuestionId: number;
  title: string;
  titleSlug: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly?: boolean;
  url: string;
}): Promise<number> {
  if (getIsPostgresConnected()) {
    const sql = `
      INSERT INTO leetcode_problems (
        frontend_question_id, title, title_slug, difficulty, is_paid_only, url, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (title_slug) 
      DO UPDATE SET 
        title = EXCLUDED.title,
        difficulty = EXCLUDED.difficulty,
        is_paid_only = EXCLUDED.is_paid_only,
        url = EXCLUDED.url,
        updated_at = NOW()
      RETURNING id;
    `;
    const res = await query(sql, [
      problem.frontendQuestionId,
      problem.title,
      problem.titleSlug,
      problem.difficulty,
      problem.isPaidOnly || false,
      problem.url,
    ]);
    return res.rows[0].id;
  }

  const existing = inMemoryDb.leetcode_problems.find((p) => p.title_slug === problem.titleSlug);
  if (existing) {
    existing.title = problem.title;
    existing.difficulty = problem.difficulty;
    return existing.id;
  }
  const id = getNextId('leetcode_problems');
  inMemoryDb.leetcode_problems.push({
    id,
    frontend_question_id: problem.frontendQuestionId,
    title: problem.title,
    title_slug: problem.titleSlug,
    difficulty: problem.difficulty,
    is_paid_only: problem.isPaidOnly || false,
    url: problem.url,
  });
  return id;
}

export async function linkProblemTag(problemId: number, tagId: number): Promise<void> {
  if (getIsPostgresConnected()) {
    const sql = `
      INSERT INTO leetcode_problem_tags (leetcode_problem_id, leetcode_tag_id)
      VALUES ($1, $2)
      ON CONFLICT (leetcode_problem_id, leetcode_tag_id) DO NOTHING;
    `;
    await query(sql, [problemId, tagId]);
    return;
  }

  const exists = inMemoryDb.leetcode_problem_tags.some(
    (lpt) => lpt.leetcode_problem_id === problemId && lpt.leetcode_tag_id === tagId
  );
  if (!exists) {
    inMemoryDb.leetcode_problem_tags.push({
      id: getNextId('leetcode_problem_tags'),
      leetcode_problem_id: problemId,
      leetcode_tag_id: tagId,
    });
  }
}
