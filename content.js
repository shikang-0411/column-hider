(() => {
  if (globalThis.__TCH_CONTENT_BOOTSTRAPPED__) {
    globalThis.__TCH_CONTENT_REINIT__?.();
    return;
  }
  globalThis.__TCH_CONTENT_BOOTSTRAPPED__ = true;

  const STORAGE_KEY = "columnRules";

  const DEFAULT_RULES = [
    { id: "default-image", ariaLabel: "Image", matchType: "exact", enabled: true },
    { id: "default-player", ariaLabel: "Player", matchType: "exact", enabled: true },
    { id: "default-uptime", ariaLabel: "Uptime", matchType: "contains", enabled: true },
  ];

  const RETRY_MS = 1500;
  const RETRY_MAX = 20;

  let isApplying = false;
  let debounceTimer = null;
  let textDebounceTimer = null;
  let readyRetryTimer = null;
  let readyRetryCount = 0;
  let cachedRules = null;
  let isActive = false;

  function getLogic() {
    return globalThis.TCH_PAGE_LOGIC;
  }

  function mightHaveTargetTable() {
    return !!document.querySelector(
      'table th[aria-label], .dataTables_wrapper, [role="grid"] [role="columnheader"], [role="treegrid"] [role="columnheader"]'
    );
  }

  function applyTextReplacements() {
    getLogic()?.applyTextReplacements?.();
  }

  function scheduleTextReplace(delay = 200) {
    clearTimeout(textDebounceTimer);
    textDebounceTimer = setTimeout(applyTextReplacements, delay);
  }

  function loadAndApply() {
    if (!mightHaveTargetTable()) return;

    const logic = getLogic();
    if (!logic) {
      chrome.runtime.sendMessage({ type: "TABLE_DETECTED" }).catch(() => {});
      return;
    }

    const applyNow = (rules) => {
      isApplying = true;
      logic.applyRulesToDocument(rules);
      requestAnimationFrame(() => {
        isApplying = false;
      });
    };

    if (cachedRules) {
      applyNow(cachedRules);
      return;
    }

    applyNow(DEFAULT_RULES);

    chrome.storage.local.get([STORAGE_KEY], (result) => {
      cachedRules = result[STORAGE_KEY] ?? DEFAULT_RULES;
      applyNow(cachedRules);
    });
  }

  function scheduleApply(delay = 300) {
    if (!isActive && !mightHaveTargetTable()) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadAndApply, delay);
  }

  function hasTargetTable() {
    const logic = getLogic();
    if (!logic) return mightHaveTargetTable();
    return logic.scanDocument().containerCount > 0;
  }

  function isHidingActive() {
    return document.querySelector('[data-tch-hidden="true"]') !== null;
  }

  function stopReadyRetries() {
    clearInterval(readyRetryTimer);
    readyRetryTimer = null;
    readyRetryCount = 0;
  }

  function scheduleReadyRetries() {
    if (!hasTargetTable()) return;

    stopReadyRetries();
    loadAndApply();

    readyRetryTimer = setInterval(() => {
      readyRetryCount += 1;
      loadAndApply();

      if (isHidingActive() || readyRetryCount >= RETRY_MAX) {
        stopReadyRetries();
      }
    }, RETRY_MS);
  }

  function onTableActivity(reason) {
    if (!isActive && !mightHaveTargetTable()) return;

    scheduleApply(reason === "datatable" ? 50 : 300);

    if (hasTargetTable() && !isHidingActive()) {
      scheduleReadyRetries();
    }
  }

  function onPageChange(reason) {
    scheduleTextReplace(reason === "datatable" ? 50 : 200);
    onTableActivity(reason);
  }

  function patchHistoryMethods() {
    if (globalThis.__TCH_HISTORY_PATCHED__) return;
    globalThis.__TCH_HISTORY_PATCHED__ = true;

    ["pushState", "replaceState"].forEach((method) => {
      const original = history[method];
      history[method] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        onPageChange(method);
        return result;
      };
    });

    window.addEventListener("popstate", () => onPageChange("popstate"));
  }

  function hookDataTables() {
    const jq = globalThis.jQuery || globalThis.$;
    if (!jq?.fn?.dataTable || globalThis.__TCH_DT_HOOKED__) return false;

    globalThis.__TCH_DT_HOOKED__ = true;
    jq(document).on("init.dt draw.dt", () => onPageChange("datatable"));
    return true;
  }

  function ensureLibraryHooks() {
    hookDataTables();
  }

  function initTextReplacer() {
    if (globalThis.__TCH_TEXT_REPLACER__) return;
    globalThis.__TCH_TEXT_REPLACER__ = true;

    patchHistoryMethods();
    ensureLibraryHooks();
    applyTextReplacements();

    const observer = new MutationObserver(() => scheduleTextReplace(250));
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => scheduleTextReplace(50), { once: true });
    }

    window.addEventListener("load", () => scheduleTextReplace(50), { once: true });
  }

  function watchForTable() {
    if (globalThis.__TCH_TABLE_WATCHER__) return;
    globalThis.__TCH_TABLE_WATCHER__ = true;

    const tryActivate = () => {
      if (!mightHaveTargetTable()) return;
      activateColumnHider();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", tryActivate, { once: true });
    } else {
      tryActivate();
    }

    const watcher = new MutationObserver(() => tryActivate());
    watcher.observe(document.documentElement, { childList: true, subtree: true });
  }

  function activateColumnHider() {
    if (isActive) {
      onTableActivity("reinit");
      return globalThis.__TCH_COLUMN_HIDER__;
    }

    isActive = true;
    ensureLibraryHooks();

    chrome.runtime.sendMessage({ type: "TABLE_DETECTED" }).catch(() => {});

    const api = {
      scan: () => getLogic()?.scanDocument?.() ?? { containerCount: 0, containers: [], labels: [] },
      apply: loadAndApply,
      replaceText: applyTextReplacements,
    };

    globalThis.__TCH_COLUMN_HIDER__ = api;

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[STORAGE_KEY]) return;
      cachedRules = changes[STORAGE_KEY].newValue ?? DEFAULT_RULES;

      const logic = getLogic();
      if (!logic) return;

      logic.applyRulesToDocument(cachedRules);
      scheduleReadyRetries();
    });

    const observer = new MutationObserver(() => {
      if (!hasTargetTable()) return;
      if (!isHidingActive()) scheduleApply(400);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "class"],
    });

    document.addEventListener(
      "click",
      (event) => {
        if (
          event.target.closest(
            ".dataTables_wrapper a, .dataTables_wrapper button, .paginate_button, .dataTables_paginate"
          )
        ) {
          onPageChange("click");
        }
      },
      true
    );

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "PING") {
        sendResponse({ ok: true });
        return true;
      }

      if (message.type === "REAPPLY") {
        cachedRules = null;
        onPageChange("reapply");
        sendResponse({ ok: true });
        return true;
      }

      if (message.type === "NAVIGATION" || message.type === "PAGE_READY") {
        onPageChange("navigation");
        sendResponse({ ok: true });
        return true;
      }

      if (message.type === "SCAN") {
        sendResponse(api.scan());
        return true;
      }

      if (message.type === "REPLACE_TEXT") {
        applyTextReplacements();
        sendResponse({ ok: true });
        return true;
      }

      return false;
    });

    onTableActivity("init");
    return api;
  }

  function initColumnHider() {
    initTextReplacer();
    watchForTable();

    if (globalThis.__TCH_COLUMN_HIDER__ || mightHaveTargetTable()) {
      return activateColumnHider();
    }

    return null;
  }

  globalThis.__TCH_CONTENT_REINIT__ = initColumnHider;
  initColumnHider();
})();
