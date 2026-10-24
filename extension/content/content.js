/**
 * LeetRoot - Chrome Extension Manifest V3 Content Script
 * Uses isolated Shadow DOM to prevent any CSS bleed into or out of LeetCode.
 */
(function () {
  'use strict';

  const DEFAULT_API_BASE = 'http://localhost:4000/api';
  let apiBaseUrl = DEFAULT_API_BASE;
  let currentProblemSlug = '';
  let isSidebarOpen = false;
  let cachedData = null;
  let activeTagFilter = null;
  let shadowRoot = null;
  let currentAbortController = null;
  let currentRequestId = 0;
  let navigationIntervalId = null;
  let lastObservedUrl = '';

  // Retrieve custom API URL from chrome.storage if set by user
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['leetroot_api_url'], (res) => {
      if (res && res.leetroot_api_url) {
        apiBaseUrl = res.leetroot_api_url.replace(/\/$/, '');
      }
    });
  }

  /**
   * 1. Detect Problem Slug from supported LeetCode problem URLs.
   * Matches /problems/:slug/*
   */
  function extractProblemSlug(url) {
    const targetUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
    try {
      // Support relative or absolute URLs
      const pathname = targetUrl.startsWith('http') ? new URL(targetUrl).pathname : targetUrl;
      const match = pathname.match(/\/problems\/([a-zA-Z0-9_-]+)/);
      return match ? match[1].toLowerCase() : null;
    } catch {
      return null;
    }
  }

  /**
   * Construct canonical API endpoint URL
   */
  function formatApiUrl(base, slug, limit = 5) {
    const cleanBase = (base || DEFAULT_API_BASE).replace(/\/$/, '');
    return `${cleanBase}/v1/problems/${encodeURIComponent(slug)}/examples?limit=${limit}`;
  }

  /**
   * Embedded scoped styles for complete Shadow DOM isolation.
   */
  const SHADOW_STYLES = `
    :host {
      all: initial;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* Floating Trigger Button */
    #leetroot-floating-trigger {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999998;
      display: flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: #f8fafc;
      border: 1px solid #f59e0b;
      border-radius: 9999px;
      padding: 10px 18px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(245, 158, 11, 0.25), 0 4px 6px rgba(0, 0, 0, 0.3);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(12px);
    }

    #leetroot-floating-trigger:hover {
      transform: translateY(-2px) scale(1.02);
      box-shadow: 0 12px 24px rgba(245, 158, 11, 0.35);
      background: linear-gradient(135deg, #334155 0%, #1e293b 100%);
    }

    #leetroot-floating-trigger .lr-badge {
      background: #f59e0b;
      color: #0f172a;
      font-weight: 700;
      border-radius: 9999px;
      padding: 2px 7px;
      font-size: 11px;
    }

    /* Slide-out Sidebar Panel */
    #leetroot-sidebar {
      position: fixed;
      top: 0;
      right: -480px;
      width: 460px;
      height: 100vh;
      z-index: 999999;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(20px);
      border-left: 1px solid rgba(148, 163, 184, 0.15);
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    #leetroot-sidebar.lr-open {
      right: 0;
    }

    /* Header */
    .lr-header {
      padding: 16px 20px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.15);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(15, 23, 42, 0.8);
    }

    .lr-logo-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .lr-logo-icon {
      font-size: 20px;
      color: #f59e0b;
    }

    .lr-title {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
    }

    .lr-subtitle {
      font-size: 11px;
      color: #f59e0b;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .lr-header-actions {
      display: flex;
      gap: 8px;
    }

    .lr-btn-icon {
      background: transparent;
      border: 1px solid rgba(148, 163, 184, 0.2);
      color: #94a3b8;
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.15s ease;
    }

    .lr-btn-icon:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border-color: rgba(255, 255, 255, 0.3);
    }

    /* Tags Filter Bar */
    .lr-tags-bar {
      padding: 10px 20px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.15);
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
      background: rgba(30, 41, 59, 0.4);
    }

    .lr-tag-chip {
      background: rgba(51, 65, 85, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.2);
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .lr-tag-chip:hover, .lr-tag-chip.active {
      background: rgba(245, 158, 11, 0.2);
      border-color: #f59e0b;
      color: #fbbf24;
    }

    /* Content Area */
    .lr-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .lr-content::-webkit-scrollbar {
      width: 6px;
    }
    .lr-content::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.2);
      border-radius: 3px;
    }

    /* Example Card */
    .lr-card {
      background: #111827;
      border: 1px solid rgba(148, 163, 184, 0.15);
      border-radius: 10px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      transition: border-color 0.2s ease;
    }

    .lr-card:hover {
      border-color: rgba(245, 158, 11, 0.4);
    }

    .lr-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    .lr-repo-name {
      font-size: 14px;
      font-weight: 700;
      color: #fff;
    }

    .lr-repo-meta {
      font-size: 11px;
      color: #94a3b8;
      font-family: ui-monospace, Menlo, Consolas, monospace;
      word-break: break-all;
      margin-top: 2px;
    }

    .lr-badge-group {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .lr-stars-badge {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.3);
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 9999px;
      white-space: nowrap;
    }

    .lr-truncated-badge {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.3);
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 9999px;
    }

    .lr-rationale-box {
      background: rgba(15, 23, 42, 0.8);
      border-left: 3px solid #f59e0b;
      padding: 10px 12px;
      border-radius: 0 6px 6px 0;
      font-size: 12.5px;
      line-height: 1.5;
      color: #e2e8f0;
    }

    .lr-rationale-title {
      font-size: 11px;
      font-weight: 700;
      color: #f59e0b;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .lr-snippet-container {
      background: #090d16;
      border: 1px solid rgba(148, 163, 184, 0.1);
      border-radius: 6px;
      overflow: hidden;
    }

    .lr-snippet-toolbar {
      background: rgba(30, 41, 59, 0.5);
      padding: 6px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #94a3b8;
      font-family: ui-monospace, Menlo, Consolas, monospace;
      border-bottom: 1px solid rgba(148, 163, 184, 0.08);
    }

    .lr-code-block {
      margin: 0;
      padding: 12px;
      overflow-x: auto;
      font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.5;
      color: #cbd5e1;
      max-height: 220px;
      white-space: pre;
    }

    .lr-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 4px;
    }

    .lr-source-link {
      color: #38bdf8;
      font-size: 12px;
      font-weight: 500;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .lr-source-link:hover {
      color: #7dd3fc;
      text-decoration: underline;
    }

    .lr-copy-btn {
      background: rgba(51, 65, 85, 0.5);
      border: 1px solid rgba(148, 163, 184, 0.2);
      color: #94a3b8;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .lr-copy-btn:hover {
      background: rgba(51, 65, 85, 0.9);
      color: #fff;
    }

    /* States (Loading, Empty, Error) */
    .lr-state-container {
      text-align: center;
      padding: 48px 24px;
      color: #94a3b8;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .lr-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(245, 158, 11, 0.2);
      border-top-color: #f59e0b;
      border-radius: 50%;
      animation: lr-spin 0.8s linear infinite;
    }

    @keyframes lr-spin {
      to { transform: rotate(360deg); }
    }

    .lr-state-title {
      font-size: 15px;
      font-weight: 600;
      color: #fff;
    }

    .lr-state-desc {
      font-size: 12px;
      line-height: 1.5;
      max-width: 300px;
    }

    .lr-btn-primary {
      background: #f59e0b;
      color: #0f172a;
      border: none;
      font-weight: 600;
      font-size: 12px;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      margin-top: 8px;
      transition: background 0.15s ease;
    }

    .lr-btn-primary:hover {
      background: #d97706;
    }
  `;

  /**
   * 2. Initialize Shadow DOM Root
   */
  function getOrCreateShadowRoot() {
    if (shadowRoot) return shadowRoot;

    let host = document.getElementById('leetroot-extension-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'leetroot-extension-host';
      document.body.appendChild(host);
    }

    shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' });

    // Inject isolated styles
    const styleEl = document.createElement('style');
    styleEl.textContent = SHADOW_STYLES;
    shadowRoot.appendChild(styleEl);

    // Create persistent Sidebar Shell
    const sidebar = document.createElement('div');
    sidebar.id = 'leetroot-sidebar';
    sidebar.innerHTML = `
      <div class="lr-header">
        <div class="lr-logo-group">
          <span class="lr-logo-icon">⚡</span>
          <div>
            <div class="lr-title">LeetRoot</div>
            <div class="lr-subtitle">Verified Production Code</div>
          </div>
        </div>
        <div class="lr-header-actions">
          <button class="lr-btn-icon" id="lr-btn-refresh" title="Refresh">↻</button>
          <button class="lr-btn-icon" id="lr-btn-close" title="Close">✕</button>
        </div>
      </div>
      <div class="lr-tags-bar" id="lr-tags-bar" style="display: none;"></div>
      <div class="lr-content" id="lr-content"></div>
    `;
    shadowRoot.appendChild(sidebar);

    // Attach Header Listeners
    sidebar.querySelector('#lr-btn-close')?.addEventListener('click', () => toggleSidebar(false));
    sidebar.querySelector('#lr-btn-refresh')?.addEventListener('click', () => {
      if (currentProblemSlug) loadDataForProblem(currentProblemSlug, true);
    });

    return shadowRoot;
  }

  /**
   * 3. Toggle Sidebar visibility
   */
  function toggleSidebar(forceOpen) {
    const root = getOrCreateShadowRoot();
    const sidebar = root.getElementById('leetroot-sidebar');
    if (!sidebar) return;

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

  /**
   * 4. Floating Trigger Button inside Shadow DOM
   */
  function ensureFloatingTrigger(exampleCount = 0) {
    const root = getOrCreateShadowRoot();
    let trigger = root.getElementById('leetroot-floating-trigger');

    if (!trigger) {
      trigger = document.createElement('div');
      trigger.id = 'leetroot-floating-trigger';
      trigger.innerHTML = `
        <span>⚡ LeetRoot: Real Code</span>
        <span class="lr-badge" id="lr-count-badge">${exampleCount}</span>
      `;
      trigger.addEventListener('click', () => toggleSidebar());
      root.appendChild(trigger);
    } else {
      const badge = root.getElementById('lr-count-badge');
      if (badge) badge.textContent = exampleCount;
    }
  }

  /**
   * 5. Fetch verified examples from API with stale-response protection & request cancellation
   */
  async function loadDataForProblem(slug, forceRefresh = false) {
    if (!slug) return;

    // Abort previous in-flight request if navigating or re-requesting
    if (currentAbortController) {
      try {
        currentAbortController.abort();
      } catch {}
      currentAbortController = null;
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    currentAbortController = controller;
    const requestId = ++currentRequestId;
    currentProblemSlug = slug;

    const root = getOrCreateShadowRoot();
    const content = root.getElementById('lr-content');
    const tagsBar = root.getElementById('lr-tags-bar');

    if (tagsBar) tagsBar.style.display = 'none';
    if (content) {
      content.innerHTML = `
        <div class="lr-state-container">
          <div class="lr-spinner"></div>
          <div class="lr-state-title">Finding verified production code...</div>
          <p class="lr-state-desc">Scanning indexed repositories for <strong>${escapeHtml(slug)}</strong></p>
        </div>
      `;
    }

    try {
      // Primary: Canonical GET /api/v1/problems/:slug/examples?limit=5
      const url = formatApiUrl(apiBaseUrl, slug, 5);
      const fetchOptions = controller ? { signal: controller.signal } : {};
      const res = await fetch(url, fetchOptions);

      // Guard 1: Verify this response still belongs to the latest request & active problem slug
      if (requestId !== currentRequestId || slug !== currentProblemSlug) {
        return;
      }

      if (res.status === 404) {
        if (requestId !== currentRequestId || slug !== currentProblemSlug) return;
        renderEmptyState(slug, 'Problem not found in catalog or has no verified production code yet.');
        ensureFloatingTrigger(0);
        return;
      }

      if (!res.ok) {
        throw new Error(`API error HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      // Guard 2: Verify again after JSON deserialization
      if (requestId !== currentRequestId || slug !== currentProblemSlug) {
        return;
      }

      cachedData = data;
      renderSidebarContent(data);
      ensureFloatingTrigger(data.examples ? data.examples.length : 0);
    } catch (err) {
      // Silently ignore aborted requests to prevent flashing error state on navigation
      if (err.name === 'AbortError' || controller?.signal?.aborted) {
        return;
      }
      // Guard 3: Do not render error if navigation has moved to a different problem
      if (requestId !== currentRequestId || slug !== currentProblemSlug) {
        return;
      }
      console.error('[LeetRoot] Failed to fetch examples:', err);
      renderErrorState(err.message, slug);
      ensureFloatingTrigger('!');
    } finally {
      // Only clear controller reference if it has not been superseded by a newer request
      if (currentAbortController === controller) {
        currentAbortController = null;
      }
    }
  }

  /**
   * 6. Render Populated State
   */
  function renderSidebarContent(data) {
    const root = getOrCreateShadowRoot();
    const content = root.getElementById('lr-content');
    const tagsBar = root.getElementById('lr-tags-bar');
    if (!content || !tagsBar) return;

    const examples = data.examples || [];

    if (examples.length === 0) {
      renderEmptyState(currentProblemSlug, 'No verified production examples match this problem yet.');
      return;
    }

    // Render Tag Filter Chips
    const allTags = new Set();
    examples.forEach((ex) => {
      (ex.tags || []).forEach((t) => allTags.add(t.slug));
    });

    if (allTags.size > 1) {
      tagsBar.innerHTML = `
        <span class="lr-tag-chip ${!activeTagFilter ? 'active' : ''}" data-slug="all">All (${examples.length})</span>
        ${Array.from(allTags)
          .map(
            (slug) => `
          <span class="lr-tag-chip ${activeTagFilter === slug ? 'active' : ''}" data-slug="${slug}">
            ${escapeHtml(slug)}
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

    const filtered = activeTagFilter
      ? examples.filter((ex) => (ex.tags || []).some((t) => t.slug === activeTagFilter))
      : examples;

    content.innerHTML = filtered
      .map((ex, idx) => {
        const repo = ex.repo || { name: 'Repository', fullName: 'repo/repo', url: '#', stars: 0 };
        const starsFormatted = repo.stars >= 1000 ? `${(repo.stars / 1000).toFixed(0)}k` : repo.stars;
        const truncatedBadge = ex.isTruncated ? `<span class="lr-truncated-badge">Max 40L</span>` : '';

        return `
          <div class="lr-card">
            <div class="lr-card-header">
              <div class="lr-repo-info">
                <div class="lr-repo-name">${escapeHtml(repo.fullName)}</div>
                <div class="lr-repo-meta">${escapeHtml(ex.filePath)}:L${ex.startLine}-L${ex.endLine}</div>
              </div>
              <div class="lr-badge-group">
                ${truncatedBadge}
                <div class="lr-stars-badge">★ ${starsFormatted}</div>
              </div>
            </div>

            <div class="lr-rationale-box">
              <div class="lr-rationale-title">Why Production Uses This</div>
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
              <a href="${escapeHtml(ex.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="lr-source-link">
                View on GitHub (L${ex.startLine}&ndash;L${ex.endLine}) &rarr;
              </a>
              <button class="lr-copy-btn" data-idx="${idx}">Copy Snippet</button>
            </div>
          </div>
        `;
      })
      .join('');

    // Attach copy button handlers
    content.querySelectorAll('.lr-copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx') || '0', 10);
        const snippet = filtered[idx]?.codeSnippet || '';
        if (navigator.clipboard) {
          navigator.clipboard.writeText(snippet).then(() => {
            const orig = btn.textContent;
            btn.textContent = 'Copied!';
            btn.style.color = '#10b981';
            setTimeout(() => {
              btn.textContent = orig;
              btn.style.color = '';
            }, 1800);
          });
        }
      });
    });
  }

  /**
   * 7. Render Empty State
   */
  function renderEmptyState(slug, message) {
    const root = getOrCreateShadowRoot();
    const content = root.getElementById('lr-content');
    if (!content) return;

    content.innerHTML = `
      <div class="lr-state-container">
        <div style="font-size: 32px;">📁</div>
        <div class="lr-state-title">No Verified Examples Yet</div>
        <p class="lr-state-desc">${escapeHtml(message || 'No verified production code found.')}</p>
        <button class="lr-btn-primary" id="lr-btn-check-again">Check Again</button>
      </div>
    `;

    root.getElementById('lr-btn-check-again')?.addEventListener('click', () => {
      loadDataForProblem(currentProblemSlug, true);
    });
  }

  /**
   * 8. Render Error State
   */
  function renderErrorState(errorMessage, slug) {
    const root = getOrCreateShadowRoot();
    const content = root.getElementById('lr-content');
    if (!content) return;

    content.innerHTML = `
      <div class="lr-state-container">
        <div style="font-size: 32px;">⚠️</div>
        <div class="lr-state-title">Connection Error</div>
        <p class="lr-state-desc">Could not reach LeetRoot API at <code>${escapeHtml(apiBaseUrl)}</code>: ${escapeHtml(errorMessage)}</p>
        <button class="lr-btn-primary" id="lr-btn-retry">Retry</button>
      </div>
    `;

    root.getElementById('lr-btn-retry')?.addEventListener('click', () => {
      loadDataForProblem(slug || currentProblemSlug, true);
    });
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

  /**
   * 9. SPA Location Change Detection & URL Watcher
   */
  function handleLocationChange() {
    const slug = extractProblemSlug();
    if (!slug) return;

    // Avoid repeated API calls when slug remains unchanged and data is already cached
    if (slug === currentProblemSlug && cachedData) {
      return;
    }

    if (slug !== currentProblemSlug) {
      console.log(`[LeetRoot] Problem navigated to: ${slug}`);
      currentProblemSlug = slug;
      cachedData = null;
      activeTagFilter = null;
      ensureFloatingTrigger(0);
      loadDataForProblem(slug);
    }
  }

  /**
   * Lightweight URL change detector for Chrome MV3 isolated world.
   * Polls every 1s and self-cleans if extension UI is removed from the DOM.
   */
  function checkUrlChange() {
    if (typeof window === 'undefined') return;

    // Stop and clean up timer if extension UI host was removed from DOM
    if (shadowRoot && !document.getElementById('leetroot-extension-host')) {
      stopUrlWatcher();
      return;
    }

    const currentHref = window.location.href;
    if (currentHref !== lastObservedUrl) {
      lastObservedUrl = currentHref;
      handleLocationChange();
    }
  }

  function startUrlWatcher() {
    if (navigationIntervalId) return;
    lastObservedUrl = typeof window !== 'undefined' ? window.location.href : '';
    navigationIntervalId = setInterval(checkUrlChange, 1000);
  }

  function stopUrlWatcher() {
    if (navigationIntervalId) {
      clearInterval(navigationIntervalId);
      navigationIntervalId = null;
    }
  }

  // Initialize listeners and start watcher
  if (typeof window !== 'undefined') {
    if (window.history) {
      const origPushState = history.pushState;
      history.pushState = function () {
        origPushState.apply(this, arguments);
        setTimeout(handleLocationChange, 50);
      };

      const origReplaceState = history.replaceState;
      history.replaceState = function () {
        origReplaceState.apply(this, arguments);
        setTimeout(handleLocationChange, 50);
      };

      window.addEventListener('popstate', () => {
        setTimeout(handleLocationChange, 50);
      });
    }

    window.addEventListener('beforeunload', stopUrlWatcher);

    // Initial check and start lightweight 1-second watcher
    setTimeout(() => {
      handleLocationChange();
      startUrlWatcher();
    }, 300);
  }

  // Export helpers for testing environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      extractProblemSlug,
      formatApiUrl,
      escapeHtml,
      loadDataForProblem,
      handleLocationChange,
      checkUrlChange,
      startUrlWatcher,
      stopUrlWatcher,
      getCurrentProblemSlug: () => currentProblemSlug,
      getCachedData: () => cachedData,
      getCurrentRequestId: () => currentRequestId,
      resetStateForTesting: () => {
        currentProblemSlug = '';
        cachedData = null;
        activeTagFilter = null;
        if (currentAbortController) {
          try {
            currentAbortController.abort();
          } catch {}
          currentAbortController = null;
        }
        currentRequestId = 0;
        stopUrlWatcher();
        lastObservedUrl = '';
      },
    };
  }
})();
