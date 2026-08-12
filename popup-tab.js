async function injectPageLogic(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["page-logic.js"],
  });
}

async function pingContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    return response?.ok === true;
  } catch {
    return false;
  }
}

async function ensureContentScript(tabId) {
  if (await pingContentScript(tabId)) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "PAGE_READY" });
    } catch {
      // Content script is present but this frame did not respond.
    }
    return;
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId, allFrames: true },
      files: ["content.css"],
    });
  } catch {
    // Styles may already be present in the frame.
  }

  await injectPageLogic(tabId);

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["content.js"],
  });
}

async function runInAllFrames(tabId, action, rules = null, replaceWords = null) {
  await injectPageLogic(tabId);

  const injections = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: "ISOLATED",
    func: (actionName, rulesArg, replaceWordsArg) => {
      const logic = globalThis.TCH_PAGE_LOGIC;
      if (!logic) {
        return {
          error: "logic missing",
          frameUrl: location.href,
          tableCount: document.querySelectorAll("table").length,
        };
      }

      if (actionName === "scan") {
        return logic.scanDocument();
      }

      if (actionName === "apply") {
        logic.applyTextReplacements?.(replaceWordsArg ?? []);
        return {
          ok: true,
          hidden: logic.applyRulesToDocument(rulesArg ?? []),
          frameUrl: location.href,
        };
      }

      return null;
    },
    args: [action, rules, replaceWords],
  });

  return injections.map((entry) => ({
    frameId: entry.frameId,
    result: entry.result,
  }));
}

function mergeScanResults(frameResults) {
  const labels = new Set();
  const containers = [];
  let containerCount = 0;
  const debug = [];

  frameResults.forEach(({ frameId, result }) => {
    if (!result) {
      debug.push(`frame ${frameId}: no result`);
      return;
    }

    if (result.error) {
      debug.push(
        `frame ${frameId}: ${result.error}, tables=${result.tableCount}, url=${result.frameUrl}`
      );
      return;
    }

    containerCount += result.containerCount;
    result.containers.forEach((container) => containers.push({ ...container, frameId }));
    result.labels.forEach((label) => labels.add(label));

    if (result.containerCount === 0 && result.tableCount > 0) {
      debug.push(
        `frame ${frameId}: ${result.tableCount} table(s) found but no aria-label headers`
      );
    }
  });

  return {
    containerCount,
    containers,
    labels: [...labels].sort(),
    frameCount: frameResults.filter(({ result }) => result && !result.error).length,
    debug,
  };
}

async function runTabAction(action) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  const pageError = getPageError(tab);
  if (pageError) {
    throw new Error(pageError);
  }

  const rules = action === "apply" ? await getRules() : null;
  const replaceWords =
    action === "apply" ? await globalThis.TCH_REPLACE_WORDS_STORE.getReplaceWords() : null;

  if (action === "apply") {
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id, allFrames: true },
        files: ["content.css"],
      });
    } catch {
      // Styles may already be present.
    }
  }

  let frameResults = await runInAllFrames(tab.id, action, rules, replaceWords);

  if (action === "scan") {
    let merged = mergeScanResults(frameResults);

    if (merged.containerCount === 0) {
      await ensureContentScript(tab.id);
      frameResults = await runInAllFrames(tab.id, action, null, null);
      merged = mergeScanResults(frameResults);
    }

    return merged;
  }

  if (frameResults.some(({ result }) => result?.ok)) {
    return { ok: true };
  }

  await ensureContentScript(tab.id);
  frameResults = await runInAllFrames(tab.id, action, rules, replaceWords);
  return frameResults.some(({ result }) => result?.ok) ? { ok: true } : { ok: false };
}
