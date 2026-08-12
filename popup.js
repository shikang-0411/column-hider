const store = globalThis.TCH_RULES_STORE;
const replaceWordsStore = globalThis.TCH_REPLACE_WORDS_STORE;

const form = document.getElementById("rule-form");
const formTitle = document.getElementById("form-title");
const ruleIdInput = document.getElementById("rule-id");
const ariaLabelInput = document.getElementById("aria-label");
const matchTypeInput = document.getElementById("match-type");
const enabledInput = document.getElementById("enabled");
const submitBtn = document.getElementById("submit-btn");
const cancelBtn = document.getElementById("cancel-btn");
const rulesList = document.getElementById("rules-list");
const emptyState = document.getElementById("empty-state");
const resetBtn = document.getElementById("reset-btn");
const exportBtn = document.getElementById("export-btn");
const rulesViewBtn = document.getElementById("rules-view-btn");
const rulesPanel = document.getElementById("rules-panel");

const replaceForm = document.getElementById("replace-form");
const replaceFormTitle = document.getElementById("replace-form-title");
const replaceIdInput = document.getElementById("replace-id");
const replaceFromInput = document.getElementById("replace-from");
const replaceToInput = document.getElementById("replace-to");
const replaceEnabledInput = document.getElementById("replace-enabled");
const replaceSubmitBtn = document.getElementById("replace-submit-btn");
const replaceCancelBtn = document.getElementById("replace-cancel-btn");
const replaceList = document.getElementById("replace-list");
const replaceEmptyState = document.getElementById("replace-empty-state");
const replaceResetBtn = document.getElementById("replace-reset-btn");
const replaceExportBtn = document.getElementById("replace-export-btn");
const replaceViewBtn = document.getElementById("replace-view-btn");
const replacePanel = document.getElementById("replace-panel");

const scanBtn = document.getElementById("scan-btn");
const scanResult = document.getElementById("scan-result");
const applyBtn = document.getElementById("apply-btn");

const RESTRICTED_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "devtools://",
  "view-source:",
];

let rules = [];
let replaceWords = [];

function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function getPageError(tab) {
  if (!tab?.url) {
    return "No active tab found.";
  }

  if (isRestrictedUrl(tab.url)) {
    return `Extensions cannot run on ${tab.url.split(":")[0]}:// pages.\nOpen the page with your table, then try again.`;
  }

  if (tab.url.startsWith("file://")) {
    return 'This is a local file page.\nIn chrome://extensions, enable "Allow access to file URLs" for Table Column Hider, then reload the page.';
  }

  return null;
}

function showScanResult(text) {
  scanResult.hidden = false;
  scanResult.textContent = text;
}

function getRules() {
  return store.getRules();
}

function saveRules(nextRules) {
  return store.saveRules(nextRules);
}

function resetForm() {
  ruleIdInput.value = "";
  ariaLabelInput.value = "";
  matchTypeInput.value = "exact";
  enabledInput.checked = true;
  formTitle.textContent = "Add rule";
  submitBtn.textContent = "Add rule";
  cancelBtn.hidden = true;
}

function startEdit(rule) {
  ruleIdInput.value = rule.id;
  ariaLabelInput.value = rule.ariaLabel;
  matchTypeInput.value = rule.matchType;
  enabledInput.checked = rule.enabled;
  formTitle.textContent = "Edit rule";
  submitBtn.textContent = "Save changes";
  cancelBtn.hidden = false;
  ariaLabelInput.focus();
}

function renderRules() {
  rulesList.innerHTML = "";

  if (rules.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  rules.forEach((rule) => {
    const li = document.createElement("li");
    li.className = `rule-item${rule.enabled ? "" : " disabled"}`;

    const main = document.createElement("div");
    main.className = "rule-main";

    const label = document.createElement("div");
    label.className = "rule-label";
    label.textContent = rule.ariaLabel;

    const meta = document.createElement("div");
    meta.className = "rule-meta";
    meta.textContent = `${rule.matchType === "contains" ? "Contains" : "Exact"} · ${
      rule.enabled ? "Enabled" : "Disabled"
    }`;

    main.append(label, meta);

    const actions = document.createElement("div");
    actions.className = "rule-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "icon-btn secondary";
    toggleBtn.textContent = rule.enabled ? "Disable" : "Enable";
    toggleBtn.addEventListener("click", async () => {
      rules = rules.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
      await saveRules(rules);
      renderRules();
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startEdit(rule));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      rules = rules.filter((r) => r.id !== rule.id);
      await saveRules(rules);
      if (ruleIdInput.value === rule.id) resetForm();
      renderRules();
    });

    actions.append(toggleBtn, editBtn, deleteBtn);
    li.append(main, actions);
    rulesList.appendChild(li);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const ariaLabel = ariaLabelInput.value.trim();
  if (!ariaLabel) return;

  const payload = {
    id: ruleIdInput.value || crypto.randomUUID(),
    ariaLabel,
    matchType: matchTypeInput.value,
    enabled: enabledInput.checked,
  };

  const existingIndex = rules.findIndex((r) => r.id === payload.id);
  if (existingIndex >= 0) {
    rules[existingIndex] = payload;
  } else {
    rules.push(payload);
  }

  await saveRules(rules);
  resetForm();
  renderRules();
});

cancelBtn.addEventListener("click", resetForm);

function togglePanel(panel, button) {
  const willShow = panel.hidden;
  panel.hidden = !willShow;
  button.textContent = willShow ? "Hide" : "View";
  button.setAttribute("aria-expanded", String(willShow));
}

rulesViewBtn.addEventListener("click", () => togglePanel(rulesPanel, rulesViewBtn));

resetBtn.addEventListener("click", async () => {
  rules = await store.resetToBundledRules();
  resetForm();
  renderRules();
});

exportBtn.addEventListener("click", () => {
  const blob = new Blob([`${JSON.stringify(rules, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "rules.json";
  anchor.click();
  URL.revokeObjectURL(url);
});

function resetReplaceForm() {
  replaceIdInput.value = "";
  replaceFromInput.value = "";
  replaceToInput.value = "";
  replaceEnabledInput.checked = true;
  replaceFormTitle.textContent = "Add replace word";
  replaceSubmitBtn.textContent = "Add replace word";
  replaceCancelBtn.hidden = true;
}

function startReplaceEdit(entry) {
  replaceIdInput.value = entry.id;
  replaceFromInput.value = entry.from;
  replaceToInput.value = entry.to;
  replaceEnabledInput.checked = entry.enabled;
  replaceFormTitle.textContent = "Edit replace word";
  replaceSubmitBtn.textContent = "Save changes";
  replaceCancelBtn.hidden = false;
  replaceFromInput.focus();
}

function renderReplaceWords() {
  replaceList.innerHTML = "";

  if (replaceWords.length === 0) {
    replaceEmptyState.hidden = false;
    return;
  }

  replaceEmptyState.hidden = true;

  replaceWords.forEach((entry) => {
    const li = document.createElement("li");
    li.className = `rule-item${entry.enabled ? "" : " disabled"}`;

    const main = document.createElement("div");
    main.className = "rule-main";

    const label = document.createElement("div");
    label.className = "rule-label";
    label.textContent = `"${entry.from}" → "${entry.to}"`;

    const meta = document.createElement("div");
    meta.className = "rule-meta";
    meta.textContent = entry.enabled ? "Enabled" : "Disabled";

    main.append(label, meta);

    const actions = document.createElement("div");
    actions.className = "rule-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "icon-btn secondary";
    toggleBtn.textContent = entry.enabled ? "Disable" : "Enable";
    toggleBtn.addEventListener("click", async () => {
      replaceWords = replaceWords.map((item) =>
        item.id === entry.id ? { ...item, enabled: !item.enabled } : item
      );
      await replaceWordsStore.saveReplaceWords(replaceWords);
      renderReplaceWords();
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startReplaceEdit(entry));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      replaceWords = replaceWords.filter((item) => item.id !== entry.id);
      await replaceWordsStore.saveReplaceWords(replaceWords);
      if (replaceIdInput.value === entry.id) resetReplaceForm();
      renderReplaceWords();
    });

    actions.append(toggleBtn, editBtn, deleteBtn);
    li.append(main, actions);
    replaceList.appendChild(li);
  });
}

replaceForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const from = replaceFromInput.value.trim();
  const to = replaceToInput.value.trim();
  if (!from) return;

  const payload = {
    id: replaceIdInput.value || crypto.randomUUID(),
    from,
    to,
    enabled: replaceEnabledInput.checked,
  };

  const existingIndex = replaceWords.findIndex((item) => item.id === payload.id);
  if (existingIndex >= 0) {
    replaceWords[existingIndex] = payload;
  } else {
    replaceWords.push(payload);
  }

  await replaceWordsStore.saveReplaceWords(replaceWords);
  resetReplaceForm();
  renderReplaceWords();
});

replaceCancelBtn.addEventListener("click", resetReplaceForm);

replaceViewBtn.addEventListener("click", () => togglePanel(replacePanel, replaceViewBtn));

replaceResetBtn.addEventListener("click", async () => {
  replaceWords = await replaceWordsStore.resetToBundledReplaceWords();
  resetReplaceForm();
  renderReplaceWords();
});

replaceExportBtn.addEventListener("click", () => {
  const blob = new Blob([`${JSON.stringify(replaceWords, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "replace-words.json";
  anchor.click();
  URL.revokeObjectURL(url);
});

scanBtn.addEventListener("click", async () => {
  scanBtn.disabled = true;
  scanBtn.textContent = "Scanning...";

  try {
    const response = await runTabAction("scan");

    if (response.containerCount === 0) {
      const debugText = response.debug?.length ? `\n\nDebug:\n${response.debug.join("\n")}` : "";
      showScanResult(
        "No tables with aria-label headers were found.\n" +
          "If the table loads via AJAX, wait for it to appear then scan again." +
          debugText
      );
      return;
    }

    showScanResult(
      `Found ${response.containerCount} table/grid(s) across ${response.frameCount} frame(s)\n\n` +
        response.containers
          .map((container) => {
            const name = container.id ? `#${container.id}` : container.type;
            return `${name}:\n${container.headers.map((label) => `  - ${label}`).join("\n")}`;
          })
          .join("\n\n")
    );
  } catch (error) {
    showScanResult(error.message || String(error));
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = "Scan page for column labels";
  }
});

applyBtn.addEventListener("click", async () => {
  applyBtn.disabled = true;

  try {
    await runTabAction("apply");
    applyBtn.textContent = "Applied!";
  } catch (error) {
    applyBtn.textContent = "Failed";
    showScanResult(error.message || String(error));
  } finally {
    setTimeout(() => {
      applyBtn.disabled = false;
      applyBtn.textContent = "Re-apply on current tab";
    }, 1200);
  }
});

async function init() {
  const [nextRules, nextReplaceWords] = await Promise.all([
    getRules(),
    replaceWordsStore.getReplaceWords(),
  ]);
  rules = nextRules;
  replaceWords = nextReplaceWords;
  renderRules();
  renderReplaceWords();
}

init();
