(() => {
  const STORAGE_KEY = "replaceWords";

  function normalizeReplaceWords(entries) {
    if (!Array.isArray(entries)) return [];

    return entries
      .filter((entry) => entry && typeof entry.from === "string" && entry.from.trim())
      .map((entry) => ({
        id: entry.id || crypto.randomUUID(),
        from: entry.from.trim(),
        to: entry.to == null ? "" : String(entry.to),
        matchType: entry.matchType === "contains" ? "contains" : "exact",
        enabled: entry.enabled !== false,
      }));
  }

  async function loadBundledReplaceWords() {
    const response = await fetch(chrome.runtime.getURL("replace-words.json"), {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Failed to load replace-words.json (${response.status})`);
    }

    return normalizeReplaceWords(await response.json());
  }

  async function getStoredReplaceWords() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    return Array.isArray(stored) ? normalizeReplaceWords(stored) : null;
  }

  async function saveReplaceWords(nextEntries) {
    const normalized = normalizeReplaceWords(nextEntries);
    await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  async function getReplaceWords() {
    const stored = await getStoredReplaceWords();
    if (stored) return stored;

    const bundled = await loadBundledReplaceWords();
    await saveReplaceWords(bundled);
    return bundled;
  }

  async function resetToBundledReplaceWords() {
    const bundled = await loadBundledReplaceWords();
    return saveReplaceWords(bundled);
  }

  async function ensureReplaceWordsSeeded() {
    const stored = await getStoredReplaceWords();
    if (stored) return stored;
    return getReplaceWords();
  }

  globalThis.TCH_REPLACE_WORDS_STORE = {
    STORAGE_KEY,
    loadBundledReplaceWords,
    getStoredReplaceWords,
    getReplaceWords,
    saveReplaceWords,
    resetToBundledReplaceWords,
    ensureReplaceWordsSeeded,
    normalizeReplaceWords,
  };
})();
