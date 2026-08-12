(() => {
  const STORAGE_KEY = "columnRules";

  function normalizeRules(rules) {
    if (!Array.isArray(rules)) return [];

    return rules
      .filter((rule) => rule && typeof rule.ariaLabel === "string" && rule.ariaLabel.trim())
      .map((rule) => ({
        id: rule.id || crypto.randomUUID(),
        ariaLabel: rule.ariaLabel.trim(),
        matchType: rule.matchType === "contains" ? "contains" : "exact",
        enabled: rule.enabled !== false,
      }));
  }

  async function loadBundledRules() {
    const response = await fetch(chrome.runtime.getURL("rules.json"));
    if (!response.ok) {
      throw new Error(`Failed to load rules.json (${response.status})`);
    }

    return normalizeRules(await response.json());
  }

  async function getStoredRules() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    return Array.isArray(stored) ? normalizeRules(stored) : null;
  }

  async function saveRules(nextRules) {
    const normalized = normalizeRules(nextRules);
    await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  async function getRules() {
    const stored = await getStoredRules();
    if (stored) return stored;

    const bundled = await loadBundledRules();
    await saveRules(bundled);
    return bundled;
  }

  async function resetToBundledRules() {
    const bundled = await loadBundledRules();
    return saveRules(bundled);
  }

  async function ensureRulesSeeded() {
    const stored = await getStoredRules();
    if (stored) return stored;
    return getRules();
  }

  globalThis.TCH_RULES_STORE = {
    STORAGE_KEY,
    loadBundledRules,
    getStoredRules,
    getRules,
    saveRules,
    resetToBundledRules,
    ensureRulesSeeded,
    normalizeRules,
  };
})();
