(() => {
  "use strict";

  const INDEX_URL = "/src/data/search-index.json";
  const CATEGORY_ORDER = ["all", "novels", "manga", "music", "stories", "gallery"];
  const LABELS = {
    all: { en: "All", es: "Todo", tg: "All" },
    novels: { en: "Novels", es: "Novelas", tg: "Novels" },
    manga: { en: "Manga", es: "Manga", tg: "Manga" },
    music: { en: "Music", es: "Música", tg: "Music" },
    stories: { en: "Stories", es: "Historias", tg: "Stories" },
    gallery: { en: "Gallery", es: "Galería", tg: "Gallery" },
  };
  const UI = {
    en: {
      search: "Search the archive...",
      hint: "Search novels, manga, music, stories, and gallery",
      noResults: "No results found",
      tryAnother: "Try a title, character, artist, chapter, or keyword.",
      navigate: "navigate",
      select: "select",
      close: "close",
      filter: "filter",
    },
    es: {
      search: "Buscar en el archivo...",
      hint: "Busca novelas, manga, música, historias y galería",
      noResults: "No se encontraron resultados",
      tryAnother: "Prueba con un título, personaje, artista, capítulo o palabra clave.",
      navigate: "navegar",
      select: "seleccionar",
      close: "cerrar",
      filter: "filtrar",
    },
    tg: {
      search: "Search the archive...",
      hint: "Search novels, manga, music, stories, and gallery",
      noResults: "No results found",
      tryAnother: "Try a title, character, artist, chapter, or keyword.",
      navigate: "navigate",
      select: "select",
      close: "close",
      filter: "filter",
    },
  };

  let indexPromise = null;
  let records = [];
  let activeCategory = "all";
  let activeIndex = 0;
  let currentResults = [];
  let palette = null;
  let input = null;
  let resultsEl = null;
  let filterEl = null;

  function lang() {
    const value = document.documentElement.lang || localStorage.getItem("lang") || "en";
    return UI[value] ? value : "en";
  }

  function textFor(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value[lang()] || value.en || value.es || value.tg || Object.values(value)[0] || "";
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function fuzzyScore(query, record) {
    const q = normalize(query);
    if (!q) return 0;
    const title = normalize(textFor(record.title));
    const description = normalize(textFor(record.description));
    const meta = normalize(Object.values(record.meta || {}).join(" "));
    const haystacks = [title, description, meta];
    let best = 0;

    for (const hay of haystacks) {
      if (!hay) continue;
      if (hay === q) best = Math.max(best, 1000);
      else if (hay.startsWith(q)) best = Math.max(best, 850);
      else if (hay.includes(q)) best = Math.max(best, 700 - Math.min(100, hay.indexOf(q)));

      let matched = 0;
      let cursor = 0;
      for (const char of q) {
        const found = hay.indexOf(char, cursor);
        if (found === -1) break;
        matched += 1;
        cursor = found + 1;
      }
      if (q.length > 2 && matched === q.length) {
        best = Math.max(best, 420 + Math.round((q.length / Math.max(hay.length, 1)) * 180));
      }

      const qWords = q.split(/\s+/).filter(Boolean);
      const wordHits = qWords.filter((word) => hay.includes(word)).length;
      if (qWords.length && wordHits) {
        best = Math.max(best, 500 + Math.round((wordHits / qWords.length) * 180));
      }
    }
    return best;
  }

  async function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(`${INDEX_URL}?v=1`, { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) throw new Error(`Search index HTTP ${response.status}`);
          return response.json();
        })
        .then((payload) => {
          records = Array.isArray(payload.records) ? payload.records : [];
          return records;
        })
        .catch((error) => {
          console.warn("Command palette search index unavailable:", error);
          records = [];
          return records;
        });
    }
    return indexPromise;
  }

  function categoryLabel(category) {
    return LABELS[category]?.[lang()] || LABELS[category]?.en || category;
  }

  function renderFilters() {
    const labels = CATEGORY_ORDER.map((category) => {
      const active = category === activeCategory ? " is-active" : "";
      return `<button type="button" class="command-palette-filter${active}" data-category="${category}" aria-pressed="${category === activeCategory}">${categoryLabel(category)}</button>`;
    }).join("");
    filterEl.innerHTML = labels;
  }

  function iconFor(category) {
    return (
      {
        novels: "book",
        manga: "book-open",
        music: "music",
        stories: "scroll-text",
        gallery: "images",
      }[category] || "search"
    );
  }

  function renderResults() {
    const query = input.value.trim();
    renderFilters();

    if (!query) {
      currentResults = records
        .filter((record) => activeCategory === "all" || record.category === activeCategory)
        .slice(0, 8);
    } else {
      currentResults = records
        .filter((record) => activeCategory === "all" || record.category === activeCategory)
        .map((record) => ({ record, score: fuzzyScore(query, record) }))
        .filter((item) => item.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score || textFor(a.record.title).localeCompare(textFor(b.record.title)),
        )
        .slice(0, 12)
        .map((item) => item.record);
    }

    activeIndex = Math.min(activeIndex, Math.max(currentResults.length - 1, 0));

    if (!currentResults.length) {
      resultsEl.innerHTML = `<div class="command-palette-empty"><div class="command-palette-empty-icon"><i data-lucide="search-x"></i></div><strong>${UI[lang()].noResults}</strong><span>${UI[lang()].tryAnother}</span></div>`;
      refreshIcons();
      return;
    }

    resultsEl.innerHTML = currentResults
      .map((record, index) => {
        const title = escapeHtml(textFor(record.title));
        const description = escapeHtml(textFor(record.description));
        const meta = escapeHtml(metaText(record));
        const selected = index === activeIndex ? " is-selected" : "";
        const image = record.image
          ? `<img src="${escapeAttr(record.image)}" alt="" loading="lazy" decoding="async" onerror="this.closest('.command-palette-thumb')?.classList.add('is-fallback'); this.remove();">`
          : "";
        return `<button type="button" class="command-palette-result${selected}" data-result-index="${index}">
          <span class="command-palette-thumb ${image ? "" : "is-fallback"}">${image || `<i data-lucide="${iconFor(record.category)}"></i>`}</span>
          <span class="command-palette-result-copy">
            <span class="command-palette-result-title">${title}</span>
            <span class="command-palette-result-meta"><b>${escapeHtml(categoryLabel(record.category))}</b>${meta ? `<span>·</span>${meta}</span>` : "</span>"}
            ${description ? `<span class="command-palette-result-description">${description}</span>` : ""}
          </span>
          <i class="command-palette-result-arrow" data-lucide="arrow-up-right" aria-hidden="true"></i>
        </button>`;
      })
      .join("");
    refreshIcons();
  }

  function metaText(record) {
    const meta = record.meta || {};
    if (record.category === "novels") return meta.volume ? `Vol. ${meta.volume}` : "";
    if (record.category === "manga")
      return `${meta.version || "Manga"}${meta.chapter ? ` · Ch. ${meta.chapter}` : ""}`;
    if (record.category === "music")
      return meta.type === "track" ? meta.albumTitle || "Track" : meta.year || "Album";
    if (record.category === "stories") return meta.type || meta.volume || "";
    if (record.category === "gallery") return meta.artist || meta.collection || "";
    return "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function refreshIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons();
    else if (window.Iconify) window.Iconify.scan?.();
  }

  function ensurePalette() {
    if (palette) return palette;
    const root = document.createElement("div");
    root.className = "command-palette";
    root.id = "commandPalette";
    root.hidden = true;
    root.innerHTML = `<div class="command-palette-backdrop" data-command-close></div>
      <section class="command-palette-dialog" role="dialog" aria-modal="true" aria-labelledby="commandPaletteTitle">
        <div class="command-palette-header">
          <div class="command-palette-search-row">
            <i data-lucide="search" aria-hidden="true"></i>
            <input id="commandPaletteInput" type="search" autocomplete="off" spellcheck="false" aria-label="Search archive">
            <kbd>ESC</kbd>
          </div>
          <p id="commandPaletteTitle" class="command-palette-hint"></p>
          <div id="commandPaletteFilters" class="command-palette-filters" role="group" aria-label="Filter results"></div>
        </div>
        <div id="commandPaletteResults" class="command-palette-results" role="listbox"></div>
        <footer class="command-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> ${UI[lang()].navigate}</span>
          <span><kbd>↵</kbd> ${UI[lang()].select}</span>
          <span><kbd>Esc</kbd> ${UI[lang()].close}</span>
        </footer>
      </section>`;
    document.body.appendChild(root);
    palette = root;
    input = root.querySelector("#commandPaletteInput");
    resultsEl = root.querySelector("#commandPaletteResults");
    filterEl = root.querySelector("#commandPaletteFilters");

    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-command-close]")) close();
      const filter = event.target.closest("[data-category]");
      if (filter) {
        activeCategory = filter.dataset.category || "all";
        activeIndex = 0;
        renderResults();
        input.focus();
        return;
      }
      const result = event.target.closest("[data-result-index]");
      if (result) activateResult(Number(result.dataset.resultIndex));
    });

    input.addEventListener("input", () => {
      activeIndex = 0;
      renderResults();
    });

    document.addEventListener("keydown", onKeydown, true);
    refreshIcons();
    return palette;
  }

  function onKeydown(event) {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "k") {
      event.preventDefault();
      toggle();
      return;
    }
    if (!palette || palette.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, Math.max(currentResults.length - 1, 0));
      renderResults();
      scrollActiveIntoView();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderResults();
      scrollActiveIntoView();
    } else if (event.key === "Enter") {
      event.preventDefault();
      activateResult(activeIndex);
    }
  }

  function scrollActiveIntoView() {
    requestAnimationFrame(() => {
      resultsEl.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
    });
  }

  function activateResult(index) {
    const record = currentResults[index];
    if (!record) return;
    close();
    window.location.href = record.href;
  }

  async function open() {
    ensurePalette();
    const ui = UI[lang()];
    input.placeholder = ui.search;
    palette.querySelector("#commandPaletteTitle").textContent = ui.hint;
    activeCategory = "all";
    activeIndex = 0;
    palette.hidden = false;
    document.documentElement.classList.add("command-palette-open");
    document.body.classList.add("command-palette-open");
    await loadIndex();
    renderResults();
    input.focus();
    input.select();
  }

  function close() {
    if (!palette || palette.hidden) return;
    palette.hidden = true;
    document.documentElement.classList.remove("command-palette-open");
    document.body.classList.remove("command-palette-open");
  }

  function toggle() {
    if (palette && !palette.hidden) close();
    else open();
  }

  function updateTrigger() {
    const button = document.getElementById("commandPaletteTrigger");
    if (!button) return;
    const labels = { en: "Search", es: "Buscar", tg: "Search" };
    const label = button.querySelector(".command-palette-trigger-label");
    if (label) label.textContent = labels[lang()] || labels.en;
    const shortcut = button.querySelector("kbd");
    if (shortcut)
      shortcut.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K";
  }

  function injectTrigger() {
    if (document.getElementById("commandPaletteTrigger")) {
      updateTrigger();
      return;
    }
    const host = document.querySelector(
      "#menu-container, #sidebar-container, #menu-component-wrapper",
    );
    if (!host) return;
    const target = host.querySelector(".nav-section") || host.querySelector(".sidebar-inner");
    if (!target) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "commandPaletteTrigger";
    button.className = "command-palette-trigger";
    button.innerHTML = `<span class="command-palette-trigger-icon"><i data-lucide="search"></i></span><span class="command-palette-trigger-label"></span><kbd></kbd>`;
    button.addEventListener("click", open);
    target.parentNode.insertBefore(button, target);
    updateTrigger();
    refreshIcons();
  }

  document.addEventListener("menuLoaded", () => setTimeout(injectTrigger, 0));
  document.addEventListener("languageChanged", () => {
    updateTrigger();
    if (palette && !palette.hidden) {
      input.placeholder = UI[lang()].search;
      palette.querySelector("#commandPaletteTitle").textContent = UI[lang()].hint;
      renderResults();
    }
  });
  document.addEventListener("DOMContentLoaded", () => setTimeout(injectTrigger, 0));
  window.addEventListener("load", () => setTimeout(injectTrigger, 0));
  window.CommandPalette = { open, close, toggle, injectTrigger };
})();
