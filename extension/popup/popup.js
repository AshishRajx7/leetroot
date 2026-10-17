document.addEventListener('DOMContentLoaded', async () => {
  const statusPill = document.getElementById('status-pill');
  const statusText = document.getElementById('status-text');
  const apiUrlInput = document.getElementById('api-url');
  const btnSaveUrl = document.getElementById('btn-save-url');

  const statExamples = document.getElementById('stat-examples');
  const statRepos = document.getElementById('stat-repos');
  const statTags = document.getElementById('stat-tags');
  const statProblems = document.getElementById('stat-problems');

  let apiUrl = 'http://localhost:4000/api';

  // Load saved API url
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['leetroot_api_url'], (res) => {
      if (res && res.leetroot_api_url) {
        apiUrl = res.leetroot_api_url;
        apiUrlInput.value = apiUrl;
      }
      checkStatusAndFetchStats();
    });
  } else {
    checkStatusAndFetchStats();
  }

  btnSaveUrl.addEventListener('click', () => {
    const newUrl = apiUrlInput.value.trim().replace(/\/$/, '');
    if (newUrl) {
      apiUrl = newUrl;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ leetroot_api_url: apiUrl }, () => {
          btnSaveUrl.textContent = 'Saved!';
          setTimeout(() => (btnSaveUrl.textContent = 'Save'), 1500);
          checkStatusAndFetchStats();
        });
      }
    }
  });

  async function checkStatusAndFetchStats() {
    try {
      const res = await fetch(`${apiUrl}/health`);
      if (res.ok) {
        statusPill.className = 'status-pill online';
        statusText.textContent = 'Online';
      } else {
        throw new Error('Not 200');
      }

      const statsRes = await fetch(`${apiUrl}/stats`);
      const data = await statsRes.json();
      if (data && data.stats) {
        statExamples.textContent = data.stats.totalExamples ?? 0;
        statRepos.textContent = data.curatedReposCount ?? 16;
        statTags.textContent = data.stats.totalTags ?? 0;
        statProblems.textContent = data.stats.totalProblems ?? 0;
      }
    } catch {
      statusPill.className = 'status-pill offline';
      statusText.textContent = 'Offline';
    }
  }
});
