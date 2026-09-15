const JSZIP_VERSION = "3.10.1";
const JSZIP_CDN = `https://cdn.jsdelivr.net/npm/jszip@${JSZIP_VERSION}/dist/jszip.min.js`;
// EPUB asset host.
const EPUB_BASE_URL = "https://media.adashimaverse.com/Novelas/Ingles/";
const EPUB_PROGRESS_KEY = "adashima_epub_html_progress";
const EPUB_READING_STATS_KEY = "adashima_epub_reading_stats";
const EPUB_SETTINGS_KEY = "adashima_epub_html_settings";
const EPUB_FETCH_TIMEOUT_MS = 30000;
const EPUB_REFRESH_PARAM = "reader_refresh";

let jsZipLoadPromise = null;
let epubCurrentVolume = null;
let epubCurrentUrl = null;
let epubZip = null;
let epubOpfPath = "";
let epubSpine = [];
let epubManifest = new Map();
let epubToc = [];
let epubChapters = [];
let epubGuide = [];
let epubChapterIndex = 0;
let epubCurrentTocIndex = -1;
let epubStyleUrls = [];
let epubObjectUrls = [];
// Blob URLs backing the chapter(s) currently attached to #epubReaderScroll
// (the base chapter plus anything appended via infinite scroll). Revoked and
// replaced on every renderChapter() navigation - see the comment there for
// why this can't just wait for cleanupObjectUrls() at reader close.
let epubActiveChapterUrls = [];
let epubProgressTimer = null;
let epubReadingTimer = null;
let epubUiTimer = null;
let epubUiManuallyHidden = false;
let epubResizeTimer = null;
let epubOpenRequestId = 0;
let epubFetchController = null;
let epubSearchCache = new Map();
let epubAutoAdvanceLock = false;

const epubSettingsDefaults = {
  theme: "light",
  fontSize: 100,
  fontWeight: 400,
  lineHeight: 1.65,
  contentWidth: 720,
  mode: "scrolled",
  fontFamily: "system",
  textAlign: "left",
  paragraphSpacing: 1.25,
  letterSpacing: 0,
  wordSpacing: 0,
  paragraphIndent: 0,
  hyphenation: false,
  hideIllustrations: false,
  customTheme: {
    bg: "#17131a",
    text: "#f0e8f1",
    muted: "#b5a9b7",
    link: "#e3a8f2",
    accent: "#c978dc",
  },
  autoHideChrome: true,
  showHeader: true,
  showFooter: true,
  showChapterTitle: true,
  showReadingStats: true,
  progressDisplay: "percentage",
  showProgressBar: true,
  progressBarSize: 3,
  accessibility: {
    highContrast: false,
    reducedMotion: false,
    dyslexiaFont: false,
    underlineLinks: false,
  },
};

let epubSettings = structuredClone(epubSettingsDefaults);

const EPUB_THEMES = {
  light: { bg: "#fffdfb", text: "#29252a", muted: "#6d636d", link: "#79528a", accent: "#79528a" },
  sepia: { bg: "#f1dfbd", text: "#463427", muted: "#725b46", link: "#8b5728", accent: "#b87432" },
  dark: { bg: "#17131a", text: "#f0e8f1", muted: "#b5a9b7", link: "#e3a8f2", accent: "#c978dc" },
  amoled: { bg: "#000000", text: "#f5f5f5", muted: "#a9a9a9", link: "#e5b8ff", accent: "#d47cff" },
  rose: { bg: "#3a101f", text: "#ffe8ef", muted: "#d9a5b4", link: "#ff8fb2", accent: "#ff5f94" },
  ocean: { bg: "#082d3a", text: "#e4fbff", muted: "#91c9d4", link: "#49d4f2", accent: "#16b8dd" },
  forest: { bg: "#102f1b", text: "#e7f7ea", muted: "#a0c3a9", link: "#73d58a", accent: "#3fbc61" },
  lavender: {
    bg: "#25163d",
    text: "#f3eaff",
    muted: "#bca9d5",
    link: "#c99cff",
    accent: "#a86cff",
  },
  cyber: { bg: "#0b0418", text: "#f4ecff", muted: "#b9a9d3", link: "#ff55d8", accent: "#a855ff" },
  nightblue: {
    bg: "#0b1d35",
    text: "#e9f5ff",
    muted: "#9db8d1",
    link: "#69c7ff",
    accent: "#2999e8",
  },
};

function loadJsZip() {
  if (jsZipLoadPromise) return jsZipLoadPromise;
  jsZipLoadPromise = new Promise((resolve, reject) => {
    if (window.JSZip) return resolve(window.JSZip);
    const script = document.createElement("script");
    script.src = JSZIP_CDN;
    script.async = true;
    script.onload = () =>
      window.JSZip ? resolve(window.JSZip) : reject(new Error("JSZip loaded without JSZip"));
    script.onerror = () => {
      jsZipLoadPromise = null;
      reject(new Error("Failed to load the EPUB ZIP parser."));
    };
    document.head.appendChild(script);
  });
  return jsZipLoadPromise;
}

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function saveSettings() {
  try {
    localStorage.setItem(EPUB_SETTINGS_KEY, JSON.stringify(epubSettings));
  } catch {
    /* ignore */
  }
}

function volumeKey(volume) {
  return volume?.fileEpub || volume?.id || "unknown";
}

function progressMap() {
  return readStorage(EPUB_PROGRESS_KEY);
}

function getSavedProgress(volume) {
  return progressMap()[volumeKey(volume)] || null;
}

function readingStatsMap() {
  return readStorage(EPUB_READING_STATS_KEY);
}

function getReadingSeconds() {
  return Number(readingStatsMap()[volumeKey(epubCurrentVolume)]?.seconds || 0);
}

function formatReadingTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function updateReadingStatsUI() {
  const seconds = getReadingSeconds();
  setText("epubReadingTime", formatReadingTime(seconds));
  const progress = document.getElementById("epubProgressText")?.textContent || "0%";
  setText("epubReadingProgress", progress);
}

function persistReadingSecond() {
  if (!epubCurrentVolume) return;
  const map = readingStatsMap();
  const key = volumeKey(epubCurrentVolume);
  const current = map[key] || { seconds: 0 };
  current.seconds = Number(current.seconds || 0) + 1;
  current.updatedAt = Date.now();
  map[key] = current;
  try {
    localStorage.setItem(EPUB_READING_STATS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  updateReadingStatsUI();
}

function startReadingTimer() {
  clearInterval(epubReadingTimer);
  epubReadingTimer = setInterval(() => {
    const modal = document.getElementById("epubReaderModal");
    if (
      !modal?.classList.contains("open") ||
      document.hidden ||
      modal.classList.contains("settings-open") ||
      modal.classList.contains("toc-open") ||
      modal.classList.contains("search-open")
    )
      return;
    const loading = document.getElementById("epubLoadingState");
    if (!loading?.hidden) return;
    persistReadingSecond();
  }, 1000);
}

function stopReadingTimer() {
  clearInterval(epubReadingTimer);
  epubReadingTimer = null;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function themeColors() {
  if (epubSettings.theme === "custom") return epubSettings.customTheme || EPUB_THEMES.dark;
  return EPUB_THEMES[epubSettings.theme] || EPUB_THEMES.light;
}

function isVariableFont() {
  return epubSettings.fontFamily === "system" || epubSettings.fontFamily === "lora";
}

function normalizeFontWeight() {
  const allowed = isVariableFont() ? [300, 400, 500, 600, 700, 800] : [400, 700];
  const current = Number(epubSettings.fontWeight);
  epubSettings.fontWeight = allowed.includes(current) ? current : current >= 550 ? 700 : 400;
}

function updateReaderLabels() {
  const modal = document.getElementById("epubReaderModal");
  if (modal) modal.dataset.theme = epubSettings.theme;
  const themeViewer = document.getElementById("epubViewer");
  if (themeViewer) themeViewer.dataset.theme = epubSettings.theme;
  const f = document.getElementById("epubFontSizeValue");
  if (f) f.textContent = `${epubSettings.fontSize}%`;
  const fw = document.getElementById("epubFontWeightValue");
  const weightMinus = document.getElementById("epubFontWeightMinus");
  const weightPlus = document.getElementById("epubFontWeightPlus");
  if (fw)
    fw.textContent = isVariableFont()
      ? `${epubSettings.fontWeight}`
      : epubSettings.fontWeight >= 700
        ? "Bold"
        : "Regular";
  if (weightMinus) {
    weightMinus.disabled = !isVariableFont() && epubSettings.fontWeight <= 400;
    weightMinus.setAttribute(
      "aria-label",
      isVariableFont() ? "Decrease font weight" : "Use regular font weight",
    );
  }
  if (weightPlus) {
    weightPlus.disabled = !isVariableFont() && epubSettings.fontWeight >= 700;
    weightPlus.setAttribute(
      "aria-label",
      isVariableFont() ? "Increase font weight" : "Use bold font weight",
    );
  }
  const lh = document.getElementById("epubLineHeightValue");
  if (lh) lh.textContent = Number(epubSettings.lineHeight).toFixed(2);
  const w = document.getElementById("epubWidthValue");
  if (w) w.textContent = `${epubSettings.contentWidth}px`;
  const ps = document.getElementById("epubParagraphSpacingValue");
  if (ps) ps.textContent = `${Number(epubSettings.paragraphSpacing || 1.25).toFixed(2)}em`;
  const ls = document.getElementById("epubLetterSpacingValue");
  if (ls) ls.textContent = `${Number(epubSettings.letterSpacing || 0).toFixed(2)}px`;
  const ws = document.getElementById("epubWordSpacingValue");
  if (ws) ws.textContent = `${Number(epubSettings.wordSpacing || 0).toFixed(1)}px`;
  const pi = document.getElementById("epubParagraphIndentValue");
  if (pi) pi.textContent = `${Number(epubSettings.paragraphIndent || 0).toFixed(1)}em`;
  const t = document.getElementById("epubThemeSelect");
  if (t) t.value = epubSettings.theme;
  ["Bg", "Text", "Muted", "Link", "Accent"].forEach((part) => {
    const input = document.getElementById(`epubCustom${part}`);
    if (input) input.value = epubSettings.customTheme?.[part.toLowerCase()] || "#000000";
  });
  document.querySelectorAll("[data-epub-theme]").forEach((card) => {
    const selected = card.dataset.epubTheme === epubSettings.theme;
    card.classList.toggle("is-selected", selected);
    card.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  const font = document.getElementById("epubFontSelect");
  if (font) font.value = epubSettings.fontFamily;
  const align = document.getElementById("epubTextAlignSelect");
  if (align) align.value = epubSettings.textAlign || "left";
  const hide = document.getElementById("epubHideIllustrations");
  if (hide) hide.checked = !!epubSettings.hideIllustrations;
  const pref = document.getElementById("epubReaderPreference");
  if (pref) {
    try {
      pref.value = localStorage.getItem("adashima_reader_preference") || "epub";
    } catch {
      /* ignore */
    }
  }
  const toggles = {
    epubAutoHideChrome: epubSettings.autoHideChrome,
    epubShowHeader: epubSettings.showHeader,
    epubShowFooter: epubSettings.showFooter,
    epubShowChapterTitle: epubSettings.showChapterTitle,
    epubShowReadingStats: epubSettings.showReadingStats,
    epubShowProgressBar: epubSettings.showProgressBar,
    epubDyslexiaFont: epubSettings.accessibility?.dyslexiaFont,
    epubHighContrast: epubSettings.accessibility?.highContrast,
    epubReducedMotion: epubSettings.accessibility?.reducedMotion,
    epubUnderlineLinks: epubSettings.accessibility?.underlineLinks,
    epubHyphenation: epubSettings.hyphenation,
  };
  Object.entries(toggles).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
  });
  const progressDisplay = document.getElementById("epubProgressDisplaySelect");
  if (progressDisplay) progressDisplay.value = epubSettings.progressDisplay || "percentage";
  const progressBarSize = document.getElementById("epubProgressBarSizeSelect");
  if (progressBarSize) progressBarSize.value = String(epubSettings.progressBarSize || 3);
}

function resetEpubSettings() {
  epubSettings = structuredClone(epubSettingsDefaults);
  try {
    localStorage.removeItem(EPUB_SETTINGS_KEY);
  } catch {
    /* ignore */
  }
  saveSettings();
  normalizeFontWeight();
  updateReaderLabels();
  applyReaderStyles();
}

function applyEpubThemeOverride(theme) {
  const viewer = document.getElementById("epubViewer");
  if (!viewer) return;
  let style = document.getElementById("adashimaEpubThemeOverride");
  if (!style) {
    style = document.createElement("style");
    style.id = "adashimaEpubThemeOverride";
    document.head.appendChild(style);
  }
  // Publisher CSS is intentionally loaded for typography/layout, but its
  // page colors must never override the reader theme. This scoped, high-
  // specificity layer is appended after publisher styles and uses !important
  // so light/dark/custom themes work even with aggressive EPUB CSS.
  style.textContent = `
    #epubReaderModal[data-theme="${epubSettings.theme}"] .epub-viewer-wrap,
    #epubReaderModal[data-theme="${epubSettings.theme}"] #epubViewer,
    #epubReaderModal[data-theme="${epubSettings.theme}"] #epubReaderScroll,
    #epubViewer .epub-chapter.reader-content {
      color: ${theme.text} !important;
      background-color: ${theme.bg} !important;
    }
    #epubViewer .epub-chapter.reader-content p,
    #epubViewer .epub-chapter.reader-content li,
    #epubViewer .epub-chapter.reader-content blockquote,
    #epubViewer .epub-chapter.reader-content div,
    #epubViewer .epub-chapter.reader-content section,
    #epubViewer .epub-chapter.reader-content article,
    #epubViewer .epub-chapter.reader-content span,
    #epubViewer .epub-chapter.reader-content strong,
    #epubViewer .epub-chapter.reader-content em {
      background-color: transparent !important;
    }
    #epubViewer .epub-chapter.reader-content a,
    #epubViewer .epub-chapter.reader-content a * { color: ${theme.link} !important; }
    #epubViewer .epub-chapter.reader-content figcaption { color: ${theme.muted} !important; }
    #epubViewer .epub-chapter.reader-content hr { border-top-color: ${theme.muted} !important; }
  `;
  // Move the override to the end of <head> so it stays after publisher CSS.
  document.head.appendChild(style);
}

function applyIllustrationVisibility() {
  const viewer = document.getElementById("epubViewer");
  if (!viewer) return;
  const hidden = !!epubSettings.hideIllustrations;
  viewer.classList.toggle("epub-hide-illustrations", hidden);
  viewer.classList.toggle("hide-illustrations", hidden);
  viewer.querySelectorAll(".epub-chapter").forEach((chapter) => {
    chapter.querySelectorAll('img, picture, svg, [role="img"]').forEach((el) => {
      el.style.setProperty("display", hidden ? "none" : "", "important");
      if (hidden) {
        const figure = el.closest("figure");
        if (figure && figure.querySelector('img, picture, svg, [role="img"]')) {
          figure.dataset.adashimaHiddenIllustration = "true";
          figure.style.setProperty("display", "none", "important");
        }
      }
    });
    if (!hidden)
      chapter.querySelectorAll("figure[data-adashima-hidden-illustration]").forEach((figure) => {
        figure.style.removeProperty("display");
        figure.removeAttribute("data-adashima-hidden-illustration");
      });
  });
}

function applyReaderStyles() {
  const theme = themeColors();
  const viewer = document.getElementById("epubViewer");
  if (!viewer) return;
  viewer.style.setProperty("--epub-bg", theme.bg);
  viewer.style.setProperty("--epub-text", theme.text);
  viewer.style.setProperty("--epub-muted", theme.muted);
  viewer.style.setProperty("--epub-link", theme.link);
  viewer.style.setProperty("--epub-accent", theme.accent || theme.link);
  viewer.style.setProperty("--epub-bg", theme.bg);
  const modal = document.getElementById("epubReaderModal");
  if (modal) {
    modal.style.setProperty("--epub-accent", theme.accent || theme.link);
    modal.style.setProperty(
      "--epub-progress-bar-size",
      `${Number(epubSettings.progressBarSize || 3)}px`,
    );
    // Keep reader themes scoped to the reading surface. The settings/TOC UI
    // intentionally retains its own neutral interface colors and typography.
    modal.style.removeProperty("--epub-bg");
    modal.style.removeProperty("--epub-text");
    modal.style.removeProperty("--epub-muted");
    modal.style.removeProperty("--epub-link");
  }
  viewer.dataset.theme = epubSettings.theme;
  const viewerWrap = viewer.closest(".epub-viewer-wrap");
  if (viewerWrap) viewerWrap.style.setProperty("--epub-bg", theme.bg);
  const scroll = document.getElementById("epubReaderScroll");
  if (scroll) scroll.style.setProperty("--epub-bg", theme.bg);
  viewer.style.setProperty("--epub-font-size", `${epubSettings.fontSize}%`);
  viewer.style.setProperty("--epub-font-weight", epubSettings.fontWeight);
  viewer.style.setProperty("--epub-line-height", epubSettings.lineHeight);
  viewer.style.setProperty("--epub-content-width", `${epubSettings.contentWidth}px`);
  viewer.style.setProperty("--epub-font-family", getFontFamily());
  viewer.style.setProperty("--epub-text-align", epubSettings.textAlign || "left");
  viewer.style.setProperty(
    "--epub-paragraph-spacing",
    `${epubSettings.paragraphSpacing || 1.25}em`,
  );
  viewer.style.setProperty("--epub-letter-spacing", `${Number(epubSettings.letterSpacing || 0)}px`);
  viewer.style.setProperty("--epub-word-spacing", `${Number(epubSettings.wordSpacing || 0)}px`);
  viewer.style.setProperty(
    "--epub-paragraph-indent",
    `${Number(epubSettings.paragraphIndent || 0)}em`,
  );
  viewer.style.setProperty(
    "--epub-progress-bar-size",
    `${Number(epubSettings.progressBarSize || 3)}px`,
  );
  viewer.classList.toggle("epub-high-contrast", !!epubSettings.accessibility?.highContrast);
  viewer.classList.toggle("epub-reduced-motion", !!epubSettings.accessibility?.reducedMotion);
  viewer.classList.toggle("epub-dyslexia-font", !!epubSettings.accessibility?.dyslexiaFont);
  viewer.classList.toggle("epub-hyphenate", !!epubSettings.hyphenation);
  viewer.classList.toggle("epub-underline-links", !!epubSettings.accessibility?.underlineLinks);
  modal?.classList.toggle("epub-no-auto-hide", epubSettings.autoHideChrome === false);
  modal?.classList.toggle("epub-hide-header", epubSettings.showHeader === false);
  modal?.classList.toggle("epub-hide-footer", epubSettings.showFooter === false);
  modal?.classList.toggle("epub-hide-chapter-title", epubSettings.showChapterTitle === false);
  modal?.classList.toggle("epub-hide-progress-bar", epubSettings.showProgressBar === false);
  modal?.classList.toggle("epub-hide-reading-stats", epubSettings.showReadingStats === false);
  viewer.classList.add("epub-scrolled-mode");
  applyEpubThemeOverride(theme);
  applyIllustrationVisibility();
}

function applyCustomTheme() {
  if (!epubSettings.customTheme) return;
  const theme = epubSettings.customTheme;
  const valid = /^#[0-9a-fA-F]{6}$/;
  Object.keys(theme).forEach((key) => {
    if (!valid.test(theme[key])) theme[key] = epubSettingsDefaults.customTheme[key];
  });
}

function getFontFamily() {
  switch (epubSettings.fontFamily) {
    case "arial":
      return "Arial, Helvetica, sans-serif";
    case "verdana":
      return "Verdana, Geneva, sans-serif";
    case "tahoma":
      return "Tahoma, Geneva, sans-serif";
    case "trebuchet":
      return "'Trebuchet MS', Arial, sans-serif";
    case "georgia":
      return "Georgia, serif";
    case "lora":
      return "Lora, Georgia, serif";
    case "garamond":
      return "Garamond, 'EB Garamond', 'Times New Roman', serif";
    case "palatino":
      return "'Palatino Linotype', Palatino, serif";
    case "times":
      return "'Times New Roman', Times, serif";
    case "mono":
      return "'Courier New', Courier, monospace";
    case "opendyslexic":
      return "'OpenDyslexic', 'Comic Sans MS', sans-serif";
    case "system":
    default:
      return "'Inter Variable', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }
}

function showEpubError(message) {
  const loading = document.getElementById("epubLoadingState");
  const error = document.getElementById("epubErrorState");
  if (loading) loading.hidden = true;
  if (error) {
    error.hidden = false;
    setText("epubErrorMessage", message || "This EPUB could not be opened.");
  }
}

function setLoading(loading) {
  const state = document.getElementById("epubLoadingState");
  const error = document.getElementById("epubErrorState");
  if (state) state.hidden = !loading;
  if (loading && error) error.hidden = true;
}

function scheduleUiHide() {
  clearTimeout(epubUiTimer);
  if (epubUiManuallyHidden || epubSettings.autoHideChrome === false) return;
  epubUiTimer = setTimeout(() => {
    const modal = document.getElementById("epubReaderModal");
    if (
      modal?.classList.contains("open") &&
      !modal.classList.contains("settings-open") &&
      !modal.classList.contains("toc-open") &&
      !modal.classList.contains("search-open")
    ) {
      modal.classList.add("chrome-hidden");
    }
  }, 3500);
}

function showUi() {
  epubUiManuallyHidden = false;
  document.getElementById("epubReaderModal")?.classList.remove("chrome-hidden");
  scheduleUiHide();
}

function restoreHeaderForSettings() {
  const modal = document.getElementById("epubReaderModal");
  if (!modal) return;
  // `showHeader` is a persistent interface preference, so the emergency
  // control must be able to recover from a permanently hidden header.
  if (epubSettings.showHeader === false) {
    epubSettings.showHeader = true;
    saveSettings();
    updateReaderLabels();
    applyReaderStyles();
  }
  showUi();
}

async function refreshEpubVolume() {
  if (!epubCurrentVolume?.fileEpub) return false;

  // Preserve the exact current position before replacing the parsed EPUB.
  // This makes refresh a parser/renderer recovery action rather than a
  // destructive "start over" operation.
  saveProgress(true);
  const volume = epubCurrentVolume;
  const modal = document.getElementById("epubReaderModal");
  modal?.classList.remove("settings-open", "toc-open", "search-open", "epub-mobile-actions-open");
  clearTimeout(epubUiTimer);
  epubUiManuallyHidden = false;
  modal?.classList.remove("chrome-hidden");

  return openEpubReader(volume, { forceRefresh: true });
}

// Keep the reader chrome visible while active.
let epubLastActivityShow = 0;
function keepChromeAlive() {
  if (epubUiManuallyHidden) return;
  const now = Date.now();
  if (now - epubLastActivityShow < 200) return;
  epubLastActivityShow = now;
  showUi();
}

// Enter browser fullscreen when supported.
function isEpubFullscreen() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );
}

function requestEpubFullscreen() {
  const elem = document.querySelector("#epubReaderModal .epub-reader-shell");
  if (!elem) return;
  if (elem.requestFullscreen)
    elem.requestFullscreen().catch(() => {
      /* noop */
    });
  else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
  else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
}

function exitEpubFullscreen() {
  if (document.exitFullscreen)
    document.exitFullscreen().catch(() => {
      /* noop */
    });
  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  else if (document.msExitFullscreen) document.msExitFullscreen();
}

function handleEpubFullscreenChange() {
  const modal = document.getElementById("epubReaderModal");
  if (!modal?.classList.contains("open")) return;
  const active = isEpubFullscreen();
  const icon = document.getElementById("epubFullscreenIcon");
  if (icon) {
    icon.classList.toggle("fa-expand", !active);
    icon.classList.toggle("fa-compress", active);
  }
  if (active) {
    // Fullscreen starts with the reader chrome hidden.
    clearTimeout(epubUiTimer);
    epubUiManuallyHidden = true;
    modal.classList.add("chrome-hidden");
  } else {
    showUi();
  }
}

function normalizePath(path) {
  const parts = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function dirname(path) {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i + 1) : "";
}

function resolveEpubPath(basePath, relativePath) {
  if (!relativePath) return basePath;
  try {
    return normalizePath(
      new URL(relativePath, `https://epub.local/${basePath}`).pathname.replace(/^\//, ""),
    );
  } catch {
    return normalizePath(dirname(basePath) + relativePath.split("#")[0]);
  }
}

function zipFile(path) {
  if (!epubZip) return null;
  return epubZip.file(normalizePath(path));
}

async function zipText(path) {
  const file = zipFile(path);
  if (!file) throw new Error(`EPUB file not found: ${path}`);
  return file.async("text");
}

async function zipBlobUrl(path, bucket) {
  const file = zipFile(path);
  if (!file) return null;
  const blob = await file.async("blob");
  const url = URL.createObjectURL(blob);
  epubObjectUrls.push(url);
  if (bucket) bucket.push(url);
  return url;
}

function revokeObjectUrls(list) {
  (list || []).forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  });
}

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("The EPUB contains invalid XML.");
  return doc;
}

function isParserErrorDocument(doc) {
  if (!doc) return true;
  // Chrome/WebKit report a failed XML parse either as the document element
  // itself, or as an element injected somewhere inside <body> (the rest of
  // the tree can still look superficially fine). Firefox uses its own
  // namespace for the same element. Check broadly rather than only at the
  // root, or genuine failures slip through as "successful" empty chapters.
  if (doc.documentElement?.nodeName === "parsererror") return true;
  return !!doc.getElementsByTagName("parsererror").length;
}

// EPUB chapter XHTML is parsed strictly first (application/xhtml+xml) so
// well-formed files behave exactly as before. Real-world chapter markup very
// often contains plain HTML named entities (&nbsp; &mdash; &hellip; &rsquo;
// etc.) whose definitions live only in an external DTD that browsers never
// fetch - DOMParser then fails the whole document instead of just that
// entity. That failure used to bubble up as "Chapter N has no readable
// body," which is exactly what made some (but not all) chapters silently
// refuse to load, most noticeably when jumping straight to one via the TOC
// instead of reaching it gradually via infinite scroll. Falling back to the
// lenient text/html parser recovers those chapters instead of failing them.
function parseChapterMarkup(text) {
  const strict = new DOMParser().parseFromString(text, "application/xhtml+xml");
  if (!isParserErrorDocument(strict) && strict.querySelector("body")) return strict;
  return new DOMParser().parseFromString(text, "text/html");
}

// NOTE: this must stay synchronous. Every call site below (isFrontMatterLabel,
// isChapterLikeLabel, parseToc, detectEpubChapters, dedupe, ...) uses the
// return value immediately as a string (e.g. `.toLowerCase()`, regex `.test()`,
// direct assignment) without `await`. Marking this `async` makes it return a
// Promise instead of a string, which breaks every one of those call sites -
// most visibly as `normalizeChapterLabel(...).toLowerCase is not a function`
// inside detectEpubChapters()'s dedupe(), which aborts chapter detection and
// makes the header/progress/footer chapter counts wrong (or throws entirely).
function normalizeChapterLabel(label) {
  return String(label || "")
    .replace(/\s+/g, " ")
    .trim();
}

const EPUB_FRONT_MATTER_RE =
  /^(cover|title page|title|copyright|contents?|table of contents|toc|dedication|also by|about the author|author.?s note|publisher.?s note|colophon|advertisement|ad|half[- ]title|imprint|endpapers?|blank)$/i;
const EPUB_CHAPTER_LABEL_RE =
  /^(chapter\s+\d+|chapter\s+[ivxlcdm]+|prologue|epilogue|afterword|foreword|interlude|side story|side[- ]story|extra|bonus|special|short story|story|part\s+\d+|part\s+[ivxlcdm]+)\b/i;
const EPUB_CHAPTER_HEADING_RE =
  /^(chapter\s+\d+|chapter\s+[ivxlcdm]+|prologue|epilogue|afterword|foreword|interlude|side story|side[- ]story|extra|bonus|special|part\s+\d+|part\s+[ivxlcdm]+)\b/i;

function isFrontMatterLabel(label) {
  return EPUB_FRONT_MATTER_RE.test(normalizeChapterLabel(label));
}

function isChapterLikeLabel(label) {
  return EPUB_CHAPTER_LABEL_RE.test(normalizeChapterLabel(label));
}

function getEpubSemanticType(element) {
  let current = element;
  while (current && current.nodeType === 1) {
    const values = [
      current.getAttribute("epub:type"),
      current.getAttribute("type"),
      current.getAttribute("role"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (values) return values;
    current = current.parentElement;
  }
  return "";
}

async function parseEpub() {
  const containerText = await zipText("META-INF/container.xml");
  const container = parseXml(containerText);
  const rootfile = [
    ...container.getElementsByTagNameNS("*", "rootfile"),
    ...container.getElementsByTagName("rootfile"),
  ][0];
  const fullPath = rootfile?.getAttribute("full-path");
  if (!fullPath)
    throw new Error("The EPUB is missing META-INF/container.xml rootfile information.");

  epubOpfPath = normalizePath(fullPath);
  const opf = parseXml(await zipText(epubOpfPath));

  epubManifest = new Map();
  const manifestNodes = [...opf.getElementsByTagName("item")];
  manifestNodes.forEach((item) => {
    const id = item.getAttribute("id");
    if (!id) return;
    epubManifest.set(id, {
      id,
      href: item.getAttribute("href") || "",
      mediaType: item.getAttribute("media-type") || "",
      properties: item.getAttribute("properties") || "",
      path: resolveEpubPath(epubOpfPath, item.getAttribute("href") || ""),
    });
  });

  const spine = opf.getElementsByTagName("spine")[0];
  if (!spine) throw new Error("The EPUB is missing a spine.");
  epubSpine = [...spine.getElementsByTagName("itemref")]
    .map((ref) => epubManifest.get(ref.getAttribute("idref")))
    .filter((item) => item && /xhtml|html|application\/xhtml/i.test(item.mediaType));
  if (!epubSpine.length) throw new Error("No readable XHTML chapters were found in this EPUB.");

  epubToc = await parseToc(spine);
  epubGuide = parseEpubGuide(opf);
  epubChapters = await detectEpubChapters();
  epubToc = await buildReaderToc(epubToc);
}

async function parseToc(spine) {
  const navItem = [...epubManifest.values()].find((item) =>
    /(^|\s)nav(\s|$)/i.test(item.properties),
  );
  if (navItem) {
    try {
      const navDoc = parseXml(await zipText(navItem.path));
      const nav = [...navDoc.getElementsByTagName("nav")].find((n) =>
        /toc/i.test(n.getAttribute("epub:type") || n.getAttribute("role") || ""),
      );
      if (nav) {
        const base = navItem.path;
        const anchors = [...nav.querySelectorAll("a[href]")];
        const result = anchors.map((a) => ({
          label: normalizeChapterLabel(a.textContent) || "Untitled",
          href: resolveEpubPath(base, a.getAttribute("href").split("#")[0]),
          fragment: a.getAttribute("href").split("#")[1] || "",
          semanticType: getEpubSemanticType(a),
        }));
        if (result.length) return result;
      }
    } catch (e) {
      console.warn("EPUB nav parsing failed", e);
    }
  }

  const tocId = spine.getAttribute("toc");
  const ncxItem = tocId
    ? epubManifest.get(tocId)
    : [...epubManifest.values()].find((item) => item.mediaType === "application/x-dtbncx+xml");
  if (!ncxItem)
    return epubSpine.map((item, index) => ({
      label: `Chapter ${index + 1}`,
      href: item.path,
      fragment: "",
      semanticType: "",
      synthetic: true,
    }));

  try {
    const ncx = parseXml(await zipText(ncxItem.path));
    return [...ncx.getElementsByTagName("navPoint")].map((point) => {
      const label = point.getElementsByTagName("text")[0]?.textContent?.trim() || "Untitled";
      const src = point.getElementsByTagName("content")[0]?.getAttribute("src") || "";
      return {
        label: normalizeChapterLabel(label),
        href: resolveEpubPath(ncxItem.path, src.split("#")[0]),
        fragment: src.split("#")[1] || "",
        semanticType: "",
      };
    });
  } catch {
    return epubSpine.map((item, index) => ({
      label: `Chapter ${index + 1}`,
      href: item.path,
      fragment: "",
      semanticType: "",
      synthetic: true,
    }));
  }
}

function parseEpubGuide(opf) {
  const guide = opf.getElementsByTagName("guide")[0];
  if (!guide) return [];
  return [...guide.getElementsByTagName("reference")]
    .map((reference) => ({
      href: resolveEpubPath(epubOpfPath, reference.getAttribute("href") || ""),
      label: normalizeChapterLabel(reference.getAttribute("title") || ""),
      type: String(reference.getAttribute("type") || "").toLowerCase(),
    }))
    .filter((entry) => entry.href);
}

async function buildReaderToc(parsedToc) {
  const existing = (parsedToc || [])
    .map((item, tocIndex) => ({
      ...item,
      label: normalizeChapterLabel(item.label) || "Untitled",
      target: epubSpine.findIndex((spineItem) => spineItem.path === item.href),
      tocIndex,
    }))
    .filter((item) => item.target >= 0);

  const firstChapterIndex = epubChapters.length
    ? Math.min(...epubChapters.map((chapter) => chapter.spineIndex))
    : epubSpine.length;
  const represented = new Set(existing.map((item) => item.target));
  const synthetic = [];
  let illustrationNumber = 0;

  for (let spineIndex = 0; spineIndex < firstChapterIndex; spineIndex += 1) {
    if (represented.has(spineIndex)) continue;
    const spineItem = epubSpine[spineIndex];
    const guide = epubGuide.find((entry) => entry.href === spineItem.path);
    const properties = String(spineItem.properties || "").toLowerCase();
    let label = guide?.label || "";

    if (!label && spineIndex === 0) label = "Cover";
    if (!label && /cover/.test(properties)) label = "Cover";
    if (!label && spineIndex === 1) label = "Start";
    if (!label) {
      illustrationNumber += 1;
      label = `Illustration ${illustrationNumber}`;
    }

    synthetic.push({
      label,
      href: spineItem.path,
      fragment: "",
      semanticType: guide?.type || "front-matter",
      synthetic: true,
      frontMatter: true,
      target: spineIndex,
      tocIndex: -1,
    });
  }

  // Mark authored entries as front matter without removing them from the TOC.
  // A front-matter label is never promoted into epubChapters, so it does not
  // affect chapter numbering/progress.
  existing.forEach((item) => {
    item.frontMatter =
      item.target < firstChapterIndex ||
      isFrontMatterLabel(item.label) ||
      /^(cover|titlepage|title-page|copyright|dedication|toc|contents|frontmatter|front-matter)$/i.test(
        item.semanticType || "",
      );
  });

  return [...existing, ...synthetic]
    .sort((a, b) => a.target - b.target || a.tocIndex - b.tocIndex)
    .map((item, index) => ({ ...item, tocIndex: index }));
}

async function detectEpubChapters() {
  const chapterCandidates = [];
  const headingCandidates = [];

  // EPUB 3 navigation / EPUB 2 NCX is the strongest source because it is
  // explicitly authored for reading-system navigation. We still filter out
  // front matter and only promote entries that look like real story chapters
  // or carry EPUB navigation semantics for a chapter.
  epubToc.forEach((item, tocIndex) => {
    const target = epubSpine.findIndex((spineItem) => spineItem.path === item.href);
    if (target < 0) return;
    if (item.synthetic) return;
    const label = normalizeChapterLabel(item.label);
    const semantic = String(item.semanticType || "").toLowerCase();
    const isSemanticChapter =
      /(^|\s)chapter(\s|$)/.test(semantic) || /(^|\s)part(\s|$)/.test(semantic);
    if (isFrontMatterLabel(label)) return;
    if (isSemanticChapter || isChapterLikeLabel(label)) {
      chapterCandidates.push({
        id: `toc-${tocIndex}`,
        label: label || `Chapter ${chapterCandidates.length + 1}`,
        spineIndex: target,
        fragment: item.fragment || "",
        source: "toc",
        tocIndex,
      });
    }
  });

  // Some EPUBs have a weak or missing navigation document. Inspect headings
  // inside XHTML files as a structural fallback. This also catches multiple
  // chapters stored in one XHTML spine item when their headings have IDs.
  const headingResults = await Promise.all(
    epubSpine.map(async (item, spineIndex) => {
      try {
        const doc = parseXml(await zipText(item.path));
        const nodes = [
          ...doc.querySelectorAll("h1, h2, h3, h4, h5, h6, [class*='chapter'], [class*='Chapter']"),
        ];
        return nodes
          .map((node, headingIndex) => {
            const label = normalizeChapterLabel(node.textContent);
            if (!label || !EPUB_CHAPTER_HEADING_RE.test(label)) return null;
            const id =
              node.getAttribute("id") || node.querySelector("[id]")?.getAttribute("id") || "";
            return {
              id: `heading-${spineIndex}-${headingIndex}`,
              label,
              spineIndex,
              fragment: id,
              source: "heading",
            };
          })
          .filter(Boolean);
      } catch {
        return [];
      }
    }),
  );
  headingResults.flat().forEach((entry) => headingCandidates.push(entry));

  // Prefer explicit navigation chapters when there are enough of them. A
  // second pass removes duplicate entries that point to the same target.
  const dedupe = (entries) => {
    const seen = new Set();
    return entries
      .filter((entry) => {
        const key = `${entry.spineIndex}|${entry.fragment || ""}|${normalizeChapterLabel(entry.label).toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(
        (a, b) =>
          a.spineIndex - b.spineIndex || (a.tocIndex ?? Infinity) - (b.tocIndex ?? Infinity),
      );
  };

  // TOC entries whose label is not front matter and whose href resolves to a
  // real spine item. This is deliberately the last-resort *source* (spine
  // entries can be covers, copyright pages, artwork, etc.) but it is computed
  // unconditionally, not only when nav/heading regex matches are entirely
  // absent - see the selection logic below for why.
  const tocFallbackChapters = dedupe(
    epubToc
      .map((item, tocIndex) => {
        const target = epubSpine.findIndex((spineItem) => spineItem.path === item.href);
        if (target < 0 || isFrontMatterLabel(item.label)) return null;
        return {
          id: `toc-fallback-${tocIndex}`,
          label: normalizeChapterLabel(item.label) || `Chapter ${tocIndex + 1}`,
          spineIndex: target,
          fragment: item.fragment || "",
          source: "toc-fallback",
          tocIndex,
        };
      })
      .filter(Boolean),
  );

  const navChapters = dedupe(chapterCandidates);
  const headingChapters = dedupe(headingCandidates);

  // Prefer whichever source produced a usable *multi-chapter* result, tried
  // in priority order (nav/NCX semantics > structural headings > TOC
  // fallback). A source with only 0-1 entries is not just "lower priority" -
  // it is more likely a false positive (one stray heading that happens to
  // match the chapter regex, or a single semantically-tagged nav item) than
  // a real one-chapter book, so it must not block a lower-priority source
  // that actually found a real chapter list. Concretely: many light-novel
  // EPUBs give every chapter a lyrical/thematic title ("Radiance That
  // Reaches For the Sun: Heliotrope") that matches none of the nav/heading
  // regexes, so navChapters/headingChapters come back empty (0, not "a
  // little"), while tocFallbackChapters still holds the real chapter list.
  // Previously this function stopped at "if (chapters.length < 2) fall
  // through to headings" and then "if (!chapters.length) fall through to
  // TOC" - so a single spurious heading match (length === 1) skipped the
  // TOC fallback entirely and produced a one-chapter book instead of the
  // correct multi-chapter list. Evaluating all three sources up front avoids
  // that trap.
  let chapters = [];
  for (const candidate of [navChapters, headingChapters, tocFallbackChapters]) {
    if (candidate.length >= 2) {
      chapters = candidate;
      break;
    }
  }
  if (!chapters.length) {
    chapters = navChapters.length
      ? navChapters
      : headingChapters.length
        ? headingChapters
        : tocFallbackChapters;
  }

  if (!chapters.length) {
    chapters = epubSpine.map((item, spineIndex) => ({
      id: `spine-${spineIndex}`,
      label: buildSpineFallbackLabel(item, spineIndex),
      spineIndex,
      fragment: "",
      source: "spine-fallback",
    }));
  }

  return chapters.map((chapter, index) => ({ ...chapter, chapterIndex: index }));
}

function buildSpineFallbackLabel(item, index) {
  const filename =
    item?.path
      ?.split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "") || "";
  const cleaned = filename
    .replace(/[_-]+/g, " ")
    .replace(/\b\d+\b/g, (m) => m)
    .trim();
  return cleaned || `Chapter ${index + 1}`;
}

function getChapterMetaForSpineIndex(spineIndex) {
  if (!epubChapters.length) return null;
  let match = null;
  epubChapters.forEach((chapter) => {
    if (chapter.spineIndex <= spineIndex) match = chapter;
  });
  return match;
}

function getChapterMetaForCurrentPosition() {
  const scroll = document.getElementById("epubReaderScroll");
  if (!scroll || !epubChapters.length) return getChapterMetaForSpineIndex(epubChapterIndex);
  const active = scroll.querySelector(`.epub-chapter[data-chapter-index="${epubChapterIndex}"]`);
  const scrollRect = scroll.getBoundingClientRect();
  const anchor = scrollRect.top + Math.min(180, scroll.clientHeight * 0.32);
  let match = null;
  let bestTop = -Infinity;

  epubChapters.forEach((chapter) => {
    if (chapter.spineIndex > epubChapterIndex) return;
    if (chapter.spineIndex < epubChapterIndex) {
      match = chapter;
      return;
    }
    if (!active) {
      match = chapter;
      return;
    }
    if (!chapter.fragment) {
      if (!match || match.spineIndex < chapter.spineIndex) match = chapter;
      return;
    }
    const target = active.querySelector(`#${CSS.escape(chapter.fragment)}`);
    if (!target) return;
    const top = target.getBoundingClientRect().top;
    if (top <= anchor && top > bestTop) {
      bestTop = top;
      match = chapter;
    }
  });

  // Being above the first detected story chapter means the reader is in
  // front matter. Do not borrow Chapter 1 metadata here; otherwise the cover
  // and illustrations incorrectly display as "Chapter 1 / N".
  if (epubChapters.length && epubChapterIndex < epubChapters[0].spineIndex) return null;
  return match;
}

function formatChapterProgress(meta) {
  if (!meta || !epubChapters.length) return "";
  return `Chapter ${meta.chapterIndex + 1} / ${epubChapters.length}`;
}

function scrollToDetectedChapter(chapter, behavior = "smooth") {
  const scroll = document.getElementById("epubReaderScroll");
  if (!scroll || !chapter) return false;
  if (chapter.spineIndex !== epubChapterIndex) return false;
  if (!chapter.fragment) {
    scroll.scrollTo({ top: 0, behavior });
    return true;
  }
  const active = scroll.querySelector(`.epub-chapter[data-chapter-index="${chapter.spineIndex}"]`);
  const target = active?.querySelector(`#${CSS.escape(chapter.fragment)}`);
  if (!target) return false;
  target.scrollIntoView({ block: "start", behavior });
  return true;
}

function cleanXhtmlDocument(doc) {
  // Use the document head and body when resolving chapter headings.
  doc.querySelectorAll("script, noscript, iframe, object, embed").forEach((el) => el.remove());
  doc.querySelectorAll("meta[http-equiv]").forEach((el) => el.remove());
  return doc;
}

async function injectResourceUrls(container, chapterPath, urlBucket) {
  const tasks = [];
  // EPUBs commonly use ordinary <img> URLs, SVG <image>/<use> xlink URLs,
  // srcset, inline CSS backgrounds, and <source> elements. Rewrite all of
  // them before the chapter is attached to the live DOM so the browser never
  // gets a chance to request the EPUB-relative URL from the website itself.
  const elements = [
    ...container.querySelectorAll(
      "img[src], img[srcset], source[src], source[srcset], video[src], audio[src], image[href], use[href]",
    ),
  ];

  ["image", "use"].forEach((tag) => {
    Array.from(container.getElementsByTagName(tag)).forEach((el) => {
      if (el.hasAttributeNS("http://www.w3.org/1999/xlink", "href")) elements.push(el);
    });
  });

  const seen = new Set();
  elements.forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);

    const namespaced = el.hasAttributeNS?.("http://www.w3.org/1999/xlink", "href");
    const attr = el.hasAttribute("src") ? "src" : el.hasAttribute("href") ? "href" : "xlink:href";
    const raw =
      el.getAttribute(attr) ||
      (namespaced ? el.getAttributeNS("http://www.w3.org/1999/xlink", "href") : "");

    if (raw && !/^(data:|blob:|https?:|#)/i.test(raw)) {
      const path = resolveEpubPath(chapterPath, raw.split("#")[0]);
      tasks.push(
        zipBlobUrl(path, urlBucket).then((url) => {
          if (!url) return;
          if (namespaced || attr === "xlink:href") {
            el.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
          } else {
            el.setAttribute(attr, url);
          }
        }),
      );
    }

    const srcset = el.getAttribute("srcset");
    if (srcset) {
      tasks.push(
        rewriteEpubSrcset(srcset, chapterPath, urlBucket).then((value) => {
          if (value) el.setAttribute("srcset", value);
        }),
      );
    }
  });

  container.querySelectorAll("[style*='url(']").forEach((el) => {
    const style = el.getAttribute("style") || "";
    tasks.push(
      rewriteCssUrls(style, chapterPath, urlBucket).then((value) => el.setAttribute("style", value)),
    );
  });

  // A single broken/unreadable embedded resource (a corrupt image entry, an
  // svg referencing a path that doesn't resolve, etc.) must never take the
  // whole chapter down with it. Promise.all rejects as soon as any one task
  // rejects, which used to abort buildChapterElement before the chapter's
  // text ever reached the DOM - most noticeable when jumping straight to a
  // chapter via the TOC instead of reaching it gradually, since that chapter
  // hadn't had a chance to fail (and be silently skipped) during infinite
  // scroll yet. Promise.allSettled lets every other resource - and, crucially,
  // the chapter text itself - load normally regardless of any one failure.
  await Promise.allSettled(tasks);
}

async function rewriteEpubSrcset(srcset, basePath, urlBucket) {
  const entries = String(srcset || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const rewritten = await Promise.all(
    entries.map(async (entry) => {
      const match = entry.match(/^(\S+)(\s+.+)?$/);
      if (!match) return entry;
      const raw = match[1];
      const descriptor = match[2] || "";
      if (/^(data:|blob:|https?:|#)/i.test(raw)) return entry;
      // One malformed candidate in a srcset shouldn't blank out the rest of
      // the list (or, transitively, the chapter - see injectResourceUrls).
      const url = await zipBlobUrl(resolveEpubPath(basePath, raw), urlBucket).catch(() => null);
      return url ? `${url}${descriptor}` : entry;
    }),
  );

  return rewritten.join(", ");
}
async function rewriteCssUrls(cssText, basePath, urlBucket) {
  const matches = [...cssText.matchAll(/url\((['"]?)([^'"\)]+)\1\)/gi)];
  let result = cssText;
  for (const match of matches) {
    const raw = match[2].trim();
    if (/^(data:|blob:|https?:|#)/i.test(raw)) continue;
    // Same reasoning as above: a single unreadable background/font
    // reference shouldn't stop the rest of the inline style from applying.
    const url = await zipBlobUrl(resolveEpubPath(basePath, raw), urlBucket).catch(() => null);
    if (url) result = result.replace(match[0], `url("${url}")`);
  }
  return result;
}

async function loadChapterStyles(chapterPath, options = {}) {
  if (!options.append) {
    epubStyleUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    });
    epubStyleUrls = [];
    document.querySelectorAll("style[data-adashima-epub-style]").forEach((el) => el.remove());
  }

  const chapterFile = zipFile(chapterPath);
  if (!chapterFile) return;
  const xhtml = parseChapterMarkup(await chapterFile.async("text"));
  const links = [...xhtml.querySelectorAll("link[rel~='stylesheet'][href]")];
  const inlineStyles = [...xhtml.querySelectorAll("style")].map((el) => el.textContent || "");

  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href) continue;
    const cssPath = resolveEpubPath(chapterPath, href.split("#")[0]);
    const cssFile = zipFile(cssPath);
    if (!cssFile) continue;
    let css = await cssFile.async("text");
    css = await rewriteCssUrls(css, cssPath, options.urlBucket);
    const style = document.createElement("style");
    style.dataset.adashimaEpubStyle = "true";
    style.textContent = css;
    document.head.appendChild(style);
  }
  inlineStyles.forEach((css) => {
    const style = document.createElement("style");
    style.dataset.adashimaEpubStyle = "true";
    style.textContent = css;
    document.head.appendChild(style);
  });
}

function buildChapterTitle(doc, index, tocLabel) {
  // The EPUB navigation is the authoritative chapter naming source.
  // Publisher headings can be decorative, stale, or belong to a different
  // section (this was causing Volume 3 / Chapter 33 to drift).
  if (tocLabel) return tocLabel.replace(/\s+/g, " ").trim();
  const detected = epubChapters.find(
    (chapter) => chapter.spineIndex === index && !chapter.fragment,
  );
  if (detected?.label) return detected.label;
  const heading = doc.querySelector(
    "h1, h2, h3, .chapter, .Chapter_Header, .chapter-title, [class*='chapter']",
  );
  return heading?.textContent?.replace(/\s+/g, " ").trim() || `Chapter ${index + 1}`;
}

// Match chapter numbering to the visible table of contents.
function tocEntriesForNumbering() {
  const seen = new Set();
  const entries = [];
  epubToc.forEach((item) => {
    const target = epubSpine.findIndex((spineItem) => spineItem.path === item.href);
    if (target < 0 || seen.has(target)) return;
    seen.add(target);
    entries.push({ target, label: item.label });
  });
  entries.sort((a, b) => a.target - b.target);
  return entries;
}

// Resolve the nearest TOC entry for the current spine item.
function tocPositionForIndex(index, entries) {
  let match = null;
  let position = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].target > index) break;
    match = entries[i];
    position = i + 1;
  }
  return match ? { label: match.label, position, total: entries.length } : null;
}
function tocEntriesForIndex(index) {
  return epubToc
    .map((item, tocIndex) => ({
      ...item,
      tocIndex,
      target: epubSpine.findIndex((spineItem) => spineItem.path === item.href),
    }))
    .filter((item) => item.target === index);
}

function tocLabelForChapter(index) {
  const matches = tocEntriesForIndex(index);
  return matches[0]?.label || null;
}

function updateTocHighlight() {
  const list = document.getElementById("epubTocList");
  if (!list) return;
  list.querySelectorAll(".epub-toc-item").forEach((button) => {
    const tocIndex = Number(button.dataset.epubTocIndex);
    const target = Number(button.dataset.epubTarget);
    const current =
      epubCurrentTocIndex >= 0 ? tocIndex === epubCurrentTocIndex : target === epubChapterIndex;
    button.classList.toggle("is-current", current);
    button.setAttribute("aria-current", current ? "page" : "false");
  });
  const current = list.querySelector(".epub-toc-item.is-current");
  if (current && modalIsTocOpen()) current.scrollIntoView({ block: "nearest" });
}

function modalIsTocOpen() {
  return document.getElementById("epubReaderModal")?.classList.contains("toc-open");
}

let epubRenderRequestId = 0;
let epubChapterObserver = null;

function decorateChapter(chapter, item, _index) {
  chapter.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!href || /^(https?:|mailto:|tel:|#)/i.test(href)) return;
    const targetPath = resolveEpubPath(item.path, href.split("#")[0]);
    const targetIndex = epubSpine.findIndex((spineItem) => spineItem.path === targetPath);
    if (targetIndex >= 0) {
      a.dataset.epubChapter = String(targetIndex);
      a.href = "#";
      a.addEventListener("click", (event) => {
        event.preventDefault();
        renderChapter(targetIndex, { preserveScroll: false });
      });
    }
  });
}

function updateReaderNavigationState() {
  const currentIndex = epubChapterIndex;
  const currentMeta = getChapterMetaForCurrentPosition();

  let previous = null;
  let next = null;

  if (currentMeta) {
    previous = epubChapters[currentMeta.chapterIndex - 1] || null;
    next = epubChapters[currentMeta.chapterIndex + 1] || null;
  } else {
    // Front matter (cover, title page, copyright, contents, illustrations)
    // is part of the EPUB spine even when it is intentionally excluded from
    // the chapter list. It should still have usable Previous/Next controls.
    previous =
      [...epubChapters].reverse().find((chapter) => chapter.spineIndex < currentIndex) || null;
    next = epubChapters.find((chapter) => chapter.spineIndex > currentIndex) || null;
  }

  document.getElementById("epubPrev")?.toggleAttribute("disabled", !previous);
  document.getElementById("epubNext")?.toggleAttribute("disabled", !next);
}

function updateActiveChapterFromScroll() {
  const scroll = document.getElementById("epubReaderScroll");
  if (!scroll) return;
  const chapters = [...scroll.querySelectorAll(".epub-chapter[data-chapter-index]")];
  if (!chapters.length) return;

  const scrollRect = scroll.getBoundingClientRect();
  const anchor = scrollRect.top + Math.min(180, scroll.clientHeight * 0.32);
  let active = chapters[0];
  let best = Infinity;
  chapters.forEach((chapter) => {
    const rect = chapter.getBoundingClientRect();
    const distance =
      rect.top <= anchor ? Math.abs(rect.top - anchor) * 0.55 : Math.abs(rect.top - anchor);
    if (distance < best) {
      best = distance;
      active = chapter;
    }
  });

  const nextIndex = Number(active.dataset.chapterIndex);
  if (!Number.isFinite(nextIndex)) return;
  epubChapterIndex = nextIndex;

  // Prefer the last TOC fragment that has already crossed the reading anchor.
  // This supports EPUBs where several chapters/sections share one XHTML spine item.
  const candidates = epubToc
    .map((item, tocIndex) => ({
      ...item,
      tocIndex,
      target: epubSpine.findIndex((spineItem) => spineItem.path === item.href),
    }))
    .filter((item) => item.target === nextIndex);
  let bestToc = null;
  let bestPassedTop = -Infinity;
  let firstFragment = null;
  candidates.forEach((item) => {
    if (!item.fragment) {
      if (!bestToc) bestToc = item;
      return;
    }
    const target = active.querySelector(`#${CSS.escape(item.fragment)}`);
    if (!target) return;
    if (!firstFragment) firstFragment = item;
    const rect = target.getBoundingClientRect();
    if (rect.top <= anchor && rect.top > bestPassedTop) {
      bestPassedTop = rect.top;
      bestToc = item;
    }
  });
  if (!bestToc && firstFragment) bestToc = firstFragment;
  if (!bestToc && candidates.length) bestToc = candidates[candidates.length - 1];

  const chapterMeta = getChapterMetaForCurrentPosition();
  epubCurrentTocIndex = Number.isInteger(chapterMeta?.tocIndex)
    ? chapterMeta.tocIndex
    : bestToc
      ? bestToc.tocIndex
      : -1;
  const title =
    chapterMeta?.label ||
    bestToc?.label ||
    active.dataset.chapterTitle ||
    `Chapter ${nextIndex + 1}`;
  setText("epubChapterTitle", title);
  setText("epubChapterProgress", formatChapterProgress(chapterMeta));
  setText("epubFooterChapterProgress", formatChapterProgress(chapterMeta));
  updateTocHighlight();
  updateReaderNavigationState();
}

function chapterLocalProgress(chapter, scroll) {
  const rect = chapter.getBoundingClientRect();
  const viewportTop = scroll.getBoundingClientRect().top;
  const start = rect.top - viewportTop + scroll.scrollTop;
  const height = Math.max(1, rect.height);
  const visiblePosition = scroll.scrollTop - start;
  const percent = Math.max(
    0,
    Math.min(100, (visiblePosition / Math.max(1, height - scroll.clientHeight * 0.35)) * 100),
  );
  return percent;
}

function getCurrentReadingPosition() {
  const scroll = document.getElementById("epubReaderScroll");
  if (!scroll) return { spineIndex: epubChapterIndex, chapterIndex: 0, percentage: 0 };
  updateActiveChapterFromScroll();
  const chapter = scroll.querySelector(`.epub-chapter[data-chapter-index="${epubChapterIndex}"]`);
  const percentage = chapter ? chapterLocalProgress(chapter, scroll) : 0;
  const meta = getChapterMetaForCurrentPosition();
  return {
    spineIndex: epubChapterIndex,
    chapterIndex: meta?.chapterIndex ?? 0,
    chapterId: meta?.id || null,
    percentage,
  };
}

function restoreSavedPosition(saved, spineIndex) {
  if (!saved || !Number.isFinite(spineIndex)) return;
  const scroll = document.getElementById("epubReaderScroll");
  const chapter = scroll?.querySelector(`.epub-chapter[data-chapter-index="${spineIndex}"]`);
  if (!scroll || !chapter) return;

  const percentage = Math.max(0, Math.min(100, Number(saved.percentage || 0)));
  requestAnimationFrame(() => {
    const chapterHeight = Math.max(1, chapter.scrollHeight);
    const chapterTop = chapter.offsetTop;
    const target =
      chapterTop + Math.max(0, (chapterHeight - scroll.clientHeight * 0.35) * (percentage / 100));
    scroll.scrollTop = Math.max(0, target);
    epubChapterIndex = spineIndex;
    updateActiveChapterFromScroll();
    updateProgressUI();
    requestAnimationFrame(() => {
      updateActiveChapterFromScroll();
      updateProgressUI();
    });
  });
}

function saveProgress(immediate = false) {
  const viewer = document.getElementById("epubViewer");
  if (!viewer || !epubCurrentVolume) return;
  clearTimeout(epubProgressTimer);
  const persist = () => {
    const position = getCurrentReadingPosition();
    const map = progressMap();
    map[volumeKey(epubCurrentVolume)] = {
      // spineIndex keeps backward compatibility with the previous storage
      // format, while chapterIndex/chapterId identify the detected chapter.
      spineIndex: position.spineIndex,
      chapterIndex: position.chapterIndex,
      chapterId: position.chapterId,
      percentage: position.percentage,
      updatedAt: Date.now(),
    };
    try {
      localStorage.setItem(EPUB_PROGRESS_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
    updateProgressUI();
    updateReadingStatsUI();
  };
  if (immediate) persist();
  else epubProgressTimer = setTimeout(persist, 80);
}

async function buildChapterElement(index, urlBucket) {
  const item = epubSpine[index];
  const text = await zipText(item.path);
  const doc = cleanXhtmlDocument(parseChapterMarkup(text));
  const body = doc.querySelector("body");
  if (!body) throw new Error(`Chapter ${index + 1} has no readable body.`);

  const chapter = document.createElement("article");
  chapter.className = "epub-chapter reader-content";
  chapter.dataset.chapterIndex = String(index);
  chapter.dataset.volume = epubCurrentVolume?.id || "";
  chapter.dataset.chapterTitle = buildChapterTitle(doc, index, tocLabelForChapter(index));
  chapter.innerHTML = body.innerHTML;
  decorateChapter(chapter, item, index);

  // Rewrite every embedded asset while the chapter is still detached. This
  // is especially important for cover/front-matter pages whose entire body
  // may be one SVG <image>; waiting until after insertion can cause the
  // browser to resolve the original ../images/... URL against the site.
  await injectResourceUrls(chapter, item.path, urlBucket);

  return { chapter, item, doc };
}

function installChapterObserver(scroll) {
  if (epubChapterObserver) epubChapterObserver.disconnect();
  epubChapterObserver = new IntersectionObserver(
    () => {
      updateActiveChapterFromScroll();
      updateProgressUI();
    },
    { root: scroll, threshold: [0, 0.15, 0.5, 0.85, 1] },
  );
  scroll
    .querySelectorAll(".epub-chapter[data-chapter-index]")
    .forEach((chapter) => epubChapterObserver.observe(chapter));
}

async function appendChapter(index, options = {}) {
  const renderId = epubRenderRequestId;
  const scroll = document.getElementById("epubReaderScroll");
  if (!scroll || !epubSpine[index]) return;
  if (scroll.querySelector(`.epub-chapter[data-chapter-index="${index}"]`)) return;

  const chapterUrls = [];
  const { chapter, item, doc } = await buildChapterElement(index, chapterUrls);
  if (renderId !== epubRenderRequestId) {
    // A navigation elsewhere (e.g. a TOC jump) superseded this continuation
    // before it finished; its blob URLs were never attached to the DOM.
    revokeObjectUrls(chapterUrls);
    return;
  }
  epubActiveChapterUrls.push(...chapterUrls);
  chapter.classList.add("epub-chapter-appended");
  scroll.appendChild(chapter);

  await Promise.allSettled([loadChapterStyles(item.path, { append: true, urlBucket: chapterUrls })]);
  if (renderId !== epubRenderRequestId || !requestStillCurrent()) return;
  applyReaderStyles();
  installChapterObserver(scroll);

  if (options.updateHeader) {
    const tocEntries = tocEntriesForNumbering();
    const tocMatch = tocEntries.length ? tocPositionForIndex(index, tocEntries) : null;
    setText(
      "epubChapterTitle",
      tocLabelForChapter(index) || buildChapterTitle(doc, index, tocMatch?.label),
    );
  }
  const chapterMeta = getChapterMetaForSpineIndex(index);
  updateReaderNavigationState();
  updateProgressUI();
}

async function renderChapter(index, options = {}) {
  const renderId = ++epubRenderRequestId;
  if (!epubSpine[index]) return;
  const viewer = document.getElementById("epubViewer");
  if (!viewer) return;
  epubChapterIndex = index;
  epubCurrentTocIndex = Number.isInteger(options.tocIndex) ? options.tocIndex : -1;
  epubAutoAdvanceLock = false;

  const chapterUrls = [];
  const { chapter, item, doc } = await buildChapterElement(index, chapterUrls);
  if (renderId !== epubRenderRequestId) {
    revokeObjectUrls(chapterUrls);
    return;
  }

  // Everything currently in the viewer (the base chapter plus anything
  // infinite scroll appended) is about to be discarded, so its blob URLs are
  // no longer reachable from the DOM and can be freed now instead of waiting
  // for the reader to close. Without this, repeatedly jumping around a book
  // via the TOC piles up an ever-growing number of un-revoked blob URLs for
  // the whole session; mobile browsers have a much tighter budget for these
  // than desktop, so a long session eventually starts failing to create new
  // ones - which surfaces as a chapter that never finishes loading.
  revokeObjectUrls(epubActiveChapterUrls);
  epubActiveChapterUrls = chapterUrls;

  viewer.innerHTML = "";
  const scroll = document.createElement("div");
  scroll.id = "epubReaderScroll";
  scroll.className = "epub-reader-scroll";
  scroll.appendChild(chapter);
  viewer.appendChild(scroll);
  applyReaderStyles();

  // Manual chapter loads replace publisher styles; automatic continuation appends them.
  Promise.allSettled([loadChapterStyles(item.path, { urlBucket: chapterUrls })]).then(() => {
    if (renderId === epubRenderRequestId && requestStillCurrent()) {
      applyReaderStyles();
      installChapterObserver(scroll);
      updateProgressUI();
      fillViewport();
      // Images can still expand the chapter's height slightly after their
      // own load event, once layout has a moment to settle - re-check so a
      // borderline-short chapter doesn't get left without its follow-up text.
      setTimeout(() => {
        if (renderId === epubRenderRequestId && requestStillCurrent()) fillViewport();
      }, 150);
    }
  });

  const tocEntries = tocEntriesForNumbering();
  const tocMatch = tocEntries.length ? tocPositionForIndex(index, tocEntries) : null;
  setText(
    "epubChapterTitle",
    tocLabelForChapter(index) || buildChapterTitle(doc, index, tocMatch?.label),
  );
  const chapterMeta = getChapterMetaForSpineIndex(index);
  updateReaderNavigationState();

  const saved = getSavedProgress(epubCurrentVolume);
  if (!options.preserveScroll && index === (saved?.chapterIndex ?? -1)) {
    requestAnimationFrame(() => {
      const chapterHeight = Math.max(1, chapter.scrollHeight);
      const target = Math.max(
        0,
        (chapterHeight - scroll.clientHeight * 0.35) * (Number(saved.percentage || 0) / 100),
      );
      scroll.scrollTop = target;
      updateActiveChapterFromScroll();
      updateProgressUI();
      // Images and publisher styles can change the document height after the first
      // frame. Re-run detection after layout settles so reopening a book restores
      // the actual visible TOC entry rather than only the saved spine item.
      requestAnimationFrame(() => {
        updateActiveChapterFromScroll();
        updateProgressUI();
      });
      setTimeout(() => {
        updateActiveChapterFromScroll();
        updateProgressUI();
      }, 120);
    });
  } else {
    scroll.scrollTop = 0;
    requestAnimationFrame(() => {
      updateActiveChapterFromScroll();
      updateProgressUI();
    });
  }
  scroll.addEventListener(
    "scroll",
    () => {
      // Update the visible progress immediately; persistence is debounced.
      updateActiveChapterFromScroll();
      updateProgressUI();
      saveProgress(false);
      handleEpubScroll();
    },
    { passive: true },
  );
  installChapterObserver(scroll);
  updateProgressUI();
  initTocSectionToggle();
  renderToc();
}

// Shared with fillViewport() below - keep the "how close to the bottom
// counts as needing more content" rule in one place.
function autoAdvanceThreshold(scroll) {
  return Math.max(260, scroll.clientHeight * 0.2);
}

function handleEpubScroll() {
  const scroll = document.getElementById("epubReaderScroll");
  if (!scroll || epubSettings.mode !== "scrolled" || epubAutoAdvanceLock) return;
  const active = scroll.querySelector(`.epub-chapter[data-chapter-index="${epubChapterIndex}"]`);
  if (!active || epubChapterIndex >= epubSpine.length - 1) return;
  const scrollRect = scroll.getBoundingClientRect();
  const rect = active.getBoundingClientRect();
  const distanceToEnd = rect.bottom - scrollRect.top - scroll.clientHeight;
  // Load the next section before the reader actually hits the illustration/chapter boundary.
  if (distanceToEnd <= autoAdvanceThreshold(scroll)) {
    epubAutoAdvanceLock = true;
    appendChapter(epubChapterIndex + 1)
      .then(() => {
        // Keep the current scroll position untouched: the new chapter is simply added below it.
        epubAutoAdvanceLock = false;
      })
      .catch(() => {
        epubAutoAdvanceLock = false;
      });
  }
}

// Jumping to a chapter (TOC, Prev/Next, an in-chapter link) only ever renders
// the single spine item that was targeted. Continuous reading beyond that
// relies entirely on the "scroll" listener above calling appendChapter() as
// the reader nears the bottom of that item. Many EPUBs open a chapter with a
// short decorative title/illustration spine item, and on a phone's shorter
// viewport that item can easily fit on screen with nothing left to scroll -
// so the scroll event that would normally fetch the actual chapter text
// right after it never fires, and the reader is left showing only the title
// art forever (until the book is closed and reopened, which pulls chapters
// in explicitly instead of waiting on scrolling - see openEpubReader). This
// proactively fills the viewport the same way, immediately after a jump,
// regardless of whether the jumped-to item happens to need scrolling.
async function fillViewport() {
  const scroll = document.getElementById("epubReaderScroll");
  if (!scroll || epubSettings.mode !== "scrolled" || epubAutoAdvanceLock) return;
  epubAutoAdvanceLock = true;
  try {
    while (scroll.isConnected) {
      const last = scroll.lastElementChild;
      if (!last) break;
      const scrollRect = scroll.getBoundingClientRect();
      const rect = last.getBoundingClientRect();
      const distanceToEnd = rect.bottom - scrollRect.top - scroll.clientHeight;
      if (distanceToEnd > autoAdvanceThreshold(scroll)) break;
      const lastIndex = Number(last.dataset.chapterIndex);
      const nextIndex = Number.isFinite(lastIndex) ? lastIndex + 1 : null;
      if (nextIndex === null || nextIndex >= epubSpine.length) break;
      const before = scroll.childElementCount;
      await appendChapter(nextIndex);
      // appendChapter() no-ops (index already present, or superseded by a
      // newer navigation) - stop instead of spinning forever.
      if (scroll.childElementCount === before) break;
    }
  } finally {
    epubAutoAdvanceLock = false;
  }
}

function initTocSectionToggle() {
  const list = document.getElementById("epubTocList");
  if (!list || list.dataset.epubTocToggleBound === "true") return;
  list.dataset.epubTocToggleBound = "true";

  list.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-epub-toc-section-toggle]");
    if (!toggle || !list.contains(toggle)) return;
    const section = toggle.closest(".epub-toc-section");
    if (!section) return;

    const nextCollapsed = section.dataset.epubTocCollapsed !== "true";
    section.dataset.epubTocCollapsed = nextCollapsed ? "true" : "false";
    section.classList.toggle("is-collapsed", nextCollapsed);
    toggle.setAttribute("aria-expanded", nextCollapsed ? "false" : "true");

    const sectionKey = toggle.dataset.epubTocSectionToggle || "front-matter";
    try {
      localStorage.setItem(`adashima-epub-toc-${sectionKey}-collapsed`, nextCollapsed ? "1" : "0");
    } catch {
      // Storage may be unavailable; the current state still changes.
    }
  });
}

function renderToc() {
  const list = document.getElementById("epubTocList");
  if (!list) return;
  list.innerHTML = "";

  const entries = epubToc.length
    ? epubToc
        .map((item, tocIndex) => ({
          item,
          tocIndex,
          target: Number.isFinite(item.target)
            ? item.target
            : epubSpine.findIndex((spineItem) => spineItem.path === item.href),
        }))
        .filter((entry) => entry.target >= 0)
    : epubSpine.map((_, index) => ({
        item: { label: `Section ${index + 1}`, href: epubSpine[index]?.path || "", fragment: "" },
        tocIndex: index,
        target: index,
      }));

  const isFrontMatterEntry = ({ item }) =>
    Boolean(item.frontMatter) || isFrontMatterLabel(item.label);

  const frontMatterEntries = entries.filter(isFrontMatterEntry);
  const chapterEntries = entries.filter((entry) => !isFrontMatterEntry(entry));

  const createTocItem = ({ item, tocIndex, target }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "epub-toc-item";
    button.dataset.epubTarget = String(target);
    button.dataset.epubTocIndex = String(tocIndex);
    button.style.setProperty("--toc-depth", String(Math.max(0, Number(item.depth) || 0)));
    if (item.fragment) button.dataset.epubFragment = item.fragment;
    if (isFrontMatterEntry({ item })) button.classList.add("is-front-matter");

    const label = document.createElement("span");
    label.className = "epub-toc-label";
    label.textContent = item.label || `Section ${target + 1}`;
    button.append(label);

    button.addEventListener("click", async () => {
      try {
        await renderChapter(target, { preserveScroll: false, tocIndex });
        const fragment = item.fragment ? decodeURIComponent(item.fragment) : "";
        const chapter = document.querySelector(
          `#epubReaderScroll .epub-chapter[data-chapter-index="${target}"]`,
        );
        const anchor =
          fragment && chapter ? chapter.querySelector(`#${CSS.escape(fragment)}`) : null;
        if (anchor) {
          requestAnimationFrame(() =>
            anchor.scrollIntoView({ block: "start", behavior: "smooth" }),
          );
        }
        closeDrawer("toc");
        showUi();
      } catch (e) {
        showEpubError(e.message);
      }
    });

    return button;
  };

  const appendSection = (title, sectionEntries, options = {}) => {
    if (!sectionEntries.length) return;

    const section = document.createElement("section");
    section.className = `epub-toc-section${options.frontMatter ? " is-front-matter" : ""}`;

    if (options.collapsible) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "epub-toc-section-toggle";
      const sectionKey = options.frontMatter ? "front-matter" : "chapters";
      toggle.dataset.epubTocSectionToggle = sectionKey;
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-controls", `epub-toc-section-${sectionKey}`);

      const heading = document.createElement("span");
      heading.className = "epub-toc-section-title";
      heading.textContent = title;

      const count = document.createElement("span");
      count.className = "epub-toc-section-count";
      count.textContent = String(sectionEntries.length);

      const chevron = document.createElement("i");
      chevron.className = "fas fa-chevron-down epub-toc-section-chevron";
      chevron.setAttribute("aria-hidden", "true");

      toggle.append(heading, count, chevron);

      const content = document.createElement("div");
      content.className = "epub-toc-section-content";
      content.id = `epub-toc-section-${sectionKey}`;

      sectionEntries.forEach((entry) => content.appendChild(createTocItem(entry)));
      section.append(toggle, content);

      const storageKey = `adashima-epub-toc-${sectionKey}-collapsed`;
      let collapsed = false;
      try {
        collapsed = localStorage.getItem(storageKey) === "1";
      } catch {
        // Storage can be unavailable in private/restricted browser contexts.
      }

      const currentIsFrontMatter = sectionEntries.some(
        (entry) => entry.target === epubChapterIndex && isFrontMatterEntry(entry),
      );
      if (currentIsFrontMatter) collapsed = false;

      section.dataset.epubTocSection = sectionKey;
      section.dataset.epubTocCollapsed = collapsed ? "true" : "false";
      section.classList.toggle("is-collapsed", collapsed);
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    } else {
      const heading = document.createElement("div");
      heading.className = "epub-toc-section-heading";
      heading.textContent = title;
      section.appendChild(heading);
      sectionEntries.forEach((entry) => section.appendChild(createTocItem(entry)));
    }

    list.appendChild(section);
  };

  appendSection("Front matter", frontMatterEntries, {
    collapsible: true,
    frontMatter: true,
  });
  appendSection("Chapters", chapterEntries);

  updateTocHighlight();
}

function updateProgressUI() {
  const scroll = document.getElementById("epubReaderScroll");
  if (!scroll) return;
  const position = getCurrentReadingPosition();
  const chapterCount = Math.max(1, epubChapters.length);
  const meta = getChapterMetaForCurrentPosition();
  const chapterFraction = meta ? (meta.chapterIndex + position.percentage / 100) / chapterCount : 0;
  const bounded = Math.max(0, Math.min(100, Math.round(chapterFraction * 100)));
  const display = epubSettings.progressDisplay || "percentage";
  const chapterText = formatChapterProgress(meta);
  const progressText =
    display === "chapter" ? chapterText : display === "hidden" ? "" : `${bounded}%`;
  setText("epubProgressText", progressText);
  setText("epubReadingProgress", `${bounded}%${chapterText ? ` · ${chapterText}` : ""}`);
  setText("epubChapterProgress", chapterText);
  setText("epubFooterChapterProgress", chapterText);
  const bar = document.getElementById("epubProgressBar");
  if (bar) {
    bar.style.width = `${bounded}%`;
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(bounded));
    bar.setAttribute(
      "aria-label",
      chapterText ? `${chapterText}, ${bounded}% complete` : `${bounded}% complete`,
    );
  }
}

function openDrawer(type) {
  const modal = document.getElementById("epubReaderModal");
  if (!modal) return;
  modal.classList.remove("settings-open", "toc-open", "search-open", "epub-mobile-actions-open");
  modal.classList.add(`${type}-open`);
  updateReadingStatsUI();
  showUi();
}

function closeDrawer(type) {
  document.getElementById("epubReaderModal")?.classList.remove(`${type}-open`);
  updateReadingStatsUI();
}
function closeAllDrawers() {
  document
    .getElementById("epubReaderModal")
    ?.classList.remove("settings-open", "toc-open", "search-open");
  updateReadingStatsUI();
}

function changeNumberSetting(key, delta, min, max) {
  epubSettings[key] = Math.max(min, Math.min(max, Number(epubSettings[key]) + delta));
  saveSettings();
  updateReaderLabels();
  applyReaderStyles();
}

function requestStillCurrent() {
  return (
    !!epubCurrentVolume && document.getElementById("epubReaderModal")?.classList.contains("open")
  );
}

function cleanupObjectUrls() {
  epubObjectUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  });
  epubActiveChapterUrls = [];
  epubObjectUrls = [];
}

async function openEpubReader(volume, options = {}) {
  if (!volume?.fileEpub) return false;
  const requestId = ++epubOpenRequestId;
  if (epubFetchController) {
    try {
      epubFetchController.abort();
    } catch {
      /* ignore */
    }
  }
  epubFetchController = new AbortController();
  const modal = document.getElementById("epubReaderModal");
  if (!modal) return false;
  // Close the PDF reader before opening an EPUB.
  try {
    window.closePdfModal?.();
  } catch {
    /* ignore */
  }
  epubRenderRequestId++;

  const storedSettings = readStorage(EPUB_SETTINGS_KEY);
  epubSettings = {
    ...structuredClone(epubSettingsDefaults),
    ...epubSettings,
    ...storedSettings,
    mode: "scrolled",
  };
  epubSettings.accessibility = {
    ...epubSettingsDefaults.accessibility,
    ...(storedSettings.accessibility || {}),
  };
  epubSettings.customTheme = {
    ...epubSettingsDefaults.customTheme,
    ...(storedSettings.customTheme || {}),
  };
  if (!EPUB_THEMES[epubSettings.theme] && epubSettings.theme !== "custom") {
    epubSettings.theme = "light";
    saveSettings();
  }
  applyCustomTheme();
  normalizeFontWeight();
  epubSearchCache = new Map();
  epubCurrentVolume = volume;
  const refreshSuffix = options.forceRefresh ? `?${EPUB_REFRESH_PARAM}=${Date.now()}` : "";
  epubCurrentUrl = EPUB_BASE_URL + encodeURIComponent(volume.fileEpub) + refreshSuffix;
  setText("epubReaderTitle", volume.title || "Reading");
  setText("epubChapterTitle", "");
  modal.classList.add("open");
  epubUiManuallyHidden = false;
  modal.classList.remove("chrome-hidden", "settings-open", "toc-open");
  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";
  document.getElementById("epubFullscreenIcon")?.classList.remove("fa-compress");
  document.getElementById("epubFullscreenIcon")?.classList.add("fa-expand");
  updateReaderLabels();
  applyReaderStyles();
  updateReadingStatsUI();
  setLoading(true);

  try {
    const JSZip = await loadJsZip();
    cleanupObjectUrls();
    epubZip = null;
    epubSpine = [];
    epubManifest = new Map();
    epubToc = [];
    epubGuide = [];

    const controller = epubFetchController;
    const timeoutId = setTimeout(() => controller.abort(), EPUB_FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(epubCurrentUrl, {
        mode: "cors",
        credentials: "omit",
        signal: controller.signal,
        cache: options.forceRefresh ? "reload" : "no-cache",
      });
    } catch (e) {
      if (e?.name === "AbortError")
        throw new Error("The EPUB request timed out. The R2 file did not respond in time.");
      throw new Error(`The EPUB could not be downloaded: ${e?.message || "network error"}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok)
      throw new Error(`R2 returned HTTP ${response.status} for ${volume.fileEpub}.`);
    const buffer = await response.arrayBuffer();
    if (requestId !== epubOpenRequestId) return false;
    if (!buffer.byteLength) throw new Error("The EPUB file is empty.");

    try {
      epubZip = await JSZip.loadAsync(buffer);
    } catch {
      throw new Error("The downloaded file is not a valid EPUB/ZIP archive.");
    }

    await parseEpub();
    if (requestId !== epubOpenRequestId) return false;
    const saved = getSavedProgress(volume);
    const savedSpineIndex = Number.isFinite(Number(saved?.spineIndex))
      ? Number(saved.spineIndex)
      : Number(saved?.chapterIndex || 0);
    const detectedStart = saved?.chapterId
      ? epubChapters.find((chapter) => chapter.id === saved.chapterId)?.spineIndex
      : undefined;

    // Always keep the front matter in the rendered reading surface. This is
    // important even when a saved position exists: a cover, opening
    // illustration, copyright page, or table of contents must remain reachable
    // by scrolling back to the top instead of disappearing whenever progress
    // restoration chooses a later spine item. Front matter is excluded from
    // epubChapters, so it never contributes to chapter numbering/progress.
    if (epubSpine.length) {
      const firstStorySpineIndex = epubChapters.length
        ? Math.max(0, Math.min(epubSpine.length - 1, epubChapters[0].spineIndex))
        : 0;
      const restoredIndex = Math.max(
        0,
        Math.min(
          epubSpine.length - 1,
          Number.isFinite(detectedStart) ? detectedStart : savedSpineIndex,
        ),
      );

      await renderChapter(0);
      for (let index = 1; index < firstStorySpineIndex; index++) {
        if (requestId !== epubOpenRequestId) return false;
        await appendChapter(index);
      }

      if (restoredIndex > 0 && restoredIndex !== firstStorySpineIndex) {
        if (requestId !== epubOpenRequestId) return false;
        await appendChapter(restoredIndex);
        restoreSavedPosition(saved, restoredIndex);
      } else if (firstStorySpineIndex > 0) {
        await appendChapter(firstStorySpineIndex);
        if (saved && restoredIndex === firstStorySpineIndex) {
          restoreSavedPosition(saved, restoredIndex);
        }
      }
    }
    if (requestId !== epubOpenRequestId) return false;
    setLoading(false);
    updateReadingStatsUI();
    startReadingTimer();
    scheduleUiHide();
    return true;
  } catch (error) {
    if (requestId !== epubOpenRequestId) return false;
    if (error?.name === "AbortError") return false;
    console.error("AdashimaVerse HTML EPUB reader failed", error, epubCurrentUrl);
    showEpubError(error?.message || "The EPUB could not be opened.");
    return false;
  } finally {
    if (requestId === epubOpenRequestId) epubFetchController = null;
  }
}

function closeEpubReader() {
  ++epubOpenRequestId;
  ++epubRenderRequestId;
  if (epubFetchController) {
    try {
      epubFetchController.abort();
    } catch {
      /* ignore */
    }
  }
  epubFetchController = null;
  const modal = document.getElementById("epubReaderModal");
  if (!modal) return;
  if (isEpubFullscreen()) exitEpubFullscreen();
  modal.classList.remove(
    "open",
    "settings-open",
    "toc-open",
    "search-open",
    "epub-mobile-actions-open",
    "chrome-hidden",
  );
  epubUiManuallyHidden = false;
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
  clearTimeout(epubUiTimer);
  clearTimeout(epubProgressTimer);
  stopReadingTimer();
  if (epubChapterObserver) {
    epubChapterObserver.disconnect();
    epubChapterObserver = null;
  }
  cleanupObjectUrls();
  epubZip = null;
  epubCurrentVolume = null;
  epubCurrentUrl = null;
  epubSpine = [];
  epubManifest = new Map();
  epubToc = [];
  epubChapters = [];
  epubSearchCache = new Map();
  document.querySelectorAll("style[data-adashima-epub-style]").forEach((el) => el.remove());
}

async function runEpubSearch() {
  const input = document.getElementById("epubSearchInput");
  const list = document.getElementById("epubSearchResults");
  if (!input || !list) return;
  const query = input.value.trim().toLowerCase();
  list.innerHTML = "";
  if (query.length < 2) {
    list.innerHTML = '<div class="epub-search-empty">Type at least 2 characters.</div>';
    return;
  }
  const results = [];
  for (let i = 0; i < epubSpine.length && results.length < 40; i++) {
    const item = epubSpine[i];
    let text = epubSearchCache.get(item.path);
    if (text == null) {
      try {
        const doc = new DOMParser().parseFromString(
          await zipText(item.path),
          "application/xhtml+xml",
        );
        text = (doc.querySelector("body")?.textContent || "").replace(/\s+/g, " ").trim();
        epubSearchCache.set(item.path, text);
      } catch {
        continue;
      }
    }
    const at = text.toLowerCase().indexOf(query);
    if (at >= 0)
      results.push({
        index: i,
        text: text.slice(Math.max(0, at - 90), Math.min(text.length, at + query.length + 150)),
      });
  }
  if (!results.length) {
    list.innerHTML = '<div class="epub-search-empty">No matches found.</div>';
    return;
  }
  results.forEach((result) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "epub-search-result";
    const label =
      epubChapters.find((chapter) => chapter.spineIndex === result.index)?.label ||
      epubToc.find((t) => epubSpine[result.index]?.path === t.href)?.label ||
      `Section ${result.index + 1}`;
    const snippet = result.text.replace(
      new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"),
      (m) => `[[${m}]]`,
    );
    button.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(snippet).replace(/\[\[(.*?)\]\]/g, "<mark>$1</mark>")}</span>`;
    button.addEventListener("click", async () => {
      await renderChapter(result.index);
      closeDrawer("search");
    });
    list.appendChild(button);
  });
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c],
  );
}

function initEpubReader() {
  const modal = document.getElementById("epubReaderModal");
  if (!modal || modal.dataset.initialized === "true") return;
  modal.dataset.initialized = "true";

  document.getElementById("epubReaderClose")?.addEventListener("click", closeEpubReader);
  document.getElementById("epubBackdrop")?.addEventListener("click", closeEpubReader);
  const navigateDetectedChapter = async (delta) => {
    const current = getChapterMetaForCurrentPosition();
    let target = null;

    if (current) {
      target = epubChapters[current.chapterIndex + delta] || null;
    } else if (delta > 0) {
      // From cover/front matter, Next should take the reader to the first
      // actual story chapter instead of doing nothing.
      target = epubChapters.find((chapter) => chapter.spineIndex > epubChapterIndex) || null;
    } else {
      // If the user somehow lands after the final detected chapter, Previous
      // should still return to the nearest real chapter.
      target =
        [...epubChapters].reverse().find((chapter) => chapter.spineIndex < epubChapterIndex) ||
        null;
    }

    if (!target) return;
    if (target.spineIndex === epubChapterIndex && scrollToDetectedChapter(target)) {
      updateActiveChapterFromScroll();
      updateProgressUI();
      saveProgress(true);
      return;
    }
    await renderChapter(target.spineIndex, { preserveScroll: false });
    requestAnimationFrame(() => scrollToDetectedChapter(target, "auto"));
  };
  document.getElementById("epubPrev")?.addEventListener("click", () => navigateDetectedChapter(-1));
  document.getElementById("epubNext")?.addEventListener("click", () => navigateDetectedChapter(1));
  const openSettings = () => {
    // This path must work even when the persistent Show Header preference is
    // disabled. Restore the header first so the user is never trapped in a
    // header-less reader.
    restoreHeaderForSettings();
    modal.classList.add("settings-open");
    modal.classList.remove("toc-open", "search-open", "epub-mobile-actions-open");
  };
  document.getElementById("epubSettingsToggle")?.addEventListener("click", () => {
    if (modal.classList.contains("settings-open")) {
      closeAllDrawers();
      showUi();
    } else {
      openSettings();
    }
  });
  document.getElementById("epubHiddenHeaderSettings")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openSettings();
  });
  document.getElementById("epubRefreshVolume")?.addEventListener("click", async () => {
    if (!epubCurrentVolume) return;
    const button = document.getElementById("epubRefreshVolume");
    if (button) {
      button.disabled = true;
      button.classList.add("is-loading");
      button.setAttribute("aria-busy", "true");
    }
    try {
      await refreshEpubVolume();
    } finally {
      if (button) {
        button.disabled = false;
        button.classList.remove("is-loading");
        button.removeAttribute("aria-busy");
      }
    }
  });
  document.getElementById("epubRefreshVolumeHeader")?.addEventListener("click", refreshEpubVolume);
  document.getElementById("epubMobileRefreshVolume")?.addEventListener("click", async () => {
    modal.classList.remove("epub-mobile-actions-open");
    await refreshEpubVolume();
  });
  document.getElementById("epubFullscreenToggle")?.addEventListener("click", () => {
    if (isEpubFullscreen()) exitEpubFullscreen();
    else requestEpubFullscreen();
  });
  document.getElementById("epubChromeHide")?.addEventListener("click", () => {
    closeAllDrawers();
    clearTimeout(epubUiTimer);
    epubUiManuallyHidden = true;
    modal.classList.add("chrome-hidden");
  });
  document.addEventListener("fullscreenchange", handleEpubFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleEpubFullscreenChange);
  document.getElementById("epubTocToggle")?.addEventListener("click", () => {
    modal.classList.toggle("toc-open");
    modal.classList.remove("settings-open");
    modal.classList.remove("epub-mobile-actions-open");
    showUi();
    if (modal.classList.contains("toc-open")) {
      updateActiveChapterFromScroll();
      updateTocHighlight();
    }
  });
  document.getElementById("epubMobileActionsToggle")?.addEventListener("click", () => {
    modal.classList.toggle("epub-mobile-actions-open");
    modal.classList.remove("settings-open", "toc-open");
    showUi();
  });
  document.getElementById("epubMobileSearch")?.addEventListener("click", () => {
    modal.classList.remove("epub-mobile-actions-open");
    document.getElementById("epubSearchToggle")?.click();
  });
  document.getElementById("epubMobileFullscreen")?.addEventListener("click", () => {
    modal.classList.remove("epub-mobile-actions-open");
    document.getElementById("epubFullscreenToggle")?.click();
  });
  document.getElementById("epubMobileChromeHide")?.addEventListener("click", () => {
    modal.classList.remove("epub-mobile-actions-open");
    document.getElementById("epubChromeHide")?.click();
  });
  document.getElementById("epubChromeReveal")?.addEventListener("click", () => {
    // "Show header" is a persistent preference, while "Hide UI" is a
    // temporary chrome state. If the user hid the header itself, the reveal
    // control must restore it instead of merely removing chrome-hidden.
    if (epubSettings.showHeader === false) {
      epubSettings.showHeader = true;
      saveSettings();
      updateReaderLabels();
      applyReaderStyles();
    }
    showUi();
  });
  document.getElementById("epubDrawerBackdrop")?.addEventListener("click", closeAllDrawers);
  document.getElementById("epubThemeSelect")?.addEventListener("change", (e) => {
    epubSettings.theme = e.target.value;
    saveSettings();
    updateReaderLabels();
    applyReaderStyles();
  });
  document.querySelectorAll("[data-epub-theme]").forEach((card) => {
    card.addEventListener("click", () => {
      const theme = card.dataset.epubTheme;
      if (!EPUB_THEMES[theme] && theme !== "custom") return;
      epubSettings.theme = theme;
      saveSettings();
      updateReaderLabels();
      applyReaderStyles();
    });
  });
  document.getElementById("epubHideIllustrations")?.addEventListener("change", (e) => {
    epubSettings.hideIllustrations = !!e.target.checked;
    saveSettings();
    applyReaderStyles();
  });
  document.getElementById("epubResetCustomTheme")?.addEventListener("click", () => {
    epubSettings.customTheme = structuredClone(epubSettingsDefaults.customTheme);
    epubSettings.theme = "custom";
    saveSettings();
    updateReaderLabels();
    applyReaderStyles();
  });
  ["Bg", "Text", "Muted", "Link", "Accent"].forEach((part) => {
    document.getElementById(`epubCustom${part}`)?.addEventListener("input", (e) => {
      epubSettings.customTheme = {
        ...epubSettingsDefaults.customTheme,
        ...(epubSettings.customTheme || {}),
      };
      epubSettings.customTheme[part.toLowerCase()] = e.target.value;
      epubSettings.theme = "custom";
      saveSettings();
      updateReaderLabels();
      applyReaderStyles();
    });
  });
  document.getElementById("epubResetSettings")?.addEventListener("click", () => {
    resetEpubSettings();
  });

  document.getElementById("epubFontSelect")?.addEventListener("change", (e) => {
    epubSettings.fontFamily = e.target.value;
    normalizeFontWeight();
    saveSettings();
    updateReaderLabels();
    applyReaderStyles();
  });
  document.getElementById("epubTextAlignSelect")?.addEventListener("change", (e) => {
    epubSettings.textAlign = e.target.value;
    saveSettings();
    applyReaderStyles();
  });
  document
    .getElementById("epubParagraphSpacingMinus")
    ?.addEventListener("click", () => changeNumberSetting("paragraphSpacing", -0.15, 0.5, 2.5));
  document
    .getElementById("epubParagraphSpacingPlus")
    ?.addEventListener("click", () => changeNumberSetting("paragraphSpacing", 0.15, 0.5, 2.5));
  document
    .getElementById("epubLetterSpacingMinus")
    ?.addEventListener("click", () => changeNumberSetting("letterSpacing", -0.1, -0.5, 3));
  document
    .getElementById("epubLetterSpacingPlus")
    ?.addEventListener("click", () => changeNumberSetting("letterSpacing", 0.1, -0.5, 3));
  document
    .getElementById("epubWordSpacingMinus")
    ?.addEventListener("click", () => changeNumberSetting("wordSpacing", -0.5, -1, 8));
  document
    .getElementById("epubWordSpacingPlus")
    ?.addEventListener("click", () => changeNumberSetting("wordSpacing", 0.5, -1, 8));
  document
    .getElementById("epubParagraphIndentMinus")
    ?.addEventListener("click", () => changeNumberSetting("paragraphIndent", -0.25, 0, 3));
  document
    .getElementById("epubParagraphIndentPlus")
    ?.addEventListener("click", () => changeNumberSetting("paragraphIndent", 0.25, 0, 3));
  const bindReaderToggle = (id, key, nested = false) => {
    document.getElementById(id)?.addEventListener("change", (e) => {
      if (nested) epubSettings.accessibility[key] = !!e.target.checked;
      else epubSettings[key] = !!e.target.checked;
      saveSettings();
      updateReaderLabels();
      applyReaderStyles();
      if (key === "autoHideChrome") {
        if (e.target.checked) showUi();
        else {
          clearTimeout(epubUiTimer);
          document.getElementById("epubReaderModal")?.classList.remove("chrome-hidden");
        }
      }
    });
  };
  bindReaderToggle("epubAutoHideChrome", "autoHideChrome");
  bindReaderToggle("epubShowHeader", "showHeader");
  bindReaderToggle("epubShowFooter", "showFooter");
  bindReaderToggle("epubShowChapterTitle", "showChapterTitle");
  bindReaderToggle("epubShowReadingStats", "showReadingStats");
  bindReaderToggle("epubShowProgressBar", "showProgressBar");
  bindReaderToggle("epubDyslexiaFont", "dyslexiaFont", true);
  bindReaderToggle("epubHighContrast", "highContrast", true);
  bindReaderToggle("epubReducedMotion", "reducedMotion", true);
  bindReaderToggle("epubUnderlineLinks", "underlineLinks", true);
  bindReaderToggle("epubHyphenation", "hyphenation");
  document.getElementById("epubProgressDisplaySelect")?.addEventListener("change", (e) => {
    epubSettings.progressDisplay = e.target.value;
    saveSettings();
    updateReaderLabels();
    updateProgressUI();
  });
  document.getElementById("epubProgressBarSizeSelect")?.addEventListener("change", (e) => {
    epubSettings.progressBarSize = Number(e.target.value) || 3;
    saveSettings();
    updateReaderLabels();
    applyReaderStyles();
  });

  document.getElementById("epubReaderPreference")?.addEventListener("change", (e) => {
    const preference = e.target.value;
    try {
      localStorage.setItem("adashima_reader_preference", preference);
    } catch {
      /* ignore */
    }
    // Apply reader preference changes to the open book.
    if (preference === "pdf" && epubCurrentVolume && typeof window.openPdfModal === "function") {
      const volume = epubCurrentVolume;
      closeEpubReader();
      window.openPdfModal(volume.id);
    }
  });
  document
    .getElementById("epubSearchToggle")
    ?.addEventListener("click", () => openDrawer("search"));
  document
    .getElementById("epubSearchClose")
    ?.addEventListener("click", () => closeDrawer("search"));
  document.getElementById("epubSearchInput")?.addEventListener("input", () => runEpubSearch());
  document
    .getElementById("epubFontMinus")
    ?.addEventListener("click", () => changeNumberSetting("fontSize", -5, 75, 160));
  document
    .getElementById("epubFontPlus")
    ?.addEventListener("click", () => changeNumberSetting("fontSize", 5, 75, 160));
  document.getElementById("epubFontWeightMinus")?.addEventListener("click", () => {
    if (isVariableFont()) changeNumberSetting("fontWeight", -100, 300, 800);
    else if (epubSettings.fontWeight >= 700) {
      epubSettings.fontWeight = 400;
      saveSettings();
      updateReaderLabels();
      applyReaderStyles();
    }
  });
  document.getElementById("epubFontWeightPlus")?.addEventListener("click", () => {
    if (isVariableFont()) changeNumberSetting("fontWeight", 100, 300, 800);
    else if (epubSettings.fontWeight <= 400) {
      epubSettings.fontWeight = 700;
      saveSettings();
      updateReaderLabels();
      applyReaderStyles();
    }
  });
  document
    .getElementById("epubLineMinus")
    ?.addEventListener("click", () => changeNumberSetting("lineHeight", -0.1, 1.2, 2.2));
  document
    .getElementById("epubLinePlus")
    ?.addEventListener("click", () => changeNumberSetting("lineHeight", 0.1, 1.2, 2.2));
  document
    .getElementById("epubWidthMinus")
    ?.addEventListener("click", () => changeNumberSetting("contentWidth", -40, 480, 1000));
  document
    .getElementById("epubWidthPlus")
    ?.addEventListener("click", () => changeNumberSetting("contentWidth", 40, 480, 1000));
  document.querySelectorAll("[data-epub-settings-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.epubSettingsTab;
      document.querySelectorAll("[data-epub-settings-tab]").forEach((item) => {
        const active = item === tab;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", active ? "true" : "false");
      });
      document.querySelectorAll("[data-epub-settings-section]").forEach((section) => {
        section.hidden = section.dataset.epubSettingsSection !== name;
      });
    });
  });

  document.getElementById("epubRetry")?.addEventListener("click", () => {
    if (epubCurrentVolume) openEpubReader(epubCurrentVolume);
  });
  document.getElementById("epubViewer")?.addEventListener("click", () => {
    // A single tap/click is the discoverable escape hatch from a manually
    // hidden reader UI. Navigation still works through the visible controls
    // and keyboard shortcuts when the UI is shown.
    if (epubUiManuallyHidden) showUi();
  });

  const shell = modal.querySelector(".epub-reader-shell");
  shell?.addEventListener("mousemove", keepChromeAlive);

  window.addEventListener("keydown", (event) => {
    if (!modal.classList.contains("open")) return;
    if (event.key === "Escape") {
      if (modal.classList.contains("settings-open") || modal.classList.contains("toc-open"))
        closeAllDrawers();
      else closeEpubReader();
      return;
    }
    if (event.target.matches("input, select, textarea")) return;
    if (event.key === "ArrowLeft") {
      document.getElementById("epubPrev")?.click();
    }
    if (event.key === "ArrowRight") {
      document.getElementById("epubNext")?.click();
    }
    if (event.key.toLowerCase() === "t") openDrawer("toc");
    if (event.key.toLowerCase() === "s") openDrawer("settings");
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      openDrawer("search");
      document.getElementById("epubSearchInput")?.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (!modal.classList.contains("open")) return;
    clearTimeout(epubResizeTimer);
    epubResizeTimer = setTimeout(() => updateProgressUI(), 120);
  });
}

// Devtools diagnostic: open a book, then run `epubDebugChapters()` in the
// console. Shows exactly which detection source produced epubChapters, and
// for every TOC entry, whether its href actually matched a spine item -
// this is normally the thing that's wrong when the header/footer/progress
// chapter count doesn't match the visible Contents list.
function debugEpubChapterDetection() {
  if (!epubCurrentVolume) return "No EPUB is currently open.";
  return {
    volume: epubCurrentVolume.title || epubCurrentVolume.fileEpub,
    spineLength: epubSpine.length,
    tocLength: epubToc.length,
    detectedChapterCount: epubChapters.length,
    detectedChapterSource: epubChapters[0]?.source || null,
    chapters: epubChapters.map((c) => ({
      label: c.label,
      spineIndex: c.spineIndex,
      source: c.source,
      fragment: c.fragment || "",
    })),
    tocEntries: epubToc.map((item) => ({
      label: item.label,
      href: item.href,
      matchedSpineIndex: epubSpine.findIndex((spineItem) => spineItem.path === item.href),
      excludedAsFrontMatter: isFrontMatterLabel(item.label),
      synthetic: !!item.synthetic,
    })),
  };
}
window.epubDebugChapters = debugEpubChapterDetection;

window.openEpubReader = openEpubReader;
window.closeEpubReader = closeEpubReader;
window.initEpubReader = initEpubReader;