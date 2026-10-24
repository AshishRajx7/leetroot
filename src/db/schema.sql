-- Real-World DSA Pattern Finder (LeetRoot) Database Schema
-- Optimized for O(log n) query path to serve LeetCode extension with <50ms response time

-- 1. Curated Open Source Repositories
CREATE TABLE IF NOT EXISTS repos (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    full_name VARCHAR(255) NOT NULL UNIQUE,
    url TEXT NOT NULL,
    default_branch VARCHAR(50) DEFAULT 'main',
    language VARCHAR(50),
    stars INTEGER DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Scans History and Status
CREATE TABLE IF NOT EXISTS scans (
    id SERIAL PRIMARY KEY,
    repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    commit_hash VARCHAR(64),
    status VARCHAR(30) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    candidates_found INTEGER DEFAULT 0,
    examples_verified INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. LeetCode Topic Taxonomy Tags
CREATE TABLE IF NOT EXISTS leetcode_tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Extracted and NIM-Verified Production Code Examples
-- Note: code_snippet is capped at scan time (~40 lines) to keep the table lean.
-- Full context is reachable via source_url.
CREATE TABLE IF NOT EXISTS code_examples (
    id SERIAL PRIMARY KEY,
    repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    scan_id INTEGER REFERENCES scans(id) ON DELETE SET NULL,
    file_path VARCHAR(500) NOT NULL,
    function_name VARCHAR(255),
    language VARCHAR(50) NOT NULL,
    code_snippet TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    source_url TEXT NOT NULL,
    rationale TEXT NOT NULL,
    production_context TEXT,
    confidence_score NUMERIC(3, 2) DEFAULT 1.0,
    is_truncated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Idempotent column addition for existing deployments
ALTER TABLE code_examples ADD COLUMN IF NOT EXISTS is_truncated BOOLEAN DEFAULT FALSE;

-- Ensure duplicate verification jobs or retries do not create duplicate examples
CREATE UNIQUE INDEX IF NOT EXISTS uq_code_examples_location 
ON code_examples (repo_id, file_path, start_line, end_line);

-- 5. Many-to-Many Association: Code Examples <-> LeetCode Tags
CREATE TABLE IF NOT EXISTS code_example_tags (
    id SERIAL PRIMARY KEY,
    code_example_id INTEGER NOT NULL REFERENCES code_examples(id) ON DELETE CASCADE,
    leetcode_tag_id INTEGER NOT NULL REFERENCES leetcode_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_code_example_tag UNIQUE (code_example_id, leetcode_tag_id)
);

-- MANDATORY COVERING INDEX for O(log n) query path for Phase 3 LeetCode extension
-- Lookups by leetcode_tag_id directly yield code_example_id without table scan
CREATE INDEX IF NOT EXISTS idx_code_example_tags_covering 
ON code_example_tags (leetcode_tag_id, code_example_id);

CREATE INDEX IF NOT EXISTS idx_code_example_tags_example 
ON code_example_tags (code_example_id);

-- 6. LeetCode Problem Catalog Synced from LeetCode GraphQL / API
CREATE TABLE IF NOT EXISTS leetcode_problems (
    id SERIAL PRIMARY KEY,
    frontend_question_id INTEGER NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    title_slug VARCHAR(255) NOT NULL UNIQUE,
    difficulty VARCHAR(20) NOT NULL, -- 'Easy', 'Medium', 'Hard'
    is_paid_only BOOLEAN DEFAULT FALSE,
    url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Many-to-Many Association: LeetCode Problems <-> LeetCode Tags
CREATE TABLE IF NOT EXISTS leetcode_problem_tags (
    id SERIAL PRIMARY KEY,
    leetcode_problem_id INTEGER NOT NULL REFERENCES leetcode_problems(id) ON DELETE CASCADE,
    leetcode_tag_id INTEGER NOT NULL REFERENCES leetcode_tags(id) ON DELETE CASCADE,
    CONSTRAINT uq_problem_tag UNIQUE (leetcode_problem_id, leetcode_tag_id)
);

CREATE INDEX IF NOT EXISTS idx_problem_tags_problem 
ON leetcode_problem_tags (leetcode_problem_id);

CREATE INDEX IF NOT EXISTS idx_problem_tags_tag 
ON leetcode_problem_tags (leetcode_tag_id);

-- Performance indices for fast lookups
CREATE INDEX IF NOT EXISTS idx_code_examples_repo ON code_examples (repo_id);
CREATE INDEX IF NOT EXISTS idx_scans_repo ON scans (repo_id);
CREATE INDEX IF NOT EXISTS idx_problems_slug ON leetcode_problems (title_slug);
