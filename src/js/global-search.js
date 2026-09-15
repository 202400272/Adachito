/*
 * AdashimaVerse global search
 * Client-side, static-first search across the archive's JSON data.
 */
(() => {
  if (window.__ADASHIMA_GLOBAL_SEARCH_INITIALIZED) return;
  window.__ADASHIMA_GLOBAL_SEARCH_INITIALIZED = true;

  const DATASETS = [
    {
      key: "novels",
      label: { en: "Novels", es: "Novelas", tg: "Mga Nobela" },
      path: "/Adashima_Novelas",
      load: loadNovels,
    },
    {
      key: "manga",
      label: { en: "Manga", es: "Manga", tg: "Manga" },
      path: "/Adashima_Manga",
      load: loadManga,
    },
    {
      key: "music",
      label: { en: "Music", es: "Música", tg: "Music" },
      path: "/Adashima_Music",
      load: loadMusic,
    },
    {
      key: "stories",
      label: { en: "Stories", es: "Historias", tg: "Mga Kuwento" },
      path: "/otros/Web_Stories",
      load: loadStories,
    },
    {
      key: "gallery",
      label: { en: "Gallery", es: "Galería", tg: "Gallery" },
      path: "/Adashima_Gallery",
      load: loadGallery,
    },
  ];

  const TEXT = {
    en: {
      placeholder: "Search the archive…",
      hint: "Search novels, manga, music, stories, and gallery",
      shortcut: "Ctrl K",
      all: "All",
      noResults: "No results found",
      start: "Type to search the archive",
      loading: "Loading archive…",
      result: "result",
      results: "results",
      close: "Close search",
      clear: "Clear search",
      search: "Search",
    },
    es: {
      placeholder: "Buscar en el archivo…",
      hint: "Busca novelas, manga, música, historias y galería",
      shortcut: "Ctrl K",
      all: "Todo",
      noResults: "No se encontraron resultados",
      start: "Escribe para buscar en el archivo",
      loading: "Cargando archivo…",
      result: "resultado",
      results: "resultados",
      close: "Cerrar búsqueda",
      clear: "Limpiar búsqueda",
      search: "Buscar",
    },
    tg: {
      placeholder: "Maghanap sa archive…",
      hint: "Maghanap ng nobela, manga, music, stories, at gallery",
      shortcut: "Ctrl K",
      all: "Lahat",
      noResults: "Walang nahanap na resulta",
      start: "Mag-type para maghanap sa archive",
      loading: "Nilo-load ang archive…",
      result: "resulta",
      results: "mga resulta",
      close: "Isara ang paghahanap",
      clear: "I-clear ang paghahanap",
      search: "Maghanap",
    },
  };

  let lang = getLanguage();
  let indexPromise = null;
  let index = [];
  let activeFilter = "all";
  let paletteOpen = false;
  let selectedIndex = 0;

  function getLanguage() {
    const value = document.documentElement.lang || localStorage.getItem("lang") || "es";
    return ["en", "es", "tg"].includes(value) ? value : "es";
  }

  function t(key) {
    return (TEXT[lang] || TEXT.en)[key];
  }

  async function json(path) {
    const response = await fetch(path, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Failed to load ${path}`);
    return response.json();
  }

  async function loadNovels() {
    const data = await json(`/src/data/novelas/${lang}.json`);
    return (data.volumes || []).map((item) => ({
      id: `novel-${item.id}`,
      title: item.title || `Volume ${item.id}`,
      subtitle: item.desc || "",
      image: item.thumbnail || "",
      type: "novels",
      url: `/Adashima_Novelas#novel-${encodeURIComponent(item.id)}`,
      search: [item.title, item.desc, item.translator, item.id].filter(Boolean).join(" "),
    }));
  }

  async function loadManga() {
    const data = await json(`/src/data/manga/${lang}.json`);
    const items = [];
    for (const version of Object.values(data.versions || {})) {
      const label = version.label || "Manga";
      for (const [number, description] of Object.entries(version.descriptions || {})) {
        items.push({
          id: `manga-${label}-${number}`,
          title: `Chapter ${number}`,
          subtitle: `${label} · ${description}`,
          image: data.chapterThumbnails?.[label?.toLowerCase()]?.[number] || "",
          type: "manga",
          url: "/Adashima_Manga",
          search: [number, description, label, version.path].filter(Boolean).join(" "),
        });
      }
    }
    return items;
  }

  async function loadMusic() {
    const data = await json(`/src/data/music/${lang}.json`);
    const items = [];
    for (const album of data.albums || []) {
      items.push({
        id: `music-album-${album.id}`,
        title: album.title || album.title_en || "Album",
        subtitle: `${album.artist || ""}${album.year ? ` · ${album.year}` : ""}`.trim(),
        image: album.coverImage || "",
        type: "music",
        url: `/Adashima_Music?album=${encodeURIComponent(album.id)}`,
        search: [
          album.title,
          album.title_jp,
          album.title_en,
          album.artist,
          album.badge,
          album.classification,
          album.catalogNumber,
        ]
          .filter(Boolean)
          .join(" "),
      });
      for (const track of album.tracks || []) {
        items.push({
          id: `music-track-${track.id}`,
          title: track.title || track.title_en || "Track",
          subtitle: `${album.title || "Album"} · ${track.artist || ""}`.replace(/ · $/, ""),
          image: album.coverImage || "",
          type: "music",
          url: `/Adashima_Music?album=${encodeURIComponent(album.id)}`,
          search: [
            track.title,
            track.title_jp,
            track.title_es,
            track.artist,
            album.title,
            album.title_jp,
          ]
            .filter(Boolean)
            .join(" "),
        });
      }
    }
    return items;
  }

  async function loadStories() {
    const data = await json(`/src/data/web-stories/${lang}.json`);
    return [...(data.stories || []), ...(data.auChapters || [])].map((item, i) => ({
      id: `story-${i}-${item.enTitle || item.title || "story"}`,
      title: item.enTitle || item.title || item.jpTitle || `Story ${i + 1}`,
      subtitle: [item.jpTitle, item.source, item.type, item.volume].filter(Boolean).join(" · "),
      image: "",
      type: "stories",
      url: "/otros/Web_Stories",
      search: Object.values(item)
        .filter((value) => typeof value === "string" || typeof value === "number")
        .join(" "),
    }));
  }

  async function loadGallery() {
    const sources = ["official", "covers", "coversJP", "mangaCoversJP"];
    const groups = await Promise.all(
      sources.map((source) => json(`/src/data/gallery/${source}/${lang}.json`).catch(() => null)),
    );
    return groups.flatMap((data, sourceIndex) =>
      (data?.artworks || []).map((item) => ({
        id: `gallery-${sources[sourceIndex]}-${item.id}`,
        title: item.title || "Gallery artwork",
        subtitle: [item.artist, item.collection, item.year].filter(Boolean).join(" · "),
        image: item.image || "",
        type: "gallery",
        url: "/Adashima_Gallery",
        search: [
          item.title,
          item.artist,
          item.collection,
          item.publication,
          item.type,
          item.year,
          ...(item.characters || []),
          ...(item.tags || []),
        ]
          .filter(Boolean)
          .join(" "),
      })),
    );
  }

  async function ensureIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = Promise.all(DATASETS.map((dataset) => dataset.load().catch(() => []))).then(
      (groups) => {
        index = groups.flat();
        return index;
      },
    );
    return indexPromise;
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function editDistance(a, b) {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    if (Math.abs(a.length - b.length) > 3) return 4;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) {
        row[j] = Math.min(
          row[j - 1] + 1,
          prev[j] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
      prev = row;
    }
    return prev[b.length];
  }

  function score(item, query) {
    const q = normalize(query);
    if (!q) return 0;
    const title = normalize(item.title);
    const text = normalize(item.search);
    if (title === q) return 1000;
    if (title.startsWith(q)) return 850;
    if (title.includes(q)) return 700;
    if (text.includes(q)) return 500;

    const qTokens = q.split(/\s+/).filter(Boolean);
    const tokens = text.split(/\s+/).filter(Boolean);
    let total = 0;
    for (const qt of qTokens) {
      let best = 0;
      for (const token of tokens) {
        if (token.startsWith(qt)) best = Math.max(best, 260);
        else if (token.includes(qt)) best = Math.max(best, 210);
        else if (qt.length >= 3) {
          const distance = editDistance(qt, token.slice(0, Math.max(qt.length, 3)));
          if (distance <= Math.max(1, Math.floor(qt.length / 4)))
            best = Math.max(best, 140 - distance * 20);
        }
      }
      total += best;
    }
    return total;
  }

  function search(query) {
    if (!query.trim()) return [];
    return index
      .filter((item) => activeFilter === "all" || item.type === activeFilter)
      .map((item) => ({ item, score: score(item, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
      .slice(0, 12)
      .map((entry) => entry.item);
  }

  function iconFor(type) {
    return (
      {
        novels: "book-open",
        manga: "book",
        music: "music",
        stories: "scroll-text",
        gallery: "images",
      }[type] || "search"
    );
  }

  function escapeHtml(value) {
    return String(value || "").replace(
      /[&<>'"]/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char],
    );
  }

  function resultHtml(item, indexInResults) {
    const dataset = DATASETS.find((entry) => entry.key === item.type);
    const label = dataset?.label?.[lang] || dataset?.label?.en || item.type;
    const image = item.image
      ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy" decoding="async" />`
      : `<span class="global-search-result-icon"><i data-lucide="${iconFor(item.type)}"></i></span>`;
    return `<a class="global-search-result${indexInResults === selectedIndex ? " is-selected" : ""}" href="${escapeHtml(item.url)}" data-result-index="${indexInResults}">
      <span class="global-search-result-thumb">${image}</span>
      <span class="global-search-result-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.subtitle || "")}</span></span>
      <span class="global-search-result-tag">${escapeHtml(label)}</span>
      <i data-lucide="arrow-up-right" class="global-search-result-arrow" aria-hidden="true"></i>
    </a>`;
  }

  function filterHtml() {
    return [
      { key: "all", label: t("all") },
      ...DATASETS.map((dataset) => ({
        key: dataset.key,
        label: dataset.label[lang] || dataset.label.en,
      })),
    ]
      .map(
        (filter) =>
          `<button type="button" class="global-search-filter${activeFilter === filter.key ? " is-active" : ""}" data-search-filter="${filter.key}">${escapeHtml(filter.label)}</button>`,
      )
      .join("");
  }

  function buildPalette() {
    if (document.getElementById("globalSearchPalette")) return;
    const palette = document.createElement("div");
    palette.id = "globalSearchPalette";
    palette.className = "global-search-palette";
    palette.hidden = true;
    palette.innerHTML = `<div class="global-search-backdrop" data-search-close></div>
      <section class="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby="globalSearchTitle">
        <div class="global-search-header">
          <div class="global-search-input-wrap">
            <i data-lucide="search" aria-hidden="true"></i>
            <input id="globalPaletteInput" type="search" autocomplete="off" spellcheck="false" />
            <kbd>Esc</kbd>
          </div>
          <button type="button" class="global-search-close" data-search-close aria-label="${t("close")}"><i data-lucide="x"></i></button>
        </div>
        <div class="global-search-filters" id="globalSearchFilters" role="toolbar" aria-label="Search filters">${filterHtml()}</div>
        <div class="global-search-meta"><span id="globalSearchTitle">${escapeHtml(t("hint"))}</span><span id="globalSearchCount"></span></div>
        <div class="global-search-results" id="globalSearchResults" role="listbox"></div>
      </section>`;
    document.body.appendChild(palette);
    wirePalette(palette);
    if (window.lucide) window.lucide.createIcons();
  }

  function buildHomeSearch() {
    const host = document.getElementById("global-search-home");
    if (!host || host.dataset.initialized) return;
    host.dataset.initialized = "true";
    host.innerHTML = `<div class="global-home-search-shell">
      <div class="global-home-search-input-wrap">
        <i data-lucide="search" aria-hidden="true"></i>
        <input id="globalSearchInput" type="search" autocomplete="off" spellcheck="false" />
        <kbd>${escapeHtml(t("shortcut"))}</kbd>
        <button type="button" class="global-home-search-clear" id="globalSearchClear" aria-label="${t("clear")}" hidden><i data-lucide="x"></i></button>
      </div>
      <div class="global-search-filters global-home-search-filters" id="globalHomeSearchFilters" role="toolbar" aria-label="Search filters">${filterHtml()}</div>
      <div class="global-home-search-results" id="globalHomeSearchResults"></div>
    </div>`;
    const input = document.getElementById("globalSearchInput");
    const clear = document.getElementById("globalSearchClear");
    input.placeholder = t("placeholder");
    input.setAttribute("aria-label", t("search"));
    input.addEventListener("input", () => renderHomeResults(input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") input.blur();
    });
    clear.addEventListener("click", () => {
      input.value = "";
      renderHomeResults("");
      input.focus();
    });
    host.addEventListener("click", (event) => {
      const filter = event.target.closest("[data-search-filter]");
      if (!filter) return;
      activeFilter = filter.dataset.searchFilter;
      syncFilterButtons();
      renderHomeResults(input.value);
    });
    if (window.lucide) window.lucide.createIcons();
  }

  function syncFilterButtons() {
    document
      .querySelectorAll("[data-search-filter]")
      .forEach((button) =>
        button.classList.toggle("is-active", button.dataset.searchFilter === activeFilter),
      );
  }

  function renderHomeResults(query) {
    const resultsEl = document.getElementById("globalHomeSearchResults");
    const clear = document.getElementById("globalSearchClear");
    if (!resultsEl) return;
    clear.hidden = !query;
    if (!query.trim()) {
      resultsEl.innerHTML = "";
      return;
    }
    if (!index.length) {
      resultsEl.innerHTML = `<div class="global-search-loading">${escapeHtml(t("loading"))}</div>`;
      ensureIndex().then(() => renderHomeResults(query));
      return;
    }
    const results = search(query);
    resultsEl.innerHTML = results.length
      ? results.slice(0, 8).map(resultHtml).join("")
      : `<div class="global-search-empty">${escapeHtml(t("noResults"))}</div>`;
    if (window.lucide) window.lucide.createIcons();
  }

  function wirePalette(palette) {
    const input = palette.querySelector("#globalPaletteInput");
    const resultsEl = palette.querySelector("#globalSearchResults");
    palette.addEventListener("click", (event) => {
      const filter = event.target.closest("[data-search-filter]");
      if (filter) {
        activeFilter = filter.dataset.searchFilter;
        syncFilterButtons();
        renderPaletteResults(input.value);
        input.focus();
      }
      if (event.target.closest("[data-search-close]")) closePalette();
    });
    input.addEventListener("input", () => {
      selectedIndex = 0;
      renderPaletteResults(input.value);
    });
    input.addEventListener("keydown", (event) => {
      const results = search(input.value);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, Math.max(results.length - 1, 0));
        renderPaletteResults(input.value);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        renderPaletteResults(input.value);
      }
      if (event.key === "Enter" && results[selectedIndex]) {
        event.preventDefault();
        window.location.href = results[selectedIndex].url;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closePalette();
      }
    });
    resultsEl.addEventListener("mousemove", (event) => {
      const result = event.target.closest("[data-result-index]");
      if (!result) return;
      selectedIndex = Number(result.dataset.resultIndex);
      resultsEl
        .querySelectorAll(".global-search-result")
        .forEach((el) =>
          el.classList.toggle("is-selected", Number(el.dataset.resultIndex) === selectedIndex),
        );
    });
  }

  function renderPaletteResults(query) {
    const resultsEl = document.getElementById("globalSearchResults");
    const countEl = document.getElementById("globalSearchCount");
    if (!resultsEl) return;
    if (!query.trim()) {
      resultsEl.innerHTML = `<div class="global-search-start"><i data-lucide="sparkles"></i><span>${escapeHtml(t("start"))}</span></div>`;
      countEl.textContent = "";
      if (window.lucide) window.lucide.createIcons();
      return;
    }
    if (!index.length) {
      resultsEl.innerHTML = `<div class="global-search-loading">${escapeHtml(t("loading"))}</div>`;
      ensureIndex().then(() => renderPaletteResults(query));
      return;
    }
    const results = search(query);
    countEl.textContent = `${results.length} ${results.length === 1 ? t("result") : t("results")}`;
    resultsEl.innerHTML = results.length
      ? results.map(resultHtml).join("")
      : `<div class="global-search-empty"><i data-lucide="search-x"></i><span>${escapeHtml(t("noResults"))}</span></div>`;
    if (window.lucide) window.lucide.createIcons();
  }

  function openPalette() {
    if (window.isHomePage?.()) return;
    buildPalette();
    const palette = document.getElementById("globalSearchPalette");
    const input = document.getElementById("globalPaletteInput");
    if (!palette || !input) return;
    palette.hidden = false;
    paletteOpen = true;
    document.body.classList.add("global-search-open");
    input.placeholder = t("placeholder");
    selectedIndex = 0;
    renderPaletteResults(input.value);
    requestAnimationFrame(() => input.focus());
    ensureIndex();
  }

  function closePalette() {
    const palette = document.getElementById("globalSearchPalette");
    if (!palette) return;
    palette.hidden = true;
    paletteOpen = false;
    document.body.classList.remove("global-search-open");
  }

  function addTrigger() {
    if (window.isHomePage?.()) return;
    const controls = document.querySelector("#menu-component-wrapper .sidebar-controls");
    if (!controls || controls.querySelector(".global-search-trigger")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "drawer-close-btn global-search-trigger";
    button.setAttribute("aria-label", t("search"));
    button.title = `${t("search")} (${t("shortcut")})`;
    button.innerHTML = `<i data-lucide="search"></i>`;
    button.addEventListener("click", openPalette);
    controls.insertBefore(button, controls.firstChild);
    if (window.lucide) window.lucide.createIcons();
  }

  function refreshLanguage() {
    lang = getLanguage();
    const input = document.getElementById("globalSearchInput");
    if (input) input.placeholder = t("placeholder");
    const paletteInput = document.getElementById("globalPaletteInput");
    if (paletteInput) paletteInput.placeholder = t("placeholder");
    const homeFilters = document.getElementById("globalHomeSearchFilters");
    if (homeFilters) homeFilters.innerHTML = filterHtml();
    const paletteFilters = document.getElementById("globalSearchFilters");
    if (paletteFilters) paletteFilters.innerHTML = filterHtml();
    syncFilterButtons();
    if (paletteOpen) renderPaletteResults(paletteInput?.value || "");
    indexPromise = null;
    index = [];
  }

  function loadStyles() {
    if (document.querySelector("link[data-global-search-styles]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/src/css/global-search.css?v=2.5.0";
    link.dataset.globalSearchStyles = "true";
    document.head.appendChild(link);
  }

  function init() {
    loadStyles();
    if (window.isHomePage?.()) {
      buildHomeSearch();
      const homeButton = document.getElementById("globalSearchMenuButton");
      if (homeButton) homeButton.style.display = "none";
    } else {
      buildPalette();
      addTrigger();
    }
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (window.isHomePage?.()) {
          const input = document.getElementById("globalSearchInput");
          if (input) input.focus();
        } else if (paletteOpen) closePalette();
        else openPalette();
      }
    });
    document.addEventListener("languageChanged", refreshLanguage);
    document.addEventListener("menuLoaded", () => {
      if (!window.isHomePage?.()) addTrigger();
    });
    window.addEventListener("resize", () => {
      if (paletteOpen) document.body.classList.add("global-search-open");
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
