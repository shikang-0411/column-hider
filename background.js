const STORAGE_KEY = "columnRules";

const DEFAULT_RULES = [
  { id: "default-image", ariaLabel: "Image", matchType: "exact", enabled: true },
  { id: "default-player", ariaLabel: "Player", matchType: "exact", enabled: true },
  { id: "default-uptime", ariaLabel: "Uptime", matchType: "contains", enabled: true },
];

const RETRY_MS = 1500;
const RETRY_MAX = 20;

const retryTimers = new Map();
const pendingApply = new Map();
const activeTableTabs = new Set();

function isInjectableUrl(url) {
  if (!url) return false;
  return !(
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("devtools://")
  );
}

async function getStoredRules() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] ?? DEFAULT_RULES;
}

async function injectStyles(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId, allFrames: true },
      files: ["content.css"],
    });
  } catch {
    // Styles may already be present.
  }
}

async function injectPageLogic(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["page-logic.js"],
  });
}

async function notifyContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PAGE_READY" });
  } catch {
    // Manifest content script may not be ready in this frame yet.
  }
}

async function applyRulesToTab(tabId, rules) {
  const tab = await chrome.tabs.get(tabId);
  if (!isInjectableUrl(tab.url)) {
    return { containerCount: 0, hiddenCount: 0 };
  }

  await injectStyles(tabId);

  try {
    await injectPageLogic(tabId);
  } catch {
    return { containerCount: 0, hiddenCount: 0 };
  }

  const injections = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: "ISOLATED",
    func: (rulesArg) => {
      const logic = globalThis.TCH_PAGE_LOGIC;
      if (!logic) return { containerCount: 0, hiddenCount: 0 };

      const scan = logic.scanDocument();
      if (scan.containerCount === 0) {
        return { containerCount: 0, hiddenCount: 0 };
      }

      logic.applyTextReplacements?.();
      logic.applyRulesToDocument(rulesArg ?? []);
      return {
        containerCount: scan.containerCount,
        hiddenCount: document.querySelectorAll('[data-tch-hidden="true"]').length,
      };
    },
    args: [rules],
  });

  return injections.reduce(
    (totals, entry) => ({
      containerCount: totals.containerCount + (entry.result?.containerCount ?? 0),
      hiddenCount: totals.hiddenCount + (entry.result?.hiddenCount ?? 0),
    }),
    { containerCount: 0, hiddenCount: 0 }
  );
}

async function ensureContentAndApply(tabId) {
  const rules = await getStoredRules();
  const result = await applyRulesToTab(tabId, rules);

  if (result.containerCount === 0) {
    activeTableTabs.delete(tabId);
    stopRetryLoop(tabId);
    return result;
  }

  activeTableTabs.add(tabId);

  if (result.hiddenCount > 0) {
    stopRetryLoop(tabId);
    await notifyContentScript(tabId);
    return result;
  }

  return result;
}

function queueApply(tabId) {
  clearTimeout(pendingApply.get(tabId));
  pendingApply.set(
    tabId,
    setTimeout(async () => {
      pendingApply.delete(tabId);

      const result = await ensureContentAndApply(tabId);
      if (result.containerCount > 0 && result.hiddenCount === 0) {
        startRetryLoop(tabId);
      }
    }, 400)
  );
}

function startRetryLoop(tabId) {
  if (retryTimers.has(tabId)) return;

  let count = 0;
  const timer = setInterval(async () => {
    count += 1;
    const result = await ensureContentAndApply(tabId);

    if (result.hiddenCount > 0 || result.containerCount === 0 || count >= RETRY_MAX) {
      stopRetryLoop(tabId);
    }
  }, RETRY_MS);

  retryTimers.set(tabId, timer);
}

function stopRetryLoop(tabId) {
  const timer = retryTimers.get(tabId);
  if (timer) {
    clearInterval(timer);
    retryTimers.delete(tabId);
  }
}

function handleNavigation(details) {
  if (!isInjectableUrl(details.url)) return;
  queueApply(details.tabId);
}

chrome.webNavigation.onCompleted.addListener(handleNavigation);
chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);

chrome.tabs.onRemoved.addListener((tabId) => {
  stopRetryLoop(tabId);
  clearTimeout(pendingApply.get(tabId));
  pendingApply.delete(tabId);
  activeTableTabs.delete(tabId);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY]) return;

  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id && activeTableTabs.has(tab.id)) {
        queueApply(tab.id);
      }
    });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FORCE_APPLY" && sender.tab?.id) {
    queueApply(sender.tab.id);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "TABLE_DETECTED" && sender.tab?.id) {
    activeTableTabs.add(sender.tab.id);
    queueApply(sender.tab.id);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
