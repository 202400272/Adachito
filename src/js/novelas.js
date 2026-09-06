// Global state
let currentLang = (() => {
  const storedLang =
    window.LanguageSwitch?.getCurrentLanguage?.() ||
    localStorage.getItem("lang") ||
    localStorage.getItem("preferredLanguage") ||
    localStorage.getItem("language") ||
    localStorage.getItem("adashima_manga_lang") ||
    "es";

  const normalized = String(storedLang).toLowerCase().trim();
  const supported = ["es", "en", "tg"];

  if (supported.includes(normalized)) return normalized;
  for (const lang of supported) {
    if (normalized.startsWith(lang + "-") || normalized === lang) {
      return lang;
    }
  }

  return "es";
})();

let translations = null;
let volumeData = [];
let _isSwitching = false;
let _currentRenderVersion = 0;
let _globalAbortController = new AbortController();
const PDFJS_VERSION = "2.16.105";
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

// pdf.js (~300KB) is no longer loaded up front in <head> — it used to block
// first paint on every visit to this page, even for people who never open
// the reader. Instead it's fetched once, lazily, the first time someone
// actually opens a volume. loadPdfJsLibrary() is idempotent (safe to call
// on every open) and every call site awaits it before touching pdfjsLib.
let pdfJsLoadPromise = null;
function loadPdfJsLibrary() {
  if (pdfJsLoadPromise) return pdfJsLoadPromise;
  pdfJsLoadPromise = new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
    const script = document.createElement("script");
    script.src = `${PDFJS_CDN}/pdf.min.js`;
    script.onload = () => {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
      } catch {
        // Ignore persistence failures when storage is unavailable.
      }
      resolve(window.pdfjsLib);
    };
    script.onerror = () => {
      pdfJsLoadPromise = null; // allow retry on next open, e.g. after a flaky connection
      reject(new Error("Failed to load pdf.js"));
    };
    document.head.appendChild(script);
  });
  return pdfJsLoadPromise;
}

// Small LRU of already-loaded PDFDocumentProxy objects (not raw bytes),
// bounded so memory can't grow unbounded across a browsing session — the
// previous version cached every fetched PDF's full ArrayBuffer forever,
// which is a real mobile-crash risk after opening a handful of volumes.
// Evicted entries are explicitly .destroy()ed to release pdf.js's
// worker-side caches too, not just dropped for GC to maybe collect later.
const PDF_CACHE_LIMIT = window.innerWidth < 768 ? 1 : 2;
const pdfCache = new Map(); // cacheKey -> PDFDocumentProxy, insertion-ordered (LRU)

function getCachedPdf(key) {
  if (!pdfCache.has(key)) return null;
  const pdf = pdfCache.get(key);
  pdfCache.delete(key);
  pdfCache.set(key, pdf); // move to most-recently-used
  return pdf;
}

function cachePdf(key, pdf) {
  pdfCache.set(key, pdf);
  while (pdfCache.size > PDF_CACHE_LIMIT) {
    const oldestKey = pdfCache.keys().next().value;
    const oldestPdf = pdfCache.get(oldestKey);
    pdfCache.delete(oldestKey);
    if (oldestPdf && oldestPdf !== modalPdfDoc) {
      try {
        oldestPdf.destroy();
      } catch {
        // Already torn down or mid-teardown — nothing to do.
      }
    }
  }
}

// Modal state
let modalPdfDoc = null;
let modalPageNum = 1;
// _modalRendering is true from the moment a render cycle starts until it
// (and any coalesced follow-up, see _modalPendingPage) fully settles.
// queueModalRender() uses it to tell a fresh request apart from one that
// arrives while a render is already in flight — the latter used to just
// get appended to a strict promise chain, so mashing the arrow keys queued
// up a full-resolution render for every intermediate page instead of
// jumping straight to the last one requested.
let _modalRendering = false;
// Set when a new render is requested while one is already in flight.
// Rather than stacking another queued render per request, the in-flight
// one is cancelled immediately and exactly one follow-up render runs once
// that settles, targeting whatever page is current by then.
let _modalPendingPage = false;
let modalScale = 1.0;
let modalFitScale = 1.0;
let lastRenderedScale = 1.0;
// A zoom change only triggers an actual re-rasterization once the CSS
// preview scale has drifted this far from the resolution the canvas was
// last rendered at (1.25 = 25% either direction). Inside that band, zoom
// is purely the CSS transform already being applied live during the
// gesture (see applyZoomPreview/applyCascadeZoomPreview) — nothing is
// re-rendered, so a typical pinch/scroll/click zoom feels like scaling a
// photo instead of visibly reloading. Bigger zoom changes still commit a
// real re-render eventually, the same way most image/map/PDF viewers
// only rasterize at specific "levels" rather than continuously — there's
// no way around that for canvas-rendered PDF text staying sharp across a
// 0.3x-3x range without keeping an enormous bitmap in memory at all times.
const ZOOM_RERENDER_BAND = 1.25;
// Tracks which page the on-screen canvas currently holds, so a zoom
// change (same page, new scale) can be told apart from an actual page
// turn (different page) — they need different rendering strategies, see
// renderModalPage().
let lastRenderedPageNum = null;
let zoomRenderTimer = null;
let modalCurrentVolume = null;
let modalAbortController = new AbortController();
let modalRenderTask = null;
let modalThumbnails = [];
let modalThumbnailsVisible = false;
let modalThumbnailsRendered = false;
let modalThumbnailRenderVersion = 0;
let modalThumbnailAbortController = null;
// Small LRU-ish cache of low-res preload bitmaps, keyed by page number.
// Used to be two single-slot variables (one for "next", one for "prev"),
// which meant only one page in each direction could ever be cached —
// paging forward twice before the first preload finished left nothing
// cached for the second hop. A small keyed cache survives that.
const MAX_PRELOAD_CACHE = 4;
let modalPreloadCache = new Map(); // pageNum -> { pageNum, canvas }
// Aborts only the low-res preload renders (preloadNextPage/preloadPrevPage),
// separately from modalAbortController (which spans the whole document's
// lifetime in the modal). Recreated on every page turn so a preload for a
// page the user has since navigated away from is cancelled immediately
// instead of continuing to rasterize in the background and competing with
// the real page's render for main-thread time.
let modalPreloadAbortController = new AbortController();

// Every single-page render used to end with page.cleanup(), which
// discards pdf.js's decoded-image/font cache for that page. That meant
// the low-res preload render and the full-res render right after it for
// the *same* page each re-decoded the embedded images from scratch, and
// flipping back to a page you'd just seen a moment ago paid the full
// decode cost again instead of hitting a cache. modalHotPages keeps the
// pages near the one currently on screen "warm" (no cleanup), and only
// tears down pages once they fall outside that window — bounding memory
// for a 300+ page volume while keeping the pages actually being flipped
// through fast.
const HOT_PAGE_RADIUS = 1;
let modalHotPages = new Map(); // pageNum -> pdf.js PageProxy
function retainHotPage(pageNum, page) {
  modalHotPages.set(pageNum, page);
}
function pruneHotPages(centerPageNum) {
  for (const [pageNum, page] of modalHotPages) {
    if (Math.abs(pageNum - centerPageNum) > HOT_PAGE_RADIUS) {
      page.cleanup();
      modalHotPages.delete(pageNum);
    }
  }
}

// IN-DOCUMENT TEXT SEARCH
// Per-page text is extracted lazily (in the background, a few pages at a
// time so it never blocks rendering/scrolling) via pdf.js's
// page.getTextContent(), then cached by the same cache key used for the
// parsed PDF document itself — so re-opening a volume already read in
// this session reuses the index instead of re-extracting it.
let modalTextIndex = null; // Map<pageNum, { items, text, itemStarts, viewportW }>
let modalTextIndexCacheKey = null;
let modalTextIndexBuildToken = 0;
let modalSearchIndexingComplete = false;
let modalSearchQuery = "";
let modalSearchMatches = []; // [{ pageNum, start, end }] in page-text-offset terms
let modalSearchActiveIndex = -1;
let modalSearchHighlightEls = [];
let modalSearchDebounceTimer = null;
let modalSearchHighlightToken = 0;

// Reader view state
let modalViewMode = "single"; // "single" | "cascade"
let modalToolbarHidden = false;
let toolbarAutoHideTimer = null;

// Reading theme (light/sepia/dark) — a CSS filter over the rendered
// canvas bitmap, since pages have no real text layer to re-theme.
const READING_THEMES = ["light", "sepia", "dark"];
const READING_THEME_KEY = "adashima_reading_theme";
let modalReadingTheme = "light";

// Cascade mode state
let cascadeContainerEl = null;
let cascadePageEntries = []; // [{ pageNum, wrapper, canvas, aspectRatio, rendered }]
let cascadeIO = null;
let cascadeRenderedOrder = []; // LRU of rendered page numbers, for eviction
const CASCADE_KEEP_RENDERED = 6; // how many rendered pages to keep at once
let _cascadeRenderQueue = Promise.resolve();
let cascadeCurrentPage = 1;
let cascadeZoomTimer = null;
let cascadeBuildToken = 0;
let cascadeLastRenderedScale = 1.0;
let cascadeActiveRenders = 0;
const CASCADE_MAX_CONCURRENT = 2;
let cascadePendingQueue = [];
let cascadeScrollRaf = null;

// Base (unzoomed) reading width for cascade pages, mirroring the
// desktop CSS cap (.pdf-cascade-page max-width: min(100%, 900px)) in
// JS so the scale computed for rendering matches what the page will
// actually display at. Cached like modalContainerWidth/Height above —
// measuring the container itself (stable, laid out top-down) rather
// than a page wrapper's own clientWidth, which becomes circular once
// wrapper width is being explicitly set to reflect modalScale.
let cascadeBaseWidth = null;

// READING PROGRESS PERSISTENCE
// Remembers the last page read per volume (keyed by filename, since that's
// stable across language-independent volume ids) so reopening a book later
// resumes where the reader left off, instead of always starting at page 1.
const NOVEL_PROGRESS_KEY = "adashima_novel_progress";
let progressSaveTimer = null;

function getVolumeProgressId(vol) {
  return vol.filePdf || vol.file || vol.id;
}

function loadProgressMap() {
  try {
    return JSON.parse(localStorage.getItem(NOVEL_PROGRESS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveReadingProgress(vol, page, totalPages) {
  if (!vol || !page || !totalPages) return;
  clearTimeout(progressSaveTimer);
  progressSaveTimer = setTimeout(() => {
    try {
      const map = loadProgressMap();
      const key = getVolumeProgressId(vol);
      if (!key) return;
      if (page >= totalPages) {
        // Finished (or on the last page) — nothing to resume, so drop it.
        delete map[key];
      } else {
        map[key] = { page, total: totalPages, ts: Date.now() };
      }
      localStorage.setItem(NOVEL_PROGRESS_KEY, JSON.stringify(map));
    } catch {
      // Ignore persistence failures when storage is unavailable.
    }
  }, 400);
}

function getSavedReadingProgress(vol) {
  const key = getVolumeProgressId(vol);
  if (!key) return null;
  const entry = loadProgressMap()[key];
  return entry && entry.page > 1 ? entry : null;
}

function isPdfFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function getCascadeBaseWidth() {
  if (cascadeBaseWidth !== null) return cascadeBaseWidth;
  const container = cascadeContainerEl || document.getElementById("pdfCascadeContainer");
  const raw = container?.clientWidth || 800;
  const capped = window.innerWidth >= 769 ? Math.min(raw, 900) : raw;
  cascadeBaseWidth = capped;
  return cascadeBaseWidth;
}

function invalidateCascadeBaseWidth() {
  cascadeBaseWidth = null;
}

// Cached fit-box for the PDF canvas. renderModalPage() must NOT measure
// canvasWrapperModal directly on every call: that wrapper shrink-wraps to
// the canvas we just resized, so re-measuring it after every page turn
// feeds each render's own output back in as the next render's target size —
// a runaway feedback loop that looks like the page "zooming in" a little
// more on every next-page click. Measuring once and reusing that value
// (re-measuring only on an actual window resize or fresh modal open)
// breaks the loop.
let modalContainerWidth = null;
let modalContainerHeight = null;
let modalResizeObserver = null;

function getModalContainerSize(outerContainer, paddedEl) {
  if (modalContainerWidth === null || modalContainerHeight === null) {
    // Measure the stable outer scroll box (sized top-down by the flex
    // chain), not the inner padded wrapper: a wrapper relying on
    // min-width/min-height:100% inside an overflow:auto ancestor can
    // collapse to the size of its own content (the canvas) instead of
    // honoring the percentage, which is what made pages render tiny.
    let padX = 0;
    let padY = 0;
    if (paddedEl) {
      const cs = getComputedStyle(paddedEl);
      padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    }
    modalContainerWidth = outerContainer.clientWidth - padX;
    modalContainerHeight = outerContainer.clientHeight - padY;
  }
  return { width: modalContainerWidth, height: modalContainerHeight };
}

function invalidateModalContainerSize() {
  modalContainerWidth = null;
  modalContainerHeight = null;
}

const FALLBACK_TRANSLATIONS = {
  es: {
    pageTitle: "Adashima - Novelas Ligeras",
    headerTitle: "Novelas Ligeras",
    footer:
      "Fan site no oficial de Adachi to Shimamura.<br>Creado por fans, sin fines de lucro.<br>Adachi to Shimamura y todos sus derechos pertenecen a Hitoma Iruma.",
    floatingTitle: "Ir al mini-juego",
    searchPlaceholder: "Buscar por título, descripción, volumen...",
    viewList: "Lista",
    viewGrid: "Cuadrícula",
    readButton: "Leer",
    noResults: "No se encontraron resultados",
    modal: { reading: "Leyendo: ", closeReader: "Cerrar lector" },
    toastMessages: {
      fileNotAvailable: "Archivo no disponible.",
      documentNotAvailable: "Documento no disponible.",
      loadingDocument: "Cargando documento...",
      errorOnPage: "Error en pág.",
      retry: "Reintentar",
      resumedAt: "Continuando en la pág.",
    },
    pdfControls: {
      zoomOut: "Alejar (-)",
      zoomIn: "Acercar (+)",
      zoomReset: "Restablecer zoom (0)",
      prevPage: "Página anterior (←)",
      nextPage: "Página siguiente (→)",
      page: "Pág.",
      goTo: "Ir a página",
      fullscreen: "Pantalla completa (F)",
      downloadPDF: "Descargar PDF",
      thumbnails: "Miniaturas",
      loadingDocument: "Cargando documento...",
    },
    volumes: [
      {
        id: "1",
        title: "Volumen 1",
        desc: "Publicado el 10 de marzo del 2013. Ilustrado por Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/01.webp",
        file: "Adachi to Shimamura Volumen 1 Español.pdf",
      },
      {
        id: "2",
        title: "Volumen 2",
        desc: "Publicado el 10 de septiembre del 2013.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/02.webp",
        file: "Adachi to Shimamura Volumen 2 Español.pdf",
      },
      {
        id: "3",
        title: "Volumen 3",
        desc: "Publicado el 9 de agosto del 2014. Ilustrado por Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/03.webp",
        file: "Adachi to Shimamura Volumen 3 Español.pdf",
      },
      {
        id: "4",
        title: "Volumen 4",
        desc: "Publicado el 9 de mayo del 2015. Ilustrado por Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/04.webp",
        file: "Adachi to Shimamura Volumen 4 Español.pdf",
      },
      {
        id: "5",
        title: "Volumen 5",
        desc: "Publicado el 10 de noviembre del 2015. Ilustrado por Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/05.webp",
        file: "Adachi to Shimamura Volumen 5 Español.pdf",
      },
      {
        id: "6",
        title: "Volumen 6",
        desc: "Publicado el 10 de mayo del 2016. Ilustrado por Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/06.webp",
        file: "Adachi to Shimamura Volumen 6 Español.pdf",
      },
      {
        id: "7",
        title: "Volumen 7",
        desc: "Publicado el 10 de noviembre del 2016. Ilustrado por Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/07.webp",
        file: "Adachi to Shimamura Volumen 7 Español.pdf",
      },
      {
        id: "8",
        title: "Volumen 8",
        desc: "Publicado el 10 de mayo del 2019.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/08.webp",
        file: "Adachi to Shimamura Volumen 8 Español.pdf",
      },
      {
        id: "8.5",
        title: "Especial Tarumi",
        desc: "Publicado en 2019.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/08.webp",
        file: "Adachi to Shimamura Especial Tarumi Español.pdf",
      },
      {
        id: "9",
        title: "Volumen 9",
        desc: "Publicado el 10 de octubre del 2020.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/09.webp",
        file: "Adachi to Shimamura Volumen 9 Español.pdf",
      },
      {
        id: "10",
        title: "Volumen 10",
        desc: "Publicado el 10 de septiembre del 2021. Ilustrado por Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/10.webp",
        file: "Adachi to Shimamura Volumen 10 Español.pdf",
      },
      {
        id: "11",
        title: "Volumen 11",
        desc: "Publicado el 9 de diciembre del 2022. Ilustrado por Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/11.webp",
        file: "Adachi to Shimamura Volumen 11 Español.pdf",
      },
      {
        id: "12",
        title: "Volumen 12",
        desc: "Publicado el 8 de noviembre del 2024. Ilustrado por Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/12.webp",
        file: "Adachi to Shimamura Volumen 12 Español.pdf",
      },
      {
        id: "13",
        title: "Volumen 13",
        desc: "Publicado el 8 de noviembre del 2025. Ilustrado por Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/13.webp",
        file: "Adachi to Shimamura Volumen 13 Español.pdf",
      },
      {
        id: "13.5",
        title: "Especiales Volumen 13",
        desc: "Publicado el 8 de noviembre del 2025.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/13.webp",
        file: "Especiales Volumen 13 Español.pdf",
      },
      {
        id: "E1",
        title: "Adachi to Shimamura Especial 1 Español",
        desc: "Publicado en 2020.",
        thumbnail: "../../assets/Imagenes/Especial1.webp",
        file: "Adachi to Shimamura Especial 1 Español (1).pdf",
      },
      {
        id: "E2",
        title: "Adachi to Shimamura Especial 2 Español",
        desc: "Publicado en 2020.",
        thumbnail: "../../assets/Imagenes/Especial2.webp",
        file: "Adachi to Shimamura Especial 2 Español (2).pdf",
      },
      {
        id: "E3",
        title: "Adachi to Shimamura Especial 3 Español",
        desc: "Publicado en 2020.",
        thumbnail: "../../assets/Imagenes/Especial3.webp",
        file: "Adachi to Shimamura Especial 3 Español (1).pdf",
      },
      {
        id: "E4",
        title: "Adachi to Shimamura Especial 4 Español",
        desc: "Publicado en 2020.",
        thumbnail: "../../assets/Imagenes/Especial4.webp",
        file: "Adachi to Shimamura Especial 4 Español (2).pdf",
      },
      {
        id: "99_9",
        title: "Volumen 99.9",
        desc: "Publicado el 10 de noviembre del 2023. Ilustrado por Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/99.webp",
        file: "Adachi to Shimamura Volumen 99.9 Español.pdf",
      },
      {
        id: "SS",
        title: "Volumen SS",
        desc: "Publicado el 10 de noviembre del 2023. Ilustrado por Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/SS1.webp",
        file: "Adachi to Shimamura Volumen SS Español.pdf",
      },
      {
        id: "SS2",
        title: "Volumen SS2",
        desc: "Publicado el 8 de noviembre del 2024. Ilustrado por Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/SS2.webp",
        file: "Adachi to Shimamura Volumen SS2 Español.pdf",
      },
    ],
  },
  en: {
    pageTitle: "Adashima - Light Novels",
    headerTitle: "Light Novels",
    footer:
      "Unofficial Adachi to Shimamura fan site.<br>Created by fans, non-profit.<br>Adachi to Shimamura and all rights belong to Hitoma Iruma.",
    floatingTitle: "Go to mini-game",
    searchPlaceholder: "Search by title, description, volume...",
    viewList: "List",
    viewGrid: "Grid",
    readButton: "Read",
    noResults: "No results found",
    modal: { reading: "Reading: ", closeReader: "Close reader" },
    toastMessages: {
      fileNotAvailable: "File not available.",
      documentNotAvailable: "Document not available.",
      loadingDocument: "Loading document...",
      errorOnPage: "Error on pg.",
      retry: "Retry",
      resumedAt: "Resuming at pg.",
    },
    pdfControls: {
      zoomOut: "Zoom out (-)",
      zoomIn: "Zoom in (+)",
      zoomReset: "Reset zoom (0)",
      prevPage: "Previous page (←)",
      nextPage: "Next page (→)",
      page: "Pg.",
      goTo: "Go to page",
      fullscreen: "Fullscreen (F)",
      downloadPDF: "Download PDF",
      thumbnails: "Thumbnails",
      loadingDocument: "Loading document...",
    },
    volumes: [
      {
        id: "1",
        title: "Volume 1",
        desc: "Published on March 10, 2013. Illustrated by Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/01.webp",
        filePdf: "Adachi and Shimamura.pdf",
        fileEpub: "Adachi and Shimamura.epub",
        translator: "Sneikkimies",
      },
      {
        id: "2",
        title: "Volume 2",
        desc: "Published on September 10, 2013.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/02.webp",
        filePdf: "Adachi and Shimamura 2.pdf",
        fileEpub: "Adachi and Shimamura 2.epub",
        translator: "Sneikkimies",
      },
      {
        id: "3",
        title: "Volume 3",
        desc: "Published on August 9, 2014. Illustrated by Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/03.webp",
        filePdf: "Adachi and Shimamura 3.pdf",
        fileEpub: "Adachi and Shimamura 3.epub",
        translator: "Sneikkimies",
      },
      {
        id: "4",
        title: "Volume 4",
        desc: "Published on May 9, 2015. Illustrated by Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/04.webp",
        filePdf: "Adachi and Shimamura 4.pdf",
        fileEpub: "Adachi and Shimamura 4.epub",
        translator: "Sneikkimies",
      },
      {
        id: "5",
        title: "Volume 5",
        desc: "Published on November 10, 2015. Illustrated by Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/05.webp",
        filePdf: "Adachi and Shimamura 5.pdf",
        fileEpub: "Adachi and Shimamura 5.epub",
        translator: "Sneikkimies",
      },
      {
        id: "6",
        title: "Volume 6",
        desc: "Published on May 10, 2016. Illustrated by Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/06.webp",
        filePdf: "Adachi and Shimamura 6.pdf",
        fileEpub: "Adachi and Shimamura 6.epub",
        translator: "Sneikkimies",
      },
      {
        id: "7",
        title: "Volume 7",
        desc: "Published on November 10, 2016. Illustrated by Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/07.webp",
        filePdf: "Adachi and Shimamura 7.pdf",
        fileEpub: "Adachi and Shimamura 7.epub",
        translator: "Sneikkimies",
      },
      {
        id: "8",
        title: "Volume 8",
        desc: "Published on May 10, 2019.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/08.webp",
        filePdf: "Adachi and Shimamura 8.pdf",
        fileEpub: "Adachi and Shimamura 8.epub",
        translator: "Sneikkimies",
      },
      {
        id: "9",
        title: "Volume 9",
        desc: "Published on October 10, 2020.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/09.webp",
        filePdf: "Adachi and Shimamura 9.pdf",
        fileEpub: "Adachi and Shimamura 9.epub",
        translator: "Sneikkimies",
      },
      {
        id: "10",
        title: "Volume 10",
        desc: "Published on September 10, 2021. Illustrated by Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/10.webp",
        filePdf: "Adachi and Shimamura 10.pdf",
        fileEpub: "Adachi and Shimamura 10.epub",
        translator: "Sneikkimies",
      },
      {
        id: "11",
        title: "Volume 11",
        desc: "Published on December 9, 2022. Illustrated by Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/11.webp",
        filePdf: "Adachi and Shimamura 11.pdf",
        fileEpub: "Adachi and Shimamura 11.epub",
        translator: "Sneikkimies",
      },
      {
        id: "12",
        title: "Volume 12",
        desc: "Published on November 8, 2024. Illustrated by Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/12.webp",
        filePdf: "Adachi and Shimamura 12.pdf",
        fileEpub: "Adachi and Shimamura 12.epub",
        translator: "Sneikkimies",
      },
      {
        id: "13",
        title: "Volume 13",
        desc: "Published on November 8, 2025. Illustrated by Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/13.webp",
        filePdf: "Adachi and Shimamura 13.pdf",
        fileEpub: "Adachi and Shimamura 13.epub",
        translator: "Sneikkimies",
      },
      {
        id: "E1",
        title: "Special 1",
        desc: "Published in 2020.",
        thumbnail: "../../assets/Imagenes/Especial1.webp",
        filePdf: "Adachi and Shimamura - Anime Special Novel 1.pdf",
        fileEpub: "Adachi and Shimamura - Anime Special Novel 1.epub",
        translator: "Sneikkimies",
      },
      {
        id: "E2",
        title: "Special 2",
        desc: "Published in 2020.",
        thumbnail: "../../assets/Imagenes/Especial2.webp",
        filePdf: "Adachi and Shimamura BD Extra 2.pdf",
        fileEpub: "Adachi and Shimamura - Anime Special Novel 2.epub",
        translator: "Sneikkimies",
      },
      {
        id: "E3",
        title: "Special 3",
        desc: "Published in 2020.",
        thumbnail: "../../assets/Imagenes/Especial3.webp",
        filePdf: "Adachi and Shimamura BD Extra 3.pdf",
        fileEpub: "Adachi and Shimamura - Anime Special Novel 3.epub",
        translator: "Sneikkimies",
      },
      {
        id: "E4",
        title: "Special 4",
        desc: "Published in 2020.",
        thumbnail: "../../assets/Imagenes/Especial4.webp",
        filePdf: "Adachi and Shimamura BD Extra 4.pdf",
        fileEpub: "Adachi and Shimamura - Anime Special Novel 4.epub",
        translator: "Sneikkimies",
      },
      {
        id: "99_9",
        title: "Volume 99.9",
        desc: "Published on November 10, 2023. Illustrated by Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/99.webp",
        filePdf: "Adachi and Shimamura 99.pdf",
        fileEpub: "Adachi and Shimamura 99.epub",
        translator: "Sneikkimies",
      },
      {
        id: "SS",
        title: "Volume SS",
        desc: "Published on November 10, 2023. Illustrated by Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/SS1.webp",
        filePdf: "Adachi and Shimamura SS.pdf",
        fileEpub: "Adachi and Shimamura SS.epub",
        translator: "Sneikkimies",
      },
      {
        id: "SS2",
        title: "Volume SS2",
        desc: "Published on November 8, 2024. Illustrated by Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/SS2.webp",
        filePdf: "Adachi and Shimamura Novel Vol SS2.pdf",
        fileEpub: "Adachi and Shimamura SS2.epub",
        translator: "Sneikkimies",
      },
      {
        id: "ESC",
        title: "Extra Stories Collection",
        desc: "Extra stories collection.",
        thumbnail:
          "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_G_2P7mtYJGqau2ZqkzFnlaK7cW23Xgdga-i3i-ZvuQQpKq13hDdOZH9M&s=10",
        filePdf: "_Adachi and Shimamura- Extra Stories Collection.pdf",
        fileEpub: null,
        translator: null,
        isExtra: true,
      },
    ],
    generalDownloads: { pdf: "Download PDF Full", epub: "Download EPUB Full" },
  },
  tg: {
    pageTitle: "Adashima - Light Novels",
    headerTitle: "Light Novels",
    footer:
      "Unofficial Adachi to Shimamura fan site.<br>Ginawa ng mga fans, non-profit.<br>Ang Adachi to Shimamura at lahat ng karapatan ay pagmamay-ari ni Hitoma Iruma.",
    floatingTitle: "Pumunta sa mini-game",
    searchPlaceholder: "Maghanap ayon sa pamagat, paglalarawan, volume...",
    viewList: "Listahan",
    viewGrid: "Grid",
    readButton: "Basahin",
    noResults: "Walang nakitang resulta",
    modal: { reading: "Binabasa: ", closeReader: "Isara ang reader" },
    toastMessages: {
      fileNotAvailable: "Hindi available ang file.",
      documentNotAvailable: "Hindi available ang dokumento.",
      loadingDocument: "Ilo-load ang dokumento...",
      errorOnPage: "Error sa pahina.",
      retry: "Subukan muli",
      resumedAt: "Ipagpapatuloy sa pahina",
    },
    pdfControls: {
      zoomOut: "Mag-zoom out (-)",
      zoomIn: "Mag-zoom in (+)",
      zoomReset: "I-reset ang zoom (0)",
      prevPage: "Nakaraang pahina (←)",
      nextPage: "Susunod na pahina (→)",
      page: "Pah.",
      goTo: "Pumunta sa pahina",
      fullscreen: "Full screen (F)",
      downloadPDF: "I-download ang PDF",
      thumbnails: "Mga thumbnail",
      loadingDocument: "Ilo-load ang dokumento...",
    },
    volumes: [
      {
        id: "1",
        title: "Volume 1",
        desc: "Inilathala noong Marso 10, 2013. Ilustrasyon ni Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/01.webp",
        filePdf: "Adachi and Shimamura.pdf",
        fileEpub: "Adachi and Shimamura.epub",
        translator: "Sneikkimies",
      },
      {
        id: "2",
        title: "Volume 2",
        desc: "Inilathala noong Setyembre 10, 2013.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/02.webp",
        filePdf: "Adachi and Shimamura 2.pdf",
        fileEpub: "Adachi and Shimamura 2.epub",
        translator: "Sneikkimies",
      },
      {
        id: "3",
        title: "Volume 3",
        desc: "Inilathala noong Agosto 9, 2014. Ilustrasyon ni Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/03.webp",
        filePdf: "Adachi and Shimamura 3.pdf",
        fileEpub: "Adachi and Shimamura 3.epub",
        translator: "Sneikkimies",
      },
      {
        id: "4",
        title: "Volume 4",
        desc: "Inilathala noong Mayo 9, 2015. Ilustrasyon ni Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/04.webp",
        filePdf: "Adachi and Shimamura 4.pdf",
        fileEpub: "Adachi and Shimamura 4.epub",
        translator: "Sneikkimies",
      },
      {
        id: "5",
        title: "Volume 5",
        desc: "Inilathala noong Nobyembre 10, 2015. Ilustrasyon ni Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/05.webp",
        filePdf: "Adachi and Shimamura 5.pdf",
        fileEpub: "Adachi and Shimamura 5.epub",
        translator: "Sneikkimies",
      },
      {
        id: "6",
        title: "Volume 6",
        desc: "Inilathala noong Mayo 10, 2016. Ilustrasyon ni Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/06.webp",
        filePdf: "Adachi and Shimamura 6.pdf",
        fileEpub: "Adachi and Shimamura 6.epub",
        translator: "Sneikkimies",
      },
      {
        id: "7",
        title: "Volume 7",
        desc: "Inilathala noong Nobyembre 10, 2016. Ilustrasyon ni Non.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/07.webp",
        filePdf: "Adachi and Shimamura 7.pdf",
        fileEpub: "Adachi and Shimamura 7.epub",
        translator: "Sneikkimies",
      },
      {
        id: "8",
        title: "Volume 8",
        desc: "Inilathala noong Mayo 10, 2019.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/08.webp",
        filePdf: "Adachi and Shimamura 8.pdf",
        fileEpub: "Adachi and Shimamura 8.epub",
        translator: "Sneikkimies",
      },
      {
        id: "9",
        title: "Volume 9",
        desc: "Inilathala noong Oktubre 10, 2020.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/09.webp",
        filePdf: "Adachi and Shimamura 9.pdf",
        fileEpub: "Adachi and Shimamura 9.epub",
        translator: "Sneikkimies",
      },
      {
        id: "10",
        title: "Volume 10",
        desc: "Inilathala noong Setyembre 10, 2021. Ilustrasyon ni Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/10.webp",
        filePdf: "Adachi and Shimamura 10.pdf",
        fileEpub: "Adachi and Shimamura 10.epub",
        translator: "Sneikkimies",
      },
      {
        id: "11",
        title: "Volume 11",
        desc: "Inilathala noong Disyembre 9, 2022. Ilustrasyon ni Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/11.webp",
        filePdf: "Adachi and Shimamura 11.pdf",
        fileEpub: "Adachi and Shimamura 11.epub",
        translator: "Sneikkimies",
      },
      {
        id: "12",
        title: "Volume 12",
        desc: "Inilathala noong Nobyembre 8, 2024. Ilustrasyon ni Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/12.webp",
        filePdf: "Adachi and Shimamura 12.pdf",
        fileEpub: "Adachi and Shimamura 12.epub",
        translator: "Sneikkimies",
      },
      {
        id: "13",
        title: "Volume 13",
        desc: "Inilathala noong Nobyembre 8, 2025. Ilustrasyon ni Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/13.webp",
        filePdf: "Adachi and Shimamura 13.pdf",
        fileEpub: "Adachi and Shimamura 13.epub",
        translator: "Sneikkimies",
      },
      {
        id: "E1",
        title: "Special 1",
        desc: "Inilathala noong 2020.",
        thumbnail: "../../assets/Imagenes/Especial1.webp",
        filePdf: "Adachi and Shimamura - Anime Special Novel 1.pdf",
        fileEpub: "Adachi and Shimamura - Anime Special Novel 1.epub",
        translator: "Sneikkimies",
      },
      {
        id: "E2",
        title: "Special 2",
        desc: "Inilathala noong 2020.",
        thumbnail: "../../assets/Imagenes/Especial2.webp",
        filePdf: "Adachi and Shimamura BD Extra 2.pdf",
        fileEpub: "Adachi and Shimamura - Anime Special Novel 2.epub",
        translator: "Sneikkimies",
      },
      {
        id: "E3",
        title: "Special 3",
        desc: "Inilathala noong 2020.",
        thumbnail: "../../assets/Imagenes/Especial3.webp",
        filePdf: "Adachi and Shimamura BD Extra 3.pdf",
        fileEpub: "Adachi and Shimamura - Anime Special Novel 3.epub",
        translator: "Sneikkimies",
      },
      {
        id: "E4",
        title: "Special 4",
        desc: "Inilathala noong 2020.",
        thumbnail: "../../assets/Imagenes/Especial4.webp",
        filePdf: "Adachi and Shimamura BD Extra 4.pdf",
        fileEpub: "Adachi and Shimamura - Anime Special Novel 4.epub",
        translator: "Sneikkimies",
      },
      {
        id: "99_9",
        title: "Volume 99.9",
        desc: "Inilathala noong Nobyembre 10, 2023. Ilustrasyon ni Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/99.webp",
        filePdf: "Adachi and Shimamura 99.pdf",
        fileEpub: "Adachi and Shimamura 99.epub",
        translator: "Sneikkimies",
      },
      {
        id: "SS",
        title: "Volume SS",
        desc: "Inilathala noong Nobyembre 10, 2023. Ilustrasyon ni Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/SS1.webp",
        filePdf: "Adachi and Shimamura SS.pdf",
        fileEpub: "Adachi and Shimamura SS.epub",
        translator: "Sneikkimies",
      },
      {
        id: "SS2",
        title: "Volume SS2",
        desc: "Inilathala noong Nobyembre 8, 2024. Ilustrasyon ni Raemz.",
        thumbnail:
          "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/SS2.webp",
        filePdf: "Adachi and Shimamura Novel Vol SS2.pdf",
        fileEpub: "Adachi and Shimamura SS2.epub",
        translator: "Sneikkimies",
      },
      {
        id: "ESC",
        title: "Koleksyon ng mga Dagdag na Kuwento",
        desc: "Koleksyon ng mga dagdag na kuwento.",
        thumbnail:
          "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_G_2P7mtYJGqau2ZqkzFnlaK7cW23Xgdga-i3i-ZvuQQpKq13hDdOZH9M&s=10",
        filePdf: "_Adachi and Shimamura- Extra Stories Collection.pdf",
        fileEpub: null,
        translator: null,
        isExtra: true,
      },
    ],
    generalDownloads: { pdf: "I-download ang Buong PDF", epub: "I-download ang Buong EPUB" },
  },
};

// FIXED: Use LanguageSwitch for data URL
async function loadTranslations(lang) {
  try {
    const url =
      window.LanguageSwitch && typeof window.LanguageSwitch.getDataUrl === "function"
        ? window.LanguageSwitch.getDataUrl("novelas", lang) + "?v=" + Date.now()
        : (() => {
            // Fallback path resolution
            const path = window.location.pathname;
            if (path.includes("/src/pages/")) {
              return `../../data/novelas/${lang}.json?v=${Date.now()}`;
            } else if (path.includes("/src/")) {
              return `../data/novelas/${lang}.json?v=${Date.now()}`;
            }
            return `./src/data/novelas/${lang}.json?v=${Date.now()}`;
          })();

    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
    if (!response.ok) throw new Error("Failed to load translations");
    const data = await response.json();
    translations = data;
    volumeData = data.volumes || [];
    return data;
  } catch (e) {
    console.warn("Failed to load translations, using fallback:", e);
    translations = FALLBACK_TRANSLATIONS[lang] || FALLBACK_TRANSLATIONS.es;
    volumeData = translations.volumes || [];
    return translations;
  }
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

function showMessage(msg) {
  const t = document.getElementById("toast-message");
  if (!t) return;
  t.textContent = msg;
  t.style.display = "block";
  t.style.opacity = "1";
  clearTimeout(t._hideTimeout);
  t._hideTimeout = setTimeout(() => {
    t.style.opacity = "0";
    setTimeout(() => (t.style.display = "none"), 300);
  }, 3000);
}

function updateUITranslations() {
  const modalTitle = document.getElementById("pdfModalTitle");
  if (modalTitle) {
    modalTitle.innerHTML = `${getText("modal.reading")} <span id="pdfVolumeTitle">${modalCurrentVolume ? modalCurrentVolume.title : "Volumen"}</span>`;
  }

  const pageLabel = document.getElementById("pdfPageLabel");
  if (pageLabel) {
    pageLabel.textContent = getText("pdfControls.page");
  }

  const pageInput = document.getElementById("pageInputModal");
  if (pageInput) {
    pageInput.placeholder = getText("pdfControls.goTo");
  }

  const thumbnailsTitle = document.getElementById("pdfThumbnailsTitle");
  if (thumbnailsTitle) {
    thumbnailsTitle.textContent = getText("pdfControls.thumbnails");
  }

  const loadingText = document.getElementById("pdfLoadingTextModal");
  if (loadingText) {
    loadingText.textContent = getText("pdfControls.loadingDocument");
  }

  const errorMsg = document.getElementById("pdfErrorMsgModal");
  if (errorMsg) {
    errorMsg.textContent = getText("toastMessages.documentNotAvailable");
  }

  const retryText = document.getElementById("pdfRetryText");
  if (retryText) {
    retryText.textContent = getText("toastMessages.retry");
  }

  const thumbToggle = document.getElementById("pdfThumbnailToggle");
  if (thumbToggle) thumbToggle.title = getText("pdfControls.thumbnails");

  const prevBtn = document.getElementById("pdfPrevModal");
  if (prevBtn) prevBtn.title = getText("pdfControls.prevPage");

  const nextBtn = document.getElementById("pdfNextModal");
  if (nextBtn) nextBtn.title = getText("pdfControls.nextPage");

  const zoomOut = document.getElementById("pdfZoomOutModal");
  if (zoomOut) zoomOut.title = getText("pdfControls.zoomOut");

  const zoomIn = document.getElementById("pdfZoomInModal");
  if (zoomIn) zoomIn.title = getText("pdfControls.zoomIn");

  const zoomReset = document.getElementById("pdfZoomResetModal");
  if (zoomReset) zoomReset.title = getText("pdfControls.zoomReset");

  const fullscreen = document.getElementById("pdfFullscreenModal");
  if (fullscreen) fullscreen.title = getText("pdfControls.fullscreen");

  const download = document.getElementById("pdfDownloadModal");
  if (download) download.title = getText("pdfControls.downloadPDF");

  const epubBtn = document.getElementById("epubDownloadModal");
  if (epubBtn) epubBtn.title = getText("pdfControls.downloadEPUB") || "Download EPUB";

  const closeBtn = document.getElementById("pdfModalClose");
  if (closeBtn) closeBtn.setAttribute("aria-label", getText("modal.closeReader"));
}

async function smartDownload(url, fileName) {
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) {
      console.error("smartDownload: respuesta no OK", response.status, url);
      forceDownloadFallback(url, fileName);
      return;
    }
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = blobUrl;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error("smartDownload: fetch falló (probable CORS)", error, url);
    forceDownloadFallback(url, fileName);
  }
}

function forceDownloadFallback(url, fileName) {
  try {
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showMessage(getText("toastMessages.fileNotAvailable"));
  } catch (fallbackError) {
    console.error("forceDownloadFallback: error", fallbackError, url);
    showMessage(getText("toastMessages.fileNotAvailable"));
  }
}

function buildVolumeHTML(vol) {
  const isEnglish = currentLang === "en";
  const isExtraStories = isEnglish && vol.isExtra;
  const novelItemClass = isExtraStories ? "novel-item extra-stories-special" : "novel-item";
  const translatorCredit =
    isEnglish && vol.translator && vol.id !== "ESC"
      ? `<div class="translator-credit">Translated by <a href="https://sneikkimies.github.io/" target="_blank" rel="noopener noreferrer">${vol.translator}</a></div>`
      : "";

  return `
        <details class="${novelItemClass}" id="novel-${vol.id}" data-volume-id="${vol.id}">
            <summary class="novel-summary">
                <span><i class="fas fa-book"></i> ${vol.title}</span>
                <i class="fas fa-chevron-down chevron-icon"></i>
            </summary>
            <div class="novel-content">
                <div class="novel-description"><p>${vol.desc}</p></div>
                ${translatorCredit}
                <div class="novel-actions">
                    <button class="btn btn-read" data-volume-id="${vol.id}" onclick="openPdfModal('${vol.id}')">
                        <i class="fas fa-book-open"></i> ${getText("readButton")}
                    </button>
                </div>
            </div>
        </details>`;
}

function buildCardHTML(vol) {
  const isExtra = currentLang === "en" && vol.isExtra;
  const cardClass = isExtra ? "novel-card extra-card" : "novel-card";
  const thumb = vol.thumbnail || "";
  const imgHtml = thumb
    ? `<img class="card-img" src="${thumb}" alt="${vol.title}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'card-img card-img-placeholder\\'><i class=\\'fas fa-book-open\\'></i></div>';">`
    : `<div class="card-img card-img-placeholder"><i class="fas fa-book-open"></i></div>`;
  const badge = isExtra ? '<span class="card-badge">✨ Extra</span>' : "";
  return `<div class="${cardClass}" data-volume-id="${vol.id}" data-title="${vol.title.toLowerCase()}" data-desc="${(vol.desc || "").toLowerCase()}" data-number="${vol.id}">
            ${imgHtml}
            <div class="card-body">
                <div class="card-title">${vol.title}</div>
                <div class="card-desc">${vol.desc || ""}</div>
                ${badge}
                <button class="btn btn-read btn-read-card" data-volume-id="${vol.id}" onclick="event.stopPropagation(); openPdfModal('${vol.id}')">
                    <i class="fas fa-book-open"></i> ${getText("readButton")}
                </button>
            </div>
        </div>`;
}

function openPdfModal(volumeId) {
  const vol = volumeData.find((v) => v.id === volumeId);
  if (!vol) return;

  modalCurrentVolume = vol;
  const volumeTitle = document.getElementById("pdfVolumeTitle");
  const modalTitle = document.getElementById("pdfModalTitle");

  if (volumeTitle) {
    volumeTitle.textContent = vol.title;
  }

  if (modalTitle) {
    modalTitle.innerHTML = `${getText("modal.reading")} <span id="pdfVolumeTitle">${vol.title}</span>`;
  }

  cancelThumbnailRendering();
  resetModalViewer();

  const epubBtn = document.getElementById("epubDownloadModal");
  if (epubBtn) {
    epubBtn.style.display = currentLang === "en" && vol.fileEpub ? "" : "none";
  }

  const modal = document.getElementById("pdfModal");
  modal.classList.add("open");
  document.body.style.overflow = "hidden";

  updateUITranslations();

  let savedTheme = "light";
  try {
    savedTheme = localStorage.getItem(READING_THEME_KEY) || "light";
  } catch {
    // Ignore persistence failures when storage is unavailable.
  }
  applyReadingTheme(savedTheme);

  loadPdfInModal(vol);
  scheduleToolbarAutoHide();
}

function closePdfModal() {
  const modal = document.getElementById("pdfModal");
  modal.classList.remove("open");
  document.body.style.overflow = "";

  if (modalRenderTask) {
    modalRenderTask.cancel();
    modalRenderTask = null;
  }

  cancelThumbnailRendering();

  if (modalPdfDoc) {
    modalPdfDoc = null;
  }
  modalAbortController.abort();
  modalAbortController = new AbortController();
  modalPreloadAbortController.abort();
  modalPreloadAbortController = new AbortController();

  modalPreloadCache.clear();
  _modalRendering = false;
  _modalPendingPage = false;
  // Don't cleanup() these pages here — the doc itself may still be held
  // in the outer PDF-document LRU (see line ~68) for a quick reopen, and
  // cleanup()ing its pages on every modal close would defeat that cache.
  // Just drop our references; the doc's own eventual .destroy() (when it
  // falls out of that LRU) handles tearing down its pages.
  modalHotPages.clear();
  invalidateModalContainerSize();
  closeSearchBar();

  const canvas = document.getElementById("pdfRenderModal");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.style.display = "none";
  canvas.style.width = "";
  canvas.style.height = "";
  document.getElementById("pageNumModal").textContent = "-";
  document.getElementById("pageCountModal").textContent = "-";
  document.getElementById("pdfProgressModal").style.width = "0%";
  document.getElementById("pdfLoadingModal").classList.remove("visible");
  document.getElementById("pdfErrorModal").style.display = "none";
  document.getElementById("zoomDisplayModal").textContent = "100%";
  modalPageNum = 1;
  modalScale = 1.0;
  modalFitScale = 1.0;
  modalThumbnails = [];
  modalThumbnailsRendered = false;
  document.getElementById("pdfThumbnailsSidebar").classList.remove("open");
  modalThumbnailsVisible = false;

  clearTimeout(toolbarAutoHideTimer);
  modalToolbarHidden = false;
  document.getElementById("pdfViewerModal")?.classList.remove("pdf-chrome-hidden");

  resetCascadeUI();

  closeSettingsPanel();
}

// Shared open/close for the dedicated settings drawer (#pdfToolbarSecondary)
// — used by the gear button, the panel's own close button, backdrop taps,
// Escape, closing the reader entirely, and picking a reading-mode option
// that should tidy the panel away afterward.
function closeSettingsPanel() {
  document.getElementById("pdfToolbarSecondary")?.classList.remove("open");
  document.getElementById("pdfToolbarSecondaryBackdrop")?.classList.remove("open");
  document.getElementById("pdfMoreToggle")?.setAttribute("aria-expanded", "false");
}

function openSettingsPanel() {
  // The drawer must always mirror the reader's live state when opened.
  syncReaderSettingsUI();
  document.getElementById("pdfToolbarSecondary")?.classList.add("open");
  document.getElementById("pdfToolbarSecondaryBackdrop")?.classList.add("open");
  document.getElementById("pdfMoreToggle")?.setAttribute("aria-expanded", "true");
}

function toggleSettingsPanel() {
  const isOpen = document.getElementById("pdfToolbarSecondary")?.classList.contains("open");
  if (isOpen) closeSettingsPanel();
  else openSettingsPanel();
}

function resetModalViewer() {
  if (modalViewMode === "cascade") {
    resetCascadeUI();
  }
  const canvas = document.getElementById("pdfRenderModal");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.style.display = "none";
  canvas.style.transform = "none";
  canvas.style.width = "";
  canvas.style.height = "";
  invalidateModalContainerSize();
  clearTimeout(zoomRenderTimer);
  zoomRenderTimer = null;
  lastRenderedScale = 1.0;
  lastRenderedPageNum = null;
  document.getElementById("pageNumModal").textContent = "-";
  document.getElementById("pageCountModal").textContent = "-";
  document.getElementById("pdfProgressModal").style.width = "0%";
  document.getElementById("pdfLoadingModal").classList.remove("visible");
  document.getElementById("pdfErrorModal").style.display = "none";
  document.getElementById("zoomDisplayModal").textContent = "100%";
  modalPageNum = 1;
  document.getElementById("pdfThumbnailsList").innerHTML = "";
  modalThumbnails = [];
  modalThumbnailsRendered = false;
  closeSearchBar();
}

function cancelThumbnailRendering() {
  if (modalThumbnailAbortController) {
    modalThumbnailAbortController.abort();
    modalThumbnailAbortController = null;
  }
  if (thumbnailObserver) {
    thumbnailObserver.disconnect();
    thumbnailObserver = null;
  }
  modalThumbnailRenderVersion++;
  modalThumbnailsRendered = false;
}

function getPdfCacheKey(vol, _isEnglish) {
  const fileTarget = vol.filePdf || vol.file;
  return `${currentLang}_${fileTarget}`;
}

function getPreferredPdfViewMode() {
  const stored = localStorage.getItem("adashima_pdf_mode");
  if (stored === "single") return "single";
  if (stored === "continuous") return "cascade";
  // No explicit preference yet: default novels to continuous scroll —
  // it reads more like a book than the manga-style single-page+zoom view.
  return "cascade";
}

async function loadPdfInModal(vol) {
  const isEnglish = currentLang === "en";
  const baseUrl = isEnglish
    ? "https://media.adashimaverse.com/Novelas/Ingles/"
    : "https://media.adashimaverse.com/Novelas/";
  // tg.json (like en.json) stores the filename under filePdf, not file —
  // fall back to file only for langs (es) that actually use that key.
  const fileTarget = vol.filePdf || vol.file;

  if (!fileTarget) {
    document.getElementById("pdfErrorModal").style.display = "flex";
    document.getElementById("pdfErrorMsgModal").textContent = getText(
      "toastMessages.documentNotAvailable",
    );
    return;
  }

  const url = baseUrl + encodeURIComponent(fileTarget);
  const cacheKey = getPdfCacheKey(vol, isEnglish);

  const loadingEl = document.getElementById("pdfLoadingModal");
  const errorEl = document.getElementById("pdfErrorModal");
  const canvas = document.getElementById("pdfRenderModal");

  loadingEl.classList.add("visible");
  errorEl.style.display = "none";
  canvas.style.display = "none";

  // Captured now, not re-read later: closePdfModal() replaces
  // modalAbortController with a fresh instance right after aborting, so
  // reading the *global* signal from inside the catch block below would
  // always see the new, non-aborted one. This local reference is what was
  // actually live for this specific load.
  const requestSignal = modalAbortController.signal;

  try {
    await loadPdfJsLibrary();

    let pdf = getCachedPdf(cacheKey);
    if (!pdf) {
      // getDocument({ url }) lets pdf.js stream the file and fetch byte
      // ranges as needed (page 1 can render before the whole file has
      // downloaded), instead of the old fetch()+arrayBuffer() approach
      // that forced a full download before rendering could start at all.
      // If the media host doesn't send range-request-friendly headers,
      // pdf.js detects that and transparently falls back to a normal full
      // download — this is safe either way, it just may not stream.
      const loadingTask = pdfjsLib.getDocument({
        url,
        cMapUrl: `${PDFJS_CDN}/cmaps/`,
        cMapPacked: true,
        useSystemFonts: true,
      });

      const onAbort = () => loadingTask.destroy();
      requestSignal.addEventListener("abort", onAbort, { once: true });
      try {
        pdf = await loadingTask.promise;
      } finally {
        requestSignal.removeEventListener("abort", onAbort);
      }
      cachePdf(cacheKey, pdf);
    }

    modalPdfDoc = pdf;

    // Fire-and-forget: doesn't block the page from rendering. Text
    // extraction feeds the search bar, and it re-runs the current query
    // (if the search bar happens to already be open) as new pages come in.
    ensureTextIndex(pdf, cacheKey);

    document.getElementById("pageCountModal").textContent = modalPdfDoc.numPages;
    document.getElementById("mobilePageCountModal").textContent = modalPdfDoc.numPages;
    loadingEl.classList.remove("visible");

    const savedProgress = getSavedReadingProgress(vol);
    if (savedProgress && savedProgress.page <= modalPdfDoc.numPages) {
      modalPageNum = savedProgress.page;
      showMessage(`${getText("toastMessages.resumedAt")} ${savedProgress.page}`);
    } else {
      modalPageNum = 1;
    }

    maybeShowReaderHint();

    if (getPreferredPdfViewMode() === "cascade" && modalPdfDoc.numPages > 1) {
      canvas.style.display = "none";
      await enterCascadeMode();
    } else {
      canvas.style.display = "block";
      modalViewMode = "single";
      updateCascadeToggleUI(false);
      await queueModalRender();

      if (modalPdfDoc.numPages > 1) {
        preloadNextPage();
      }
    }
  } catch (error) {
    // Covers both a genuine fetch abort and loadingTask.destroy() being
    // called mid-load when the modal was closed before loading finished —
    // pdf.js doesn't always name that rejection "AbortError".
    if (error.name !== "AbortError" && !requestSignal.aborted) {
      errorEl.style.display = "flex";
      document.getElementById("pdfErrorMsgModal").textContent = getText(
        "toastMessages.documentNotAvailable",
      );
    }
  }
}

async function preloadNextPage() {
  if (!modalPdfDoc || modalPageNum >= modalPdfDoc.numPages) return;

  try {
    const nextPageNum = modalPageNum + 1;
    const page = await modalPdfDoc.getPage(nextPageNum);
    const _viewport = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = 0.5;
    const scaledViewport = page.getViewport({ scale });

    const offscreenCanvas = document.createElement("canvas");
    const clampedDpr = getClampedDpr(scaledViewport.width, scaledViewport.height, dpr);
    offscreenCanvas.width = scaledViewport.width * clampedDpr;
    offscreenCanvas.height = scaledViewport.height * clampedDpr;
    const ctx = offscreenCanvas.getContext("2d");
    ctx.scale(clampedDpr, clampedDpr);

    await page.render({
      canvasContext: ctx,
      viewport: scaledViewport,
      signal: modalPreloadAbortController.signal,
    }).promise;

    setPreloadCacheEntry(nextPageNum, offscreenCanvas);

    retainHotPage(nextPageNum, page);
  } catch (error) {
    if (error.name !== "AbortError") {
      console.warn("Preload failed:", error);
    }
  }
}

// Stores a preload bitmap in modalPreloadCache, evicting the oldest entry
// once the cache grows past MAX_PRELOAD_CACHE — bounds memory use while
// still letting a couple of pages in either direction stay cached instead
// of just one.
function setPreloadCacheEntry(pageNum, canvas) {
  modalPreloadCache.delete(pageNum); // re-insert at the end (most-recent)
  modalPreloadCache.set(pageNum, { pageNum, canvas });
  while (modalPreloadCache.size > MAX_PRELOAD_CACHE) {
    const oldestKey = modalPreloadCache.keys().next().value;
    modalPreloadCache.delete(oldestKey);
  }
}

// Mirrors preloadNextPage() but for the previous page — novel readers
// backtrack to reread a scene far more often than manga readers flip
// backward, so a fast low-res placeholder in that direction matters too.
async function preloadPrevPage() {
  if (!modalPdfDoc || modalPageNum <= 1) return;

  try {
    const prevPageNum = modalPageNum - 1;
    const page = await modalPdfDoc.getPage(prevPageNum);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = 0.5;
    const scaledViewport = page.getViewport({ scale });

    const offscreenCanvas = document.createElement("canvas");
    const clampedDpr = getClampedDpr(scaledViewport.width, scaledViewport.height, dpr);
    offscreenCanvas.width = scaledViewport.width * clampedDpr;
    offscreenCanvas.height = scaledViewport.height * clampedDpr;
    const ctx = offscreenCanvas.getContext("2d");
    ctx.scale(clampedDpr, clampedDpr);

    await page.render({
      canvasContext: ctx,
      viewport: scaledViewport,
      signal: modalPreloadAbortController.signal,
    }).promise;

    setPreloadCacheEntry(prevPageNum, offscreenCanvas);

    retainHotPage(prevPageNum, page);
  } catch (error) {
    if (error.name !== "AbortError") {
      console.warn("Preload (prev) failed:", error);
    }
  }
}

// Thumbnails used to be rasterized for *every* page in the book the
// instant the panel opened (in batches of 5, but still all of them,
// eventually) — for a 300+ page volume that's a real CPU spike, often
// landing while cascade mode's own renders are also in flight. Now only
// lightweight placeholder boxes are built up front; each thumbnail's
// actual bitmap is decoded lazily via IntersectionObserver, only once it
// scrolls into view in the thumbnail strip.
let thumbnailObserver = null;

async function renderThumbnails() {
  const pdfDoc = modalPdfDoc;
  if (!pdfDoc || modalThumbnailsRendered) return;

  cancelThumbnailRendering();
  const renderVersion = ++modalThumbnailRenderVersion;
  const abortController = new AbortController();
  modalThumbnailAbortController = abortController;
  const signal = abortController.signal;

  const list = document.getElementById("pdfThumbnailsList");
  if (!list) return;

  list.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "pdf-thumbnails-grid";
  list.appendChild(grid);

  const totalPages = pdfDoc.numPages;
  const frag = document.createDocumentFragment();

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const wrapper = document.createElement("div");
    wrapper.className = "pdf-thumbnail-wrapper pdf-thumbnail-pending";
    wrapper.dataset.page = pageNum;

    const placeholder = document.createElement("div");
    placeholder.className = "pdf-thumbnail pdf-thumbnail-placeholder";
    wrapper.appendChild(placeholder);

    const pageLabel = document.createElement("span");
    pageLabel.className = "pdf-thumbnail-label";
    pageLabel.textContent = pageNum;
    wrapper.appendChild(pageLabel);

    wrapper.addEventListener("click", () => goToPage(pageNum));

    frag.appendChild(wrapper);
    modalThumbnails.push(wrapper);
  }
  grid.appendChild(frag);

  thumbnailObserver = new IntersectionObserver(
    (entries) => {
      if (signal.aborted || renderVersion !== modalThumbnailRenderVersion) return;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        thumbnailObserver.unobserve(entry.target);
        const pageNum = Number(entry.target.dataset.page);
        renderThumbnailBitmap(pdfDoc, pageNum, renderVersion, signal, entry.target);
      });
    },
    { root: list, rootMargin: "200% 0px 200% 0px" },
  );
  modalThumbnails.forEach((wrapper) => thumbnailObserver.observe(wrapper));

  modalThumbnailsRendered = true;
  updateThumbnailSelection();
}

async function renderThumbnailBitmap(pdfDoc, pageNum, renderVersion, signal, wrapper) {
  if (!pdfDoc || !wrapper.isConnected) return;

  try {
    if (signal.aborted || renderVersion !== modalThumbnailRenderVersion) return;

    const page = await pdfDoc.getPage(pageNum);

    if (signal.aborted || renderVersion !== modalThumbnailRenderVersion) {
      page.cleanup();
      return;
    }

    const viewport = page.getViewport({ scale: 0.2 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.className = "pdf-thumbnail";
    canvas.dataset.page = pageNum;

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    if (signal.aborted || renderVersion !== modalThumbnailRenderVersion) {
      page.cleanup();
      return;
    }

    page.cleanup();

    wrapper.classList.remove("pdf-thumbnail-pending");
    wrapper.querySelector(".pdf-thumbnail-placeholder")?.replaceWith(canvas);
  } catch (error) {
    if (error.name !== "AbortError") {
      console.warn("Failed to render thumbnail for page", pageNum, error);
    }
  }
}

function updateThumbnailSelection(pageNum = modalPageNum) {
  const wrappers = document.querySelectorAll(".pdf-thumbnail-wrapper");
  wrappers.forEach((w) => {
    w.classList.toggle("active", parseInt(w.dataset.page) === pageNum);
    if (w.classList.contains("active")) {
      w.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
}

function toggleToolbarVisibility(forceShow) {
  const viewer = document.getElementById("pdfViewerModal");
  if (!viewer) return;
  modalToolbarHidden = forceShow ? false : !modalToolbarHidden;
  viewer.classList.toggle("pdf-chrome-hidden", modalToolbarHidden);
  clearTimeout(toolbarAutoHideTimer);
  if (!modalToolbarHidden) {
    scheduleToolbarAutoHide();
  }
}

// Controls fade out on their own after a few seconds of inactivity —
// mirrors most fullscreen video/reader UIs — but any interaction
// (button press, zoom, page turn, mouse move) pushes the timer back out.
function scheduleToolbarAutoHide(delay = 4000) {
  clearTimeout(toolbarAutoHideTimer);
  if (modalToolbarHidden) return;
  // Never auto-hide while in true OS fullscreen: the fullscreen exit
  // control lives in the header's "more" menu, so hiding the header here
  // would strand the person with no discoverable way back out.
  if (isPdfFullscreen()) return;
  toolbarAutoHideTimer = setTimeout(() => {
    const modal = document.getElementById("pdfModal");
    if (!modal || !modal.classList.contains("open")) return;
    if (isPdfFullscreen()) return;
    modalToolbarHidden = true;
    document.getElementById("pdfViewerModal")?.classList.add("pdf-chrome-hidden");
  }, delay);
}

function toggleThumbnails() {
  const sidebar = document.getElementById("pdfThumbnailsSidebar");
  modalThumbnailsVisible = !modalThumbnailsVisible;
  sidebar.classList.toggle("open", modalThumbnailsVisible);

  if (modalThumbnailsVisible && !modalThumbnailsRendered && modalPdfDoc) {
    renderThumbnails();
  }
}

function goToPage(pageNum) {
  if (!modalPdfDoc || pageNum < 1 || pageNum > modalPdfDoc.numPages) return;
  if (modalViewMode === "cascade") {
    scrollCascadeToPage(pageNum);
    return;
  }
  modalPageNum = pageNum;
  updateThumbnailSelection();
  queueModalRender();
}

// ============================================================
// IN-DOCUMENT TEXT SEARCH ("find in document")
// ============================================================

// Extracts and caches each page's text (via pdf.js getTextContent()) a
// few pages at a time, yielding back to the browser between batches so
// a long volume never blocks scrolling or page rendering while it's
// being indexed. Cheap to call repeatedly — it's a no-op once the same
// PDF (by cache key) is already indexed or being indexed.
async function ensureTextIndex(pdf, cacheKey) {
  if (modalTextIndexCacheKey === cacheKey && modalTextIndex) return;

  modalTextIndex = new Map();
  modalTextIndexCacheKey = cacheKey;
  modalSearchIndexingComplete = false;
  const token = ++modalTextIndexBuildToken;
  const totalPages = pdf.numPages;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (token !== modalTextIndexBuildToken) return;
    try {
      const page = await pdf.getPage(pageNum);
      if (token !== modalTextIndexBuildToken) {
        page.cleanup();
        return;
      }
      const content = await page.getTextContent();
      const items = content.items;
      const itemStarts = new Array(items.length);
      let text = "";
      for (let i = 0; i < items.length; i++) {
        itemStarts[i] = text.length;
        text += items[i].str || "";
      }
      const viewport = page.getViewport({ scale: 1 });
      modalTextIndex.set(pageNum, {
        items,
        text,
        itemStarts,
        viewportW: viewport.width,
      });
      page.cleanup();
    } catch {
      // A page that fails text extraction (e.g. a scanned image with no
      // text layer) is simply left out of the index — its neighbors
      // still get indexed normally.
    }

    if (pageNum % 3 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // If a search is already active, refresh results as new pages come
    // in so later chapters appear without the person needing to retype.
    if (token === modalTextIndexBuildToken && modalSearchQuery) {
      runSearch(modalSearchQuery, { silent: true });
    }
  }

  if (token === modalTextIndexBuildToken) {
    modalSearchIndexingComplete = true;
    updateSearchUI();
  }
}

function isSearchBarOpen() {
  return !document.getElementById("pdfSearchBar")?.hidden;
}

function openSearchBar() {
  const bar = document.getElementById("pdfSearchBar");
  if (!bar) return;
  bar.hidden = false;
  document.getElementById("pdfSearchToggle")?.setAttribute("aria-expanded", "true");
  closeSettingsPanel();
  const input = document.getElementById("pdfSearchInput");
  input?.focus();
  input?.select();
}

function closeSearchBar() {
  const bar = document.getElementById("pdfSearchBar");
  if (bar) bar.hidden = true;
  document.getElementById("pdfSearchToggle")?.setAttribute("aria-expanded", "false");
  clearSearchHighlights();
  modalSearchQuery = "";
  modalSearchMatches = [];
  modalSearchActiveIndex = -1;
  const input = document.getElementById("pdfSearchInput");
  if (input) input.value = "";
  updateSearchUI();
}

function toggleSearchBar() {
  if (isSearchBarOpen()) {
    closeSearchBar();
  } else {
    openSearchBar();
  }
}

// Re-scans the (possibly still partial) text index for `query`.
// `silent: true` (used for the background progressive re-scan and for
// keeping the counter live while typing) updates the match list/counter
// without yanking the reader to a new page.
function runSearch(query, { silent = false } = {}) {
  modalSearchQuery = query;
  const q = query.trim().toLowerCase();

  if (!q || !modalTextIndex) {
    modalSearchMatches = [];
    modalSearchActiveIndex = -1;
    clearSearchHighlights();
    updateSearchUI();
    return;
  }

  const hadMatches = modalSearchMatches.length > 0;
  const previousActive =
    silent && modalSearchActiveIndex >= 0 ? modalSearchMatches[modalSearchActiveIndex] : null;

  const matches = [];
  const pageNums = [...modalTextIndex.keys()].sort((a, b) => a - b);
  for (const pageNum of pageNums) {
    const entry = modalTextIndex.get(pageNum);
    const haystack = entry.text.toLowerCase();
    let from = 0;
    let idx;
    while ((idx = haystack.indexOf(q, from)) !== -1) {
      matches.push({ pageNum, start: idx, end: idx + q.length });
      from = idx + q.length;
    }
  }
  modalSearchMatches = matches;

  if (!matches.length) {
    modalSearchActiveIndex = -1;
  } else if (previousActive) {
    // Keep pointing at the same logical match across a progressive
    // re-scan, rather than snapping back to the first result.
    const keepIdx = matches.findIndex(
      (m) => m.pageNum === previousActive.pageNum && m.start === previousActive.start,
    );
    modalSearchActiveIndex = keepIdx !== -1 ? keepIdx : 0;
  } else {
    modalSearchActiveIndex = 0;
  }

  updateSearchUI();

  if (!silent && modalSearchActiveIndex >= 0) {
    goToSearchMatch(modalSearchActiveIndex);
  } else if (silent && !hadMatches && modalSearchActiveIndex >= 0) {
    // First result just appeared from the background index catching up —
    // worth jumping to automatically, since the person is waiting on it.
    goToSearchMatch(modalSearchActiveIndex);
  }
}

function updateSearchUI() {
  const counter = document.getElementById("pdfSearchCounter");
  if (!counter) return;
  if (!modalSearchQuery.trim()) {
    counter.textContent = "";
    return;
  }
  if (!modalSearchMatches.length) {
    const stillIndexing = !modalSearchIndexingComplete;
    counter.textContent = stillIndexing
      ? currentLang === "en"
        ? "Searching…"
        : currentLang === "tg"
          ? "Naghahanap…"
          : "Buscando…"
      : currentLang === "en"
        ? "No results"
        : currentLang === "tg"
          ? "Walang resulta"
          : "Sin resultados";
    return;
  }
  counter.textContent = `${modalSearchActiveIndex + 1} / ${modalSearchMatches.length}`;
}

function goToSearchMatch(index) {
  if (index < 0 || index >= modalSearchMatches.length) return;
  modalSearchActiveIndex = index;
  updateSearchUI();
  const match = modalSearchMatches[index];
  goToPage(match.pageNum);
  const token = ++modalSearchHighlightToken;
  scheduleSearchHighlight(match, token);
}

function searchNext() {
  if (!modalSearchMatches.length) return;
  goToSearchMatch((modalSearchActiveIndex + 1) % modalSearchMatches.length);
}

function searchPrev() {
  if (!modalSearchMatches.length) return;
  goToSearchMatch(
    (modalSearchActiveIndex - 1 + modalSearchMatches.length) % modalSearchMatches.length,
  );
}

// The target page's canvas may still be mid-render (single-page mode
// queues its render; cascade mode renders lazily via IntersectionObserver)
// right after goToPage() is called, so this polls briefly until that
// page's canvas is actually painted before positioning the highlight.
function scheduleSearchHighlight(match, token, attempt = 0) {
  if (token !== modalSearchHighlightToken) return;
  const MAX_ATTEMPTS = 40; // ~4s at 100ms
  const ready =
    modalViewMode === "cascade"
      ? cascadePageEntries.some((e) => e.pageNum === match.pageNum && e.rendered)
      : lastRenderedPageNum === match.pageNum;

  if (!ready) {
    if (attempt >= MAX_ATTEMPTS) return;
    setTimeout(() => scheduleSearchHighlight(match, token, attempt + 1), 100);
    return;
  }
  drawSearchHighlight(match, token);
}

// 2D affine transform composition ([a,b,c,d,e,f] matrices), used to
// combine a text item's own transform with the page viewport's — the
// same math pdf.js's own text-layer builder uses to position text, kept
// local here rather than reaching into pdf.js internals.
function multiplyTransforms(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function computeItemHighlightRect(item, viewport, localStart, localEnd) {
  const tx = multiplyTransforms(viewport.transform, item.transform);
  const fontHeight = Math.hypot(tx[2], tx[3]);
  const scaleFactor = Math.hypot(viewport.transform[0], viewport.transform[1]);
  const fullWidth = Math.max(item.width * scaleFactor, 0);
  const len = Math.max(item.str.length, 1);
  const fracStart = localStart / len;
  const fracEnd = localEnd / len;
  return {
    left: tx[4] + fullWidth * fracStart,
    top: tx[5] - fontHeight,
    width: Math.max(fullWidth * (fracEnd - fracStart), 2),
    height: Math.max(fontHeight, 2),
  };
}

async function drawSearchHighlight(match, token) {
  clearSearchHighlights();
  if (token !== modalSearchHighlightToken) return;

  const entry = modalTextIndex?.get(match.pageNum);
  if (!entry || !modalPdfDoc) return;

  let canvas, wrapper;
  if (modalViewMode === "cascade") {
    const pageEntry = cascadePageEntries.find((e) => e.pageNum === match.pageNum);
    if (!pageEntry || !pageEntry.rendered) return;
    canvas = pageEntry.canvas;
    wrapper = pageEntry.wrapper;
  } else {
    canvas = document.getElementById("pdfRenderModal");
    wrapper = document.getElementById("canvasWrapperModal");
  }
  if (!canvas || !wrapper) return;

  const canvasRect = canvas.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  if (!canvasRect.width || !canvasRect.height || !entry.viewportW) return;
  const displayScale = canvasRect.width / entry.viewportW;

  let page;
  try {
    page = await modalPdfDoc.getPage(match.pageNum);
  } catch {
    return;
  }
  if (token !== modalSearchHighlightToken) {
    page.cleanup();
    return;
  }
  const viewport = page.getViewport({ scale: displayScale });
  page.cleanup();

  const { items, itemStarts } = entry;
  const offsetLeft = canvasRect.left - wrapperRect.left;
  const offsetTop = canvasRect.top - wrapperRect.top;
  let firstEl = null;

  for (let i = 0; i < items.length; i++) {
    const itemStart = itemStarts[i];
    const itemEnd = itemStart + (items[i].str ? items[i].str.length : 0);
    if (itemEnd <= match.start || itemStart >= match.end) continue;

    const localStart = Math.max(0, match.start - itemStart);
    const localEnd = Math.min(items[i].str.length, match.end - itemStart);
    const rect = computeItemHighlightRect(items[i], viewport, localStart, localEnd);

    const div = document.createElement("div");
    div.className = "pdf-search-highlight";
    div.style.left = `${offsetLeft + rect.left}px`;
    div.style.top = `${offsetTop + rect.top}px`;
    div.style.width = `${rect.width}px`;
    div.style.height = `${rect.height}px`;
    wrapper.appendChild(div);
    modalSearchHighlightEls.push(div);
    if (!firstEl) firstEl = div;
  }

  firstEl?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function clearSearchHighlights() {
  modalSearchHighlightEls.forEach((el) => el.remove());
  modalSearchHighlightEls = [];
}

let modalRenderQueue = Promise.resolve();

// Requests a render of the current modalPageNum. If nothing is in flight,
// this starts a fresh render loop immediately. If a render IS already in
// flight, it used to just get appended to modalRenderQueue — a strict
// promise chain — which meant rapid page turns (arrow-key mashing, in
// particular) queued up a full-resolution render for every intermediate
// page and ran them one at a time before the view ever caught up to where
// the user actually was. Now a request that arrives mid-render instead
// cancels the in-flight render right away (renderModalPage()'s catch
// already tolerates RenderingCancelledException) and flags exactly one
// follow-up render, which will pick up whatever page is current by the
// time it runs.
async function queueModalRender() {
  if (_modalRendering) {
    if (modalRenderTask) {
      modalRenderTask.cancel();
    }
    _modalPendingPage = true;
    return modalRenderQueue;
  }
  _modalRendering = true;
  modalRenderQueue = runModalRenderLoop();
  return modalRenderQueue;
}

async function runModalRenderLoop() {
  try {
    do {
      _modalPendingPage = false;
      await renderModalPage();
    } while (_modalPendingPage);
  } finally {
    _modalRendering = false;
  }
}

// Caps the actual pixels PDF.js has to rasterize/decode into. Without
// this, fit-width * zoom * devicePixelRatio can demand several million
// pixels on a big phone screen — the cost scales with page content
// (image-heavy/colored pages are far more expensive per pixel than
// text), so this is what keeps those pages from bogging down.
const MAX_RENDER_PIXELS = 2_400_000; // ~1550x1550 at fit scale
// The pixel budget scales up with zoom level (capped) so that zooming in to
// read comfortably doesn't downgrade the effective pixel density below fit
// scale — without this, zoomed text renders blurrier than unzoomed text,
// which defeats the point of zooming in.
function getRenderPixelBudget(scale) {
  const factor = Math.min(Math.max(scale, 1), 2.5);
  return MAX_RENDER_PIXELS * factor;
}
function getClampedDpr(cssWidth, cssHeight, dpr, scale = 1) {
  const budget = getRenderPixelBudget(scale);
  const rawPixels = cssWidth * cssHeight * dpr * dpr;
  if (rawPixels <= budget) return dpr;
  const clamped = Math.sqrt(budget / (cssWidth * cssHeight));
  return Math.max(1, clamped);
}

// Shows the zoom change instantly via a cheap CSS transform on the
// already-rendered canvas, instead of re-rasterizing the PDF. This is
// what keeps button and wheel zooming responsive on mobile.
function applyZoomPreview(anchorClientPoint) {
  const canvas = document.getElementById("pdfRenderModal");
  if (!canvas) return;
  const ratio = modalScale / lastRenderedScale;
  canvas.style.transform = `scale(${ratio})`;
  if (anchorClientPoint) {
    const rect = canvas.getBoundingClientRect();
    const originX = ((anchorClientPoint.clientX - rect.left) / rect.width) * 100;
    const originY = ((anchorClientPoint.clientY - rect.top) / rect.height) * 100;
    canvas.style.transformOrigin = `${originX}% ${originY}%`;
  } else {
    canvas.style.transformOrigin = "center center";
  }
}

// Actually re-renders the PDF page at the new scale. Expensive, so
// callers should debounce this (scheduleZoomCommit) rather than call
// it on every zoom-change event. When an anchor point is given,
// the scroll container is repositioned after the re-render so whatever
// was under the fingers stays under the fingers, instead of the view
// recentering on zoom.
function commitZoomRender(anchorClientPoint) {
  clearTimeout(zoomRenderTimer);
  zoomRenderTimer = null;

  const drift = modalScale / lastRenderedScale;
  if (drift < ZOOM_RERENDER_BAND && drift > 1 / ZOOM_RERENDER_BAND) {
    // Within the no-rerender band — leave the live CSS preview exactly as
    // applyZoomPreview already set it (including its anchor point) and
    // do nothing else. This is the "just like zooming a photo" path.
    return;
  }

  // Note: the CSS preview transform is intentionally *not* reset here.
  // renderModalPage() removes it itself, at the exact moment it swaps in
  // the freshly-rendered bitmap — resetting it early (as this used to do)
  // meant the canvas snapped back to its old unscaled size and went blank
  // for the whole render, which is the "reloads" flash zooming used to
  // cause.
  const canvas = document.getElementById("pdfRenderModal");
  if (canvas) {
    canvas.style.transformOrigin = "center center";
  }
  lastRenderedScale = modalScale;

  let anchorFrac = null;
  const container = document.getElementById("canvasContainerModal");
  if (anchorClientPoint && container) {
    const rect = container.getBoundingClientRect();
    const localX = anchorClientPoint.clientX - rect.left;
    const localY = anchorClientPoint.clientY - rect.top;
    const scrollWidth = container.scrollWidth || 1;
    const scrollHeight = container.scrollHeight || 1;
    anchorFrac = {
      fracX: (container.scrollLeft + localX) / scrollWidth,
      fracY: (container.scrollTop + localY) / scrollHeight,
      localX,
      localY,
    };
  }

  queueModalRender();

  if (anchorFrac) {
    modalRenderQueue.then(() => {
      const c = document.getElementById("canvasContainerModal");
      if (!c) return;
      c.scrollLeft = anchorFrac.fracX * c.scrollWidth - anchorFrac.localX;
      c.scrollTop = anchorFrac.fracY * c.scrollHeight - anchorFrac.localY;
    });
  }
}

function scheduleZoomCommit(delay = 180, anchorClientPoint) {
  clearTimeout(zoomRenderTimer);
  zoomRenderTimer = setTimeout(() => commitZoomRender(anchorClientPoint), delay);
}

async function renderModalPage() {
  if (modalRenderTask) {
    modalRenderTask.cancel();
    modalRenderTask = null;
  }

  if (!modalPdfDoc || modalPageNum < 1 || modalPageNum > modalPdfDoc.numPages) return;

  // A new page turn/render cycle is starting now — cancel any preload
  // renders still rasterizing for a page the user has since moved past
  // (they were previously left to run to completion in the background,
  // competing with this render for main-thread canvas time) and start a
  // fresh preload "epoch" for this page.
  modalPreloadAbortController.abort();
  modalPreloadAbortController = new AbortController();

  setNavButtonsDisabled(true);

  const canvas = document.getElementById("pdfRenderModal");
  // A zoom/resize re-render keeps showing the *same* page, just at a new
  // scale — that case renders into an offscreen canvas and swaps it in
  // only once ready (see below), so the on-screen canvas never goes
  // blank/dim mid-zoom. An actual page turn is a different page, so
  // there's nothing meaningful to keep showing — that path keeps the
  // original instant-low-res-placeholder-then-clear behavior.
  const isZoomOnlyRerender = lastRenderedPageNum === modalPageNum && canvas.width > 0;
  if (!isZoomOnlyRerender) {
    canvas.style.transform = "none";
  }
  lastRenderedScale = modalScale;

  try {
    const outerContainer = document.getElementById("canvasContainerModal");
    const wrapperEl = document.getElementById("canvasWrapperModal");

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width: containerWidth, height: containerHeight } = getModalContainerSize(
      outerContainer,
      wrapperEl,
    );

    // Preload bitmap (if any) is only ever a fast, low-res instant
    // placeholder for the page-turn — it is drawn immediately below,
    // then unconditionally replaced by a full-resolution page.render()
    // a few lines later. It must never be left on screen as the final
    // image, or the page looks blurry (it's ~0.5 scale stretched up
    // to full display size).
    const preloaded = modalPreloadCache.get(modalPageNum) || null;
    modalPreloadCache.delete(modalPageNum);

    // Kick off preloading of the neighboring pages now, concurrently with
    // this page's full-resolution render, rather than waiting for this
    // render to finish first. Preloading used to only start once this
    // await chain reached the very end of the function, so a preload for
    // the next hop couldn't even begin until the current (expensive,
    // full-res) render had completely finished — leaving nothing cached
    // if the user turned pages faster than that.
    if (modalPageNum < modalPdfDoc.numPages) {
      preloadNextPage();
    }
    if (modalPageNum > 1) {
      preloadPrevPage();
    }

    const page = await modalPdfDoc.getPage(modalPageNum);
    const viewport = page.getViewport({ scale: 1 });

    let contentScale = containerWidth / viewport.width;
    if (viewport.height * contentScale > containerHeight) {
      contentScale = containerHeight / viewport.height;
    }
    contentScale = contentScale * modalScale;

    const scaledViewport = page.getViewport({ scale: contentScale });
    const clampedDpr = getClampedDpr(scaledViewport.width, scaledViewport.height, dpr, modalScale);

    if (isZoomOnlyRerender) {
      // Render into an offscreen canvas first — the live canvas (and its
      // CSS zoom-preview transform, if a pinch/wheel-zoom gesture is what
      // triggered this) keeps showing its previous content, still
      // correctly scaled, right up until the new bitmap is ready. Then
      // swap size + pixels + drop the transform all in the same
      // synchronous block, so there's never a frame where the canvas is
      // blank or the wrong size.
      const offscreen = document.createElement("canvas");
      offscreen.width = scaledViewport.width * clampedDpr;
      offscreen.height = scaledViewport.height * clampedDpr;
      const octx = offscreen.getContext("2d");
      octx.scale(clampedDpr, clampedDpr);
      octx.imageSmoothingEnabled = true;

      modalRenderTask = page.render({
        canvasContext: octx,
        viewport: scaledViewport,
        signal: modalAbortController.signal,
      });
      await modalRenderTask.promise;
      modalRenderTask = null;

      canvas.width = offscreen.width;
      canvas.height = offscreen.height;
      canvas.getContext("2d").drawImage(offscreen, 0, 0);
      canvas.style.width = scaledViewport.width + "px";
      canvas.style.height = scaledViewport.height + "px";
      canvas.style.transform = "none";
    } else {
      canvas.width = scaledViewport.width * clampedDpr;
      canvas.height = scaledViewport.height * clampedDpr;
      canvas.style.width = scaledViewport.width + "px";
      canvas.style.height = scaledViewport.height + "px";

      const ctx = canvas.getContext("2d");
      ctx.scale(clampedDpr, clampedDpr);
      ctx.imageSmoothingEnabled = true;

      if (preloaded) {
        // Instant low-res placeholder so the page-turn feels immediate
        // while the sharp render below is still in flight.
        ctx.drawImage(preloaded.canvas, 0, 0, scaledViewport.width, scaledViewport.height);
      } else {
        canvas.style.opacity = "0.5";
      }

      modalRenderTask = page.render({
        canvasContext: ctx,
        viewport: scaledViewport,
        signal: modalAbortController.signal,
      });

      await modalRenderTask.promise;
      modalRenderTask = null;

      canvas.style.opacity = "1";
      // Only opacity animates here. width/height are layout properties —
      // transitioning them forces a reflow every frame (visible jank on
      // mobile), and worse, this transition string stuck around
      // permanently and leaked into the isZoomOnlyRerender branch above,
      // which explicitly wants an instant, synchronous size swap during
      // pinch/wheel zoom. Leaving width/height out of the transition list
      // means any future style.width/height write is always instant.
      canvas.style.transition = "opacity 0.2s ease";
    }

    lastRenderedPageNum = modalPageNum;
    retainHotPage(modalPageNum, page);
    pruneHotPages(modalPageNum);

    document.getElementById("pageNumModal").textContent = modalPageNum;
    document.getElementById("mobilePageNumModal").textContent = modalPageNum;

    const progress = (modalPageNum / modalPdfDoc.numPages) * 100;
    document.getElementById("pdfProgressModal").style.width = progress + "%";

    updateThumbnailSelection();
    saveReadingProgress(modalCurrentVolume, modalPageNum, modalPdfDoc.numPages);
  } catch (error) {
    if (error.name !== "AbortError" && error.name !== "RenderingCancelledException") {
      console.error("Error rendering page:", error);
      canvas.style.opacity = "0.3";
    }
  } finally {
    // _modalRendering itself is owned by runModalRenderLoop() now, since a
    // coalesced follow-up render needs it to stay true across the whole
    // loop, not just for a single renderModalPage() pass.
    setNavButtonsDisabled(false);
  }
}

function setNavButtonsDisabled(disabled) {
  const shouldDisable = disabled || modalViewMode === "cascade";
  const buttons = ["pdfPrevModal", "pdfNextModal"];
  buttons.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = shouldDisable;
  });
}

// CASCADE (continuous scroll) MODE
// Renders every page into its own <canvas> stacked vertically inside
// #pdfCascadeContainer. Pages are built as lightweight placeholder
// boxes up front (so the scrollbar/scroll position is stable and
// correctly sized immediately), then an IntersectionObserver lazily
// rasterizes each page's canvas as it nears the viewport and evicts
// far-away ones to keep memory bounded on long volumes. This reuses
// the same PDF.js document (modalPdfDoc), the same DPR clamp
// (getClampedDpr) and the same zoom state (modalScale) as single-page
// mode — it's a second renderer for the same data, not a parallel
// system.

// The toggle button's icon/title always describe the mode a tap will
// switch *to* (not the current mode) — e.g. while reading continuously,
// it shows the "single page" icon/title, since that's what clicking it
// gets you. Previously the button's label never changed at all, which
// combined with it being buried in the "more" overflow menu, made it
// easy to not realize continuous mode could be switched back out of.
function updateCascadeToggleUI(isCascade = modalViewMode === "cascade") {
  const select = document.getElementById("pdfViewModeSelect");
  if (!select) return;

  // The dropdown reflects the reader's actual live mode, not the saved
  // preference or the mode that will be entered next.
  select.value = isCascade ? "cascade" : "single";
  select.setAttribute("aria-label", currentLang === "en" ? "Reading mode" : currentLang === "tg" ? "Mode ng pagbasa" : "Modo de lectura");

  const options = select.options;
  const labels = {
    es: ["Modo de página única", "Modo cascada (scroll continuo)"],
    en: ["Single-page mode", "Cascade mode (continuous scroll)"],
    tg: ["Mode ng iisang pahina", "Cascade mode (tuloy-tuloy na scroll)"],
  };
  const langLabels = labels[currentLang] || labels.en;
  if (options[0]) options[0].textContent = langLabels[0];
  if (options[1]) options[1].textContent = langLabels[1];

  select.title = langLabels[isCascade ? 1 : 0];
}

function syncReaderSettingsUI() {
  updateCascadeToggleUI(modalViewMode === "cascade");
  const touchToggle = document.getElementById("pdfTouchToggle");
  if (touchToggle) {
    const enabled = getTouchControlsEnabled();
    touchToggle.classList.toggle("active", enabled);
    touchToggle.setAttribute("aria-pressed", String(enabled));
    touchToggle.querySelector(".pdf-setting-toggle-label")?.replaceChildren(
      document.createTextNode(enabled
        ? (currentLang === "en" ? "Touch controls: on" : currentLang === "tg" ? "Touch controls: on" : "Controles táctiles: activados")
        : (currentLang === "en" ? "Touch controls: off" : currentLang === "tg" ? "Touch controls: off" : "Controles táctiles: desactivados"))
    );
  }
}

function resetCascadeUI() {
  teardownCascadeMode();
  modalViewMode = "single";
  setNavButtonsDisabled(false);
  updateCascadeToggleUI(false);
  const singleContainer = document.getElementById("canvasContainerModal");
  if (singleContainer) singleContainer.style.display = "";
  // The canvas itself carries its own inline display style (set at load
  // time in loadPdfInModal, independent of the container) — restore it
  // here too, or a book that loaded straight into cascade mode leaves the
  // canvas permanently display:none and single-page mode renders into
  // thin air even though the container is visible.
  const canvas = document.getElementById("pdfRenderModal");
  if (canvas) canvas.style.display = "block";
  const cascadeEl = document.getElementById("pdfCascadeContainer");
  if (cascadeEl) cascadeEl.style.display = "none";
}

async function enterCascadeMode() {
  if (!modalPdfDoc || modalViewMode === "cascade") return;

  modalViewMode = "cascade";
  setNavButtonsDisabled(true);
  updateCascadeToggleUI(true);

  const singleContainer = document.getElementById("canvasContainerModal");
  const cascadeContainer = document.getElementById("pdfCascadeContainer");
  if (singleContainer) singleContainer.style.display = "none";
  const canvas = document.getElementById("pdfRenderModal");
  if (canvas) canvas.style.display = "none";
  if (cascadeContainer) cascadeContainer.style.display = "";

  cascadeCurrentPage = modalPageNum;
  cascadeLastRenderedScale = modalScale;
  await buildCascadePages();
  if (modalViewMode !== "cascade" || !modalPdfDoc) return;

  // Land on the resume page and get it (plus its immediate neighbors)
  // rendering *before* the IntersectionObserver is even attached. Without
  // this ordering, whatever the observer's first pass happens to consider
  // "intersecting" — which on mobile can momentarily be the top of the
  // book if a layout/viewport-resize pass (address bar collapsing, etc.)
  // lands before the scroll position has settled — goes into the same
  // FIFO render queue as the resume page. With only CASCADE_MAX_CONCURRENT
  // renders running at once, that previously meant someone resuming at
  // page 50 could end up waiting behind pages 1-49.
  scrollCascadeToPage(cascadeCurrentPage, "auto");
  // Order matters: each priority call unshifts to the front, so queue the
  // neighbors first and the actual resume page last, leaving it truly
  // first in line.
  if (cascadeCurrentPage > 1) {
    queueCascadeRender(cascadeCurrentPage - 1, { priority: true });
  }
  if (cascadeCurrentPage < modalPdfDoc.numPages) {
    queueCascadeRender(cascadeCurrentPage + 1, { priority: true });
  }
  queueCascadeRender(cascadeCurrentPage, { priority: true });
  setupCascadeObserver();

  scheduleToolbarAutoHide();
}

function exitCascadeMode() {
  if (modalViewMode !== "cascade") return;
  // Carry the reading position back into single-page mode.
  modalPageNum = cascadeCurrentPage;
  resetCascadeUI();
  queueModalRender();
}

function applyReadingTheme(theme) {
  modalReadingTheme = READING_THEMES.includes(theme) ? theme : "light";
  const viewer = document.getElementById("pdfViewerModal");
  if (viewer) {
    viewer.classList.remove("reading-theme-sepia", "reading-theme-dark");
    if (modalReadingTheme !== "light") {
      viewer.classList.add(`reading-theme-${modalReadingTheme}`);
    }
  }

  const icon = document.querySelector("#pdfThemeToggle i");
  const label = document.getElementById("pdfThemeToggleLabel");
  const iconByTheme = { light: "fa-adjust", sepia: "fa-sun", dark: "fa-moon" };
  if (icon) icon.className = `fas ${iconByTheme[modalReadingTheme]}`;
  if (label) {
    const labelByTheme = {
      light: { es: "Tema", en: "Theme", tg: "Tema" },
      sepia: { es: "Sepia", en: "Sepia", tg: "Sepia" },
      dark: { es: "Oscuro", en: "Dark", tg: "Madilim" },
    };
    label.textContent = labelByTheme[modalReadingTheme][currentLang] || labelByTheme.light.en;
  }

  const toggleBtn = document.getElementById("pdfThemeToggle");
  toggleBtn?.setAttribute("aria-pressed", String(modalReadingTheme !== "light"));
  toggleBtn?.classList.toggle("active", modalReadingTheme !== "light");
}

function cycleReadingTheme() {
  const idx = READING_THEMES.indexOf(modalReadingTheme);
  const next = READING_THEMES[(idx + 1) % READING_THEMES.length];
  applyReadingTheme(next);
  try {
    localStorage.setItem(READING_THEME_KEY, next);
  } catch {
    // Ignore persistence failures when storage is unavailable.
  }
}

// FIRST-TIME READING HINT
// Explains tap zones / swipe / center-tap-to-hide-chrome / cascade mode
// once, the first time anyone opens a volume on this browser.
const READER_HINT_SEEN_KEY = "adashima_novel_reader_hint_seen";

function hasSeenReaderHint() {
  try {
    return localStorage.getItem(READER_HINT_SEEN_KEY) === "1";
  } catch {
    return true; // fail closed: don't nag if storage is unavailable
  }
}

function maybeShowReaderHint() {
  if (hasSeenReaderHint()) return;
  const hint = document.getElementById("pdfReaderHint");
  if (!hint) return;
  hint.hidden = false;
}

function dismissReaderHint() {
  const hint = document.getElementById("pdfReaderHint");
  if (hint && !hint.hidden) hint.hidden = true;
  try {
    localStorage.setItem(READER_HINT_SEEN_KEY, "1");
  } catch {
    // Ignore persistence failures when storage is unavailable.
  }
}

const PDF_TOUCH_CONTROLS_KEY = "adashima_pdf_touch_controls";

function getTouchControlsEnabled() {
  try {
    const stored = localStorage.getItem(PDF_TOUCH_CONTROLS_KEY);
    return stored === null ? true : stored === "1";
  } catch {
    return true;
  }
}

function setTouchControlsEnabled(enabled) {
  try {
    localStorage.setItem(PDF_TOUCH_CONTROLS_KEY, enabled ? "1" : "0");
  } catch {
    // Ignore storage failures; the setting still applies for this session.
  }
  syncReaderSettingsUI();
}


// Tears down observers/DOM/state without touching modalViewMode or the
// visible containers — resetCascadeUI()/exitCascadeMode() layer that on
// top. Safe to call even if cascade mode was never entered.
function teardownCascadeMode() {
  cascadeBuildToken++; // invalidates any in-flight build/render work

  if (cascadeIO) {
    cascadeIO.disconnect();
    cascadeIO = null;
  }

  const cascadeContainer = document.getElementById("pdfCascadeContainer");
  if (cascadeContainer) {
    cascadeContainer.innerHTML = "";
    cascadeContainer.style.transform = "none";
  }

  cascadePageEntries = [];
  cascadeRenderedOrder = [];
  cascadeActiveRenders = 0;
  cascadePendingQueue = [];
  clearTimeout(cascadeZoomTimer);
  cascadeZoomTimer = null;
  if (cascadeScrollRaf) {
    cancelAnimationFrame(cascadeScrollRaf);
    cascadeScrollRaf = null;
  }
  cascadeContainerEl = null;
}

async function buildCascadePages() {
  const container = document.getElementById("pdfCascadeContainer");
  if (!container || !modalPdfDoc) return;

  const token = ++cascadeBuildToken;
  container.innerHTML = "";
  cascadePageEntries = [];
  cascadeRenderedOrder = [];
  cascadeContainerEl = container;

  const totalPages = modalPdfDoc.numPages;

  // Placeholder aspect ratio for pages not yet measured, so the total
  // scroll height is right from the start (most volumes have a uniform
  // trim size, so page 1's ratio is a good stand-in until each page
  // renders and corrects its own box).
  let fallbackAspect = 1.414; // A4-ish portrait
  try {
    const firstPage = await modalPdfDoc.getPage(1);
    const vp = firstPage.getViewport({ scale: 1 });
    fallbackAspect = vp.height / vp.width;
    firstPage.cleanup();
  } catch {
    // Ignore persistence failures when storage is unavailable.
  }

  if (token !== cascadeBuildToken) return;

  invalidateCascadeBaseWidth();
  const placeholderWidth = getCascadeBaseWidth() * modalScale;

  const frag = document.createDocumentFragment();
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const wrapper = document.createElement("div");
    wrapper.className = "pdf-cascade-page";
    wrapper.dataset.page = pageNum;
    wrapper.style.aspectRatio = `1 / ${fallbackAspect}`;
    wrapper.style.width = placeholderWidth + "px";

    const canvas = document.createElement("canvas");
    canvas.className = "pdf-cascade-canvas";
    wrapper.appendChild(canvas);

    const spinner = document.createElement("div");
    spinner.className = "pdf-cascade-spinner";
    wrapper.appendChild(spinner);

    frag.appendChild(wrapper);
    cascadePageEntries.push({
      pageNum,
      wrapper,
      canvas,
      aspectRatio: fallbackAspect,
      rendered: false,
      rendering: false,
      stale: false,
    });
  }
  container.appendChild(frag);
}

function setupCascadeObserver() {
  if (cascadeIO) cascadeIO.disconnect();
  const container = document.getElementById("pdfCascadeContainer");
  if (!container) return;

  cascadeIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const pageNum = parseInt(entry.target.dataset.page, 10);
        if (!entry.isIntersecting) return;
        queueCascadeRender(pageNum);
        if (entry.intersectionRatio >= 0.5) {
          cascadeCurrentPage = pageNum;
          updateCascadeProgress();
        }
      });
    },
    {
      root: container,
      // Pre-render roughly 1.5 screens ahead/behind so pages are ready
      // just before they're scrolled to, without rasterizing the whole book.
      rootMargin: "150% 0px 150% 0px",
      threshold: [0, 0.5],
    },
  );

  cascadePageEntries.forEach((entry) => cascadeIO.observe(entry.wrapper));
}

function updateCascadeProgress() {
  if (!modalPdfDoc) return;
  document.getElementById("pageNumModal").textContent = cascadeCurrentPage;
  document.getElementById("mobilePageNumModal").textContent = cascadeCurrentPage;
  const progress = (cascadeCurrentPage / modalPdfDoc.numPages) * 100;
  document.getElementById("pdfProgressModal").style.width = progress + "%";
  updateThumbnailSelection(cascadeCurrentPage);
  saveReadingProgress(modalCurrentVolume, cascadeCurrentPage, modalPdfDoc.numPages);
}

function scrollCascadeToPage(pageNum, behavior = "smooth") {
  const entry = cascadePageEntries.find((e) => e.pageNum === pageNum);
  if (!entry) return;
  entry.wrapper.scrollIntoView({ behavior, block: "start" });
  cascadeCurrentPage = pageNum;
  updateCascadeProgress();
}

function queueCascadeRender(pageNum, { priority = false } = {}) {
  const entry = cascadePageEntries.find((e) => e.pageNum === pageNum);
  if (!entry || entry.rendering || (entry.rendered && !entry.stale)) return;
  const existingIndex = cascadePendingQueue.indexOf(pageNum);
  if (existingIndex !== -1) {
    if (priority && existingIndex !== 0) {
      cascadePendingQueue.splice(existingIndex, 1);
      cascadePendingQueue.unshift(pageNum);
    }
    drainCascadeRenderQueue();
    return;
  }
  if (priority) {
    cascadePendingQueue.unshift(pageNum);
  } else {
    cascadePendingQueue.push(pageNum);
  }
  drainCascadeRenderQueue();
}

function drainCascadeRenderQueue() {
  while (cascadeActiveRenders < CASCADE_MAX_CONCURRENT && cascadePendingQueue.length > 0) {
    const pageNum = cascadePendingQueue.shift();
    cascadeActiveRenders++;
    renderCascadePage(pageNum).finally(() => {
      cascadeActiveRenders--;
      drainCascadeRenderQueue();
    });
  }
}

async function renderCascadePage(pageNum) {
  const token = cascadeBuildToken;
  const entry = cascadePageEntries.find((e) => e.pageNum === pageNum);
  if (!entry || (entry.rendered && !entry.stale)) return;
  entry.rendering = true;

  try {
    const page = await modalPdfDoc.getPage(pageNum);
    if (token !== cascadeBuildToken) {
      page.cleanup();
      return;
    }

    const viewport = page.getViewport({ scale: 1 });
    entry.aspectRatio = viewport.height / viewport.width;
    entry.wrapper.style.aspectRatio = `1 / ${entry.aspectRatio}`;

    // Use the stable container-derived base width, not the wrapper's own
    // clientWidth — once the wrapper's width is explicitly set below to
    // reflect modalScale, re-reading it back as "the" base width would
    // feed each render's zoomed output back in as the next render's
    // input, compounding on every zoom step.
    const baseWidth = getCascadeBaseWidth();
    const contentScale = (baseWidth / viewport.width) * modalScale;
    const scaledViewport = page.getViewport({ scale: contentScale });

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const clampedDpr = getClampedDpr(scaledViewport.width, scaledViewport.height, dpr, modalScale);

    // Render into an offscreen canvas and only swap it into the visible
    // one once it's fully ready. For a page's first-ever render this is
    // no different from before (it was an empty placeholder either way),
    // but for a re-render after a zoom/resize (entry.stale) it means the
    // page keeps showing its previous bitmap the whole time — instead of
    // the old approach, which cleared the live canvas (canvas.width = ...
    // always clears pixels) up front and left it visibly blank until the
    // new render finished.
    const offscreen = document.createElement("canvas");
    offscreen.width = scaledViewport.width * clampedDpr;
    offscreen.height = scaledViewport.height * clampedDpr;
    const octx = offscreen.getContext("2d");
    octx.setTransform(clampedDpr, 0, 0, clampedDpr, 0, 0);
    octx.imageSmoothingEnabled = true;

    if (token !== cascadeBuildToken) {
      page.cleanup();
      return;
    }

    await page.render({
      canvasContext: octx,
      viewport: scaledViewport,
      signal: modalAbortController.signal,
    }).promise;

    if (token !== cascadeBuildToken) {
      page.cleanup();
      return;
    }

    const canvas = entry.canvas;
    canvas.width = offscreen.width;
    canvas.height = offscreen.height;
    canvas.getContext("2d").drawImage(offscreen, 0, 0);
    canvas.style.width = scaledViewport.width + "px";
    canvas.style.height = scaledViewport.height + "px";
    entry.wrapper.style.width = scaledViewport.width + "px";

    entry.rendered = true;
    entry.stale = false;
    entry.wrapper.classList.add("rendered");
    cascadeRenderedOrder = cascadeRenderedOrder.filter((p) => p !== pageNum);
    cascadeRenderedOrder.push(pageNum);
    page.cleanup();

    evictFarCascadePages();
  } catch (error) {
    if (error.name !== "AbortError" && error.name !== "RenderingCancelledException") {
      console.warn("Cascade render failed for page", pageNum, error);
    }
  } finally {
    entry.rendering = false;
  }
}

// Keeps memory bounded on long volumes: once more rendered pages exist
// than CASCADE_KEEP_RENDERED, clear the pixel data of whichever rendered
// pages are farthest from the current reading position, leaving their
// placeholder box (aspect-ratio) in place so scroll position doesn't jump.
function evictFarCascadePages() {
  if (cascadeRenderedOrder.length <= CASCADE_KEEP_RENDERED) return;
  const excess = cascadeRenderedOrder.length - CASCADE_KEEP_RENDERED;
  const current = cascadeCurrentPage;
  const candidates = [...cascadeRenderedOrder].sort(
    (a, b) => Math.abs(b - current) - Math.abs(a - current),
  );
  for (let i = 0; i < excess; i++) {
    const pageNum = candidates[i];
    if (Math.abs(pageNum - current) <= 1) continue; // never evict the page(s) in view
    const entry = cascadePageEntries.find((e) => e.pageNum === pageNum);
    if (!entry) continue;
    entry.canvas.width = 0;
    entry.canvas.height = 0;
    entry.rendered = false;
    entry.stale = false;
    entry.wrapper.classList.remove("rendered");
    cascadeRenderedOrder = cascadeRenderedOrder.filter((p) => p !== pageNum);
  }
}

// Called after resize/orientation/fullscreen/zoom changes: existing
// canvases are stale at the old container width/scale. Rather than
// clearing their pixels immediately (which used to blank out every
// visible page the instant you finished pinch-zooming, all at once),
// they're marked stale and left showing their old bitmap — each one gets
// swapped for a freshly-rendered bitmap only once that's ready, via the
// offscreen-canvas swap in renderCascadePage().
function relayoutCascadePages() {
  if (modalViewMode !== "cascade" || !cascadePageEntries.length) return;
  invalidateCascadeBaseWidth();

  const baseWidth = getCascadeBaseWidth();
  cascadePageEntries.forEach((entry) => {
    // Keep every placeholder's box — rendered or not — in sync with the
    // new zoom level immediately (cheap: just a style write), so scroll
    // geometry stays correct even for pages that haven't rendered yet
    // and won't get their width updated until they scroll into view.
    entry.wrapper.style.width = baseWidth * modalScale + "px";

    if (entry.rendered) {
      entry.stale = true;
    }
  });

  const containerRect = cascadeContainerEl?.getBoundingClientRect();
  if (!containerRect) return;
  cascadePageEntries.forEach((entry) => {
    const rect = entry.wrapper.getBoundingClientRect();
    if (rect.bottom > containerRect.top - 400 && rect.top < containerRect.bottom + 400) {
      queueCascadeRender(entry.pageNum);
    }
  });
}

// Cheap instant zoom preview via CSS transform (mirrors applyZoomPreview
// for single-page mode) so pinch-zoom feels immediate; the real re-render
// at the new scale is debounced through scheduleCascadeZoomCommit.
function applyCascadeZoomPreview() {
  const container = document.getElementById("pdfCascadeContainer");
  if (!container) return;
  const ratio = modalScale / cascadeLastRenderedScale;
  container.style.transform = `scale(${ratio})`;
  container.style.transformOrigin = "50% 0%";
}

function scheduleCascadeZoomCommit(delay = 180) {
  clearTimeout(cascadeZoomTimer);
  cascadeZoomTimer = setTimeout(commitCascadeZoomRender, delay);
}

function commitCascadeZoomRender() {
  clearTimeout(cascadeZoomTimer);
  cascadeZoomTimer = null;

  const drift = modalScale / cascadeLastRenderedScale;
  if (drift < ZOOM_RERENDER_BAND && drift > 1 / ZOOM_RERENDER_BAND) {
    // Same no-rerender band as commitZoomRender — the container's CSS
    // scale transform (applyCascadeZoomPreview) stays exactly as-is, no
    // page relayout/re-render at all.
    return;
  }

  const container = document.getElementById("pdfCascadeContainer");
  if (container) container.style.transform = "none";
  cascadeLastRenderedScale = modalScale;
  relayoutCascadePages();
}

function initModalEvents() {
  document.getElementById("pdfModalClose").addEventListener("click", closePdfModal);
  document.getElementById("pdfModalBackdrop").addEventListener("click", closePdfModal);

  document.getElementById("pdfPrevModal").addEventListener("click", () => {
    if (document.getElementById("pdfPrevModal").disabled) return;
    // Route through goToPage() rather than mutating modalPageNum directly —
    // goToPage() knows to redirect into scrollCascadeToPage() in cascade
    // mode. Without this, the button silently re-rendered the hidden
    // single-page canvas and did nothing visible whenever cascade (the
    // default for novels) was active.
    const current = modalViewMode === "cascade" ? cascadeCurrentPage : modalPageNum;
    if (current > 1) goToPage(current - 1);
  });

  document.getElementById("pdfNextModal").addEventListener("click", () => {
    if (!modalPdfDoc || document.getElementById("pdfNextModal").disabled) return;
    const current = modalViewMode === "cascade" ? cascadeCurrentPage : modalPageNum;
    if (current < modalPdfDoc.numPages) goToPage(current + 1);
  });

  document.getElementById("pageInputModal").addEventListener("change", (e) => {
    const page = parseInt(e.target.value, 10);
    if (page && page > 0 && page <= (modalPdfDoc?.numPages || 1)) {
      goToPage(page);
      // Jumping to a page is a one-shot action — get the settings panel
      // out of the way so the person actually sees the page they asked for.
      closeSettingsPanel();
    }
    e.target.value = "";
  });

  function updateZoomDisplay() {
    document.getElementById("zoomDisplayModal").textContent = Math.round(modalScale * 100) + "%";
  }

  // Shared by the toolbar buttons, keyboard shortcuts, wheel/trackpad
  // zoom: show the new scale immediately via
  // CSS preview, then debounce the actual re-render. anchorClientPoint
  // (cursor/tap position) keeps whatever's under the pointer fixed in
  // place while zooming, same as the pointer anchor.
  function applyZoomChange(anchorClientPoint) {
    updateZoomDisplay();
    if (modalViewMode === "cascade") {
      applyCascadeZoomPreview();
      scheduleCascadeZoomCommit();
    } else {
      applyZoomPreview(anchorClientPoint);
      scheduleZoomCommit(180, anchorClientPoint);
    }
  }

  document.getElementById("pdfZoomInModal").addEventListener("click", () => {
    modalScale = Math.min(modalScale * 1.1, 3.0);
    applyZoomChange();
  });

  document.getElementById("pdfZoomOutModal").addEventListener("click", () => {
    modalScale = Math.max(modalScale * 0.9, 0.3);
    applyZoomChange();
  });

  document.getElementById("pdfZoomResetModal").addEventListener("click", () => {
    modalScale = 1.0;
    applyZoomChange();
  });

  function exitPdfFullscreen() {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  }

  document.getElementById("pdfFullscreenModal").addEventListener("click", () => {
    const elem = document.querySelector("#pdfModal .pdf-modal-content");
    if (!elem) return;
    if (!isPdfFullscreen()) {
      if (elem.requestFullscreen) elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
      else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
    } else {
      exitPdfFullscreen();
    }
    closeSettingsPanel();
  });

  document.getElementById("pdfExitFullscreenModal")?.addEventListener("click", (event) => {
    event.stopPropagation();
    exitPdfFullscreen();
  });

  document.getElementById("pdfDownloadModal").addEventListener("click", () => {
    if (modalCurrentVolume) {
      const isEnglish = currentLang === "en";
      const baseUrl = isEnglish
        ? "https://media.adashimaverse.com/Novelas/Ingles/"
        : "https://media.adashimaverse.com/Novelas/";
      const fileTarget = isEnglish ? modalCurrentVolume.filePdf : modalCurrentVolume.file;
      if (fileTarget) {
        smartDownload(baseUrl + encodeURIComponent(fileTarget), fileTarget);
      }
    }
    closeSettingsPanel();
  });

  document.getElementById("epubDownloadModal").addEventListener("click", () => {
    if (modalCurrentVolume && currentLang === "en") {
      const baseUrl = "https://media.adashimaverse.com/Novelas/Ingles/";
      const fileTarget = modalCurrentVolume.fileEpub;
      if (fileTarget) {
        smartDownload(baseUrl + encodeURIComponent(fileTarget), fileTarget);
      }
    }
    closeSettingsPanel();
  });

  document.getElementById("pdfRetryModal").addEventListener("click", () => {
    if (modalCurrentVolume) {
      loadPdfInModal(modalCurrentVolume);
    }
  });

  document.getElementById("pdfThemeToggle").addEventListener("click", cycleReadingTheme);

  document.getElementById("pdfReaderHintDismiss").addEventListener("click", dismissReaderHint);
  document.getElementById("pdfReaderHint").addEventListener("click", (e) => {
    if (e.target.id === "pdfReaderHint") dismissReaderHint(); // backdrop click
  });

  document.getElementById("pdfThumbnailToggle").addEventListener("click", () => {
    toggleThumbnails();
    // Both are full-height side panels — showing one and tucking the other
    // away keeps the reader from stacking two drawers on a narrow screen.
    closeSettingsPanel();
  });
  document.getElementById("pdfThumbnailsClose").addEventListener("click", () => {
    document.getElementById("pdfThumbnailsSidebar").classList.remove("open");
    modalThumbnailsVisible = false;
  });

  // In-document search
  document.getElementById("pdfSearchToggle").addEventListener("click", () => {
    toggleSearchBar();
  });
  document.getElementById("pdfSearchClose").addEventListener("click", () => {
    closeSearchBar();
  });
  document.getElementById("pdfSearchNext").addEventListener("click", searchNext);
  document.getElementById("pdfSearchPrev").addEventListener("click", searchPrev);
  document.getElementById("pdfSearchInput").addEventListener("input", (e) => {
    clearTimeout(modalSearchDebounceTimer);
    const value = e.target.value;
    modalSearchDebounceTimer = setTimeout(() => {
      runSearch(value, { silent: true });
    }, 250);
  });
  document.getElementById("pdfSearchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(modalSearchDebounceTimer);
      if (modalSearchQuery.trim() === e.target.value.trim() && modalSearchMatches.length) {
        if (e.shiftKey) searchPrev();
        else searchNext();
      } else {
        runSearch(e.target.value);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearchBar();
    }
  });

  document.getElementById("pdfViewModeSelect")?.addEventListener("change", (event) => {
    const nextMode = event.target.value;
    const currentMode = modalViewMode;
    if (nextMode === currentMode) return;

    if (nextMode === "cascade") {
      localStorage.setItem("adashima_pdf_mode", "continuous");
      enterCascadeMode();
    } else {
      localStorage.setItem("adashima_pdf_mode", "single");
      exitCascadeMode();
    }

    // Keep the dropdown synchronized immediately; cascade rendering itself
    // is asynchronous.
    updateCascadeToggleUI(modalViewMode === "cascade");
    closeSettingsPanel();
  });

  document.getElementById("pdfTouchToggle")?.addEventListener("click", () => {
    setTouchControlsEnabled(!getTouchControlsEnabled());
  });

  document.getElementById("pdfMoreToggle").addEventListener("click", () => {
    toggleSettingsPanel();
    toggleToolbarVisibility(true);
  });

  document.getElementById("pdfSettingsClose").addEventListener("click", closeSettingsPanel);
  document
    .getElementById("pdfToolbarSecondaryBackdrop")
    .addEventListener("click", closeSettingsPanel);

  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("pdfModal");
    if (!modal.classList.contains("open")) return;

    const hint = document.getElementById("pdfReaderHint");
    if (hint && !hint.hidden) {
      dismissReaderHint();
      if (e.key === "Escape") return; // first Escape just dismisses the hint
    }

    if (e.key === "Escape" && document.getElementById("pdfToolbarSecondary")?.classList.contains("open")) {
      closeSettingsPanel();
      return; // first Escape closes the settings panel, not the whole reader
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      openSearchBar();
      return;
    }

    if (e.key === "Escape" && isSearchBarOpen()) {
      closeSearchBar();
      return; // first Escape closes the search bar, not the whole reader
    }

    if (e.target.tagName === "INPUT") {
      if (e.key === "Enter" && e.target.id === "pageInputModal") {
        e.target.dispatchEvent(new Event("change"));
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        closePdfModal();
        break;
      case "ArrowLeft":
      case "a":
      case "A": {
        e.preventDefault();
        // Same cascade-aware routing as the toolbar buttons above.
        const cur = modalViewMode === "cascade" ? cascadeCurrentPage : modalPageNum;
        if (cur > 1) goToPage(cur - 1);
        break;
      }
      case "ArrowRight":
      case "d":
      case "D": {
        e.preventDefault();
        const cur = modalViewMode === "cascade" ? cascadeCurrentPage : modalPageNum;
        if (modalPdfDoc && cur < modalPdfDoc.numPages) goToPage(cur + 1);
        break;
      }
      case "+":
      case "=":
        e.preventDefault();
        modalScale = Math.min(modalScale * 1.1, 3.0);
        applyZoomChange();
        break;
      case "-":
        e.preventDefault();
        modalScale = Math.max(modalScale * 0.9, 0.3);
        applyZoomChange();
        break;
      case "0":
        e.preventDefault();
        modalScale = 1.0;
        applyZoomChange();
        break;
      case "f":
      case "F":
        e.preventDefault();
        document.getElementById("pdfFullscreenModal").click();
        break;
      case "t":
      case "T":
        e.preventDefault();
        toggleThumbnails();
        break;
    }
  });

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let multiTouchActive = false;
  // True once a single-finger touch has moved past a small jitter
  // threshold — distinguishes a genuine pan/drag from a tap so a slow
  // pan while zoomed can never fall through to page-turn/chrome-toggle
  // taps (which only key off distance-at-touchend, a coarser check).
  let singleTouchMoved = false;
  // A multi-touch sequence must not leak its final touchend into the
  // single-finger page-turn logic.
  const canvasContainer = document.getElementById("canvasContainerModal");
  const cascadeScrollEl = document.getElementById("pdfCascadeContainer");

  // Two-finger pinch-to-zoom state. touch-action on the containers is
  // "pan-x pan-y" (no native pinch-zoom), so this is the only way to
  // zoom by touch besides the toolbar +/- buttons.
  let pinchActive = false;
  let pinchStartDistance = 0;
  let pinchStartScale = 1.0;

  function touchDistance(t1, t2) {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  }

  function touchMidpoint(t1, t2) {
    return {
      clientX: (t1.clientX + t2.clientX) / 2,
      clientY: (t1.clientY + t2.clientY) / 2,
    };
  }

  // Double-tap-to-zoom: two quick taps near the same spot toggle between
  // fit scale and a comfortable close-up. Deliberately additive — the
  // *first* tap of the pair still fires its normal action (page-turn or
  // chrome toggle) immediately with no added latency; only if a second
  // tap follows fast enough does this also zoom.
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  const DOUBLE_TAP_ZOOM_SCALE = 2.2;

  function handleDoubleTapZoom(touch) {
    const now = Date.now();
    const dx = Math.abs(touch.clientX - lastTapX);
    const dy = Math.abs(touch.clientY - lastTapY);
    const isDoubleTap = now - lastTapTime < 300 && dx < 30 && dy < 30;
    lastTapTime = isDoubleTap ? 0 : now;
    lastTapX = touch.clientX;
    lastTapY = touch.clientY;
    if (!isDoubleTap) return false;

    const isZoomed = modalScale > (modalFitScale || 1) * 1.02;
    modalScale = isZoomed ? 1.0 : DOUBLE_TAP_ZOOM_SCALE;
    applyZoomChange({ clientX: touch.clientX, clientY: touch.clientY });
    return true;
  }

  // Ctrl/Cmd+wheel zooms around the cursor. Plain wheel scrolling is left alone.
  function handleWheelZoom(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    modalScale = Math.min(3.0, Math.max(0.3, modalScale * factor));
    applyZoomChange({ clientX: e.clientX, clientY: e.clientY });
  }
  canvasContainer.addEventListener("wheel", handleWheelZoom, {
    passive: false,
  });
  if (cascadeScrollEl) {
    cascadeScrollEl.addEventListener("wheel", handleWheelZoom, {
      passive: false,
    });
  }

  // Click-drag panning once zoomed in, for desktop/mouse users who don't
  // have pinch or a scroll-wheel-only workflow. Only engages past fit
  // scale so normal edge-tap page turning at fit scale is untouched.
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panScrollLeft = 0;
  let panScrollTop = 0;
  canvasContainer.addEventListener("mousedown", (e) => {
    if (modalViewMode === "cascade") return;
    if (modalScale <= (modalFitScale || 1) * 1.02) return;
    if (e.target.closest(".pdf-toolbar") || e.target.closest("button")) return;
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panScrollLeft = canvasContainer.scrollLeft;
    panScrollTop = canvasContainer.scrollTop;
    canvasContainer.classList.add("panning");
    e.preventDefault();
  });
  let panFrame = 0;
  let pendingPanX = 0;
  let pendingPanY = 0;
  window.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    pendingPanX = e.clientX;
    pendingPanY = e.clientY;
    if (panFrame) return;
    panFrame = requestAnimationFrame(() => {
      panFrame = 0;
      if (!isPanning) return;
      canvasContainer.scrollLeft = panScrollLeft - (pendingPanX - panStartX);
      canvasContainer.scrollTop = panScrollTop - (pendingPanY - panStartY);
    });
  });
  window.addEventListener("mouseup", () => {
    if (!isPanning) return;
    isPanning = false;
    canvasContainer.classList.remove("panning");
  });

  function handleTouchStart(e) {
    if (!getTouchControlsEnabled()) return;
    if (e.touches.length === 2) {
      pinchActive = true;
      multiTouchActive = true;
      singleTouchMoved = false;
      pinchStartDistance = touchDistance(e.touches[0], e.touches[1]);
      pinchStartScale = modalScale;
      return;
    }
    if (e.touches.length > 1) {
      pinchActive = false;
      multiTouchActive = true;
      singleTouchMoved = false;
      return;
    }
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (!touch) return;
    if (e.target.closest(".pdf-toolbar") || e.target.closest("button") || e.target.closest("input"))
      return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    singleTouchMoved = false;
  }

  function handleTouchMove(e) {
    if (!getTouchControlsEnabled()) return;
    if (pinchActive && e.touches.length === 2) {
      e.preventDefault();
      const dist = touchDistance(e.touches[0], e.touches[1]);
      if (pinchStartDistance > 0) {
        const ratio = dist / pinchStartDistance;
        modalScale = Math.min(3.0, Math.max(0.3, pinchStartScale * ratio));
        applyZoomChange(touchMidpoint(e.touches[0], e.touches[1]));
      }
      return;
    }
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (touch) {
        const dx = Math.abs(touch.clientX - touchStartX);
        const dy = Math.abs(touch.clientY - touchStartY);
        if (dx > 8 || dy > 8) singleTouchMoved = true;
      }
    }
  }

  function handleTouchEnd(e) {
    if (!getTouchControlsEnabled()) return;
    if (multiTouchActive) {
      if (e.touches.length < 2) pinchActive = false;
      if (!e.touches.length) multiTouchActive = false;
      singleTouchMoved = false;
      return;
    }
    if (e.touches.length) return;
    const touch = e.changedTouches?.[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - touchStartX);
    const dy = Math.abs(touch.clientY - touchStartY);
    const dt = Date.now() - touchStartTime;
    const wasRealMove = singleTouchMoved || dt > 350 || dx > 40 || dy > 40;
    singleTouchMoved = false;
    if (wasRealMove) return;
    if (e.target.closest(".pdf-toolbar") || e.target.closest("button") || e.target.closest("input"))
      return;

    // A fast second tap near the same spot zooms instead of repeating
    // whatever the first tap already did (page-turn / chrome toggle).
    if (modalViewMode !== "single" && handleDoubleTapZoom(touch)) return;

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();

    const relX = (touch.clientX - rect.left) / rect.width;

    // Middle band is a dead zone for page-turning on purpose — repurposed
    // as a tap target to show/hide the reading chrome (toolbar, progress
    // bar), the way most comic/book readers handle a center tap.
    if (relX > 0.35 && relX < 0.65) {
      toggleToolbarVisibility();
      return;
    }

    // Edge-tap page turning is a single-page-mode affordance.
    // In cascade mode scrolling is how you turn pages.
    if (modalViewMode === "cascade") return;

    if (relX <= 0.35) {
      if (modalPageNum > 1) {
        modalPageNum--;
        queueModalRender();
      }
    } else if (relX >= 0.65) {
      if (modalPdfDoc && modalPageNum < modalPdfDoc.numPages) {
        modalPageNum++;
        queueModalRender();
      }
    }
  }

  function handleTouchCancel() {
    multiTouchActive = false;
    singleTouchMoved = false;
    pinchActive = false;
  }

  canvasContainer.addEventListener("touchstart", handleTouchStart, {
    passive: true,
  });
  canvasContainer.addEventListener("touchmove", handleTouchMove, {
    passive: false,
  });
  canvasContainer.addEventListener("touchend", handleTouchEnd, {
    passive: true,
  });
  canvasContainer.addEventListener("touchcancel", handleTouchCancel);

  // Cascade mode scrolls in its own container and keeps the same tap behavior.
  if (cascadeScrollEl) {
    cascadeScrollEl.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    cascadeScrollEl.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    cascadeScrollEl.addEventListener("touchend", handleTouchEnd, {
      passive: true,
    });
    cascadeScrollEl.addEventListener("touchcancel", handleTouchCancel);
  }

  // Any real interaction with the viewer keeps the chrome visible/revives
  // it, so auto-hide never fights the person actually using the controls.
  const viewerEl = document.getElementById("pdfViewerModal");
  let lastActivityShow = 0;
  function keepToolbarAlive() {
    const now = Date.now();
    if (now - lastActivityShow < 200) return;
    lastActivityShow = now;
    if (modalToolbarHidden) toggleToolbarVisibility(true);
    else scheduleToolbarAutoHide();
  }
  viewerEl.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".pdf-toolbar")) toggleToolbarVisibility(true);
  });
  // mousemove only ever fires from an actual mouse, so on a touch device
  // the toolbar's 4s auto-hide timer was never being pushed back out while
  // someone was mid-scroll reading — it would hide itself out from under
  // an actively-reading mobile user in a way that never happened on
  // desktop. touchmove covers active dragging; scroll also catches
  // momentum/inertial scrolling on mobile, which continues generating
  // scroll events after the finger has already lifted (no touchmove).
  viewerEl.addEventListener("mousemove", keepToolbarAlive);
  canvasContainer.addEventListener("touchmove", keepToolbarAlive, { passive: true });
  canvasContainer.addEventListener("scroll", keepToolbarAlive, { passive: true });
  if (cascadeScrollEl) {
    cascadeScrollEl.addEventListener("touchmove", keepToolbarAlive, { passive: true });
    cascadeScrollEl.addEventListener("scroll", keepToolbarAlive, { passive: true });
  }
  document
    .getElementById("pdfChromeReveal")
    ?.addEventListener("click", () => toggleToolbarVisibility(true));

  let resizeTimeout;
  function renderAfterViewerResize() {
    if (!modalPdfDoc || !document.getElementById("pdfModal").classList.contains("open")) return;
    invalidateModalContainerSize();
    if (modalViewMode === "cascade") {
      relayoutCascadePages();
    } else {
      queueModalRender();
    }
  }

  function handleViewerResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // A focused text input (the page-number box) means this resize is
      // almost certainly the on-screen keyboard opening/closing, not an
      // actual orientation or fullscreen change — visualViewport fires
      // "resize" for that too. Re-rendering/relayouting the whole PDF
      // while someone is mid-tap on the page input wastes a render pass
      // and can visibly shift the page under their thumb. There's nothing
      // to fix layout-wise for a keyboard popping up, so skip it.
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        active.addEventListener("blur", handleViewerResize, { once: true });
        return;
      }

      // Orientation and fullscreen events can fire before flex layout has
      // settled. Waiting two frames measures the new container, not the old
      // viewport dimensions.
      requestAnimationFrame(() => {
        requestAnimationFrame(renderAfterViewerResize);
      });
    }, 200);
  }

  window.addEventListener("resize", handleViewerResize);
  // Mobile browsers show/hide their own chrome (address bar, etc.) as the
  // page scrolls, which changes the visual viewport without necessarily
  // firing a plain "resize" — visualViewport catches that too.
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", handleViewerResize);
  }
  window.addEventListener("orientationchange", handleViewerResize);

  if (canvasContainer && "ResizeObserver" in window) {
    modalResizeObserver = new ResizeObserver(handleViewerResize);
    modalResizeObserver.observe(canvasContainer);
  }

  function handlePdfFullscreenChange() {
    const isFullscreen = isPdfFullscreen();
    const pdfModal = document.getElementById("pdfModal");
    pdfModal?.classList.toggle("pdf-is-fullscreen", isFullscreen);
    const icon = document.getElementById("fsIconModal");
    if (icon) {
      icon.classList.toggle("fa-expand", !isFullscreen);
      icon.classList.toggle("fa-compress", isFullscreen);
    }

    if (isFullscreen) {
      // Make sure the exit-fullscreen control is visible the moment
      // fullscreen is entered, and keep it that way (see the
      // fullscreenElement guard in scheduleToolbarAutoHide).
      toggleToolbarVisibility(true);
    } else {
      // Back to normal reading: resume the regular auto-hide behavior.
      scheduleToolbarAutoHide();
    }

    // The browser resizes the viewer element when entering/exiting
    // fullscreen, but that doesn't fire a window "resize" event on every
    // browser/OS combo — so the cached fit-box (modalContainerWidth/Height)
    // goes stale and the page keeps rendering at the old, smaller size,
    // leaving blank space around it in fullscreen. Re-measure and re-render
    // once layout has actually settled.
    invalidateModalContainerSize();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!pdfModal?.classList.contains("open")) return;
        if (modalViewMode === "cascade") {
          relayoutCascadePages();
        } else if (modalPdfDoc) {
          queueModalRender();
        }
      });
    });
  }

  document.addEventListener("fullscreenchange", handlePdfFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handlePdfFullscreenChange);
}

let currentView = (() => {
  try {
    const saved = localStorage.getItem("adashima_novels_view");
    return saved === "list" || saved === "grid" ? saved : "grid";
  } catch {
    return "grid";
  }
})();
let searchTerm = "";

function resetPageScrollToTop() {
  try {
    window.history.scrollRestoration = "manual";
  } catch {
    // Ignore persistence failures when storage is unavailable.
  }

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function renderVolumes() {
  const container = document.getElementById("novels-container");
  if (!container) return;
  const listHtml = volumeData.map((v) => buildVolumeHTML(v)).join("");
  const gridHtml = volumeData.map((v) => buildCardHTML(v)).join("");
  const noResultsText = getText("noResults");
  container.innerHTML = `
            <div id="no-results-message" class="no-results-message" style="display:none;">
                <div class="no-results-content">
                    <i class="fas fa-search no-results-icon"></i>
                    <p class="no-results-text">${noResultsText}</p>
                </div>
            </div>
            <div class="view-list-content" id="listViewContainer">${listHtml}</div>
            <div class="novels-grid" id="gridViewContainer">${gridHtml}</div>
        `;
  applyView(currentView);
  applySearch(searchTerm);
  attachAccordion();
}

function setView(view) {
  const normalizedView = view === "list" || view === "grid" ? view : "grid";
  currentView = normalizedView;
  try {
    localStorage.setItem("adashima_novels_view", normalizedView);
  } catch {
    /* ignore storage errors */
  }
  applyView(normalizedView);

  const listBtn = document.getElementById("viewListBtn");
  const gridBtn = document.getElementById("viewGridBtn");
  if (listBtn) listBtn.classList.toggle("active", normalizedView === "list");
  if (gridBtn) gridBtn.classList.toggle("active", normalizedView === "grid");

  const container = document.getElementById("novels-container");
  if (container) {
    container.classList.toggle("view-list", normalizedView === "list");
    container.classList.toggle("view-grid", normalizedView === "grid");
  }
}

function applyView(view) {
  const container = document.getElementById("novels-container");
  if (!container) return;

  const normalizedView = view === "list" || view === "grid" ? view : "grid";
  container.classList.toggle("view-list", normalizedView === "list");
  container.classList.toggle("view-grid", normalizedView === "grid");

  const listView = document.getElementById("listViewContainer");
  const gridView = document.getElementById("gridViewContainer");
  if (listView) listView.style.display = normalizedView === "list" ? "" : "none";
  if (gridView) gridView.style.display = normalizedView === "grid" ? "" : "none";
}

function applySearch(term) {
  searchTerm = term.toLowerCase().trim();
  document.querySelectorAll(".novel-item").forEach((el) => {
    const id = el.dataset.volumeId || "";
    const title = (el.querySelector(".novel-summary span")?.textContent || "").toLowerCase();
    const desc = (el.querySelector(".novel-description p")?.textContent || "").toLowerCase();
    const match =
      !searchTerm ||
      title.includes(searchTerm) ||
      desc.includes(searchTerm) ||
      id.toLowerCase().includes(searchTerm);
    el.style.display = match ? "" : "none";
  });
  document.querySelectorAll(".novel-card").forEach((el) => {
    const title = (el.dataset.title || "").toLowerCase();
    const desc = (el.dataset.desc || "").toLowerCase();
    const num = (el.dataset.number || "").toLowerCase();
    const match =
      !searchTerm ||
      title.includes(searchTerm) ||
      desc.includes(searchTerm) ||
      num.includes(searchTerm);
    el.style.display = match ? "" : "none";
  });

  const visibleItems = [...document.querySelectorAll(".novel-item")].filter(
    (el) => el.style.display !== "none",
  ).length;
  const visibleCards = [...document.querySelectorAll(".novel-card")].filter(
    (el) => el.style.display !== "none",
  ).length;
  const hasVisibleResults = visibleItems + visibleCards > 0;
  const noResultsMsg = document.getElementById("no-results-message");
  if (noResultsMsg) {
    noResultsMsg.style.display = searchTerm && !hasVisibleResults ? "flex" : "none";
  }
}

function attachAccordion() {
  document.querySelectorAll("details.novel-item").forEach((detail) => {
    detail.removeEventListener("toggle", handleToggle);
    detail.addEventListener("toggle", handleToggle);
  });
}

function handleToggle(e) {
  const detail = e.currentTarget;
  if (detail.open) {
    const others = document.querySelectorAll("details.novel-item");
    others.forEach((other) => {
      if (other !== detail && other.open) other.removeAttribute("open");
    });
  }
}

async function loadMenu() {
  const menuVer = Math.floor(Date.now() / 86400000);
  try {
    const response = await fetch(`/src/components/menu.html?v=${menuVer}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
    if (!response.ok) throw new Error("Error HTTP " + response.status);
    let data = await response.text();
    data = data
      .replace(/src="\.\/(assets\/)/g, 'src="../../$1')
      .replace(/data-route="\.\.\/\.\.\/index\.html"/g, 'data-route="../../index.html"');
    const container =
      document.getElementById("sidebar-container") || document.getElementById("menu-container");
    if (!container) return;
    container.innerHTML = data;
    const scripts = container.querySelectorAll("script");
    scripts.forEach((oldScript) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) =>
        newScript.setAttribute(attr.name, attr.value),
      );
      newScript.appendChild(document.createTextNode(oldScript.innerHTML));
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent("menuLoaded"));
    }, 100);
  } catch (error) {
    console.warn("Error loading menu:", error);
  }
}

async function renderApp() {
  const title = document.getElementById("page-title");
  if (title) title.textContent = getText("headerTitle");
  // Footer is now the shared component (src/components/js/footer.js),
  // which handles its own translation.
  const floatingAdashima = document.getElementById("floating-link");
  if (floatingAdashima) floatingAdashima.title = getText("floatingTitle");

  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.placeholder = getText("searchPlaceholder");

  const viewListBtn = document.getElementById("viewListBtn");
  const viewGridBtn = document.getElementById("viewGridBtn");
  if (viewListBtn) viewListBtn.innerHTML = `<i class="fas fa-list-ul"></i> ${getText("viewList")}`;
  if (viewGridBtn) viewGridBtn.innerHTML = `<i class="fas fa-th"></i> ${getText("viewGrid")}`;

  const modalTitle = document.getElementById("pdfModalTitle");
  if (modalTitle)
    modalTitle.innerHTML = `${getText("modal.reading")} <span id="pdfVolumeTitle">Volumen</span>`;

  const closeBtn = document.getElementById("pdfModalClose");
  if (closeBtn) closeBtn.setAttribute("aria-label", getText("modal.closeReader"));

  const thumbToggle = document.getElementById("pdfThumbnailToggle");
  if (thumbToggle) thumbToggle.title = getText("pdfControls.thumbnails");

  const pageLabel = document.getElementById("pdfPageLabel");
  if (pageLabel) pageLabel.textContent = getText("pdfControls.page");

  const pageInput = document.getElementById("pageInputModal");
  if (pageInput) pageInput.placeholder = getText("pdfControls.goTo");

  const thumbTitle = document.getElementById("pdfThumbnailsTitle");
  if (thumbTitle) thumbTitle.textContent = getText("pdfControls.thumbnails");

  const loadingText = document.getElementById("pdfLoadingTextModal");
  if (loadingText) loadingText.textContent = getText("pdfControls.loadingDocument");

  const errorMsg = document.getElementById("pdfErrorMsgModal");
  if (errorMsg) errorMsg.textContent = getText("toastMessages.documentNotAvailable");

  const retryText = document.getElementById("pdfRetryText");
  if (retryText) retryText.textContent = getText("toastMessages.retry");

  renderVolumes();
  setView("grid");
}

// Language switching
function switchLanguage(lang) {
  if (lang === currentLang) return;
  currentLang = lang === "en" ? "en" : "es";

  // Save language preferences
  localStorage.setItem("lang", currentLang);
  localStorage.setItem("preferredLanguage", currentLang);
  localStorage.setItem("language", currentLang);
  localStorage.setItem("adashima_manga_lang", currentLang);

  // Update LanguageSwitch if available
  if (window.LanguageSwitch?.setLanguage) {
    window.LanguageSwitch.setLanguage(currentLang);
  }

  // Reload the page to apply changes
  window.location.reload();
}

// Expose page handlers
window.openPdfModal = openPdfModal;
window.closePdfModal = closePdfModal;
window.switchLanguage = switchLanguage;

document.addEventListener("DOMContentLoaded", async () => {
  resetPageScrollToTop();

  // FIXED: Sync with LanguageSwitch
  const langFromSwitch = window.LanguageSwitch?.getCurrentLanguage?.();
  if (langFromSwitch) {
    currentLang = langFromSwitch;
  } else {
    // Fallback to localStorage
    const storedLang =
      localStorage.getItem("lang") ||
      localStorage.getItem("preferredLanguage") ||
      localStorage.getItem("language") ||
      localStorage.getItem("adashima_manga_lang") ||
      "es";
    currentLang = storedLang === "en" ? "en" : "es";
  }

  // Ensure document language is set
  document.documentElement.lang = currentLang;

  // Ensure localStorage is consistent
  localStorage.setItem("lang", currentLang);
  localStorage.setItem("preferredLanguage", currentLang);
  localStorage.setItem("language", currentLang);
  localStorage.setItem("adashima_manga_lang", currentLang);

  // If LanguageSwitch is available, ensure it matches
  if (window.LanguageSwitch?.getCurrentLanguage?.() !== currentLang) {
    window.LanguageSwitch?.setLanguage?.(currentLang);
  }

  await loadTranslations(currentLang);
  await renderApp();
  resetPageScrollToTop();
  setTimeout(resetPageScrollToTop, 50);
  setTimeout(resetPageScrollToTop, 200);
  await loadMenu();
  initModalEvents();

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      applySearch(this.value);
    });
  }

  const viewListBtn = document.getElementById("viewListBtn");
  const viewGridBtn = document.getElementById("viewGridBtn");
  if (viewListBtn) {
    viewListBtn.addEventListener("click", function () {
      setView("list");
    });
  }
  if (viewGridBtn) {
    viewGridBtn.addEventListener("click", function () {
      setView("grid");
    });
  }

  window.addEventListener("pageshow", resetPageScrollToTop);

  // Listen for language change events from LanguageSwitch
  document.addEventListener("languageChanged", function (e) {
    if (e.detail && e.detail.lang && e.detail.lang !== currentLang) {
      currentLang = e.detail.lang;
      document.documentElement.lang = currentLang;
      // Reload data with new language
      loadTranslations(currentLang).then(() => {
        renderApp();
        if (window.translateMenu) window.translateMenu(currentLang);
      });
    }
  });
});