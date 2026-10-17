// LeetRoot - Content Script for leetcode.com/problems/*
(function () {
  'use strict';

  const DEFAULT_API_URL = 'http://localhost:4000/api';
  let apiUrl = DEFAULT_API_URL;
  let currentProblemSlug = '';
  let isSidebarOpen = false;
  let cachedData = null;
  let activeTagFilter = null;

  // Retrieve custom API URL from chrome.storage if set
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['leetroot_api_url'], (res) => {
      if (res && res.leetroot_api_url) {
        apiUrl = res.leetroot_api_url.replace(/\/$/, '');
      }
    });
  }

  // 1. Detect Problem Slug from URL
  function getProblemSlug() {
    const match = window.location.pathname.match(/\/problems\/([^/]+)/);
    return match ? match[1].toLowerCase() : null;
  }

  // 2. Extract LeetCode Topic Tags from DOM
  function extractTagsFromDOM() {
    const tags = new Set();
    // Modern LeetCode problem page tag selectors
    const tagElements = document.querySelectorAll(
      'a[href*="/tag/"], [data-topic-tags] a, .topic-tag, a[href^="/tag/"]'
    );
    tagElements.forEach((el) => {
      const href = el.getAttribute('href') || '';
      const tagMatch = href.match(/\/tag\/([^/]+)/);
      if (tagMatch) {
        tags.add(tagMatch[1].toLowerCase());
      } else {
        const text = el.textContent.trim().toLowerCase().replace(/\s+/g, '-');
        if (text) tags.add(text);
      }
    });
    return Array.from(tags);
  }

  // 3. Create or Update Floating Trigger Button
  function ensureFloatingTrigger(exampleCount = 0) {
    let trigger = document.getElementById('leetroot-floating-trigger');
    if (!trigger) {
      trigger = document.createElement('div');
      trigger.id = 'leetroot-floating-trigger';
      trigger.innerHTML = `
        <span>⚡ LeetRoot: Real Code</span>
        <span class="lr-badge" id="lr-count-badge">${exampleCount}</span>
      `;
      trigger.addEventListener('click', () => {
        toggleSidebar();
      });
      document.body.appendChild(trigger);
    } else {
      const badge = document.getElementById('lr-count-badge');
      if (badge) badge.textContent = exampleCount;
    }
  }

  // 4. Create or Update Slide-Out Sidebar
  function ensureSidebar() {
    let sidebar = document.getElementById('leetroot-sidebar');
    if (!sidebar) {
      sidebar = document.createElement('div');
      sidebar.id = 'leetroot-sidebar';
      sidebar.innerHTML = `
        <div class="lr-header">
          <div class="lr-logo-group">
            <span class="lr-logo-icon">⚡</span>
            <div>
              <div class="lr-title">LeetRoot</div>
              <div class="lr-subtitle">Real Production Code</div>
            </div>
          </div>
          <div class="lr-header-actions">
            <button class="lr-btn-icon" id="lr-btn-refresh" title="Refresh">↻</button>
            <button class="lr-btn-icon" id="lr-btn-close" title="Close">✕</button>
          </div>
        </div>
        <div class="lr-tags-bar" id="lr-tags-bar">
          <!-- Tag chips will be rendered here -->
        </div>
        <div class="lr-content" id="lr-content">
          <div class="lr-loading-state">
            <div class="lr-spinner"></div>
            <div>Finding production patterns...</div>
          </div>
        </div>
      `;

      document.body.appendChild(sidebar);

      document.getElementById('lr-btn-close').addEventListener('click', () => {
        toggleSidebar(false);
      });

      document.getElementById('lr-btn-refresh').addEventListener('click', () => {
        loadDataForProblem(currentProblemSlug, true);
      });
    }
    return sidebar;
  }

  function toggleSidebar(forceOpen) {
    const sidebar = ensureSidebar();
    if (typeof forceOpen === 'boolean') {
      isSidebarOpen = forceOpen;
    } else {
      isSidebarOpen = !isSidebarOpen;
    }

    if (isSidebarOpen) {
      sidebar.classList.add('lr-open');
    } else {
      sidebar.classList.remove('lr-open');
    }
  }

  // 5. Fetch Real-World Examples from Phase 1 API
  async function loadDataForProblem(slug, forceRefresh = false) {
    if (!slug) return;
    const content = document.getElementById('lr-content');
    if (content) {
      content.innerHTML = `
        <div class="lr-loading-state">
          <div class="lr-spinner"></div>
          <div>Scanning real production repositories for <strong>${slug}</strong>...</div>
        </div>
      `;
    }

    try {
      // First try problem-specific endpoint
      let url = `${apiUrl}/examples/by-problem?slug=${encodeURIComponent(slug)}&limit=5`;
      let res = await fetch(url);
      let data = await res.json();

      // If no examples found directly by problem slug, try extracted DOM tags
      if (!data.examples || data.examples.length === 0) {
        const domTags = extractTagsFromDOM();
        if (domTags.length > 0) {
          const tagUrl = `${apiUrl}/examples/by-tag?tags=${encodeURIComponent(domTags.join(','))}&limit=5`;
          const tagRes = await fetch(tagUrl);
          const tagData = await tagRes.json();
          if (tagData.examples && tagData.examples.length > 0) {
            data = {
              problemSlug: slug,
              problem: { title: slug, tags: domTags.map((t) => ({ name: t, slug: t })) },
              examples: tagData.examples,
            };
          }
        }
      }

      cachedData = data;
      renderSidebarContent(data);
      ensureFloatingTrigger(data.examples ? data.examples.length : 0);
    } catch (err) {
      console.error('[LeetRoot] Failed to fetch examples:', err);
      renderErrorState(err.message);
      ensureFloatingTrigger('!');
    }
  }

  // 6. Render Sidebar Data
  function renderSidebarContent(data) {
    const content = document.getElementById('lr-content');
    const tagsBar = document.getElementById('lr-tags-bar');
    if (!content || !tagsBar) return;

    const examples = data.examples || [];
    const problem = data.problem;

    // Render tag chips
    const allTags = new Set();
    examples.forEach((ex) => {
      (ex.tags || []).forEach((t) => allTags.add(t.slug));
    });

    if (allTags.size > 0) {
      tagsBar.innerHTML = `
        <span class="lr-tag-chip ${!activeTagFilter ? 'active' : ''}" data-slug="all">All (${examples.length})</span>
        ${Array.from(allTags)
          .map(
            (slug) => `
          <span class="lr-tag-chip ${activeTagFilter === slug ? 'active' : ''}" data-slug="${slug}">
            ${slug}
          </span>
        `
          )
          .join('')}
      `;

      tagsBar.querySelectorAll('.lr-tag-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const slug = chip.getAttribute('data-slug');
          activeTagFilter = slug === 'all' ? null : slug;
          renderSidebarContent(cachedData);
        });
      });
      tagsBar.style.display = 'flex';
    } else {
      tagsBar.style.display = 'none';
    }

    const filteredExamples = activeTagFilter
      ? examples.filter((ex) => (ex.tags || []).some((t) => t.slug === activeTagFilter))
      : examples;

    if (filteredExamples.length === 0) {
      content.innerHTML = `
        <div class="lr-empty-state">
          <div style="font-size: 36px; margin-bottom: 12px;">🔍</div>
          <div style="font-size: 14px; font-weight: 600; color: #fff;">No verified examples yet</div>
          <p style="font-size: 12px; margin-top: 6px; line-height: 1.5;">
            We haven't indexed real-world code for this problem's pattern yet.
          </p>
          <button class="lr-empty-btn" id="lr-btn-trigger-scan">Scan Curated Repos</button>
        </div>
      `;

      const scanBtn = document.getElementById('lr-btn-trigger-scan');
      if (scanBtn) {
        scanBtn.addEventListener('click', async () => {
          scanBtn.textContent = 'Queuing scan...';
          try {
            await fetch(`${apiUrl}/scans/trigger`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ repoFullName: 'facebook/react' }),
            });
            scanBtn.textContent = 'Scan Queued! Check back shortly';
          } catch {
            scanBtn.textContent = 'Scan Triggered';
          }
        });
      }
      return;
    }

    content.innerHTML = filteredExamples
      .map((ex, idx) => {
        const repo = ex.repo || { name: 'Repository', fullName: 'repo/repo', url: '#', stars: 0 };
        const starsFormatted = repo.stars >= 1000 ? `${(repo.stars / 1000).toFixed(0)}k` : repo.stars;

        return `
          <div class="lr-card">
            <div class="lr-card-header">
              <div class="lr-repo-info">
                <div class="lr-repo-name">
                  <span>📦</span>
                  <span>${escapeHtml(repo.fullName)}</span>
                </div>
                <div class="lr-repo-meta">${escapeHtml(ex.filePath)}:${ex.startLine}-${ex.endLine}</div>
              </div>
              <div class="lr-stars-badge">★ ${starsFormatted}</div>
            </div>

            <div class="lr-rationale-box">
              <div class="lr-rationale-title">
                <span>💡</span> Why Production Uses This
              </div>
              <div>${escapeHtml(ex.rationale)}</div>
            </div>

            <div class="lr-snippet-container">
              <div class="lr-snippet-toolbar">
                <span>${escapeHtml(ex.language)} &bull; ${escapeHtml(ex.functionName || 'function')}</span>
                <span>Lines ${ex.startLine}&ndash;${ex.endLine}</span>
              </div>
              <pre class="lr-code-block"><code>${escapeHtml(ex.codeSnippet)}</code></pre>
            </div>

            <div class="lr-card-footer">
              <a href="${ex.sourceUrl}" target="_blank" rel="noopener noreferrer" class="lr-source-link">
                View on GitHub (${ex.startLine}-${ex.endLine}) &rarr;
              </a>
              <button class="lr-copy-btn" data-snippet-idx="${idx}">Copy Snippet</button>
            </div>
          </div>
        `;
      })
      .join('');

    // Attach copy button handlers
    content.querySelectorAll('.lr-copy-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-snippet-idx'), 10);
        const snippet = filteredExamples[idx]?.codeSnippet || '';
        navigator.clipboard.writeText(snippet).then(() => {
          const originalText = btn.textContent;
          btn.textContent = 'Copied!';
          btn.style.color = '#10b981';
          setTimeout(() => {
            btn.textContent = originalText;
            btn.style.color = '';
          }, 2000);
        });
      });
    });
  }

  function renderErrorState(errorMessage) {
    const content = document.getElementById('lr-content');
    if (!content) return;

    content.innerHTML = `
      <div class="lr-empty-state">
        <div style="font-size: 32px; color: #ef4444; margin-bottom: 8px;">⚠️</div>
        <div style="font-size: 14px; font-weight: 600; color: #fff;">LeetRoot Engine Offline</div>
        <p style="font-size: 12px; margin-top: 6px; line-height: 1.5;">
          Could not connect to LeetRoot Phase 1 API at <code>${escapeHtml(apiUrl)}</code>.
        </p>
        <p style="font-size: 11px; color: #64748b;">
          Make sure the backend is running with: <code>npm run dev</code>
        </p>
        <button class="lr-empty-btn" id="lr-btn-retry">Retry Connection</button>
      </div>
    `;

    const retryBtn = document.getElementById('lr-btn-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        loadDataForProblem(currentProblemSlug, true);
      });
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 7. Route Change Listener for Next.js / React SPA
  function handleLocationChange() {
    const slug = getProblemSlug();
    if (slug && slug !== currentProblemSlug) {
      console.log(`[LeetRoot] Problem changed to: ${slug}`);
      currentProblemSlug = slug;
      activeTagFilter = null;
      ensureFloatingTrigger(0);
      loadDataForProblem(slug);
    }
  }

  // Hook pushState / replaceState for SPA
  const originalPushState = history.pushState;
  history.pushState = function () {
    originalPushState.apply(this, arguments);
    setTimeout(handleLocationChange, 150);
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function () {
    originalReplaceState.apply(this, arguments);
    setTimeout(handleLocationChange, 150);
  };

  window.addEventListener('popstate', () => {
    setTimeout(handleLocationChange, 150);
  });

  // Initial check on page load
  setTimeout(handleLocationChange, 800);
})();
