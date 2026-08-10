const STORAGE_KEY = "columnRules";

const DEFAULT_RULES = [
  { id: crypto.randomUUID(), ariaLabel: "Image", matchType: "exact", enabled: true },
  { id: crypto.randomUUID(), ariaLabel: "Player", matchType: "exact", enabled: true },
  {
    id: crypto.randomUUID(),
    ariaLabel: "Uptime",
    matchType: "contains",
    enabled: true,
  },
];

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
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      resolve(result[STORAGE_KEY] ?? null);
    });
  });
}

function saveRules(nextRules) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: nextRules }, resolve);
  });
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

resetBtn.addEventListener("click", async () => {
  rules = DEFAULT_RULES.map((rule) => ({ ...rule, id: crypto.randomUUID() }));
  await saveRules(rules);
  resetForm();
  renderRules();
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
  const stored = await getRules();
  rules = stored ?? DEFAULT_RULES;

  if (!stored) {
    await saveRules(rules);
  }

  renderRules();
}

init();
