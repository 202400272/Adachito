let translations = null;
let stories = [];
let filteredStoriesCache = [];
let currentStoryIndex = -1;
let isSwitching = false;
let sourcesData = null;
let currentFilter = "all";

let currentLang = (() => {
  const storedLang =
    window.LanguageSwitch?.getCurrentLanguage?.() ||
    localStorage.getItem("lang") ||
    localStorage.getItem("preferredLanguage") ||
    localStorage.getItem("language") ||
    localStorage.getItem("adashima_manga_lang") ||
    "es";

  const normalized = String(storedLang).toLowerCase().trim();
  if (["es", "en", "tg"].includes(normalized)) return normalized;
  if (normalized.startsWith("en-")) return "en";
  if (normalized.startsWith("tg-")) return "tg";
  return "es";
})();

const READER_SETTINGS_KEY = "adashima_reader_settings";

const defaultSettings = {
  theme: "light",
  fontSize: 22,
  fontFamily: "'Source Serif 4', Georgia, serif",
  lineHeight: 1.9,
  readingWidth: 700,
  dyslexiaFont: false,
};

let readerSettings = null;
let readerScrollHandler = null;
let readerResizeHandler = null;

function loadDyslexicFont() {
  if (document.getElementById("opendyslexic-font")) return;
  const link = document.createElement("link");
  link.id = "opendyslexic-font";
  link.rel = "stylesheet";
  link.href = "https://fonts.cdnfonts.com/css/opendyslexic";
  document.head.appendChild(link);
}

function loadReaderSettings() {
  try {
    const saved = localStorage.getItem(READER_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      readerSettings = { ...defaultSettings, ...parsed };
    } else {
      readerSettings = { ...defaultSettings };
    }
  } catch (e) {
    readerSettings = { ...defaultSettings };
  }
  if (readerSettings.dyslexiaFont) {
    loadDyslexicFont();
  }
  return readerSettings;
}

function saveReaderSettings() {
  try {
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(readerSettings));
  } catch (e) {}
}

function applyReaderSettings() {
  if (!readerSettings) return;

  const content = document.getElementById("readerContent");
  if (!content) return;

  const overlay = document.getElementById("readerOverlay");
  const modal = document.querySelector(".reader-modal");
  const controls = document.getElementById("readerControls");

  overlay.classList.remove("theme-light", "theme-sepia", "theme-dark");
  modal.classList.remove("theme-light", "theme-sepia", "theme-dark");
  controls.classList.remove("theme-light", "theme-sepia", "theme-dark");

  overlay.classList.add(`theme-${readerSettings.theme}`);
  modal.classList.add(`theme-${readerSettings.theme}`);
  controls.classList.add(`theme-${readerSettings.theme}`);

  const textEl = content.querySelector(".reader-text");
  if (textEl) {
    textEl.style.fontSize = `${readerSettings.fontSize}px`;
    textEl.style.fontFamily = readerSettings.dyslexiaFont
      ? "'OpenDyslexic', 'Comic Sans MS', sans-serif"
      : readerSettings.fontFamily;
  }

  const paragraphs = content.querySelectorAll(".reader-text p");
  paragraphs.forEach((p) => {
    p.style.lineHeight = readerSettings.lineHeight;
  });

  if (content) {
    content.style.maxWidth = `${readerSettings.readingWidth}px`;
  }
}

function updateSettingsUI() {
  if (!readerSettings) return;

  document.querySelectorAll(".settings-theme-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === readerSettings.theme);
  });

  document.getElementById("fontSizeValue").textContent =
    `${readerSettings.fontSize}px`;
  document.getElementById("fontFamilySelect").value = readerSettings.fontFamily;

  document.querySelectorAll(".settings-lh-btn").forEach((btn) => {
    btn.classList.toggle(
      "active",
      parseFloat(btn.dataset.lh) === readerSettings.lineHeight,
    );
  });

  document.querySelectorAll(".settings-width-btn").forEach((btn) => {
    btn.classList.toggle(
      "active",
      parseInt(btn.dataset.width) === readerSettings.readingWidth,
    );
  });

  const dyslexiaBtn = document.getElementById("dyslexiaToggle");
  if (dyslexiaBtn) {
    dyslexiaBtn.classList.toggle("active", !!readerSettings.dyslexiaFont);
    dyslexiaBtn.setAttribute(
      "aria-pressed",
      String(!!readerSettings.dyslexiaFont),
    );
  }

  const fontFamilySelect = document.getElementById("fontFamilySelect");
  if (fontFamilySelect) {
    fontFamilySelect.disabled = !!readerSettings.dyslexiaFont;
  }
}

function toggleSettingsPanel(show) {
  const panel = document.getElementById("readerSettingsPanel");
  if (!panel) return;

  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  if (isMobile) {
    panel.style.position = "relative";
    panel.style.bottom = "auto";
    panel.style.top = "auto";
    panel.style.left = "0";
    panel.style.right = "0";
    panel.style.width = "100%";
    panel.style.borderRadius = "0";
  }

  if (show === undefined) {
    panel.classList.toggle("open");
  } else if (show) {
    panel.classList.add("open");
  } else {
    panel.classList.remove("open");
  }
}

function toggleImmersiveMode(force) {
  const modal = document.querySelector(".reader-modal");
  const exitBtn = document.getElementById("readerImmersiveExit");
  const toggleBtn = document.getElementById("readerImmersiveBtn");
  if (!modal) return;

  const isActive =
    force !== undefined ? force : !modal.classList.contains("immersive");

  modal.classList.toggle("immersive", isActive);
  if (exitBtn) exitBtn.hidden = !isActive;
  if (toggleBtn) toggleBtn.setAttribute("aria-pressed", String(isActive));

  if (isActive) {
    toggleSettingsPanel(false);
  }
}

const FALLBACK_TRANSLATIONS = {
  es: {
    pageTitle: "Historias Extra",
    pageSubtitle:
      "Una colección de historias secundarias oficiales, capítulos adicionales y contenido especial de la serie Adachi to Shimamura.",
    searchPlaceholder: "Buscar...",
    readButton: "Leer",
    noResults: "No se encontraron historias.",
    back: "Volver",
    loading: "Cargando...",
    volume: "Volumen",
    store: "Tienda",
    translatorNote: "Nota del Traductor",
    statsStories: "Total",
    statsVolumes: "Volúmenes",
    statsTranslated: "Traducidas",
    sourcesTitle: "Fuentes",
    sourcesDescription:
      "Un archivo completo de todas las historias extra, organizadas por su fuente original.",
    markRead: "Leer",
    markUnread: "No Leer",
  },
  en: {
    pageTitle: "Extra Stories",
    pageSubtitle:
      "A collection of official side stories, bonus chapters, and special content from the Adachi to Shimamura series.",
    searchPlaceholder: "Search...",
    readButton: "Read",
    noResults: "No stories found.",
    back: "Back",
    loading: "Loading...",
    volume: "Volume",
    store: "Store",
    translatorNote: "Translator's Note",
    statsStories: "Total",
    statsVolumes: "Volumes",
    statsTranslated: "Translated",
    sourcesTitle: "Sources",
    sourcesDescription:
      "A complete archive of all extra stories, bonus chapters, and special content from the Adachi to Shimamura series, organized by their original source.",
    markRead: "Read",
    markUnread: "Unread",
  },
};

function createParticles() {
  const container = document.getElementById("particles");
  if (!container) return;
  for (let i = 0; i < 40; i++) {
    const star = document.createElement("div");
    star.className = "star";
    star.style.left = Math.random() * 100 + "%";
    star.style.animationDelay = Math.random() * 10 + "s";
    star.style.animationDuration = 8 + Math.random() * 8 + "s";
    star.style.width = 2 + Math.random() * 3 + "px";
    star.style.height = star.style.width;
    container.appendChild(star);
  }
}

function showMessage(msg) {
  const t = document.getElementById("toast-message");
  if (!t) return;
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => (t.style.display = "none"), 2500);
}

function getText(key) {
  if (!translations) return key;
  const keys = key.split(".");
  let value = translations;
  for (const k of keys) {
    if (value && typeof value === "object" && k in value) value = value[k];
    else return key;
  }
  return value || key;
}

async function loadTranslations(lang) {
  try {
    const url =
      window.LanguageSwitch && typeof window.LanguageSwitch.getDataUrl === "function"
        ? window.LanguageSwitch.getDataUrl("extras", lang) + "?v=" + Date.now()
        : `../data/extras/${lang}.json?v=${Date.now()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to load translations");
    const data = await response.json();
    translations = data;
    return data;
  } catch (e) {
    translations = FALLBACK_TRANSLATIONS[lang] || FALLBACK_TRANSLATIONS.es;
    return translations;
  }
}

async function loadStories(lang) {
  try {
    const response = await fetch(
      (window.LanguageSwitch && typeof window.LanguageSwitch.getDataFolderUrl === "function"
        ? window.LanguageSwitch.getDataFolderUrl("extras") + `${lang}/index.json?v=${Date.now()}`
        : `../data/extras/${lang}/index.json?v=${Date.now()}`),
    );
    if (!response.ok) throw new Error("Failed to load story index");
    const data = await response.json();
    stories = data.stories || [];
    filteredStoriesCache = stories;
    return stories;
  } catch (e) {
    stories = [];
    filteredStoriesCache = [];
    return [];
  }
}

async function loadStoryContent(lang, storyId) {
  try {
    const response = await fetch(
      (window.LanguageSwitch && typeof window.LanguageSwitch.getDataFolderUrl === "function"
        ? window.LanguageSwitch.getDataFolderUrl("extras") + `${lang}/${storyId}.json?v=${Date.now()}`
        : `../data/extras/${lang}/${storyId}.json?v=${Date.now()}`),
    );
    if (!response.ok) throw new Error("Failed to load story content");
    return await response.json();
  } catch (e) {
    return null;
  }
}

async function loadSources() {
  try {
    const url =
      window.LanguageSwitch && typeof window.LanguageSwitch.getDataFolderUrl === "function"
        ? window.LanguageSwitch.getDataFolderUrl("extras") + `sources.json?v=${Date.now()}`
        : `../data/extras/sources.json?v=${Date.now()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to load sources");
    const data = await response.json();
    sourcesData = data.sources;
    return sourcesData;
  } catch (e) {
    return null;
  }
}

// ============================================================
// BOOKMARK FUNCTIONS
// ============================================================

function getBookmarks() {
  try {
    return JSON.parse(localStorage.getItem("adashima_bookmarks") || "[]");
  } catch (e) {
    return [];
  }
}

function saveBookmarks(bookmarks) {
  try {
    localStorage.setItem("adashima_bookmarks", JSON.stringify(bookmarks));
  } catch (e) {}
}

function isStoryBookmarked(storyId) {
  const bookmarks = getBookmarks();
  return bookmarks.includes(storyId);
}

function toggleBookmark(storyId) {
  if (currentLang === "es") return;
  const bookmarks = getBookmarks();
  const index = bookmarks.indexOf(storyId);
  if (index > -1) {
    bookmarks.splice(index, 1);
    showMessage("Bookmark removed");
  } else {
    bookmarks.push(storyId);
    showMessage("Bookmarked!");
  }
  saveBookmarks(bookmarks);
  updateBookmarkUI(storyId);
  updateFilterCounts();
  return bookmarks.includes(storyId);
}

function updateBookmarkUI(storyId) {
  document
    .querySelectorAll(`.story-bookmark-btn[data-story-id="${storyId}"]`)
    .forEach((btn) => {
      const isBookmarked = isStoryBookmarked(storyId);
      btn.classList.toggle("bookmarked", isBookmarked);
      btn.setAttribute(
        "aria-label",
        isBookmarked ? "Remove bookmark" : "Add bookmark",
      );
    });
}

// ============================================================
// READING PROGRESS FUNCTIONS
// ============================================================

function getReadingProgressData() {
  try {
    return JSON.parse(
      localStorage.getItem("adashima_reading_progress") || "{}",
    );
  } catch (e) {
    return {};
  }
}

function saveReadingProgressData(data) {
  try {
    localStorage.setItem("adashima_reading_progress", JSON.stringify(data));
  } catch (e) {}
}

function getReadingProgress(storyId) {
  const data = getReadingProgressData();
  return data[storyId] || 0;
}

function isStoryRead(storyId) {
  return getReadingProgress(storyId) >= 100;
}

function updateReadingProgress(storyId, progress) {
  // Clamp progress to 0-100
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const data = getReadingProgressData();

  // Only save if progress is > 0 or story was previously saved
  if (clampedProgress > 0 || data[storyId]) {
    data[storyId] = clampedProgress;
    saveReadingProgressData(data);
  }

  updateProgressUI(storyId);
  updateFilterCounts();

  // Update progress bar in reader if current story
  const currentStory = filteredStoriesCache[currentStoryIndex];
  if (currentStory && currentStory.id === storyId) {
    document.getElementById("readerProgress").style.width =
      clampedProgress + "%";
  }
}

function markStoryAsRead(storyId) {
  updateReadingProgress(storyId, 100);
  showMessage("Marked as read!");
  updateMarkReadButton();
}

function markStoryAsUnread(storyId) {
  const data = getReadingProgressData();
  delete data[storyId];
  saveReadingProgressData(data);
  updateProgressUI(storyId);
  updateFilterCounts();
  showMessage("Marked as unread");
  updateMarkReadButton();
}

function toggleReadStatus(storyId) {
  if (currentLang === "es") return;
  if (isStoryRead(storyId)) {
    markStoryAsUnread(storyId);
  } else {
    markStoryAsRead(storyId);
  }
}

function updateProgressUI(storyId) {
  const progress = getReadingProgress(storyId);
  const isRead = progress >= 100;

  document
    .querySelectorAll(`.story-card[data-story-id="${storyId}"] .story-meta`)
    .forEach((meta) => {
      const existingBadge = meta.querySelector(".story-progress-badge");
      if (existingBadge) existingBadge.remove();

      let badgeHtml = "";
      if (isRead) {
        badgeHtml = `<span class="story-progress-badge complete"><i class="fas fa-check-circle"></i> Read</span>`;
      } else if (progress > 0) {
        badgeHtml = `<span class="story-progress-badge"><i class="fas fa-circle"></i> ${Math.round(progress)}%</span>`;
      }
      if (badgeHtml) {
        meta.insertAdjacentHTML("beforeend", badgeHtml);
      }
    });
}

function updateMarkReadButton() {
  const story = filteredStoriesCache[currentStoryIndex];
  if (!story) return;

  const btn = document.getElementById("readerMarkRead");
  const label = document.getElementById("readerMarkLabel");
  const isRead = isStoryRead(story.id);

  btn.disabled = currentLang === "es";

  if (isRead) {
    btn.classList.add("marked");
    label.textContent = getText("markUnread") || "Unread";
  } else {
    btn.classList.remove("marked");
    label.textContent = getText("markRead") || "Read";
  }
}

// ============================================================
// FILTER FUNCTIONS
// ============================================================

function updateFilterCounts() {
  const total = stories.length;
  const bookmarks = getBookmarks().length;
  const read = stories.filter((s) => isStoryRead(s.id)).length;
  const unread = total - read;

  document.getElementById("countAll").textContent = total;
  document.getElementById("countBookmarks").textContent = bookmarks;
  document.getElementById("countRead").textContent = read;
  document.getElementById("countUnread").textContent = unread;
}

function getFilteredStories(filter) {
  let result = stories;

  switch (filter) {
    case "bookmarks":
      result = stories.filter((s) => isStoryBookmarked(s.id));
      break;
    case "read":
      result = stories.filter((s) => isStoryRead(s.id));
      break;
    case "unread":
      result = stories.filter((s) => !isStoryRead(s.id));
      break;
    case "all":
    default:
      result = stories;
      break;
  }

  const searchInput = document.getElementById("searchInput");
  if (searchInput && searchInput.value.trim()) {
    const searchTerm = searchInput.value.toLowerCase().trim();
    result = result.filter((story) => {
      const title = (story.title || "").toLowerCase();
      const type = (story.type || "").toLowerCase();
      const store = (story.store || "").toLowerCase();
      const volume = (story.volume || "").toLowerCase();
      const description = (story.description || "").toLowerCase();
      return (
        title.includes(searchTerm) ||
        type.includes(searchTerm) ||
        store.includes(searchTerm) ||
        volume.includes(searchTerm) ||
        description.includes(searchTerm)
      );
    });
  }

  return result;
}

function updateFilterPillsState() {
  document.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.disabled = currentLang === "es";
  });
}

function applyFilter(filter) {
  if (currentLang === "es") return;
  currentFilter = filter;

  document.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.filter === filter);
  });

  filteredStoriesCache = getFilteredStories(filter);
  renderFilteredStories(filteredStoriesCache);
}

function renderSources(filter = "all") {
  if (!sourcesData) return;

  const container = document.getElementById("sourcesContainer");
  if (!container) return;

  let totalSources = 0;
  let html = "";

  const categories = ["manga", "light_novel", "miscellaneous", "kakuyomu"];
  const activeCategories = filter === "all" ? categories : [filter];

  if (sourcesData.manga && activeCategories.includes("manga")) {
    const count = sourcesData.manga.stories.length;
    totalSources += count;
    html += `
          <div class="source-category" data-category="manga">
            <div class="source-category-header">
              <span class="source-category-title">
                <i class="fas ${sourcesData.manga.icon}"></i> ${sourcesData.manga.title}
                <span class="source-category-count">${count}</span>
              </span>
            </div>
            <div class="source-list">
              ${sourcesData.manga.stories
                .map(
                  (story) => `
                <div class="source-item">
                  <span class="source-volume">${story.volume}</span>
                  <span class="source-story">${story.title}</span>
                  <span class="source-origin">${story.origin}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        `;
  }

  if (sourcesData.light_novel && activeCategories.includes("light_novel")) {
    const ln = sourcesData.light_novel;
    const volumes = Object.values(ln.volumes);
    const totalCount = volumes.reduce((sum, v) => sum + v.stories.length, 0);
    totalSources += totalCount;

    html += `
          <div class="source-category" data-category="light_novel">
            <div class="source-category-header">
              <span class="source-category-title">
                <i class="fas ${ln.icon}"></i> ${ln.title}
                <span class="source-category-count">${totalCount}</span>
              </span>
            </div>
            ${volumes
              .map(
                (volume) => `
              <div class="source-subcategory">
                <div class="source-subcategory-title">${volume.title}</div>
                <div class="source-list">
                  ${volume.stories
                    .map(
                      (story) => `
                    <div class="source-item">
                      <span class="source-story">${story.title}</span>
                      <span class="source-origin">${story.origin}</span>
                    </div>
                  `,
                    )
                    .join("")}
                </div>
              </div>
            `,
              )
              .join("")}
          </div>
        `;
  }

  if (sourcesData.miscellaneous && activeCategories.includes("miscellaneous")) {
    const count = sourcesData.miscellaneous.stories.length;
    totalSources += count;
    html += `
          <div class="source-category" data-category="miscellaneous">
            <div class="source-category-header">
              <span class="source-category-title">
                <i class="fas ${sourcesData.miscellaneous.icon}"></i> ${sourcesData.miscellaneous.title}
                <span class="source-category-count">${count}</span>
              </span>
            </div>
            <div class="source-list">
              ${sourcesData.miscellaneous.stories
                .map(
                  (story) => `
                <div class="source-item">
                  <span class="source-story">${story.title}</span>
                  <span class="source-origin">${story.origin}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        `;
  }

  if (sourcesData.kakuyomu && activeCategories.includes("kakuyomu")) {
    const count = sourcesData.kakuyomu.stories.length;
    totalSources += count;
    html += `
          <div class="source-category" data-category="kakuyomu">
            <div class="source-category-header">
              <span class="source-category-title">
                <i class="fas ${sourcesData.kakuyomu.icon}"></i> ${sourcesData.kakuyomu.title}
                <span class="source-category-count">${count}</span>
              </span>
            </div>
            <div class="source-list source-list-links">
              ${sourcesData.kakuyomu.stories
                .map(
                  (story) => `
                <div class="source-item">
                  <span class="source-story">${story.title}</span>
                  <span class="source-origin">${story.origin}</span>
                  ${story.url ? `<a href="${story.url}" target="_blank" rel="noopener noreferrer" class="source-link"><i class="fas fa-external-link-alt"></i></a>` : ""}
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        `;
  }

  document.getElementById("sourcesCount").textContent = totalSources;
  container.innerHTML =
    html || '<p class="sources-empty">No sources found.</p>';
}

function initSourcesToggle() {
  const toggleBtn = document.getElementById("sourcesToggleBtn");
  const sourcesBody = document.getElementById("sourcesBody");
  const sourcesHeader = document.getElementById("sourcesToggle");

  sourcesBody.classList.remove("open");
  toggleBtn.classList.remove("open");
  toggleBtn.setAttribute("aria-expanded", "false");

  function toggleSources() {
    const isOpen = sourcesBody.classList.toggle("open");
    toggleBtn.classList.toggle("open");
    toggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  sourcesHeader.addEventListener("click", (e) => {
    if (
      e.target.closest(".source-filter-btn") ||
      e.target.closest(".source-link")
    )
      return;
    toggleSources();
  });

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSources();
  });

  const filterBtns = document.querySelectorAll(".source-filter-btn");
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderSources(btn.dataset.filter);
    });
  });
}

function updateStats(storyList) {
  const total = storyList.length;
  const volumes = new Set(storyList.map((s) => s.volume || "Uncategorized"));
  const translated = storyList.filter(
    (s) => s.language && s.language !== "Japanese",
  ).length;

  document.getElementById("totalStories").textContent = total;
  document.getElementById("totalVolumes").textContent = volumes.size;
  document.getElementById("totalTranslated").textContent = translated;
}

function renderFilteredStories(filtered) {
  const grid = document.getElementById("storyGrid");
  if (!grid) return;

  if (filtered.length === 0) {
    let emptyMessage = "No stories found.";
    let emptySub = "";
    if (currentFilter === "bookmarks") {
      emptyMessage = "No bookmarks yet.";
      emptySub = "Click the bookmark icon on any story.";
    } else if (currentFilter === "read") {
      emptyMessage = "No read stories yet.";
      emptySub = "Start reading a story.";
    } else if (currentFilter === "unread") {
      emptyMessage = "All stories read! 🎉";
      emptySub = "Check back for new stories.";
    }
    grid.innerHTML = `
          <div class="extra-empty-state">
            <i class="fas fa-book-open"></i>
            <p>${emptyMessage}</p>
            ${emptySub ? `<p class="empty-sub">${emptySub}</p>` : ""}
          </div>
        `;
    return;
  }

  const groupedStories = {};
  filtered.forEach((story) => {
    const volumeKey = story.volume || "Uncategorized";
    if (!groupedStories[volumeKey]) {
      groupedStories[volumeKey] = [];
    }
    groupedStories[volumeKey].push(story);
  });

  const sortedVolumes = Object.keys(groupedStories).sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    const numA = parseInt(a.replace(/\D/g, "")) || 0;
    const numB = parseInt(b.replace(/\D/g, "")) || 0;
    return numA - numB;
  });

  let html = "";
  sortedVolumes.forEach((volume) => {
    const storiesInVolume = groupedStories[volume];

    html += `
          <div class="volume-group">
            <div class="volume-header">
              <div class="volume-cover">
                <i class="fas fa-book"></i>
              </div>
              <h2 class="volume-title">
                ${volume === "Uncategorized" ? "Other Stories" : `${getText("volume")} ${volume}`}
              </h2>
              <span class="volume-count">${storiesInVolume.length}</span>
            </div>
            <div class="volume-stories">
        `;

    storiesInVolume.forEach((story) => {
      const actualIndex = filtered.indexOf(story);
      const isBookmarked = isStoryBookmarked(story.id);
      const isRead = isStoryRead(story.id);
      const progress = getReadingProgress(story.id);

      const typeBadge = story.type
        ? `<span class="story-type">${story.type}</span>`
        : "";

      const storeBadge = story.store
        ? `<span class="story-store-badge"><i class="fas fa-store"></i> ${story.store}</span>`
        : "";

      let progressBadge = "";
      if (isRead) {
        progressBadge = `<span class="story-progress-badge complete"><i class="fas fa-check-circle"></i></span>`;
      } else if (progress > 0) {
        progressBadge = `<span class="story-progress-badge">${Math.round(progress)}%</span>`;
      }

      html += `
            <div class="story-card" data-index="${actualIndex}" data-story-id="${story.id}">
              <div class="story-card-body">
                <div class="story-meta">
                  ${typeBadge}
                  ${storeBadge}
                  ${progressBadge}
                </div>
                <h3 class="story-title">${story.title}</h3>
                <p class="story-description">${story.description || ""}</p>
                <div class="story-footer">
                  <div class="story-footer-left">
                    <button class="story-bookmark-btn ${isBookmarked ? "bookmarked" : ""}" 
                            data-story-id="${story.id}" 
                            aria-label="${isBookmarked ? "Remove bookmark" : "Add bookmark"}"
                            ${currentLang === "es" ? "disabled" : ""}>
                      <i class="fas fa-bookmark"></i>
                    </button>
                  </div>
                  <div class="story-footer-right">
                    <button class="story-read-btn" data-story-id="${story.id}" data-index="${actualIndex}">
                      <i class="fas fa-book-open"></i> ${getText("readButton")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `;
    });

    html += `
            </div>
          </div>
        `;
  });

  grid.innerHTML = html;

  grid.querySelectorAll(".story-read-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.dataset.index);
      openReader(index);
    });
  });

  grid.querySelectorAll(".story-bookmark-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleBookmark(btn.dataset.storyId);
    });
  });
}

function renderStories(searchTerm = "") {
  const grid = document.getElementById("storyGrid");
  const statsBar = document.getElementById("statsBar");
  const extraControls = document.querySelector(".extra-controls");
  const sourcesSection = document.getElementById("sourcesSection");

  if (!grid) return;

  if (currentLang === "es") {
    if (statsBar) statsBar.style.display = "none";
    if (extraControls) extraControls.style.display = "none";
    if (sourcesSection) sourcesSection.style.display = "none";

    grid.innerHTML = `
          <div class="es-coming-soon">
            <div class="es-coming-soon-icon">
              <i class="fas fa-book-reader"></i>
              <i class="fas fa-pencil-alt construction-icon"></i>
            </div>
            <h2 class="es-coming-soon-title">En progreso</h2>
            <p class="es-coming-soon-text">Estamos trabajando en las traducciones al español. ¡Pronto disponibles!</p>
          </div>
        `;
    return;
  } else {
    if (statsBar) statsBar.style.display = "";
    if (extraControls) extraControls.style.display = "";
    if (sourcesSection) sourcesSection.style.display = "";
  }

  filteredStoriesCache = getFilteredStories(currentFilter);
  renderFilteredStories(filteredStoriesCache);
  updateStats(filteredStoriesCache);
  updateFilterCounts();
}

// ============================================================
// READER FUNCTIONS
// ============================================================

async function openReader(index) {
  const story = filteredStoriesCache[index];
  if (!story) return;

  currentStoryIndex = index;
  const overlay = document.getElementById("readerOverlay");
  const content = document.getElementById("readerContent");
  const progress = document.getElementById("readerProgress");
  const readerBody = document.getElementById("readerBody");

  // Remove old scroll handler
  if (readerScrollHandler) {
    readerBody.removeEventListener("scroll", readerScrollHandler);
    readerScrollHandler = null;
  }

  // Remove old resize handler
  if (readerResizeHandler) {
    window.removeEventListener("resize", readerResizeHandler);
    readerResizeHandler = null;
  }

  content.innerHTML = `
        <div class="reader-loading">
          <div class="reader-spinner"></div>
          <p>${getText("loading")}</p>
        </div>
      `;

  overlay.classList.add("active");
  document.body.classList.add("reader-active");
  document.body.style.overflow = "hidden";

  loadReaderSettings();
  applyReaderSettings();
  updateSettingsUI();

  const storyData = await loadStoryContent(currentLang, story.id);

  if (!storyData) {
    content.innerHTML = `
          <div class="reader-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Could not load story content.</p>
          </div>
        `;
    return;
  }

  updateMarkReadButton();

  const tagsHtml = (storyData.tags || [])
    .map((tag) => `<span class="reader-tag">${tag}</span>`)
    .join("");

  const storeHtml = storyData.store
    ? `<span class="reader-store"><i class="fas fa-store"></i> ${storyData.store}</span>`
    : "";

  const translatorNoteHtml = storyData.translatorNote
    ? `
        <div class="reader-translator-note">
          <div class="reader-translator-note-label">
            <i class="fas fa-pen-fancy"></i> ${getText("translatorNote")}
          </div>
          <p>${storyData.translatorNote}</p>
        </div>
      `
    : "";

  content.innerHTML = `
        <div class="reader-heading">
          <h1 class="reader-title">${storyData.title || story.title}</h1>
          <div class="reader-meta">
            <span class="reader-language">${storyData.language || story.language || "English"}</span>
            ${storeHtml}
          </div>
          <div class="reader-tags">${tagsHtml}</div>
        </div>
        <div class="reader-text">
          ${(storyData.content || "")
            .split("\n")
            .map((paragraph) => (paragraph.trim() ? `<p>${paragraph}</p>` : ""))
            .join("")}
        </div>
        ${translatorNoteHtml}
      `;

  applyReaderSettings();

  // Set initial progress
  const currentProgress = getReadingProgress(story.id);
  progress.style.width = currentProgress + "%";

  // Restore scroll position to match saved progress, once layout has painted
  if (currentProgress > 0) {
    requestAnimationFrame(() => {
      const scrollHeight = readerBody.scrollHeight - readerBody.clientHeight;
      if (scrollHeight > 0) {
        readerBody.scrollTop = (scrollHeight * currentProgress) / 100;
      }
    });
  }

  updateReaderNav();
  toggleSettingsPanel(false);

  // Track scroll progress with debounce
  let lastSavedProgress = currentProgress;
  let saveTimeout = null;

  readerScrollHandler = function () {
    const scrollTop = this.scrollTop;
    const scrollHeight = this.scrollHeight - this.clientHeight;

    let scrollProgress = 0;
    if (scrollHeight > 0) {
      // Calculate actual scroll progress
      scrollProgress = (scrollTop / scrollHeight) * 100;
      // Clamp to 100% if at bottom
      if (scrollTop + this.clientHeight >= scrollHeight - 2) {
        scrollProgress = 100;
      }
      progress.style.width = scrollProgress + "%";

      // Only save if progress changed significantly
      if (Math.abs(scrollProgress - lastSavedProgress) > 2) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          updateReadingProgress(story.id, scrollProgress);
          lastSavedProgress = scrollProgress;
        }, 500);
      }
    }
  };

  readerBody.addEventListener("scroll", readerScrollHandler);

  // Also check on resize for proper height calculation
  readerResizeHandler = function () {
    if (overlay.classList.contains("active")) {
      // Recalculate scroll position
      const scrollTop = readerBody.scrollTop;
      const scrollHeight = readerBody.scrollHeight - readerBody.clientHeight;
      if (scrollHeight > 0) {
        let scrollProgress = (scrollTop / scrollHeight) * 100;
        if (scrollTop + readerBody.clientHeight >= scrollHeight - 2) {
          scrollProgress = 100;
        }
        progress.style.width = scrollProgress + "%";
      }
    }
  };

  window.addEventListener("resize", readerResizeHandler);
}

function updateReaderNav() {
  const prevBtn = document.getElementById("readerPrev");
  const nextBtn = document.getElementById("readerNext");

  if (prevBtn) {
    prevBtn.disabled = currentStoryIndex <= 0;
    prevBtn.style.opacity = currentStoryIndex <= 0 ? "0.3" : "1";
  }

  if (nextBtn) {
    nextBtn.disabled = currentStoryIndex >= filteredStoriesCache.length - 1;
    nextBtn.style.opacity =
      currentStoryIndex >= filteredStoriesCache.length - 1 ? "0.3" : "1";
  }
}

function closeReader() {
  const overlay = document.getElementById("readerOverlay");
  const readerBody = document.getElementById("readerBody");

  // Remove scroll handler
  if (readerScrollHandler) {
    readerBody.removeEventListener("scroll", readerScrollHandler);
    readerScrollHandler = null;
  }

  // Remove resize handler
  if (readerResizeHandler) {
    window.removeEventListener("resize", readerResizeHandler);
    readerResizeHandler = null;
  }

  overlay.classList.remove("active");
  document.body.classList.remove("reader-active");
  document.body.style.overflow = "";
  currentStoryIndex = -1;
  toggleSettingsPanel(false);
  toggleImmersiveMode(false);
}

function navigateReader(direction) {
  const newIndex = currentStoryIndex + direction;
  if (newIndex < 0 || newIndex >= filteredStoriesCache.length) return;
  openReader(newIndex);
}

function initReaderSettings() {
  const settingsBtn = document.getElementById("readerSettingsBtn");
  const settingsClose = document.getElementById("settingsClose");
  const panel = document.getElementById("readerSettingsPanel");

  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSettingsPanel();
  });

  settingsClose.addEventListener("click", () => {
    toggleSettingsPanel(false);
  });

  document.addEventListener("click", (e) => {
    if (
      panel.classList.contains("open") &&
      !panel.contains(e.target) &&
      !settingsBtn.contains(e.target)
    ) {
      toggleSettingsPanel(false);
    }
  });

  document.querySelectorAll(".settings-theme-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      readerSettings.theme = btn.dataset.theme;
      saveReaderSettings();
      applyReaderSettings();
      updateSettingsUI();
    });
  });

  document.getElementById("fontSizeDecrease").addEventListener("click", () => {
    if (readerSettings.fontSize > 16) {
      readerSettings.fontSize -= 1;
      saveReaderSettings();
      applyReaderSettings();
      updateSettingsUI();
    }
  });

  document.getElementById("fontSizeIncrease").addEventListener("click", () => {
    if (readerSettings.fontSize < 30) {
      readerSettings.fontSize += 1;
      saveReaderSettings();
      applyReaderSettings();
      updateSettingsUI();
    }
  });

  document
    .getElementById("fontFamilySelect")
    .addEventListener("change", (e) => {
      readerSettings.fontFamily = e.target.value;
      saveReaderSettings();
      applyReaderSettings();
      updateSettingsUI();
    });

  document.querySelectorAll(".settings-lh-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      readerSettings.lineHeight = parseFloat(btn.dataset.lh);
      saveReaderSettings();
      applyReaderSettings();
      updateSettingsUI();
    });
  });

  document.querySelectorAll(".settings-width-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      readerSettings.readingWidth = parseInt(btn.dataset.width);
      saveReaderSettings();
      applyReaderSettings();
      updateSettingsUI();
    });
  });

  const dyslexiaToggle = document.getElementById("dyslexiaToggle");
  if (dyslexiaToggle) {
    dyslexiaToggle.addEventListener("click", () => {
      readerSettings.dyslexiaFont = !readerSettings.dyslexiaFont;
      if (readerSettings.dyslexiaFont) {
        loadDyslexicFont();
      }
      saveReaderSettings();
      applyReaderSettings();
      updateSettingsUI();
    });
  }

  const settingsReset = document.getElementById("settingsReset");
  if (settingsReset) {
    settingsReset.addEventListener("click", () => {
      readerSettings = { ...defaultSettings };
      saveReaderSettings();
      applyReaderSettings();
      updateSettingsUI();
      showMessage("Settings reset to defaults.");
    });
  }

  const immersiveBtn = document.getElementById("readerImmersiveBtn");
  if (immersiveBtn) {
    immersiveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleImmersiveMode(true);
    });
  }

  const immersiveExit = document.getElementById("readerImmersiveExit");
  if (immersiveExit) {
    immersiveExit.addEventListener("click", () => {
      toggleImmersiveMode(false);
    });
  }

  document.getElementById("readerMarkRead").addEventListener("click", () => {
    const story = filteredStoriesCache[currentStoryIndex];
    if (story) {
      toggleReadStatus(story.id);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (panel.classList.contains("open")) {
        toggleSettingsPanel(false);
      }
    }
  });
}

// ============================================================
// LANGUAGE SWITCHER
// ============================================================

// ============================================================
// INIT
// ============================================================

document.addEventListener("DOMContentLoaded", async function () {
  createParticles();

  await loadTranslations(currentLang);
  await loadStories(currentLang);
  await loadSources();

  document.getElementById("pageTitle").textContent = getText("pageTitle");
  document.getElementById("pageSubtitle").textContent = getText("pageSubtitle");
  document.getElementById("searchInput").placeholder =
    getText("searchPlaceholder");

  const readerBackLabel = document.getElementById("readerBackLabel");
  if (readerBackLabel) readerBackLabel.textContent = getText("back");

  document.getElementById("sourcesTitle").textContent = getText("sourcesTitle");
  document.getElementById("sourcesDescription").textContent =
    getText("sourcesDescription");

  document.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      applyFilter(pill.dataset.filter);
    });
  });

  updateFilterPillsState();

  renderStories();
  renderSources("all");
  initSourcesToggle();

  loadReaderSettings();
  applyReaderSettings();
  updateSettingsUI();
  initReaderSettings();

  document.getElementById("searchInput").addEventListener("input", function () {
    renderStories(this.value);
  });

  document.getElementById("readerClose").addEventListener("click", closeReader);
  document
    .getElementById("readerOverlay")
    .addEventListener("click", function (e) {
      if (e.target === this) closeReader();
    });
  document
    .getElementById("readerPrev")
    .addEventListener("click", () => navigateReader(-1));
  document
    .getElementById("readerNext")
    .addEventListener("click", () => navigateReader(1));

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      const panel = document.getElementById("readerSettingsPanel");
      if (panel && panel.classList.contains("open")) {
        return;
      }
      const modal = document.querySelector(".reader-modal");
      if (modal && modal.classList.contains("immersive")) {
        toggleImmersiveMode(false);
        return;
      }
      closeReader();
    }
    if (document.getElementById("readerOverlay").classList.contains("active")) {
      if (e.key === "ArrowLeft") navigateReader(-1);
      if (e.key === "ArrowRight") navigateReader(1);
    }
  });

  const menuVer = Math.floor(Date.now() / 86400000);
  fetch("/src/components/menu.html?v=" + menuVer)
    .then((response) => {
      if (!response.ok) throw new Error("Error HTTP " + response.status);
      return response.text();
    })
    .then((data) => {
      data = data
        .replace(/src="\.\/(assets\/)/g, 'src="../../$1')
        .replace(
          /data-route="\.\.\/\.\.\/index\.html"/g,
          'data-route="../../../index.html"',
        );
      const container =
        document.getElementById("sidebar-container") ||
        document.getElementById("menu-container");
      if (!container) return;
      container.innerHTML = data;

      container.querySelectorAll("script").forEach((oldScript) => {
        const s = document.createElement("script");
        Array.from(oldScript.attributes).forEach((a) =>
          s.setAttribute(a.name, a.value),
        );
        s.appendChild(document.createTextNode(oldScript.innerHTML));
        oldScript.parentNode.replaceChild(s, oldScript);
      });

      setTimeout(() => {
        document.dispatchEvent(new CustomEvent("menuLoaded"));
      }, 100);
    })
    .catch((e) => console.warn("menu.html not available:", e.message));

  document.addEventListener("menuLoaded", function () {
    if (typeof window.translateMenu === "function") {
      window.translateMenu(currentLang);
    }
  });
});