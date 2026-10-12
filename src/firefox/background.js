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
});

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
      sendResponse({ success: true, count: request.ids.length });
    });
    return true;
  }
});

async function refreshLikedCache() {
  let tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
  let targetTabId = null;
  let createdTab = false;

  if (tabs.length > 0) {
    targetTabId = tabs[0].id;
  } else {
    const tab = await chrome.tabs.create({ url: "https://www.youtube.com/playlist?list=LL", active: false });
    targetTabId = tab.id;
    createdTab = true;
    await new Promise(r => setTimeout(r, 4000));
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: async () => {
        const res = await fetch("https://www.youtube.com/playlist?list=LL", { credentials: "include" });
        const html = await res.text();
        const matches = html.matchAll(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g);
        const ids = [];
        for (const m of matches) {
          ids.push(m[1]);
        }
        return ids;
      }
    });

    if (createdTab) {
      chrome.tabs.remove(targetTabId);
    }

    if (results && results[0] && results[0].result) {
      return await overwritePlaylistCache(results[0].result);
    } else {
      throw new Error("Could not extract IDs");
    }
  } catch (err) {
    if (createdTab) {
      chrome.tabs.remove(targetTabId);
    }
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
        resolve(updatedArray.length);
      });
    });
  });
}

async function overwritePlaylistCache(newIds) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['likedVideoIds'], (data) => {
      if (chrome.runtime.lastError) {
        resolve(0);
        return;
      }
      const existingSet = new Set(data.likedVideoIds || []);
      const fetchedSet = new Set(newIds);
      
      for (const id of fetchedSet) {
        existingSet.add(id);
      }
      
      const updatedArray = Array.from(existingSet);
      chrome.storage.local.set({ likedVideoIds: updatedArray, lastUpdated: Date.now() }, () => {
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
        resolve(updatedArray.length);
      });
    });
  });
}

setInterval(refreshLikedCache, 30 * 60 * 1000);