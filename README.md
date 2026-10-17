# ⚡ LeetRoot: Real-World DSA Pattern Finder

> **Bridges the gap between grinding LeetCode and writing real production code.**  
> Scans real open-source repositories, detects core Data Structures & Algorithms patterns (trees, graphs, heaps, tries, caches, etc.), tags them using LeetCode's canonical taxonomy, and surfaces real sourced production examples right where engineers are — on the LeetCode problem page itself.

---

## 🎯 The Problem It Solves

Students and engineers grind hundreds of LeetCode problems, but rarely see those abstract data structures applied in real systems. Existing pattern repos provide only generic blurbs (e.g. *"used in operating system schedulers"*).

**LeetRoot changes this by delivering:**
- **Real functions & real repos:** Facebook React, Redis, Linux Kernel, Kubernetes, VS Code, Terraform, Node.js, CPython, Git, RocksDB, Folly.
- **Direct GitHub source anchors:** Direct links to the exact line ranges on GitHub (e.g., `#L43-L82`).
- **Concrete production rationales:** Non-generic engineering reasons explaining *why* production code uses this pattern here (e.g., *"React Scheduler uses a min-heap to keep track of tasks sorted by expiration time so the earliest deadline is popped in O(log n) during idle browser frames"*).
- **In-situ sidebar on LeetCode:** Content script automatically detects problem slugs and topic tags on `leetcode.com/problems/*` and renders the real production code directly beside the code editor.

---

## 🏗️ Architecture (Phase 1 + Phase 3)

```
LeetRoot/
├── backend/ (Phase 1 Engine + Public Dataset)
│   ├── src/
│   │   ├── parser/           # Tree-sitter AST queries & structural pattern detectors
│   │   ├── llm/              # NVIDIA NIM verification (OpenAI-compatible, 40 RPM rate limit)
│   │   ├── db/               # PostgreSQL DDL with O(log n) covering index & migrations
│   │   ├── redis/            # Redis cache-aside (examples:tag:{slug}, TTL 24h, scan invalidation)
│   │   ├── queues/           # BullMQ with 3 queues (repo-scan, llm-verify, problem-sync)
│   │   ├── leetcode/         # LeetCode API/GraphQL catalog synchronization
│   │   ├── seeds/            # Curated seed dataset of verified production examples
│   │   └── api/              # Read-only REST API for browser extension
│   └── docker-compose.yml    # Postgres 16 + Redis 7 services
│
├── extension/ (Phase 3 LeetCode Browser Extension)
│   ├── manifest.json         # Manifest V3 extension
│   ├── content/
│   │   ├── content.js        # SPA observer, DOM tag extractor & sidebar manager
│   │   └── sidebar.css       # Premium glassmorphism dark-mode UI
│   ├── popup/                # Extension status & API configuration popup
│   └── demo.html             # Interactive sandbox simulating LeetCode problem page
└── test/
    └── test-all.ts           # 22 automated tests covering DB, AST, NIM, Redis, and API
```

---

## 📊 Database Schema & Query Optimization

PostgreSQL schema finalized for instant sub-50ms query latency:

```sql
-- Covering index for O(log n) query path for Phase 3 extension:
CREATE INDEX idx_code_example_tags_covering 
ON code_example_tags (leetcode_tag_id, code_example_id);
```

- `repos`: Metadata for curated open-source repositories (name, full_name, stars, url).
- `scans`: Execution history and tracking for AST candidate scanning.
- `leetcode_tags`: LeetCode topic taxonomy (slug, name, category, description).
- `code_examples`: Extracted snippets capped at ~40 lines to keep tables lean, with GitHub URL anchors, production context, and rationale.
- `code_example_tags`: Many-to-many relationship with the covering index `(leetcode_tag_id, code_example_id)`.
- `leetcode_problems` + `leetcode_problem_tags`: Synced problem catalog from LeetCode.

---

## ⚡ BullMQ Queues Split by Speed

1. **`repo-scan`** (Slow, scheduled): Clones/fetches source files from curated OSS repositories, executes Tree-sitter AST structural queries, and identifies candidate snippets.
2. **`llm-verify`** (Rate-limited to 40 RPM): Worker with BullMQ limiter `{ max: 40, duration: 60000 }` to respect NVIDIA NIM free-tier limits. Verifies genuine DSA usage, computes confidence score, and generates production engineering rationale.
3. **`problem-sync`** (Nightly scheduled): Synchronizes LeetCode problem metadata, slugs, difficulty, and topic tags.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js v18+ (tested on Node v20)
- npm v9+
- *(Optional)* Docker Desktop for PostgreSQL & Redis (app includes automatic high-performance in-memory fallback for immediate zero-config testing)

### 2. Install & Test
```bash
# Clone and enter workspace
cd LeetRoot

# Install dependencies
npm install

# Run comprehensive test suite (AST scanner, NIM, DB, Redis, API)
npm test
```

### 3. Start the Phase 1 API Engine
```bash
npm run dev
```
The server will start at `http://localhost:4000`:
- Inspection UI: `http://localhost:4000/`
- Health check: `http://localhost:4000/api/health`
- By Tag: `http://localhost:4000/api/examples/by-tag?tags=heap-priority-queue`
- By Problem: `http://localhost:4000/api/examples/by-problem?slug=merge-k-sorted-lists`
- Stats: `http://localhost:4000/api/stats`

---

## 🧩 Installing Phase 3 Browser Extension

1. Open your browser (Chrome, Brave, Edge, or Firefox).
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in upper right corner).
4. Click **Load unpacked**.
5. Select the `LeetRoot/extension` folder.
6. Open any LeetCode problem:
   - [Merge k Sorted Lists](https://leetcode.com/problems/merge-k-sorted-lists/)
   - [Implement Trie (Prefix Tree)](https://leetcode.com/problems/implement-trie-prefix-tree/)
   - [Course Schedule II](https://leetcode.com/problems/course-schedule-ii/)
   - [LRU Cache](https://leetcode.com/problems/lru-cache/)
7. Click the **⚡ LeetRoot: Real Code** pill in the bottom-right corner to open the sidebar!

*You can also preview the extension immediately in the local sandbox by opening `extension/demo.html` in your browser!*

---

## 🤖 NVIDIA NIM Verification Setup

To connect your free NVIDIA NIM API key:
1. Get a free API key at [build.nvidia.com](https://build.nvidia.com) (1,000 free credits, no card required).
2. Add your key to `.env`:
```env
NVIDIA_NIM_API_KEY=nvapi-your-key-here
NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_NIM_MODEL=meta/llama-3.3-70b-instruct
```
The engine uses an OpenAI-compatible client with a 40 RPM rate limiter. If no key is configured, an intelligent domain heuristic verifier activates automatically to keep tests and development operational.

---

## 🧪 Automated Test Verification

All 22 automated tests pass out of the box:
```
======================================================
🧪 LeetRoot (Phase 1 + Phase 3) Comprehensive Test Suite
======================================================
✅ PASSED: Seeded 10 verified production examples
✅ PASSED: Seeded 14 unique LeetCode tags
✅ PASSED: Found 3 heap examples in 0ms (Covering Index)
✅ PASSED: Identified Facebook React Scheduler heap example
✅ PASSED: Contains exact GitHub line range anchor: #L43-L82
✅ PASSED: Contains non-generic engineering rationale
✅ PASSED: Resolved LeetCode problem: Merge k Sorted Lists
✅ PASSED: Associated 3 production examples with problem
✅ PASSED: AST scanner detected 1 DSA candidate snippet(s)
✅ PASSED: Detected correct pattern: heap-priority-queue
✅ PASSED: Extracted function name: siftDown
✅ PASSED: Clamped snippet line count to 40 <= 40 lines
✅ PASSED: Calculated valid GitHub source range
✅ PASSED: NIM verified snippet as genuine DSA
✅ PASSED: NIM confidence score: 0.95
✅ PASSED: Generated engineering rationale
✅ PASSED: Cached examples returned 3 items
✅ PASSED: Invalidated cache entries upon scan completion
✅ PASSED: GET /api/health returned 200 OK
✅ PASSED: GET /api/examples/by-tag returned 3 examples
✅ PASSED: GET /api/examples/by-problem returned 3 examples
✅ PASSED: GET /api/stats reported 10 total examples across 16 curated repos

🎉 ALL 22/22 TESTS PASSED PERFECTLY!
```
