(() => {
  const MARKER = "data-tch-hidden";
  const HIDDEN_CLASS = "tch-hidden-column";

  function matchesRule(rule, ariaLabel) {
    if (!ariaLabel) return false;
    const label = ariaLabel.trim();
    const pattern = rule.ariaLabel.trim();
    if (!pattern) return false;

    if (rule.matchType === "contains") {
      return label.toLowerCase().includes(pattern.toLowerCase());
    }
    return label === pattern;
  }

  function getActiveRules(rules) {
    return rules.filter((rule) => rule.enabled && rule.ariaLabel.trim());
  }

  function getAriaLabel(element) {
    if (!element) return null;

    const direct = element.getAttribute("aria-label");
    if (direct) return direct;

    const nested = element.querySelector("[aria-label]");
    return nested ? nested.getAttribute("aria-label") : null;
  }

  function getCellIndex(cell) {
    let index = 0;
    let sibling = cell;

    while ((sibling = sibling.previousElementSibling)) {
      index += sibling.colSpan || 1;
    }

    return index;
  }

  function getColumnSpan(cell) {
    return cell.colSpan || 1;
  }

  function isHeaderCell(cell) {
    const tag = cell.tagName;
    const role = cell.getAttribute("role");

    return (
      tag === "TH" ||
      role === "columnheader" ||
      (tag === "TD" && cell.closest("thead")) ||
      cell.classList.contains("column-header")
    );
  }

  function isDataCell(cell) {
    const tag = cell.tagName;
    const role = cell.getAttribute("role");

    return tag === "TD" || role === "gridcell" || role === "cell" || role === "rowheader";
  }

  function isRowElement(row) {
    return row.tagName === "TR" || row.getAttribute("role") === "row";
  }

  function getRowCells(row) {
    return [...row.children].filter((cell) => isHeaderCell(cell) || isDataCell(cell));
  }

  function clearHiddenMarks(root) {
    root.querySelectorAll(`.${HIDDEN_CLASS}, [${MARKER}]`).forEach((element) => {
      element.removeAttribute(MARKER);
      element.classList.remove(HIDDEN_CLASS);
      element.style.removeProperty("display");
      element.style.removeProperty("width");
      element.style.removeProperty("min-width");
      element.style.removeProperty("max-width");
      element.style.removeProperty("padding");
    });
  }

  function markHidden(element) {
    element.setAttribute(MARKER, "true");
    element.classList.add(HIDDEN_CLASS);
    element.style.setProperty("display", "none", "important");
    element.style.setProperty("width", "0", "important");
    element.style.setProperty("min-width", "0", "important");
    element.style.setProperty("max-width", "0", "important");
    element.style.setProperty("padding", "0", "important");
  }

  function hideColumnInRow(row, columnIndex) {
    if (!isRowElement(row)) return;

    if (row.tagName === "TR") {
      let col = 0;

      for (const cell of row.children) {
        if (!isHeaderCell(cell) && !isDataCell(cell)) continue;

        const span = getColumnSpan(cell);
        if (columnIndex >= col && columnIndex <= col + span - 1) {
          markHidden(cell);
          break;
        }

        col += span;
      }

      return;
    }

    const cells = getRowCells(row);
    const cell = cells[columnIndex];
    if (cell) markHidden(cell);
  }

  function getContainerRows(container) {
    if (container.tagName === "TABLE") {
      return container.querySelectorAll(
        ":scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr"
      );
    }

    const directRows = container.querySelectorAll(":scope > [role='row']");
    if (directRows.length > 0) return directRows;

    return container.querySelectorAll("[role='row']");
  }

  function hideColumn(container, columnIndex) {
    getContainerRows(container).forEach((row) => hideColumnInRow(row, columnIndex));

    if (container.tagName === "TABLE") {
      const cols = container.querySelectorAll("colgroup col");
      if (cols[columnIndex]) markHidden(cols[columnIndex]);
    }
  }

  function findHeaderRow(table) {
    const theadRow = table.querySelector("thead tr");
    if (theadRow) return theadRow;

    for (const row of table.querySelectorAll("tr")) {
      if (row.querySelector("th")) return row;
    }

    return table.querySelector("tr");
  }

  function collectHeaderCells(container) {
    if (container.tagName === "TABLE") {
      const headerRow = findHeaderRow(container);
      if (!headerRow) return [];

      return [...headerRow.children].filter((cell) => isHeaderCell(cell) || isDataCell(cell));
    }

    const explicitHeaders = [...container.querySelectorAll("[role='columnheader']")];
    if (explicitHeaders.length > 0) return explicitHeaders;

    const firstRow = container.querySelector("[role='row']");
    if (!firstRow) return [];

    return getRowCells(firstRow);
  }

  function getColumnIndicesToHide(container, rules) {
    const activeRules = getActiveRules(rules);
    if (activeRules.length === 0) return [];

    const headers = collectHeaderCells(container);
    const indices = new Set();

    headers.forEach((header) => {
      const ariaLabel = getAriaLabel(header);
      if (!ariaLabel) return;

      const matched = activeRules.some((rule) => matchesRule(rule, ariaLabel));
      if (!matched) return;

      if (container.tagName === "TABLE") {
        indices.add(getCellIndex(header));
        return;
      }

      const row = header.closest("[role='row']");
      if (!row) return;

      const cells = getRowCells(row);
      const index = cells.indexOf(header);
      if (index >= 0) indices.add(index);
    });

    return [...indices];
  }

  function isNestedContainer(element) {
    return !!element.closest("td, th");
  }

  function getWrapperTables(wrapper) {
    return [...wrapper.querySelectorAll("table")].filter((table) => !isNestedContainer(table));
  }

  function findHeaderSourceTable(tables) {
    return (
      tables.find((table) => collectHeaderCells(table).some((cell) => getAriaLabel(cell))) ||
      tables.find((table) => table.querySelector("thead th")) ||
      tables[0] ||
      null
    );
  }

  function applyRulesToTableGroup(tables, rules) {
    if (!tables.length) return 0;

    tables.forEach((table) => clearHiddenMarks(table));

    const source = findHeaderSourceTable(tables);
    if (!source) return 0;

    const indices = getColumnIndicesToHide(source, rules);
    if (!indices.length) return 0;

    tables.forEach((table) => {
      indices.forEach((index) => hideColumn(table, index));
    });

    return indices.length;
  }

  function applyRulesToContainer(container, rules) {
    if (container.tagName === "TABLE") {
      return applyRulesToTableGroup([container], rules);
    }

    clearHiddenMarks(container);

    const indices = getColumnIndicesToHide(container, rules);
    indices.forEach((index) => hideColumn(container, index));

    return indices.length;
  }

  function findContainers(root) {
    const containers = new Set();

    root.querySelectorAll(".dataTables_wrapper").forEach((wrapper) => containers.add(wrapper));

    root.querySelectorAll("table").forEach((table) => {
      if (isNestedContainer(table)) return;
      if (table.closest(".dataTables_wrapper")) return;
      containers.add(table);
    });

    root.querySelectorAll("[role='grid'], [role='treegrid']").forEach((grid) => {
      if (grid.tagName === "TABLE") return;
      if (isNestedContainer(grid)) return;
      containers.add(grid);
    });

    return [...containers];
  }

  function walkRoots(root, visit) {
    visit(root);

    root.querySelectorAll("*").forEach((element) => {
      if (element.shadowRoot) {
        walkRoots(element.shadowRoot, visit);
      }
    });
  }

  function applyRulesToDocument(rules) {
    let hiddenColumns = 0;

    walkRoots(document, (root) => {
      findContainers(root).forEach((container) => {
        if (container.classList?.contains("dataTables_wrapper")) {
          hiddenColumns += applyRulesToTableGroup(getWrapperTables(container), rules);
          return;
        }

        hiddenColumns += applyRulesToContainer(container, rules);
      });
    });

    return hiddenColumns;
  }

  function scanContainer(container) {
    if (container.classList?.contains("dataTables_wrapper")) {
      const tables = getWrapperTables(container);
      const source = findHeaderSourceTable(tables);
      if (!source) return null;

      const headers = collectHeaderCells(source)
        .map((header) => getAriaLabel(header))
        .filter(Boolean);

      if (!headers.length) return null;

      return {
        type: "datatables",
        id: source.id || container.querySelector("table[id]")?.id || null,
        headers,
        tableCount: tables.length,
      };
    }

    const type = container.tagName === "TABLE" ? "table" : container.getAttribute("role");
    const headers = collectHeaderCells(container)
      .map((header) => getAriaLabel(header))
      .filter(Boolean);

    if (!headers.length) return null;

    return {
      type,
      id: container.id || null,
      headers,
      tableCount: 1,
    };
  }

  function scanDocument() {
    const labels = new Set();
    const containers = [];

    walkRoots(document, (root) => {
      findContainers(root).forEach((container) => {
        const info = scanContainer(container);
        if (!info) return;

        containers.push(info);
        info.headers.forEach((label) => labels.add(label));
      });
    });

    return {
      containerCount: containers.length,
      containers,
      labels: [...labels].sort(),
      frameUrl: location.href,
      tableCount: document.querySelectorAll("table").length,
    };
  }

  function countHiddenColumns(rules) {
    const scan = scanDocument();
    if (!scan.containerCount) return 0;

    applyRulesToDocument(rules);
    return document.querySelectorAll(`[${MARKER}]`).length;
  }

  const TEXT_REPLACE_ATTRS = ["placeholder", "title", "aria-label"];

  function replaceWords(text) {
    if (!text) return text;

    return text
      .replace(/\bmovies\b/gi, "mdata")
      .replace(/\bmovie\b/gi, "mdata")
      .replace(/\bstreams\b/gi, "sdata")
      .replace(/\bstream\b/gi, "sdata");
  }

  function shouldSkipTextNode(node) {
    const parent = node.parentElement;
    if (!parent) return true;

    const tag = parent.tagName;
    return (
      tag === "SCRIPT" ||
      tag === "STYLE" ||
      tag === "TEXTAREA" ||
      tag === "NOSCRIPT" ||
      parent.isContentEditable
    );
  }

  function applyTextReplacementsToRoot(root) {
    let count = 0;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      if (!shouldSkipTextNode(node)) {
        const original = node.nodeValue;
        const updated = replaceWords(original);
        if (updated !== original) {
          node.nodeValue = updated;
          count += 1;
        }
      }

      node = walker.nextNode();
    }

    TEXT_REPLACE_ATTRS.forEach((attr) => {
      root.querySelectorAll(`[${attr}]`).forEach((element) => {
        const original = element.getAttribute(attr);
        if (!original) return;

        const updated = replaceWords(original);
        if (updated !== original) {
          element.setAttribute(attr, updated);
          count += 1;
        }
      });
    });

    return count;
  }

  function applyTextReplacements() {
    let count = 0;

    walkRoots(document, (root) => {
      count += applyTextReplacementsToRoot(root);
    });

    return count;
  }

  globalThis.TCH_PAGE_LOGIC = {
    scanDocument,
    applyRulesToDocument,
    countHiddenColumns,
    applyTextReplacements,
    replaceWords,
  };
})();
