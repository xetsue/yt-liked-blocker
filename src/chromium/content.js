let currentMode = 'badge_dim';
let currentDimOpacity = 0.35;
let currentBadgeSize = 11;
let currentBadgeColor = '#ff2255';
let currentBadgeTextOpacity = 1.0;
let currentBadgeText = '★ Liked';
let currentBadgeBgColor = '#000000';
let currentBadgeBgOpacity = 0.85;

let likedIdsSet = new Set();
let lastObservedVideoId = null;
let timeoutId = null;
let lastScrapedUrl = null;

function init() {
  try {
    chrome.storage.sync.get(['mode', 'dimOpacity', 'badgeSize', 'badgeColor', 'badgeTextOpacity', 'badgeText', 'badgeBgColor', 'badgeBgOpacity'], (data) => {
      if (chrome.runtime.lastError) return;
      if (data.mode) currentMode = data.mode;
      if (data.dimOpacity !== undefined) currentDimOpacity = data.dimOpacity;
      if (data.badgeSize !== undefined) currentBadgeSize = data.badgeSize;
      if (data.badgeColor) currentBadgeColor = data.badgeColor;
      if (data.badgeTextOpacity !== undefined) currentBadgeTextOpacity = data.badgeTextOpacity;
      if (data.badgeText !== undefined) currentBadgeText = data.badgeText;
      if (data.badgeBgColor) currentBadgeBgColor = data.badgeBgColor;
      if (data.badgeBgOpacity !== undefined) currentBadgeBgOpacity = data.badgeBgOpacity;
    });

    chrome.storage.local.get(['likedVideoIds'], (data) => {
      if (chrome.runtime.lastError) return;
      if (data.likedVideoIds) {
        likedIdsSet = new Set(data.likedVideoIds);
        processPage();
      }
    });
  } catch (err) {
    console.error(err);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      if (changes.mode) currentMode = changes.mode.newValue;
      if (changes.dimOpacity) currentDimOpacity = changes.dimOpacity.newValue;
      if (changes.badgeSize) currentBadgeSize = changes.badgeSize.newValue;
      if (changes.badgeColor) currentBadgeColor = changes.badgeColor.newValue;
      if (changes.badgeTextOpacity) currentBadgeTextOpacity = changes.badgeTextOpacity.newValue;
      if (changes.badgeText) currentBadgeText = changes.badgeText.newValue;
      if (changes.badgeBgColor) currentBadgeBgColor = changes.badgeBgColor.newValue;
      if (changes.badgeBgOpacity) currentBadgeBgOpacity = changes.badgeBgOpacity.newValue;

      resetProcessedCards();
      processPage();
    }
    if (area === 'local' && changes.likedVideoIds) {
      if (changes.likedVideoIds.newValue) {
        likedIdsSet = new Set(changes.likedVideoIds.newValue);
        processPage();
      }
    }
  });

  observeDOM();
  setupLikeButtonListener();
}

function observeDOM() {
  const observer = new MutationObserver(() => {
    if (currentMode === 'disabled') return;
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      processPage();
      checkWatchPageLikeState();
    }, 400);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function getAllElementsIncludingShadowDOM(selector, root = document) {
  const elements = Array.from(root.querySelectorAll(selector));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let currentNode = walker.currentNode;

  while (currentNode) {
    if (currentNode.shadowRoot) {
      elements.push(...getAllElementsIncludingShadowDOM(selector, currentNode.shadowRoot));
    }
    currentNode = walker.nextNode();
  }
  return elements;
}

function extractVideoId(card) {
  let href = card.getAttribute('href') || card.querySelector('a')?.getAttribute('href');
  if (href) {
    const match = href.match(/[?&]v=([^&]+)/) || href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
  }
  
  const parentLink = card.closest('a');
  if (parentLink) {
    const parentHref = parentLink.getAttribute('href');
    const match = parentHref ? parentHref.match(/[?&]v=([^&]+)/) : null;
    if (match) return match[1];
  }

  const sessionLink = card.getAttribute('data-sessionlink') || card.querySelector('[data-sessionlink]')?.getAttribute('data-sessionlink');
  if (sessionLink) {
    const match = sessionLink.match(/[?&]v=([^&]+)/);
    if (match) return match[1];
  }

  for (const attr of card.attributes) {
    const val = attr.value;
    const match = val && typeof val === 'string' ? val.match(/[?&]v=([a-zA-Z0-9_-]{11})/) : null;
    if (match) return match[1];
  }

  const style = card.getAttribute('style') || card.querySelector('.ytp-ce-image, .ytp-videowall-still-image, .ytp-modern-videowall-still-image, .ytp-autonav-endscreen-upnext-thumbnail')?.getAttribute('style') || '';
  const bgMatch = style.match(/\/vi\/([a-zA-Z0-9_-]{11})\//) || style.match(/\/vi_webp\/([a-zA-Z0-9_-]{11})\//);
  if (bgMatch) return bgMatch[1];

  return null;
}

function processPage() {
  if (currentMode === 'disabled') return;

  if (window.location.href.includes('playlist?list=LL')) {
    if (window.location.href !== lastScrapedUrl) {
      lastScrapedUrl = window.location.href;
      scrapePlaylistPage();
    }
  } else {
    lastScrapedUrl = null;
  }

  const selectors = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'yt-lockup-view-model',
    'ytd-rich-grid-media',
    '.ytp-videowall-still',
    '.ytp-modern-videowall-still-image',
    'div.ytp-autonav-endscreen-upnext-thumbnail',
    '.ytp-ce-element',
    '.ytp-suggestion-video',
    '.ytp-ce-video'
  ];

  const videoCards = getAllElementsIncludingShadowDOM(selectors.join(', '));

  videoCards.forEach(card => {
    const videoId = extractVideoId(card);
    if (!videoId) return;

    if (likedIdsSet.has(videoId)) {
      applyMode(card);
    } else {
      removeMode(card);
    }
  });
}

function scrapePlaylistPage() {
  setTimeout(() => {
    if (!window.location.href.includes('playlist?list=LL')) return;
    const links = document.querySelectorAll('ytd-playlist-video-renderer a[href*="/watch?v="], ytd-playlist-panel-video-renderer a[href*="/watch?v="]');
    const foundIds = [];
    links.forEach(link => {
      const href = link.getAttribute('href');
      const match = href ? href.match(/[?&]v=([^&]+)/) : null;
      if (match && !foundIds.includes(match[1])) {
        foundIds.push(match[1]);
      }
    });

    if (foundIds.length > 0) {
      chrome.runtime.sendMessage({ action: "addScrapedIds", ids: foundIds });
    }
  }, 1000);
}

function setupLikeButtonListener() {
  document.addEventListener('click', (e) => {
    const button = e.target.closest('button[aria-label*="like"], ytd-toggle-button-renderer');
    if (!button) return;

    setTimeout(() => {
      checkWatchPageLikeState(true);
    }, 300);
  });
}

function checkWatchPageLikeState(forced = false) {
  if (!window.location.href.includes('/watch?v=')) return;
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v');
  if (!videoId) return;

  if (videoId !== lastObservedVideoId || forced) {
    lastObservedVideoId = videoId;
  }

  const likeButton = document.querySelector('ytd-watch-metadata button[aria-label*="like"], #segmented-like-button button, button[aria-label^="I like this"]');
  if (!likeButton) return;

  const ariaPressed = likeButton.getAttribute('aria-pressed');
  if (ariaPressed === 'true' || ariaPressed === 'false') {
    const isLiked = ariaPressed === 'true';
    const currentlyStored = likedIdsSet.has(videoId);
    if (isLiked !== currentlyStored) {
      chrome.runtime.sendMessage({ action: "updateLikeStatus", videoId, isLiked });
    }
  }
}

function setCardDimmed(card, dimmed, opacity) {
  const images = card.querySelectorAll('img, yt-image img, .yt-core-image, .ytp-videowall-still-image, .ytp-modern-videowall-still-image, .ytp-autonav-endscreen-upnext-thumbnail, .ytp-ce-image, .ytp-ce-covering-image');
  images.forEach(img => {
    img.style.opacity = dimmed ? opacity : '';
  });

  const details = card.querySelectorAll('#details, #meta, .yt-lockup-metadata-view-model, ytd-channel-name, .ytp-ce-text, .ytp-autonav-endscreen-upnext-title');
  details.forEach(el => {
    el.style.opacity = dimmed ? opacity : '';
  });
}

function applyMode(card) {
  if (currentMode === 'hide') {
    card.style.display = 'none';
    removeBadge(card);
    setCardDimmed(card, false, 1);
  } else if (currentMode === 'badge') {
    card.style.display = '';
    setCardDimmed(card, false, 1);
    markAsLiked(card);
  } else if (currentMode === 'dim') {
    card.style.display = '';
    setCardDimmed(card, true, currentDimOpacity);
    removeBadge(card);
  } else if (currentMode === 'badge_dim') {
    card.style.display = '';
    setCardDimmed(card, true, currentDimOpacity);
    markAsLiked(card);
  } else {
    removeMode(card);
  }
}

function removeMode(card) {
  card.style.display = '';
  setCardDimmed(card, false, 1);
  removeBadge(card);
}

function resetProcessedCards() {
  const selectors = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'yt-lockup-view-model',
    'ytd-rich-grid-media',
    '.ytp-videowall-still',
    '.ytp-modern-videowall-still-image',
    'div.ytp-autonav-endscreen-upnext-thumbnail',
    '.ytp-ce-element',
    '.ytp-suggestion-video',
    '.ytp-ce-video'
  ];
  const cards = getAllElementsIncludingShadowDOM(selectors.join(', '));
  cards.forEach(card => removeMode(card));
}

function removeBadge(card) {
  const badge = card.querySelector('.liked-badge-hint');
  if (badge) badge.remove();
}

function hexToRgba(hex, opacity) {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const num = parseInt(c, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${opacity})`;
}

function markAsLiked(card) {
  let badge = card.querySelector('.liked-badge-hint');
  if (badge) {
    badge.textContent = currentBadgeText;
    badge.style.fontSize = `${currentBadgeSize}px`;
    badge.style.color = hexToRgba(currentBadgeColor, currentBadgeTextOpacity);
    badge.style.background = hexToRgba(currentBadgeBgColor, currentBadgeBgOpacity);
    return;
  }
  
  badge = document.createElement('div');
  badge.className = 'liked-badge-hint';
  badge.textContent = currentBadgeText;
  
  const isPlayerOverlay = card.classList.contains('ytp-ce-element') || 
                          card.classList.contains('ytp-videowall-still') || 
                          card.classList.contains('ytp-modern-videowall-still-image') ||
                          card.classList.contains('ytp-autonav-endscreen-upnext-thumbnail') ||
                          card.closest('.html5-video-player');

  const positionCss = isPlayerOverlay 
    ? `bottom: 8px; left: 8px; top: auto; right: auto;`
    : `top: 8px; right: 8px; bottom: auto; left: auto;`;

  badge.style.cssText = `
    position: absolute;
    ${positionCss}
    background: ${hexToRgba(currentBadgeBgColor, currentBadgeBgOpacity)};
    color: ${hexToRgba(currentBadgeColor, currentBadgeTextOpacity)};
    padding: 3px 7px;
    font-size: ${currentBadgeSize}px;
    font-weight: bold;
    border-radius: 4px;
    z-index: 99999;
    pointer-events: none;
  `;
  
  const thumb = card.querySelector('ytd-thumbnail, #thumbnail, a#thumbnail, yt-img-shadow, .ytp-videowall-still-image, .ytp-modern-videowall-still-image, div.ytp-autonav-endscreen-upnext-thumbnail, .ytp-ce-image, .ytp-ce-covering-image, a.yt-lockup-thumbnail, [id*="thumbnail"], .thumbnail, .ytp-videowall-still') || card.querySelector('img')?.parentElement || card;
  
  if (thumb) {
    const computedPos = window.getComputedStyle(thumb).position;
    if (computedPos === 'static' || !computedPos) {
      thumb.style.position = 'relative';
    }
    thumb.appendChild(badge);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}