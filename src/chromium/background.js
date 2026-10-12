const defaultSettings = {
  mode: 'badge_dim',
  dimOpacity: 0.35,
  badgeSize: 11,
  badgeColor: '#ff2255',
  badgeTextOpacity: 1.0,
  badgeText: '★ Liked',
  badgeBgColor: '#000000',
  badgeBgOpacity: 0.85,
  showBadge: true
};

function updateBadge(count) {
  chrome.storage.sync.get(['showBadge'], (data) => {
    if (chrome.runtime.lastError) return;
    const showBadge = data.showBadge !== undefined ? data.showBadge : true;
    if (!showBadge) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    let text = '';
    if (count > 0) {
      if (count >= 100000) {
        text = '+';
      } else if (count >= 1000) {
        const roundedK = Math.round(count / 1000);
        text = roundedK + 'k';
      } else {
        text = count.toString();
      }
    }
    chrome.action.setBadgeText({ text: text });
    chrome.action.setBadgeBackgroundColor({ color: '#cc0000' });
  });
}

function syncBadgeFromStorage() {
  chrome.storage.local.get(['likedVideoIds'], (data) => {
    if (chrome.runtime.lastError) return;
    const count = data.likedVideoIds ? data.likedVideoIds.length : 0;
    updateBadge(count);
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.showBadge !== undefined) {
    syncBadgeFromStorage();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['mode', 'dimOpacity', 'badgeSize', 'badgeColor', 'badgeTextOpacity', 'badgeText', 'badgeBgColor', 'badgeBgOpacity', 'showBadge'], (data) => {
    if (chrome.runtime.lastError) return;
    const settings = {
      mode: data.mode || defaultSettings.mode,
      dimOpacity: data.dimOpacity !== undefined ? data.dimOpacity : defaultSettings.dimOpacity,
      badgeSize: data.badgeSize !== undefined ? data.badgeSize : defaultSettings.badgeSize,
      badgeColor: data.badgeColor || defaultSettings.badgeColor,
      badgeTextOpacity: data.badgeTextOpacity !== undefined ? data.badgeTextOpacity : defaultSettings.badgeTextOpacity,
      badgeText: data.badgeText !== undefined ? data.badgeText : defaultSettings.badgeText,
      badgeBgColor: data.badgeBgColor || defaultSettings.badgeBgColor,
      badgeBgOpacity: data.badgeBgOpacity !== undefined ? data.badgeBgOpacity : defaultSettings.badgeBgOpacity,
      showBadge: data.showBadge !== undefined ? data.showBadge : defaultSettings.showBadge
    };
    chrome.storage.sync.set(settings);
    refreshLikedCache();
  });
  syncBadgeFromStorage();
});

syncBadgeFromStorage();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "refreshCache") {
    refreshLikedCache().then((count) => {
      sendResponse({ success: true, count });
    }).catch(err => {
      sendResponse({ success: false, error: err.toString() });
    });
    return true;
  }
  if (request.action === "addScrapedIds") {
    addNewIds(request.ids).then(total => {
      sendResponse({ success: true, total });
    });
    return true;
  }
  if (request.action === "updateLikeStatus") {
    updateSingleLikeStatus(request.videoId, request.isLiked).then(total => {
      sendResponse({ success: true, total });
    });
    return true;
  }
  if (request.action === "exportData") {
    chrome.storage.local.get(['likedVideoIds'], (data) => {
      sendResponse({ likedVideoIds: data.likedVideoIds || [] });
    });
    return true;
  }
  if (request.action === "importData") {
    chrome.storage.local.set({ likedVideoIds: request.ids }, () => {
      updateBadge(request.ids.length);
      sendResponse({ success: true, count: request.ids.length });
    });
    return true;
  }
});

async function refreshLikedCache() {
  try {
    const response = await fetch("https://www.youtube.com/playlist?list=LL", {
      credentials: "include"
    });
    const html = await response.text();
    const matches = html.matchAll(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g);
    const newIds = [];
    for (const match of matches) {
      newIds.push(match[1]);
    }
    return await addNewIds(newIds);
  } catch (err) {
    throw err;
  }
}

async function addNewIds(newIds) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['likedVideoIds'], (data) => {
      if (chrome.runtime.lastError) {
        resolve(0);
        return;
      }
      const existingSet = new Set(data.likedVideoIds || []);
      let addedCount = 0;
      for (const id of newIds) {
        if (!existingSet.has(id)) {
          existingSet.add(id);
          addedCount++;
        }
      }
      const updatedArray = Array.from(existingSet);
      chrome.storage.local.set({ likedVideoIds: updatedArray, lastUpdated: Date.now() }, () => {
        updateBadge(updatedArray.length);
        resolve(updatedArray.length);
      });
    });
  });
}

async function updateSingleLikeStatus(videoId, isLiked) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['likedVideoIds'], (data) => {
      if (chrome.runtime.lastError) {
        resolve(0);
        return;
      }
      const existingSet = new Set(data.likedVideoIds || []);
      if (isLiked) {
        existingSet.add(videoId);
      } else {
        existingSet.delete(videoId);
      }
      const updatedArray = Array.from(existingSet);
      chrome.storage.local.set({ likedVideoIds: updatedArray }, () => {
        updateBadge(updatedArray.length);
        resolve(updatedArray.length);
      });
    });
  });
}

setInterval(refreshLikedCache, 30 * 60 * 1000);