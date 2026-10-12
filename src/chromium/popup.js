document.addEventListener('DOMContentLoaded', () => {
  const radios = document.querySelectorAll('input[name="mode"]');
  const showBadgeInput = document.getElementById('showBadgeInput');
  const badgeTextInput = document.getElementById('badgeTextInput');
  const dimOpacityInput = document.getElementById('dimOpacityInput');
  const badgeSizeInput = document.getElementById('badgeSizeInput');
  const badgeColorInput = document.getElementById('badgeColorInput');
  const badgeTextOpacityInput = document.getElementById('badgeTextOpacityInput');
  const badgeBgColorInput = document.getElementById('badgeBgColorInput');
  const badgeBgOpacityInput = document.getElementById('badgeBgOpacityInput');
  const resetSettingsBtn = document.getElementById('resetSettingsBtn');

  const refreshBtn = document.getElementById('refreshBtn');
  const openPlaylistBtn = document.getElementById('openPlaylistBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const statusDiv = document.getElementById('status');
  const rawCountDiv = document.getElementById('rawCount');

  function updateRawCountDisplay() {
    chrome.storage.local.get(['likedVideoIds'], (data) => {
      if (chrome.runtime.lastError) return;
      const count = data.likedVideoIds ? data.likedVideoIds.length : 0;
      rawCountDiv.textContent = `Raw Count: ${count}`;
    });
  }

  updateRawCountDisplay();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.likedVideoIds) {
      updateRawCountDisplay();
    }
  });

  chrome.storage.sync.get(['mode', 'dimOpacity', 'badgeSize', 'badgeColor', 'badgeTextOpacity', 'badgeText', 'badgeBgColor', 'badgeBgOpacity', 'showBadge'], (data) => {
    if (chrome.runtime.lastError) return;
    const currentMode = data.mode || 'badge_dim';
    radios.forEach(radio => {
      if (radio.value === currentMode) radio.checked = true;
    });

    showBadgeInput.checked = data.showBadge !== undefined ? data.showBadge : true;
    badgeTextInput.value = data.badgeText !== undefined ? data.badgeText : '★ Liked';
    dimOpacityInput.value = data.dimOpacity !== undefined ? data.dimOpacity : 0.35;
    badgeSizeInput.value = data.badgeSize !== undefined ? data.badgeSize : 11;
    badgeColorInput.value = data.badgeColor || '#ff2255';
    badgeTextOpacityInput.value = data.badgeTextOpacity !== undefined ? data.badgeTextOpacity : 1.0;
    badgeBgColorInput.value = data.badgeBgColor || '#000000';
    badgeBgOpacityInput.value = data.badgeBgOpacity !== undefined ? data.badgeBgOpacity : 0.85;
  });

  radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const mode = e.target.value;
      chrome.storage.sync.set({ mode }, () => {
        showStatus('Setting updated!');
      });
    });
  });

  showBadgeInput.addEventListener('change', (e) => {
    chrome.storage.sync.set({ showBadge: e.target.checked }, () => {
      showStatus('Setting updated!');
    });
  });

  badgeTextInput.addEventListener('input', (e) => {
    chrome.storage.sync.set({ badgeText: e.target.value });
  });

  dimOpacityInput.addEventListener('input', (e) => {
    chrome.storage.sync.set({ dimOpacity: parseFloat(e.target.value) });
  });

  badgeSizeInput.addEventListener('input', (e) => {
    chrome.storage.sync.set({ badgeSize: parseInt(e.target.value) });
  });

  badgeColorInput.addEventListener('input', (e) => {
    chrome.storage.sync.set({ badgeColor: e.target.value });
  });

  badgeTextOpacityInput.addEventListener('input', (e) => {
    chrome.storage.sync.set({ badgeTextOpacity: parseFloat(e.target.value) });
  });

  badgeBgColorInput.addEventListener('input', (e) => {
    chrome.storage.sync.set({ badgeBgColor: e.target.value });
  });

  badgeBgOpacityInput.addEventListener('input', (e) => {
    chrome.storage.sync.set({ badgeBgOpacity: parseFloat(e.target.value) });
  });

  resetSettingsBtn.addEventListener('click', () => {
    const defaults = {
      dimOpacity: 0.35,
      badgeSize: 11,
      badgeColor: '#ff2255',
      badgeTextOpacity: 1.0,
      badgeText: '★ Liked',
      badgeBgColor: '#000000',
      badgeBgOpacity: 0.85,
      showBadge: true
    };
    chrome.storage.sync.set(defaults, () => {
      showBadgeInput.checked = true;
      badgeTextInput.value = '★ Liked';
      dimOpacityInput.value = 0.35;
      badgeSizeInput.value = 11;
      badgeColorInput.value = '#ff2255';
      badgeTextOpacityInput.value = 1.0;
      badgeBgColorInput.value = '#000000';
      badgeBgOpacityInput.value = 0.85;
      showStatus('Advanced settings reset!');
    });
  });

  refreshBtn.addEventListener('click', () => {
    refreshBtn.disabled = true;
    showStatus('Syncing liked playlist...');
    
    chrome.runtime.sendMessage({ action: "refreshCache" }, (response) => {
      refreshBtn.disabled = false;
      if (response && response.success) {
        showStatus(`Synced! Total: ${response.count} videos`);
        updateRawCountDisplay();
      } else {
        showStatus('Sync failed. Log in to YouTube.');
      }
    });
  });

  openPlaylistBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: "https://www.youtube.com/playlist?list=LL" });
  });

  exportBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "exportData" }, (response) => {
      if (response && response.likedVideoIds) {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(response.likedVideoIds, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "youtube_liked_videos_backup.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showStatus('Exported successfully!');
      } else {
        showStatus('No data to export.');
      }
    });
  });

  importBtn.addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
      try {
        const ids = JSON.parse(event.target.result);
        if (Array.isArray(ids)) {
          chrome.runtime.sendMessage({ action: "importData", ids }, (response) => {
            if (response && response.success) {
              showStatus(`Imported ${response.count} IDs!`);
              updateRawCountDisplay();
            } else {
              showStatus('Import failed.');
            }
          });
        } else {
          showStatus('Invalid JSON format.');
        }
      } catch (err) {
        showStatus('Error parsing JSON file.');
      }
    };
    reader.readAsText(file);
  });

  function showStatus(msg) {
    statusDiv.textContent = msg;
    setTimeout(() => { statusDiv.textContent = ''; }, 3500);
  }
});