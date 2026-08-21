// ===== CONFIGURATION =====
const BASE_PATH = window.LanguageSwitch?.getDataFolderUrl
  ? window.LanguageSwitch.getDataFolderUrl("gallery")
  : (() => {
      const path = window.location.pathname || "";
      let relative = "./src/data/gallery/";
      if (path.includes("/src/pages/")) {
        relative = "../../data/gallery/";
      } else if (path.includes("/src/")) {
        relative = "../data/gallery/";
      }
      const href = new URL(relative, window.location.href).href;
      return href.endsWith("/") ? href : href + "/";
    })();

let currentLanguage = (() => {
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

let galleryData = null;
let translations = null;
let currentFilter = "all";
let currentArtist = "all";
let currentCollection = "all";
let searchQuery = "";

let _currentViewerIndex = 0;
let _viewerItems = [];

// ===== OPTIMIZED PERFORMANCE CONFIG =====
const CONFIG = {
  INITIAL_LOAD_COUNT: 12,
  BATCH_SIZE: 8,
  CONCURRENT_LOADS: 4,
  LAZY_OFFSET: 100,
  RENDER_CHUNK_SIZE: 8,
  IMAGE_CACHE_LIMIT: 100,
  CACHE_CLEANUP_INTERVAL: 30000,
  COLLECTION_BATCH_SIZE: 12,
  RANDOM_DISPLAY_COUNT: 36,
  SLIDESHOW_INTERVAL: 5000, // 5 seconds
};

// ===== COLLECTION DEFINITIONS =====
const COLLECTION_DEFINITIONS = [
  { folder: "covers", type: "cover", label: "Covers" },
  { folder: "coversJP", type: "cover", label: "Covers" },
  { folder: "mangaCoversJP", type: "cover", label: "Covers" },
  { folder: "magazine", type: "magazine", label: "Magazine" },
  { folder: "anime", type: "anime", label: "Anime" },
  { folder: "manga", type: "manga", label: "Manga" },
  { folder: "collaborations", type: "collaboration", label: "Collaborations" },
  { folder: "merchandise", type: "merchandise", label: "Merchandise" },
  { folder: "seasonal", type: "seasonal", label: "Seasonal" },
  { folder: "official", type: "official", label: "Official" },
];

const VOLUME_DEFINITIONS = [
  { path: "volume-01", label: "VOLUME 01", enabled: true },
  { path: "volume-02", label: "VOLUME 02", enabled: true },
  { path: "volume-03", label: "VOLUME 03", enabled: true },
  { path: "volume-04", label: "VOLUME 04", enabled: true },
  { path: "volume-05", label: "VOLUME 05", enabled: true },
  { path: "volume-06", label: "VOLUME 06", enabled: true },
  { path: "volume-07", label: "VOLUME 07", enabled: true },
  { path: "volume-08", label: "VOLUME 08", enabled: true },
  { path: "volume-10", label: "VOLUME 10", enabled: true },
  { path: "volume-11", label: "VOLUME 11", enabled: true },
  { path: "volume-12", label: "VOLUME 12", enabled: true },
  { path: "volume-13", label: "VOLUME 13", enabled: true },
  { path: "volume-ss", label: "VOLUME SS", enabled: true },
  { path: "volume-ss2", label: "VOLUME SS2", enabled: true },
  { path: "volume-99", label: "VOLUME 99.9", enabled: true },
];

function normalizeFilterValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeArtworkMetadata(artwork) {
  if (!artwork || typeof artwork !== "object") return artwork;
  const normalized = { ...artwork };

  const typeValue = normalizeFilterValue(normalized.type);
  if (typeValue === "ilustración" || typeValue === "illustration") {
    normalized.type = "illustration";
  } else {
    normalized.type = typeValue || normalized.type;
  }

  const tags = Array.isArray(normalized.tags)
    ? normalized.tags.map((tag) => normalizeFilterValue(tag))
    : [];

  if (tags.includes("ilustración") && !tags.includes("illustration")) {
    tags.push("illustration");
  }
  if (tags.includes("illustration") && !tags.includes("ilustración")) {
    tags.push("ilustración");
  }

  normalized.tags = [...new Set(tags)];
  return normalized;
}

function normalizeVolumeLabel(label) {
  return normalizeFilterValue(label || "");
}

function isVolumeCollection(collectionName) {
  if (!collectionName) return false;
  const normalizedCollection = normalizeVolumeLabel(collectionName);
  return VOLUME_DEFINITIONS.some((vol) => normalizeVolumeLabel(vol.label) === normalizedCollection);
}

function getVolumeDisplayName(collectionLabel) {
  if (!collectionLabel) return collectionLabel || "";
  const normalized = String(collectionLabel).trim();
  const matched = normalized.match(/volume\s*(.+)/i);
  const volumeNumber = matched ? matched[1].replace(/^0+/, "") || "0" : normalized;
  if (currentLanguage === "es") {
    return `Volumen ${volumeNumber}`;
  }
  return `Volume ${volumeNumber}`;
}

function getCollectionDisplayName(collectionLabel) {
  if (!collectionLabel) return collectionLabel || "";
  const normalized = String(collectionLabel).trim();

  if (normalized.match(/^volume\s*(.+)$/i)) {
    return getVolumeDisplayName(normalized);
  }

  const displayTranslations = {
    es: {
      "light novel covers": "Portadas de novelas ligeras",
      covers: "Portadas",
      "light novel illustrations": "Ilustraciones de novelas ligeras",
      illustrations: "Ilustraciones",
    },
    en: {
      "light novel covers": "Light Novel Covers",
      covers: "Covers",
      "light novel illustrations": "Light Novel Illustrations",
      illustrations: "Illustrations",
    },
  };

  const lookupKey = normalized.toLowerCase();
  return displayTranslations[currentLanguage]?.[lookupKey] || normalized;
}

function getVolumeSectionId(collectionLabel) {
  if (!collectionLabel) return "volume-section-unknown";
  return `volume-section-${String(collectionLabel)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;
}

function groupArtworksByVolume(artworks) {
  const groups = new Map();
  for (const item of artworks) {
    const volumeKey = item.collection || "Sin volumen";
    if (!groups.has(volumeKey)) {
      groups.set(volumeKey, []);
    }
    groups.get(volumeKey).push(item);
  }
  return groups;
}

function renderIllustrationVolumeGroups(items) {
  const container = document.getElementById("exhibitionSectionsContainer");
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fas fa-search"></i></div>
        <h3>${getStaticText("noArtworksFound")}</h3>
        <p>${getStaticText("noArtworksInCollection")}</p>
        <button class="empty-clear-btn" onclick="restoreMainExhibition()">${getStaticText("backToExhibition")}</button>
      </div>
    `;
    return;
  }

  stopSlideshow();

  const groups = groupArtworksByVolume(items);
  const orderedVolumeLabels = VOLUME_DEFINITIONS.map((vol) => vol.label);

  let html = "";
  for (const volumeLabel of orderedVolumeLabels) {
    if (!groups.has(volumeLabel)) continue;
    const volumeItems = groups.get(volumeLabel);
    const sectionId = getVolumeSectionId(volumeLabel);
    html += `
      <section class="volume-section" id="${sectionId}">
        <h2 class="volume-title">${getVolumeDisplayName(volumeLabel)}</h2>
        <div class="masonry-grid" id="masonryGrid-${sectionId}">
    `;
    for (const item of volumeItems) {
      html += renderMasonryItem({ type: "artwork", item });
    }
    html += `</div></section>`;
  }

  const remainingVolumeKeys = [...groups.keys()].filter(
    (key) => !orderedVolumeLabels.includes(key),
  );
  for (const volumeLabel of remainingVolumeKeys) {
    const volumeItems = groups.get(volumeLabel);
    const sectionId = getVolumeSectionId(volumeLabel);
    html += `
      <section class="volume-section" id="${sectionId}">
        <h2 class="volume-title">${getVolumeDisplayName(volumeLabel)}</h2>
        <div class="masonry-grid" id="masonryGrid-${sectionId}">
    `;
    for (const item of volumeItems) {
      html += renderMasonryItem({ type: "artwork", item });
    }
    html += `</div></section>`;
  }

  container.innerHTML = html;
  observeImagesOptimized(container);
  preloadVisibleImages(container);
}

// ===== VIBRANT RGB COLOR PALETTE WITH HIGH CONTRAST =====
const COLOR_PALETTES = [
  {
    bg: "rgb(255, 235, 240)",
    accent: "rgb(220, 30, 100)",
    text: "rgb(40, 10, 30)",
    border: "rgba(220, 30, 100, 0.3)",
  },

  {
    bg: "rgb(230, 242, 255)",
    accent: "rgb(30, 80, 210)",
    text: "rgb(10, 20, 60)",
    border: "rgba(30, 80, 210, 0.3)",
  },
  {
    bg: "rgb(235, 255, 235)",
    accent: "rgb(20, 160, 40)",
    text: "rgb(10, 50, 20)",
    border: "rgba(20, 160, 40, 0.3)",
  },
  {
    bg: "rgb(255, 250, 225)",
    accent: "rgb(200, 160, 0)",
    text: "rgb(60, 40, 10)",
    border: "rgba(200, 160, 0, 0.3)",
  },
  {
    bg: "rgb(245, 235, 255)",
    accent: "rgb(160, 60, 180)",
    text: "rgb(50, 20, 60)",
    border: "rgba(160, 60, 180, 0.3)",
  },
  {
    bg: "rgb(230, 255, 252)",
    accent: "rgb(0, 150, 160)",
    text: "rgb(0, 50, 60)",
    border: "rgba(0, 150, 160, 0.3)",
  },
  {
    bg: "rgb(255, 240, 225)",
    accent: "rgb(220, 100, 0)",
    text: "rgb(60, 30, 10)",
    border: "rgba(220, 100, 0, 0.3)",
  },
  {
    bg: "rgb(240, 235, 255)",
    accent: "rgb(80, 60, 200)",
    text: "rgb(30, 20, 70)",
    border: "rgba(80, 60, 200, 0.3)",
  },
  {
    bg: "rgb(255, 225, 235)",
    accent: "rgb(220, 20, 120)",
    text: "rgb(60, 10, 40)",
    border: "rgba(220, 20, 120, 0.3)",
  },
  {
    bg: "rgb(225, 245, 255)",
    accent: "rgb(20, 110, 220)",
    text: "rgb(10, 30, 70)",
    border: "rgba(20, 110, 220, 0.3)",
  },
  {
    bg: "rgb(255, 245, 230)",
    accent: "rgb(200, 130, 0)",
    text: "rgb(60, 40, 10)",
    border: "rgba(200, 130, 0, 0.3)",
  },
  {
    bg: "rgb(235, 255, 240)",
    accent: "rgb(30, 150, 80)",
    text: "rgb(10, 50, 30)",
    border: "rgba(30, 150, 80, 0.3)",
  },
  {
    bg: "rgb(255, 235, 225)",
    accent: "rgb(220, 50, 0)",
    text: "rgb(70, 20, 10)",
    border: "rgba(220, 50, 0, 0.3)",
  },
  {
    bg: "rgb(245, 235, 255)",
    accent: "rgb(120, 80, 200)",
    text: "rgb(40, 20, 70)",
    border: "rgba(120, 80, 200, 0.3)",
  },
  {
    bg: "rgb(235, 250, 240)",
    accent: "rgb(0, 140, 120)",
    text: "rgb(0, 50, 40)",
    border: "rgba(0, 140, 120, 0.3)",
  },
  {
    bg: "rgb(255, 230, 225)",
    accent: "rgb(220, 60, 40)",
    text: "rgb(70, 20, 15)",
    border: "rgba(220, 60, 40, 0.3)",
  },
  {
    bg: "rgb(230, 245, 255)",
    accent: "rgb(0, 100, 200)",
    text: "rgb(0, 25, 60)",
    border: "rgba(0, 100, 200, 0.3)",
  },
  {
    bg: "rgb(255, 248, 220)",
    accent: "rgb(180, 140, 0)",
    text: "rgb(50, 40, 5)",
    border: "rgba(180, 140, 0, 0.3)",
  },
  {
    bg: "rgb(240, 255, 245)",
    accent: "rgb(0, 170, 100)",
    text: "rgb(0, 50, 30)",
    border: "rgba(0, 170, 100, 0.3)",
  },
  {
    bg: "rgb(255, 230, 245)",
    accent: "rgb(200, 30, 130)",
    text: "rgb(60, 10, 40)",
    border: "rgba(200, 30, 130, 0.3)",
  },
];

const STATIC_TRANSLATIONS = {
  en: {
    entranceLabel: "Adachi to Shimamura",
    entranceTitle: "The Illustration Collection",
    entranceSubtitle:
      "A exhibition of official artwork spanning the complete visual history of the series.",
    statArtworks: "Artworks",
    statArtists: "Artists",
    statCollections: "Collections",
    enterExhibition: "Enter Exhibition",
    featured: "Featured",
    artist: "Artist",
    heroAlt: "Featured Artwork",
    viewerAlt: "Artwork preview",
    searchPlaceholder: "Search the collection...",
    searchGalleryAria: "Search gallery",
    filters: "Filters",
    filterAll: "All",
    filterCover: "Covers",
    filterIllustration: "Illustrations",
    filterMagazine: "Magazine",
    filterAnime: "Anime",
    filterManga: "Manga",
    filterCollaboration: "Collaboration",
    filterMerchandise: "Merchandise",
    filterSeasonal: "Seasonal",
    filterOfficial: "Official Art",
    allArtists: "All Artists",
    allCollections: "All Collections",
    viewing: "Viewing",
    clear: "Clear",
    footerLine1: "Unofficial Adachi to Shimamura fan site.",
    footerLine2: "Created by fans, non-profit.",
    footerLine3: "Adachi to Shimamura and all rights belong to Hitoma Iruma.",
    loadingExhibition: "Loading exhibition...",
    loadingGallery: "Loading gallery...",
    failedExhibition: "Failed to load exhibition",
    refreshPrompt: "Please refresh the page.",
    refreshBtn: "Refresh",
    preparingArtworks: "Preparing your artworks",
    loadingCollectionPrefix: "Loading",
    loadingCollectionStatus: "Loading {collectionName}...",
    pleaseWaitArtworks: "Please wait while we load the artworks",
    noArtworksFound: "No artworks found",
    noArtworksInCollection: "No artworks available in this collection",
    failedCollectionPrefix: "Failed to load",
    tryAgain: "Please try again.",
    retry: "Retry",
    variousArtists: "Various Artists",
    artistLabel: "Artist",
    backToExhibition: "Back to Exhibition",
    collectionDescription: "A curated selection of illustrations.",
    loadingMoreItems: "Loading {count} more items...",
    viewAllWorks: "View all works →",
    loadCollectionAction: "Load collection →",
    loadCollectionButton: "Load Collection",
    loadCollectionPrompt: 'Click "Load collection" to view artworks',
    clearAllFilters: "Clear all filters",
    worksCount: "{count} works",
    publicationLabel: "Publication",
    dateLabel: "Date",
    collectionLabel: "Collection",
    tagsLabel: "Tags",
    randomGallery: "Random Gallery",
    shuffleArtworks: "Shuffle Gallery",
    noArtistsWithBio: "No artist bios available",
  },
  es: {
    entranceLabel: "Adachi to Shimamura",
    entranceTitle: "La Colección de Ilustraciones",
    entranceSubtitle:
      "Una exhibición de arte oficial que abarca toda la historia visual de la serie.",
    statArtworks: "Obras",
    statArtists: "Artistas",
    statCollections: "Colecciones",
    enterExhibition: "Entrar a la Exhibición",
    featured: "Destacado",
    artist: "Artista",
    heroAlt: "Obra destacada",
    viewerAlt: "Vista previa de la obra",
    searchPlaceholder: "Buscar en la colección...",
    searchGalleryAria: "Buscar en la galería",
    filters: "Filtros",
    filterAll: "Todo",
    filterCover: "Portadas",
    filterIllustration: "Ilustraciones",
    filterMagazine: "Revista",
    filterAnime: "Anime",
    filterManga: "Manga",
    filterCollaboration: "Colaboración",
    filterMerchandise: "Mercancía",
    filterSeasonal: "Temporada",
    filterOfficial: "Arte Oficial",
    allArtists: "Todos los Artistas",
    allCollections: "Todas las Colecciones",
    viewing: "Viendo",
    clear: "Limpiar",
    footerLine1: "Sitio de fans no oficial de Adachi to Shimamura.",
    footerLine2: "Creado por fans, sin fines de lucro.",
    footerLine3: "Adachi to Shimamura y todos los derechos pertenecen a Hitoma Iruma.",
    loadingExhibition: "Cargando exhibición...",
    loadingGallery: "Cargando galería...",
    failedExhibition: "Error al cargar la exhibición",
    refreshPrompt: "Por favor, actualiza la página.",
    refreshBtn: "Actualizar",
    preparingArtworks: "Preparando tus obras",
    loadingCollectionPrefix: "Cargando",
    loadingCollectionStatus: "Cargando {collectionName}...",
    pleaseWaitArtworks: "Por favor, espera mientras cargamos las obras",
    noArtworksFound: "No se encontraron obras",
    noArtworksInCollection: "No hay obras disponibles en esta colección",
    failedCollectionPrefix: "Error al cargar",
    tryAgain: "Por favor, inténtalo de nuevo.",
    retry: "Reintentar",
    variousArtists: "Varios Artistas",
    artistLabel: "Artista",
    backToExhibition: "Volver a la exhibición",
    collectionDescription: "Una selección de ilustraciones.",
    loadingMoreItems: "Cargando {count} obras más...",
    viewAllWorks: "Ver todas las obras →",
    loadCollectionAction: "Cargar colección →",
    loadCollectionButton: "Cargar colección",
    loadCollectionPrompt: 'Haz clic en "Cargar colección" para ver las obras',
    clearAllFilters: "Limpiar todos los filtros",
    worksCount: "{count} obras",
    publicationLabel: "Publicación",
    dateLabel: "Fecha",
    collectionLabel: "Colección",
    tagsLabel: "Etiquetas",
    randomGallery: "Galería Aleatoria",
    shuffleArtworks: "Aleatorizar Galería",
    noArtistsWithBio: "No hay biografías de artistas disponibles",
  },
};

function getStaticText(key, params = {}) {
  const dict = STATIC_TRANSLATIONS[currentLanguage] || STATIC_TRANSLATIONS.en;
  let text = dict[key] || STATIC_TRANSLATIONS.en[key] || key;

  if (params && typeof params === "object") {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramValue));
    });
  }

  return text;
}

function applyStaticTranslations() {
  const lang = currentLanguage === "en" ? "en" : "es";
  document.querySelectorAll("[data-i18n-es]").forEach((el) => {
    el.textContent = lang === "en" ? el.dataset.i18nEn : el.dataset.i18nEs;
  });
  document.querySelectorAll("[data-i18n-placeholder-es]").forEach((el) => {
    el.placeholder = lang === "en" ? el.dataset.i18nPlaceholderEn : el.dataset.i18nPlaceholderEs;
  });
  document.querySelectorAll("[data-i18n-alt-es]").forEach((el) => {
    el.alt = lang === "en" ? el.dataset.i18nAltEn : el.dataset.i18nAltEs;
  });
  document.querySelectorAll("[data-i18n-aria-es]").forEach((el) => {
    el.setAttribute("aria-label", lang === "en" ? el.dataset.i18nAriaEn : el.dataset.i18nAriaEs);
  });
  document.documentElement.lang = lang;
}

// FIXED: Use LanguageSwitch for data URL
// eslint-disable-next-line no-unused-vars -- may be invoked from an inline onclick handler in HTML
function getCollectionDataUrl(folder, lang) {
  if (window.LanguageSwitch?.getDataUrl) {
    return window.LanguageSwitch.getDataUrl(`gallery/${folder}`, lang);
  }
  // Fallback
  return `${BASE_PATH}${folder}/${lang}.json?v=${Date.now()}`;
}

async function fetchLanguageJson(basePath, lang) {
  const version = Date.now();

  // Try using LanguageSwitch first
  if (window.LanguageSwitch?.getDataUrl) {
    try {
      const url = window.LanguageSwitch.getDataUrl(`gallery/${basePath}`, lang);
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return response;
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback to manual path construction
  const primaryUrl = `${BASE_PATH}${basePath}/${lang}.json?v=${version}`;
  let response = await fetch(primaryUrl, { cache: "no-store" });

  if (response.ok) {
    return response;
  }

  const fallbackLang = lang === "es" ? "en" : "es";
  if (fallbackLang !== lang) {
    const fallbackUrl = `${BASE_PATH}${basePath}/${fallbackLang}.json?v=${version}`;
    response = await fetch(fallbackUrl, { cache: "no-store" });
  }

  return response;
}

// ===== STATE =====
let loadedCollections = new Set();
let isLoading = false;
let allArtworksCache = [];
let loadingPromises = new Map();
let failedCollections = new Set();
let volumeMetadataLoaded = false;
let _isInitialRender = true;
let artistsData = {};
let slideshowInterval = null;
let slideshowArtworks = [];
let currentSlideIndex = 0;

// ===== CACHES =====
let searchIndex = null;
let searchIndexDirty = true;
let cachedFilteredResults = null;
let lastFilterKey = "";
let _groupedCollectionsCache = null;
let _groupedCollectionsDirty = true;
let artistListCache = null;
let collectionListCache = null;
let isRendering = false;
let pendingRender = null;
const observedElements = new WeakSet();

// ===== IMAGE CACHE =====
const imageCache = new Map();
const CACHE_LIMIT = 100;

function getCachedImage(url) {
  if (imageCache.has(url)) {
    const value = imageCache.get(url);
    imageCache.delete(url);
    imageCache.set(url, value);
    return value;
  }
  return null;
}

function setCachedImage(url, data) {
  if (imageCache.size >= CACHE_LIMIT) {
    const firstKey = imageCache.keys().next().value;
    imageCache.delete(firstKey);
  }
  imageCache.set(url, data);
}

// ===== OPTIMIZED IMAGE LOADER =====
class ImageLoader {
  constructor() {
    this.loadingQueue = [];
    this.activeLoads = 0;
    this.maxConcurrent = CONFIG.CONCURRENT_LOADS;
    this.loadPromises = new Map();
    this.observer = null;
    this.isProcessing = false;
  }

  setupObserver() {
    if (this.observer) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        const visibleImages = [];

        for (const entry of entries) {
          if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
              visibleImages.push(img);
              this.observer.unobserve(img);
            }
          }
        }

        if (visibleImages.length > 0) {
          for (const img of visibleImages) {
            this.loadImage(img, {
              priority: this.getPriority(img),
            });
          }
        }
      },
      {
        rootMargin: `${CONFIG.LAZY_OFFSET}px`,
        threshold: 0.01,
      },
    );
  }

  getPriority(img) {
    if (
      img.closest(".masonry-tall") ||
      img.closest(".masonry-featured") ||
      img.id === "heroImage"
    ) {
      return "high";
    }
    return "medium";
  }

  async loadImage(img, options = {}) {
    const { priority = "low", useCache = true } = options;

    const src = img.dataset.src || img.src;
    if (!src) return;

    if (useCache) {
      const cached = getCachedImage(src);
      if (cached) {
        this.applyImage(img, cached);
        return;
      }
    }

    if (this.loadPromises.has(src)) {
      const result = await this.loadPromises.get(src);
      if (result) {
        this.applyImage(img, result);
      }
      return;
    }

    const loadPromise = new Promise((resolve) => {
      this.loadingQueue.push({
        url: src,
        img: img,
        priority: priority,
        resolve: resolve,
      });
      this.processQueue();
    });

    this.loadPromises.set(src, loadPromise);

    try {
      const result = await loadPromise;
      if (result) {
        setCachedImage(src, result);
        this.applyImage(img, result);
      }
    } finally {
      this.loadPromises.delete(src);
    }
  }

  async processQueue() {
    if (
      this.isProcessing ||
      this.loadingQueue.length === 0 ||
      this.activeLoads >= this.maxConcurrent
    ) {
      return;
    }

    this.isProcessing = true;

    this.loadingQueue.sort((a, b) => {
      const priorityMap = { high: 3, medium: 2, low: 1 };
      return priorityMap[b.priority] - priorityMap[a.priority];
    });

    const batch = this.loadingQueue.splice(0, this.maxConcurrent - this.activeLoads);
    this.activeLoads += batch.length;

    await Promise.all(
      batch.map(async ({ url, resolve }) => {
        try {
          const result = await this.loadImageFromUrl(url);
          resolve(result);
        } catch (error) {
          console.warn("Failed to load image:", url, error);
          resolve(null);
        }
      }),
    );

    this.activeLoads -= batch.length;
    this.isProcessing = false;

    if (this.loadingQueue.length > 0) {
      setTimeout(() => this.processQueue(), 50);
    }
  }

  loadImageFromUrl(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";

      img.onload = () => {
        resolve(img);
      };
      img.onerror = () => {
        resolve(null);
      };

      img.src = url;
    });
  }

  applyImage(img, imageData) {
    if (!imageData) {
      const src = img.dataset.src || img.src;
      if (src) {
        img.src = src;
        if (img.dataset.src) img.removeAttribute("data-src");
        img.style.opacity = "1";
      }
      return;
    }

    const src = imageData.src || imageData.currentSrc;
    if (src) {
      img.src = src;
      if (img.dataset.src) img.removeAttribute("data-src");
    }

    img.style.opacity = "0";
    img.style.transition = "opacity 0.3s ease";

    requestAnimationFrame(() => {
      img.style.opacity = "1";
    });
  }
}

const imageLoader = new ImageLoader();

// ===== SHOW LOADING STATE =====
function showLoadingState() {
  const container = document.getElementById("exhibitionSectionsContainer");
  if (!container) return;
  container.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>${getStaticText("loadingExhibition")}</p>
        </div>
    `;
}

// ===== GENERATE PLACEHOLDER =====
function generatePlaceholder() {
  return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23f0f0f0"/%3E%3C/svg%3E';
}

// ===== BUILD SEARCH INDEX =====
function buildSearchIndex(artworks) {
  const index = new Map();
  for (let i = 0; i < artworks.length; i++) {
    const item = artworks[i];
    const searchable = [
      item.title || "",
      item.artist || "",
      item.publication || "",
      item.collection || "",
      ...(item.tags || []),
    ]
      .join(" ")
      .toLowerCase();
    index.set(i, searchable);
  }
  return index;
}

// ===== LOAD ALL COLLECTIONS =====
async function loadAllCollections(lang) {
  const allLoadPromises = [];

  for (const vol of VOLUME_DEFINITIONS) {
    if (!vol.enabled) continue;
    const fullKey = `full-${vol.path}-${lang}`;
    if (!loadedCollections.has(fullKey) && !loadingPromises.has(fullKey)) {
      const loadPromise = (async () => {
        try {
          const response = await fetchLanguageJson(`illustrations/${vol.path}`, lang);
          if (!response.ok) return null;
          const data = await response.json();
          if (!data.artworks || !Array.isArray(data.artworks) || data.artworks.length === 0) {
            return null;
          }

          if (data.artists) {
            Object.assign(artistsData, data.artists);
          }

          const processedArtworks = data.artworks.map((art, index) => {
            const processed = normalizeArtworkMetadata({ ...art });
            if (!processed.type) processed.type = "illustration";
            processed.collection = vol.label;
            if (!processed.uniqueId) {
              processed.uniqueId = `${vol.path}-${processed.id || index}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
            }
            if (
              processed.image &&
              !processed.image.startsWith("http") &&
              !processed.image.startsWith("/")
            ) {
              const imagePath = processed.image.startsWith("./")
                ? processed.image.substring(2)
                : processed.image;
              processed.image = `${BASE_PATH}illustrations/${vol.path}/${imagePath}`;
            }
            if (!Array.isArray(processed.tags)) {
              processed.tags = [];
            }
            if (!processed.tags.includes("illustration")) {
              processed.tags.push("illustration");
            }
            return processed;
          });

          loadedCollections.add(fullKey);
          return processedArtworks;
        } catch (e) {
          console.error(`Error loading ${vol.path}:`, e);
          return null;
        }
      })();
      allLoadPromises.push(loadPromise);
    }
  }

  for (const def of COLLECTION_DEFINITIONS) {
    const key = `${def.folder}-${lang}`;
    if (
      !loadedCollections.has(key) &&
      !failedCollections.has(def.folder) &&
      !loadingPromises.has(key)
    ) {
      const loadPromise = (async () => {
        try {
          const response = await fetchLanguageJson(def.folder, lang);
          if (!response.ok) {
            failedCollections.add(def.folder);
            return null;
          }
          const data = await response.json();
          if (!data.artworks || !Array.isArray(data.artworks)) {
            failedCollections.add(def.folder);
            return null;
          }

          if (data.artists) {
            Object.assign(artistsData, data.artists);
          }

          const processedArtworks = data.artworks.map((art) => {
            const processed = normalizeArtworkMetadata({ ...art });
            if (!processed.type) processed.type = def.type || def.folder.slice(0, -1);
            if (!processed.uniqueId) {
              processed.uniqueId = `${def.type || def.folder}-${processed.id || Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
            }
            if (!processed.collection) {
              processed.collection = def.label;
            }
            return processed;
          });

          loadedCollections.add(key);
          return processedArtworks;
        } catch (e) {
          console.error(`Error loading ${def.folder}:`, e);
          failedCollections.add(def.folder);
          return null;
        }
      })();
      allLoadPromises.push(loadPromise);
    }
  }

  if (allLoadPromises.length > 0) {
    const results = await Promise.all(allLoadPromises);
    let newArtworks = [];
    results.forEach((artworks) => {
      if (artworks && artworks.length > 0) {
        newArtworks = newArtworks.concat(artworks);
      }
    });

    if (newArtworks.length > 0) {
      allArtworksCache = allArtworksCache.concat(newArtworks);

      if (galleryData) {
        galleryData.artworks = allArtworksCache;
        galleryData.artists = artistsData;
      }

      searchIndex = buildSearchIndex(allArtworksCache);
      searchIndexDirty = false;
      _groupedCollectionsDirty = true;
      cachedFilteredResults = null;

      return true;
    }
  }
  return false;
}

// ===== GET RANDOM ARTWORKS =====
function getRandomArtworks(artworks, count = CONFIG.RANDOM_DISPLAY_COUNT) {
  if (!artworks || artworks.length === 0) return [];

  const realArtworks = artworks.filter((art) => !art.placeholder);

  if (realArtworks.length === 0) return [];

  const shuffled = [...realArtworks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ===== GET FILTERED ARTWORKS =====
function getFilteredArtworks() {
  if (!galleryData) return [];

  const filterKey = `${currentFilter}|${currentArtist}|${currentCollection}|${searchQuery}`;
  if (cachedFilteredResults && lastFilterKey === filterKey) {
    return cachedFilteredResults;
  }

  lastFilterKey = filterKey;
  let artworks = galleryData.artworks;

  if (
    currentFilter === "all" &&
    currentArtist === "all" &&
    currentCollection === "all" &&
    !searchQuery
  ) {
    const result = artworks.filter((art) => !art.placeholder);
    cachedFilteredResults = result;
    return result;
  }

  const filtered = [];
  const query = searchQuery ? searchQuery.toLowerCase() : null;
  const normalizedFilter = normalizeFilterValue(currentFilter);

  for (let i = 0; i < artworks.length; i++) {
    const item = artworks[i];

    if (item.placeholder) continue;

    if (currentFilter !== "all") {
      const normalizedItemType = normalizeFilterValue(item.type);
      const normalizedItemTags = Array.isArray(item.tags)
        ? item.tags.map((tag) => normalizeFilterValue(tag))
        : [];
      const typeMatches = normalizedItemType === normalizedFilter;
      const tagMatches = normalizedItemTags.includes(normalizedFilter);

      if (!typeMatches && !tagMatches) {
        continue;
      }

      if (normalizedFilter === "illustration" && !isVolumeCollection(item.collection)) {
        continue;
      }
    }
    if (currentArtist !== "all" && item.artist !== currentArtist) continue;
    if (currentCollection !== "all" && item.collection !== currentCollection) continue;

    if (query && searchIndex) {
      const searchText = searchIndex.get(i);
      if (!searchText || !searchText.includes(query)) continue;
    }

    filtered.push(item);
  }

  cachedFilteredResults = filtered;
  return filtered;
}

// ===== OPTIMIZED IMAGE HTML =====
function getOptimizedImageHTML(artwork, _type = "grid") {
  if (!artwork || !artwork.image) return "";

  const originalSrc = artwork.image;
  const placeholder = generatePlaceholder();

  return `
        <img
            data-src="${originalSrc}"
            src="${placeholder}"
            alt="${artwork.title || "Artwork"}"
            loading="lazy"
            decoding="async"
            style="display:block;width:100%;height:100%;object-fit:cover;object-position:center top;opacity:1;transition:opacity 0.3s ease;background:#f0f0f0;"
            onload="this.style.opacity='1';this.style.background='transparent';"
            onerror="this.src='${originalSrc}';this.dataset.src='${originalSrc}';this.style.opacity='1';"
        >
    `;
}

// ===== OBSERVE IMAGES =====
function observeImagesOptimized(container) {
  if (!container) return;

  const images = container.querySelectorAll("img[data-src]");
  if (images.length === 0) return;

  imageLoader.setupObserver();

  for (const img of images) {
    if (!observedElements.has(img)) {
      imageLoader.observer.observe(img);
      observedElements.add(img);
    }
  }
}

// ===== PRELOAD VISIBLE IMAGES =====
function preloadVisibleImages(container) {
  const images = container.querySelectorAll("img[data-src]");
  const visibleImages = [];

  for (const img of images) {
    const rect = img.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      visibleImages.push(img);
    }
  }

  const toLoad = visibleImages.slice(0, CONFIG.INITIAL_LOAD_COUNT);
  for (const img of toLoad) {
    imageLoader.loadImage(img, { priority: "high" });
  }

  const remaining = visibleImages.slice(CONFIG.INITIAL_LOAD_COUNT);
  if (remaining.length > 0) {
    setTimeout(() => {
      for (const img of remaining) {
        imageLoader.loadImage(img, { priority: "medium" });
      }
    }, 500);
  }
}

// ===== BUILD COMBINED ITEMS WITH ARTIST BIOS =====
function buildCombinedItems(artworks) {
  if (!artworks || artworks.length === 0) return [];

  const artistGroups = new Map();
  for (const item of artworks) {
    if (!artistGroups.has(item.artist)) {
      artistGroups.set(item.artist, []);
    }
    artistGroups.get(item.artist).push(item);
  }

  const artistNames = Array.from(artistGroups.keys());

  const artistsWithBio = artistNames.filter((name) => {
    return !!artistsData[name]?.bio;
  });

  const artistColorMap = new Map();
  artistsWithBio.forEach((name, index) => {
    artistColorMap.set(name, COLOR_PALETTES[index % COLOR_PALETTES.length]);
  });

  const sorted = [...artworks].sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return 0;
  });

  const totalItems = sorted.length;
  const bioCount = artistsWithBio.length;
  let combinedItems = [];

  if (bioCount > 0 && totalItems > 2) {
    let itemIndex = 0;
    let bioIndex = 0;

    const totalSlots = totalItems + bioCount;
    const spacing = Math.floor(totalSlots / (bioCount + 1));
    const bioPositions = [];

    for (let i = 1; i <= bioCount; i++) {
      bioPositions.push(Math.min(i * spacing, totalSlots - 1));
    }

    let position = 0;

    while (itemIndex < totalItems || bioIndex < bioCount) {
      if (bioIndex < bioCount && bioPositions[bioIndex] === position) {
        const artistName = artistsWithBio[bioIndex];
        const artistInfo = artistsData[artistName] || null;
        combinedItems.push({
          type: "artist",
          artist: artistName,
          info: artistInfo,
          colorMap: artistColorMap.get(artistName),
        });
        bioIndex++;
        position++;
        continue;
      }

      if (itemIndex < totalItems) {
        combinedItems.push({ type: "artwork", item: sorted[itemIndex] });
        itemIndex++;
        position++;
      } else if (bioIndex < bioCount) {
        const artistName = artistsWithBio[bioIndex];
        const artistInfo = artistsData[artistName] || null;
        combinedItems.push({
          type: "artist",
          artist: artistName,
          info: artistInfo,
          colorMap: artistColorMap.get(artistName),
        });
        bioIndex++;
      }
    }
  } else {
    sorted.forEach((item) => combinedItems.push({ type: "artwork", item }));
  }

  return combinedItems;
}

// ===== RENDER MASONRY ITEM =====
function renderMasonryItem(entry) {
  if (entry.type === "artwork") {
    const item = entry.item;
    const heights = ["masonry-tall", "masonry-medium", "masonry-standard"];
    const heightClass = item.featured
      ? "masonry-tall"
      : heights[Math.floor(Math.random() * heights.length)];
    const colorIndex = Math.abs(item.id || 0) % COLOR_PALETTES.length;
    const colors = COLOR_PALETTES[colorIndex];
    const accentColor = colors.accent;
    const bgColor = colors.bg;
    const textColor = colors.text;
    const borderColor = colors.border;

    return `
      <div class="masonry-item ${heightClass}" data-artwork="${item.uniqueId}" style="border:2px solid ${borderColor};background:${bgColor};">
        <div class="masonry-artwork">
          ${getOptimizedImageHTML(item, "grid")}
          <div class="masonry-label" style="background:${bgColor};border-top:2px solid ${borderColor};">
            <span class="masonry-title" style="color:${textColor};">${item.title}</span>
            <span class="masonry-artist" style="color:${accentColor};font-weight:700;">${item.artist}</span>
            <span class="masonry-collection" style="color:${textColor}80;font-size:11px;display:block;margin-top:2px;">${item.collection}</span>
          </div>
        </div>
      </div>
    `;
  } else if (entry.type === "artist") {
    const colors = entry.colorMap || COLOR_PALETTES[0];
    const accentColor = colors.accent;
    const textColor = colors.text;
    const bgColor = colors.bg;
    const borderColor = colors.border;

    return `
      <div class="masonry-item masonry-bio" style="background:${bgColor};border:2px solid ${borderColor};">
        <div class="masonry-bio-content">
          <span class="masonry-bio-label" style="color:${accentColor};">${getStaticText("artistLabel")}</span>
          <h3 class="masonry-bio-name" style="color:${textColor};">${entry.artist}</h3>
          <p class="masonry-bio-text" style="color:${textColor};">${entry.info?.bio || ""}</p>
          ${entry.info?.website ? `<a href="${entry.info.website}" target="_blank" style="color:${accentColor};font-size:13px;text-decoration:none;display:inline-block;margin-top:8px;font-weight:600;">${entry.info.website}</a>` : ""}
        </div>
      </div>
    `;
  }
  return "";
}

// ===== RENDER RANDOM MASONRY GALLERY =====
function renderRandomMasonryGallery() {
  const container = document.getElementById("exhibitionSectionsContainer");
  if (!container) return;

  const allArtworks = galleryData ? galleryData.artworks : [];
  const randomArtworks = getRandomArtworks(allArtworks, CONFIG.RANDOM_DISPLAY_COUNT);

  if (randomArtworks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fas fa-images"></i></div>
        <h3>${getStaticText("noArtworksFound")}</h3>
        <p>${getStaticText("refreshPrompt")}</p>
      </div>
    `;
    return;
  }

  // Set up slideshow with artworks that have images
  const slideshowCandidates = randomArtworks.filter((a) => a.image && !a.placeholder);
  if (slideshowCandidates.length > 0) {
    startSlideshow(slideshowCandidates);
  }

  const heroArtwork = randomArtworks.find((a) => a.featured) || randomArtworks[0];
  updateHeroImageOptimized(heroArtwork);

  const combinedItems = buildCombinedItems(randomArtworks);

  const firstBatch = combinedItems.slice(0, CONFIG.COLLECTION_BATCH_SIZE);
  const remainingItems = combinedItems.slice(CONFIG.COLLECTION_BATCH_SIZE);

  let html = `
    <div class="random-gallery-controls">
      <h2 class="random-gallery-title">${getStaticText("randomGallery")}</h2>
      <button class="shuffle-btn" onclick="shuffleGallery()">
        <i class="fas fa-random"></i> ${getStaticText("shuffleArtworks")}
      </button>
    </div>
    <div class="masonry-grid" id="masonryGrid">
  `;

  for (const entry of firstBatch) {
    html += renderMasonryItem(entry);
  }

  html += `</div>`;

  if (remainingItems.length > 0) {
    html += `<div class="masonry-loading-more" id="masonryLoadingMore">${getStaticText("loadingMoreItems", { count: remainingItems.length })}</div>`;
  }

  container.innerHTML = html;

  observeImagesOptimized(container);
  preloadVisibleImages(container);

  if (remainingItems.length > 0) {
    loadRemainingMasonryItems(remainingItems, container);
  }
}

// ===== SLIDESHOW FUNCTIONS =====
function startSlideshow(artworks) {
  // Clear any existing interval
  if (slideshowInterval) {
    clearInterval(slideshowInterval);
    slideshowInterval = null;
  }

  slideshowArtworks = artworks;
  currentSlideIndex = 0;

  // Update hero with first artwork
  if (artworks.length > 0) {
    updateHeroImageOptimized(artworks[0]);
  }

  // Start the interval
  slideshowInterval = setInterval(() => {
    if (slideshowArtworks.length === 0) return;

    currentSlideIndex = (currentSlideIndex + 1) % slideshowArtworks.length;
    const artwork = slideshowArtworks[currentSlideIndex];

    // Fade transition effect
    const heroImg = document.getElementById("heroImage");
    if (heroImg && artwork) {
      heroImg.style.opacity = "0";
      setTimeout(() => {
        updateHeroImageOptimized(artwork);
        heroImg.style.opacity = "1";
      }, 300);
    }
  }, CONFIG.SLIDESHOW_INTERVAL);
}

function stopSlideshow() {
  if (slideshowInterval) {
    clearInterval(slideshowInterval);
    slideshowInterval = null;
  }
}

// ===== LOAD REMAINING MASONRY ITEMS =====
function loadRemainingMasonryItems(items, container) {
  const batchSize = CONFIG.COLLECTION_BATCH_SIZE;
  let currentIndex = 0;
  const masonryContainer = container.querySelector(".masonry-grid");
  const loadingMore = document.getElementById("masonryLoadingMore");

  function loadNextBatch() {
    const endIndex = Math.min(currentIndex + batchSize, items.length);
    const batch = items.slice(currentIndex, endIndex);

    let batchHTML = "";
    for (const entry of batch) {
      batchHTML += renderMasonryItem(entry);
    }

    if (masonryContainer) {
      masonryContainer.innerHTML += batchHTML;
    }

    currentIndex = endIndex;

    if (loadingMore) {
      const remaining = items.length - currentIndex;
      if (remaining > 0) {
        loadingMore.textContent = getStaticText("loadingMoreItems", {
          count: remaining,
        });
      } else {
        loadingMore.style.display = "none";
      }
    }

    observeImagesOptimized(container);

    setTimeout(() => preloadVisibleImages(container), 100);

    if (currentIndex < items.length) {
      if ("requestIdleCallback" in window) {
        requestIdleCallback(() => loadNextBatch(), { timeout: 200 });
      } else {
        setTimeout(loadNextBatch, 200);
      }
    }
  }

  setTimeout(loadNextBatch, 300);
}

// ===== SHUFFLE GALLERY =====
function shuffleGallery() {
  const container = document.getElementById("exhibitionSectionsContainer");
  if (!container) return;

  container.style.opacity = "0";
  container.style.transition = "opacity 0.3s ease";

  setTimeout(() => {
    renderRandomMasonryGallery();
    container.style.opacity = "1";
  }, 300);
}

// ===== RENDER COLLECTION PROGRESSIVELY =====
function renderCollectionProgressively(collectionName) {
  const container = document.getElementById("exhibitionSectionsContainer");
  if (!container) return;

  cachedFilteredResults = null;

  const allItems = getFilteredArtworks();
  const realItems = allItems.filter((art) => !art.placeholder);

  if (realItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fas fa-search"></i></div>
        <h3>${getStaticText("noArtworksFound")}</h3>
        <p>${getStaticText("noArtworksInCollection")}</p>
        <button class="empty-clear-btn" onclick="restoreMainExhibition()">${getStaticText("backToExhibition")}</button>
      </div>
    `;
    return;
  }

  // Stop slideshow when viewing a collection
  stopSlideshow();

  const heroArtwork = realItems.find((a) => a.featured) || realItems[0];
  updateHeroImageOptimized(heroArtwork);

  const combinedItems = buildCombinedItems(realItems);

  const firstBatch = combinedItems.slice(0, CONFIG.COLLECTION_BATCH_SIZE);
  const remainingItems = combinedItems.slice(CONFIG.COLLECTION_BATCH_SIZE);

  let html = `
    <div class="collection-view-header">
      <button class="collection-view-back" onclick="restoreMainExhibition()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        ${getStaticText("backToExhibition")}
      </button>
      <h2 class="collection-view-title">${getCollectionDisplayName(collectionName)}</h2>
      <span class="collection-view-count">${getStaticText("worksCount", { count: realItems.length })}</span>
      <p class="collection-view-description">${getStaticText("collectionDescription")}</p>
    </div>
    <div class="masonry-grid" id="masonryGrid">
  `;

  for (const entry of firstBatch) {
    html += renderMasonryItem(entry);
  }

  html += `</div>`;

  if (remainingItems.length > 0) {
    html += `<div class="masonry-loading-more" id="masonryLoadingMore">${getStaticText("loadingMoreItems", { count: remainingItems.length })}</div>`;
  }

  container.innerHTML = html;

  observeImagesOptimized(container);
  preloadVisibleImages(container);

  if (remainingItems.length > 0) {
    loadRemainingMasonryItems(remainingItems, container);
  }
}

// ===== RENDER FILTERED MASONRY =====
function renderFilteredMasonry(items) {
  const container = document.getElementById("exhibitionSectionsContainer");
  if (!container) return;

  // Stop slideshow when filtering
  stopSlideshow();

  const heroArtwork = items.find((a) => a.featured) || items[0];
  updateHeroImageOptimized(heroArtwork);

  const combinedItems = buildCombinedItems(items);

  const firstBatch = combinedItems.slice(0, CONFIG.COLLECTION_BATCH_SIZE);
  const remainingItems = combinedItems.slice(CONFIG.COLLECTION_BATCH_SIZE);

  let html = `
    <div class="filtered-grid-header">
      <h2 class="filtered-grid-title">${getStaticText("viewing")} ${items.length} ${getStaticText("worksCount", { count: "" }).trim()}</h2>
      <button class="clear-filters-btn" onclick="clearFilters()">${getStaticText("clearAllFilters")}</button>
    </div>
    <div class="masonry-grid" id="masonryGrid">
  `;

  for (const entry of firstBatch) {
    html += renderMasonryItem(entry);
  }

  html += `</div>`;

  if (remainingItems.length > 0) {
    html += `<div class="masonry-loading-more" id="masonryLoadingMore">${getStaticText("loadingMoreItems", { count: remainingItems.length })}</div>`;
  }

  container.innerHTML = html;

  observeImagesOptimized(container);
  preloadVisibleImages(container);

  if (remainingItems.length > 0) {
    loadRemainingMasonryItems(remainingItems, container);
  }
}

// ===== UPDATE HERO IMAGE =====
function updateHeroImageOptimized(artwork) {
  const heroImg = document.getElementById("heroImage");
  const heroTitle = document.getElementById("heroTitle");
  const heroArtist = document.getElementById("heroArtist");

  if (!heroImg || !artwork) {
    console.warn("Hero image or artwork not found");
    return;
  }

  if (artwork.image) {
    heroImg.src = artwork.image;
    heroImg.alt = artwork.title || getStaticText("heroAlt");
    heroImg.style.opacity = "0";

    heroImg.onload = () => {
      heroImg.style.opacity = "1";
      heroImg.style.transition = "opacity 0.5s ease";
    };

    heroImg.onerror = () => {
      if (artwork.fallbackImage) {
        heroImg.src = artwork.fallbackImage;
      } else {
        heroImg.style.opacity = "1";
        heroImg.alt = "Image not available";
      }
    };
  }

  if (heroTitle) {
    heroTitle.textContent = artwork.title || getStaticText("featured");
  }

  if (heroArtist) {
    heroArtist.textContent = artwork.artist || getStaticText("artist");
  }
}

// ===== RENDER EXHIBITION =====
async function renderExhibitionIncremental() {
  if (isRendering) {
    if (!pendingRender) {
      pendingRender = requestAnimationFrame(() => {
        pendingRender = null;
        isRendering = false;
        performIncrementalRender();
      });
    }
    return;
  }
  await performIncrementalRender();
}

async function performIncrementalRender() {
  isRendering = true;
  const container = document.getElementById("exhibitionSectionsContainer");
  if (!container) {
    isRendering = false;
    return;
  }

  if (!volumeMetadataLoaded || Object.keys(artistsData).length === 0) {
    await loadAllCollections(currentLanguage);
    volumeMetadataLoaded = true;
  }

  updateBreadcrumb();
  populateFilters();
  updateStats();

  const allItems = getFilteredArtworks();

  if (currentCollection !== "all") {
    renderCollectionProgressively(currentCollection);
    isRendering = false;
    return;
  }

  if (currentFilter === "illustration") {
    renderIllustrationVolumeGroups(allItems);
    isRendering = false;
    return;
  }

  if (searchQuery || currentFilter !== "all" || currentArtist !== "all") {
    if (allItems.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="fas fa-search"></i></div>
          <h3>${getStaticText("noArtworksFound")}</h3>
          <p>${getStaticText("refreshPrompt")}</p>
          <button class="empty-clear-btn" onclick="clearFilters()">${getStaticText("clearAllFilters")}</button>
        </div>
      `;
      isRendering = false;
      return;
    }

    renderFilteredMasonry(allItems);
    isRendering = false;
    return;
  }

  renderRandomMasonryGallery();
  isRendering = false;
}

// ===== EVENT DELEGATION =====
function setupEventDelegation() {
  const container = document.getElementById("exhibitionSectionsContainer");
  if (!container) return;

  container.addEventListener(
    "click",
    function (e) {
      const target = e.target.closest("[data-artwork]");
      if (target) {
        const artworkId = target.dataset.artwork;
        if (artworkId && !artworkId.startsWith("placeholder-")) {
          openViewer(artworkId);
        }
        return;
      }

      const collectionBtn = e.target.closest("[data-collection]");
      if (collectionBtn) {
        const collectionName = collectionBtn.dataset.collection;
        if (collectionName) {
          e.preventDefault();
          filterByCollection(collectionName);
          return;
        }
      }
    },
    { passive: false },
  );
}

// ===== VIEWER FUNCTIONS =====
function openViewer(uniqueId) {
  if (!galleryData) return;

  if (!uniqueId || uniqueId.startsWith("placeholder-")) {
    console.warn("Invalid artwork ID:", uniqueId);
    return;
  }

  const allItems = getFilteredArtworks();
  let index = allItems.findIndex((a) => a.uniqueId === uniqueId);
  let item = null;

  if (index === -1) {
    const fallbackIndex = galleryData.artworks.findIndex((a) => a.uniqueId === uniqueId);
    if (fallbackIndex !== -1) {
      _viewerItems = galleryData.artworks;
      _currentViewerIndex = fallbackIndex;
      item = galleryData.artworks[fallbackIndex];
    } else {
      console.warn("Artwork not found:", uniqueId);
      return;
    }
  } else {
    _viewerItems = allItems;
    _currentViewerIndex = index;
    item = allItems[index];
  }

  if (!item || item.placeholder) {
    console.warn("Cannot open viewer for placeholder item");
    return;
  }

  openViewerWithItem(item);
}

function openViewerWithItem(item) {
  const viewer = document.getElementById("artworkViewer");
  if (!viewer) {
    console.error("Viewer element not found");
    return;
  }

  const image = document.getElementById("viewerImage");
  const imageWrap = document.querySelector(".viewer-image-wrap");
  const loader = document.getElementById("viewerImageLoader");
  const title = document.getElementById("plaqueTitle");
  const artist = document.getElementById("plaqueArtist");

  if (!image || !title || !artist) {
    console.error("Required viewer elements missing");
    return;
  }

  const showImage = () => {
    if (loader) loader.style.display = "none";
    image.style.opacity = "1";
    image.style.transition = "opacity 0.4s ease";
    image.style.width = "auto";
    image.style.height = "auto";
    image.style.maxWidth = "100%";
    image.style.maxHeight = "100%";
    image.style.objectFit = "contain";
    image.style.objectPosition = "center center";
    if (imageWrap) {
      imageWrap.style.opacity = "1";
      imageWrap.style.transform = "scale(1) translateY(0)";
    }
  };

  if (loader) loader.style.display = "flex";

  image.style.opacity = "0";
  image.src = item.image;
  image.alt = item.title || "Artwork";

  if (image.complete && image.naturalWidth > 0) {
    showImage();
  } else {
    image.onload = () => {
      showImage();
    };
  }

  image.onerror = () => {
    if (loader) loader.style.display = "none";
    image.style.opacity = "1";
    if (imageWrap) {
      imageWrap.style.opacity = "1";
      imageWrap.style.transform = "scale(1) translateY(0)";
    }
    if (item.fallbackImage) {
      image.src = item.fallbackImage;
    }
  };

  title.textContent = item.title || "Untitled";
  artist.textContent = item.artist || "Unknown Artist";

  viewer.classList.add("open");
  document.body.classList.add("modal-open");
  document.body.style.overflow = "hidden";
}

function closeViewer() {
  const viewer = document.getElementById("artworkViewer");
  if (viewer) {
    viewer.classList.remove("open");
  }
  document.body.classList.remove("modal-open");
  document.body.style.overflow = "";
}

// ===== FILTER FUNCTIONS =====
function filterByCollection(collectionName) {
  if (currentCollection === collectionName) return;

  currentCollection = collectionName;
  document.getElementById("collectionFilter").value = collectionName;
  currentFilter = "all";
  document.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
  document.querySelector('.filter-pill[data-filter="all"]')?.classList.add("active");
  document.getElementById("artistFilter").value = "all";
  currentArtist = "all";
  searchQuery = "";
  document.getElementById("gallerySearch").value = "";
  document.getElementById("searchClearBtn")?.classList.remove("visible");

  cachedFilteredResults = null;
  _groupedCollectionsDirty = true;
  _isInitialRender = true;
  lastFilterKey = "";

  renderExhibitionIncremental();

  setTimeout(() => {
    document.getElementById("exhibitionSections")?.scrollIntoView({ behavior: "smooth" });
  }, 100);
}

function restoreMainExhibition() {
  currentCollection = "all";
  currentFilter = "all";
  currentArtist = "all";
  searchQuery = "";

  document.getElementById("collectionFilter").value = "all";
  document.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
  document.querySelector('.filter-pill[data-filter="all"]')?.classList.add("active");
  document.getElementById("artistFilter").value = "all";
  document.getElementById("gallerySearch").value = "";
  document.getElementById("searchClearBtn")?.classList.remove("visible");

  cachedFilteredResults = null;
  _groupedCollectionsDirty = true;
  _isInitialRender = true;
  lastFilterKey = "";

  renderExhibitionIncremental();

  setTimeout(() => {
    document
      .getElementById("exhibitionSections")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
}

function clearFilters() {
  currentCollection = "all";
  currentFilter = "all";
  currentArtist = "all";
  searchQuery = "";

  document.getElementById("collectionFilter").value = "all";
  document.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
  document.querySelector('.filter-pill[data-filter="all"]')?.classList.add("active");
  document.getElementById("artistFilter").value = "all";
  document.getElementById("gallerySearch").value = "";
  document.getElementById("searchClearBtn")?.classList.remove("visible");

  cachedFilteredResults = null;
  _groupedCollectionsDirty = true;
  _isInitialRender = true;
  lastFilterKey = "";

  renderExhibitionIncremental();
}

function updateBreadcrumb() {
  const breadcrumb = document.getElementById("filterBreadcrumb");
  const value = document.getElementById("breadcrumbValue");
  if (!breadcrumb || !value) return;

  if (currentCollection !== "all") {
    breadcrumb.style.display = "flex";
    value.textContent = currentCollection;
  } else if (currentFilter !== "all") {
    breadcrumb.style.display = "flex";
    const filterKey = `filter${currentFilter.charAt(0).toUpperCase()}${currentFilter.slice(1)}`;
    value.textContent = getStaticText(filterKey) || currentFilter;
  } else if (currentArtist !== "all") {
    breadcrumb.style.display = "flex";
    value.textContent = currentArtist;
  } else if (searchQuery) {
    breadcrumb.style.display = "flex";
    value.textContent = `"${searchQuery}"`;
  } else {
    breadcrumb.style.display = "none";
  }
}

// ===== UI HELPER FUNCTIONS =====
function updateUIText() {
  applyStaticTranslations();
  if (!translations) return;
  const searchInput = document.getElementById("gallerySearch");
  if (searchInput) {
    searchInput.placeholder = translations.searchPlaceholder || getStaticText("searchPlaceholder");
  }
}

function updateLangLabel(lang) {
  const labelEl = document.getElementById("langSelectedLabel");
  document.querySelectorAll(".lang-option").forEach((opt) => {
    opt.classList.toggle("selected", opt.dataset.lang === lang);
    if (opt.dataset.lang === lang && labelEl) {
      labelEl.textContent = opt.dataset.label;
    }
  });
}

// eslint-disable-next-line no-unused-vars -- may be invoked from an inline onclick handler in HTML
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString(currentLanguage === "en" ? "en-US" : "es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function updateStats() {
  if (!galleryData) return;
  const realArtworks = galleryData.artworks.filter((art) => !art.placeholder);
  const totalEl = document.getElementById("totalArtworks");
  const artistEl = document.getElementById("artistCount");
  const collectionEl = document.getElementById("collectionCount");
  if (totalEl) totalEl.textContent = realArtworks.length;
  if (artistEl) artistEl.textContent = new Set(realArtworks.map((a) => a.artist)).size;
  if (collectionEl) collectionEl.textContent = new Set(realArtworks.map((a) => a.collection)).size;
}

function populateFilters() {
  if (!galleryData) return;
  const realArtworks = galleryData.artworks.filter((art) => !art.placeholder);

  let artistListChanged = false;
  if (!artistListCache) {
    artistListCache = [...new Set(realArtworks.map((a) => a.artist))].sort();
    artistListChanged = true;
  }

  let collectionListChanged = false;
  if (!collectionListCache) {
    const volumeCollections = VOLUME_DEFINITIONS.map((v) => v.label);
    const regularCollections = [...new Set(realArtworks.map((a) => a.collection))];
    collectionListCache = [...new Set([...regularCollections, ...volumeCollections])].sort();
    collectionListChanged = true;
  }

  const artistSelect = document.getElementById("artistFilter");
  if (artistSelect && artistListChanged) {
    const previousValue = artistSelect.value;
    artistSelect.innerHTML = `<option value="all">${getStaticText("allArtists")}</option>`;
    artistListCache.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a;
      opt.textContent = a;
      artistSelect.appendChild(opt);
    });
    artistSelect.value = artistListCache.includes(previousValue) ? previousValue : "all";
  }

  const collectionSelect = document.getElementById("collectionFilter");
  if (collectionSelect && collectionListChanged) {
    const previousValue = collectionSelect.value;
    collectionSelect.innerHTML = `<option value="all">${getStaticText("allCollections")}</option>`;
    collectionListCache.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = getCollectionDisplayName(c);
      collectionSelect.appendChild(opt);
    });
    collectionSelect.value = collectionListCache.includes(previousValue) ? previousValue : "all";
  }
}

function showErrorState() {
  const container = document.getElementById("exhibitionSectionsContainer");
  if (container) {
    container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <h3>${getStaticText("failedExhibition")}</h3>
                <p>${getStaticText("refreshPrompt")}</p>
                <button onclick="location.reload()" class="refresh-btn">${getStaticText("refreshBtn")}</button>
            </div>
        `;
  }
}

// ===== LOAD GALLERY DATA =====
async function loadGalleryData(lang, initialLoad = true) {
  if (isLoading) return;
  isLoading = true;
  showLoadingState();

  try {
    let uiText = null;
    let _artists = null;

    cachedFilteredResults = null;
    _groupedCollectionsDirty = true;
    artistListCache = null;
    collectionListCache = null;

    if (initialLoad) {
      searchIndex = null;
      searchIndexDirty = true;
      imageCache.clear();
      _isInitialRender = true;
    }

    await loadAllCollections(lang);

    if (allArtworksCache.length === 0) {
      throw new Error("No artwork data loaded");
    }

    galleryData = {
      artworks: allArtworksCache,
      uiText: uiText || {},
      artists: artistsData,
    };
    translations = galleryData.uiText;

    if (searchIndexDirty || !searchIndex) {
      searchIndex = buildSearchIndex(allArtworksCache);
      searchIndexDirty = false;
    }

    updateUIText();
    populateFilters();
    updateStats();
    updateLangLabel(lang);

    const firstFeatured = allArtworksCache.find((a) => a.featured);
    if (firstFeatured) {
      updateHeroImageOptimized(firstFeatured);
    }

    // Start slideshow with featured and random artworks
    const slideshowCandidates = allArtworksCache.filter((a) => a.image && !a.placeholder);
    if (slideshowCandidates.length > 0) {
      startSlideshow(slideshowCandidates);
    }

    renderExhibitionIncremental();
  } catch (error) {
    console.error("Failed to load exhibition:", error);
    showErrorState();
  } finally {
    isLoading = false;
  }
}

// ===== SETUP FUNCTIONS =====
function setupFilters() {
  document.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.addEventListener(
      "click",
      async function () {
        document.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
        this.classList.add("active");
        currentFilter = this.dataset.filter;
        cachedFilteredResults = null;
        _groupedCollectionsDirty = true;
        _isInitialRender = true;
        lastFilterKey = "";
        await renderExhibitionIncremental();
      },
      { passive: true },
    );
  });

  const artistFilter = document.getElementById("artistFilter");
  if (artistFilter) {
    artistFilter.addEventListener(
      "change",
      async function () {
        currentArtist = this.value;
        cachedFilteredResults = null;
        _groupedCollectionsDirty = true;
        _isInitialRender = true;
        lastFilterKey = "";
        await renderExhibitionIncremental();
      },
      { passive: true },
    );
  }

  const collectionFilter = document.getElementById("collectionFilter");
  if (collectionFilter) {
    collectionFilter.addEventListener(
      "change",
      async function () {
        currentCollection = this.value;
        cachedFilteredResults = null;
        _groupedCollectionsDirty = true;
        _isInitialRender = true;
        lastFilterKey = "";
        await renderExhibitionIncremental();
      },
      { passive: true },
    );
  }
}

function setupFilterToggle() {
  const toggle = document.getElementById("filterToggle");
  const content = document.getElementById("filterContent");
  if (!toggle || !content) return;

  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    content.classList.add("collapsed");
    toggle.setAttribute("aria-expanded", "false");
  } else {
    content.classList.remove("collapsed");
    toggle.setAttribute("aria-expanded", "true");
  }

  toggle.addEventListener(
    "click",
    function () {
      const isExpanded = content.classList.toggle("collapsed");
      this.classList.toggle("active");
      this.setAttribute("aria-expanded", !isExpanded);
    },
    { passive: true },
  );

  let resizeTimeout;
  window.addEventListener(
    "resize",
    function () {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const mobile = window.innerWidth <= 768;
        if (mobile) {
          if (!content.classList.contains("collapsed")) {
            content.classList.add("collapsed");
            toggle.classList.remove("active");
            toggle.setAttribute("aria-expanded", "false");
          }
        } else {
          content.classList.remove("collapsed");
          toggle.classList.add("active");
          toggle.setAttribute("aria-expanded", "true");
        }
      }, 250);
    },
    { passive: true },
  );
}

function setupBackToMenuMotion() {
  const button = document.querySelector(".back-to-menu-btn");
  if (!button) return;

  let idleTimer = null;
  let frameRequested = false;
  let lastScrollY = window.scrollY;

  function setButtonMode() {
    if (window.innerWidth <= 768) {
      button.classList.add("mobile-fixed");
      button.style.opacity = "1";
      button.style.transform = "translateY(0)";
      button.style.pointerEvents = "auto";
    } else {
      button.classList.remove("mobile-fixed");
      button.style.opacity = "";
      button.style.transform = "";
      button.style.pointerEvents = "";
    }
  }

  function fadeOutButton() {
    button.style.opacity = "0.45";
  }

  function showButton() {
    button.style.opacity = "1";
  }

  function scheduleFade() {
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (window.innerWidth <= 768) {
        fadeOutButton();
      }
    }, 1800);
  }

  function onUserInteraction() {
    if (window.innerWidth > 768) return;
    showButton();
    button.style.transform = "translateY(0)";
    scheduleFade();
  }

  function onScroll() {
    if (window.innerWidth > 768) return;

    if (!frameRequested) {
      frameRequested = true;
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollY;
        const offset = Math.max(-8, Math.min(8, delta));
        button.style.transform = `translateY(${offset}px)`;
        lastScrollY = currentY;
        frameRequested = false;
      });
    }
    onUserInteraction();
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("touchstart", onUserInteraction, { passive: true });
  window.addEventListener("touchmove", onUserInteraction, { passive: true });
  window.addEventListener("wheel", onUserInteraction, { passive: true });
  window.addEventListener("resize", setButtonMode, { passive: true });

  setButtonMode();
  scheduleFade();
}

// ===== DEBOUNCED SEARCH =====
const debouncedSearch = debounce(async function () {
  cachedFilteredResults = null;
  _groupedCollectionsDirty = true;
  _isInitialRender = true;
  lastFilterKey = "";
  await renderExhibitionIncremental();
}, 200);

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// ===== CLEANUP =====
function cleanupGallery() {
  setInterval(() => {
    imageCache.clear();
  }, CONFIG.CACHE_CLEANUP_INTERVAL);

  // Clean up slideshow interval on page unload
  window.addEventListener("beforeunload", () => {
    stopSlideshow();
  });
}

// ===== INJECT PROGRESSIVE LOADING CSS =====
function injectProgressiveLoadingCSS() {
  const css = `
    /* ===== IMPROVED TYPOGRAPHY ===== */
    .entrance-title {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.1;
      text-shadow: 0 2px 20px rgba(0,0,0,0.05);
    }

    .entrance-subtitle {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-weight: 400;
      letter-spacing: 0.01em;
      line-height: 1.6;
      opacity: 0.85;
    }

    .entrance-stat {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-weight: 700;
    }

    .entrance-stat-label {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .entrance-label {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.15em;
    }

    .entrance-explore {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .random-gallery-title {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .collection-view-title {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .filtered-grid-title {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .shuffle-btn {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .masonry-title {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .masonry-artist {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    .masonry-collection {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 500;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      font-size: 10px;
    }

    .masonry-bio-name {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .masonry-bio-text {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-weight: 400;
      line-height: 1.7;
    }

    .masonry-bio-label {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .viewer-caption .title {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .viewer-caption .artist {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 600;
      letter-spacing: 0.03em;
    }

    .collection-view-back {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 600;
      letter-spacing: 0.03em;
    }

    .clear-filters-btn {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 600;
      letter-spacing: 0.03em;
    }

    .filter-pill {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      font-size: 11px;
    }

    .filter-select {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 500;
      letter-spacing: 0.02em;
    }

    .breadcrumb-label {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 500;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      font-size: 11px;
    }

    .breadcrumb-value {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-weight: 700;
    }

    .breadcrumb-clear {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 600;
      letter-spacing: 0.03em;
    }

    .empty-state h3 {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-weight: 700;
    }

    .empty-state p {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-weight: 400;
      line-height: 1.6;
    }

    /* ===== SLIDESHOW HERO ENHANCEMENTS ===== */
    .entrance-artwork {
      position: relative;
      overflow: hidden;
      background: #f8f8f8;
      min-height: 300px;
      box-shadow: 0 4px 30px rgba(0,0,0,0.08);
    }

    .entrance-artwork img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: opacity 0.6s ease-in-out;
    }

    .entrance-artwork-credit {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 20px 24px;
      background: linear-gradient(transparent, rgba(0,0,0,0.6));
      backdrop-filter: blur(2px);
    }

    .entrance-artwork-title {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-weight: 700;
      font-size: 18px;
      color: white;
      display: block;
      text-shadow: 0 1px 8px rgba(0,0,0,0.3);
      letter-spacing: -0.01em;
    }

    .entrance-artwork-artist {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-weight: 500;
      font-size: 14px;
      color: rgba(255,255,255,0.85);
      display: block;
      margin-top: 2px;
      letter-spacing: 0.03em;
    }

    /* Slideshow indicator dots */
    .slideshow-indicators {
      position: absolute;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 8px;
      padding: 6px 12px;
      background: rgba(0,0,0,0.3);
      backdrop-filter: blur(4px);
      border-radius: 20px;
    }

    .slideshow-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(255,255,255,0.4);
      transition: all 0.3s ease;
      cursor: pointer;
    }

    .slideshow-dot.active {
      background: white;
      transform: scale(1.2);
    }

    /* Slideshow pause button */
    .slideshow-pause {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 50%;
      background: rgba(0,0,0,0.4);
      backdrop-filter: blur(4px);
      color: white;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }

    .slideshow-pause:hover {
      background: rgba(0,0,0,0.6);
      transform: scale(1.05);
    }

    /* ===== MASONRY GRID ===== */
    .masonry-grid {
      column-count: 4;
      column-gap: 20px;
      padding: 0;
    }

    .masonry-item {
      break-inside: avoid;
      margin-bottom: 20px;
      overflow: hidden;
      background: white;
      cursor: pointer;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
      opacity: 1;
      animation: fadeInUp 0.5s ease forwards;
      position: relative;
      display: inline-block;
      width: 100%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    .masonry-item:nth-child(1) { animation-delay: 0.05s; }
    .masonry-item:nth-child(2) { animation-delay: 0.10s; }
    .masonry-item:nth-child(3) { animation-delay: 0.15s; }
    .masonry-item:nth-child(4) { animation-delay: 0.20s; }
    .masonry-item:nth-child(5) { animation-delay: 0.25s; }
    .masonry-item:nth-child(6) { animation-delay: 0.30s; }
    .masonry-item:nth-child(7) { animation-delay: 0.35s; }
    .masonry-item:nth-child(8) { animation-delay: 0.40s; }
    .masonry-item:nth-child(9) { animation-delay: 0.45s; }
    .masonry-item:nth-child(10) { animation-delay: 0.50s; }
    .masonry-item:nth-child(11) { animation-delay: 0.55s; }
    .masonry-item:nth-child(12) { animation-delay: 0.60s; }

    .masonry-item:hover {
      transform: translateY(-6px) scale(1.01);
      box-shadow: 0 12px 40px rgba(0,0,0,0.15);
      z-index: 2;
    }

    .masonry-artwork {
      position: relative;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .masonry-artwork img {
      width: 100%;
      height: auto;
      display: block;
    }

    .masonry-label {
      padding: 12px 16px;
      flex-shrink: 0;
      border-top: 2px solid rgba(0,0,0,0.06);
    }

    .masonry-title {
      font-size: 15px;
      font-weight: 700;
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: -0.01em;
      line-height: 1.3;
    }

    .masonry-artist {
      font-size: 13px;
      font-weight: 600;
      display: block;
      margin-top: 3px;
      letter-spacing: 0.02em;
      line-height: 1.3;
    }

    .masonry-collection {
      font-size: 10px;
      display: block;
      margin-top: 3px;
      opacity: 0.6;
      font-weight: 500;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    /* Artist Bio Cards */
    .masonry-bio {
      padding: 32px 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      cursor: default;
      border: 2px solid rgba(0,0,0,0.08) !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }

    .masonry-bio:hover {
      transform: none !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04) !important;
    }

    .masonry-bio-content {
      text-align: center;
      max-width: 280px;
    }

    .masonry-bio-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      opacity: 0.7;
      display: block;
      margin-bottom: 8px;
      font-weight: 700;
    }

    .masonry-bio-name {
      font-size: 22px;
      margin: 8px 0 12px 0;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }

    .masonry-bio-text {
      font-size: 14px;
      line-height: 1.7;
      opacity: 0.85;
      margin: 0;
      font-weight: 400;
    }

    .masonry-bio-content a {
      font-size: 13px;
      text-decoration: none;
      display: inline-block;
      margin-top: 10px;
      transition: opacity 0.3s ease;
      font-weight: 600;
      letter-spacing: 0.03em;
    }

    .masonry-bio-content a:hover {
      opacity: 0.6;
    }

    /* Controls */
    .random-gallery-controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .random-gallery-title {
      font-size: 26px;
      font-weight: 700;
      color: #1a1a1a;
      margin: 0;
      letter-spacing: -0.01em;
    }

    .shuffle-btn {
      background: rgb(220, 30, 100);
      color: white;
      border: none;
      padding: 10px 28px;
      cursor: pointer;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.3s ease;
      font-size: 13px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      box-shadow: 0 2px 12px rgba(220, 30, 100, 0.3);
    }

    .shuffle-btn:hover {
      transform: scale(1.04);
      background: rgb(200, 20, 80) !important;
      box-shadow: 0 4px 20px rgba(220, 30, 100, 0.4);
    }

    .shuffle-btn:active {
      transform: scale(0.96);
    }

    /* Collection View */
    .collection-view-header {
      margin-bottom: 30px;
    }

    .collection-view-back {
      background: none;
      border: none;
      color: #5a2157;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0;
      margin-bottom: 16px;
      transition: color 0.3s ease;
      font-weight: 600;
      letter-spacing: 0.03em;
    }

    .collection-view-back:hover {
      color: #3f153f;
    }

    .collection-view-title {
      font-size: 32px;
      font-weight: 700;
      color: #1a1a1a;
      margin: 0 0 4px 0;
      letter-spacing: -0.01em;
    }

    .collection-view-count {
      color: #555;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.02em;
    }

    .collection-view-description {
      color: #444;
      margin-top: 12px;
      font-size: 16px;
      font-weight: 400;
      line-height: 1.7;
    }

    /* Filtered View */
    .filtered-grid-header {
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .filtered-grid-title {
      font-size: 26px;
      font-weight: 700;
      color: #1a1a1a;
      margin: 0;
      letter-spacing: -0.01em;
    }

    .clear-filters-btn {
      background: none;
      border: none;
      color: #5a2157;
      cursor: pointer;
      font-size: 14px;
      transition: color 0.3s ease;
      font-weight: 600;
      letter-spacing: 0.03em;
    }

    .clear-filters-btn:hover {
      color: #3f153f;
      text-decoration: underline;
    }

    /* Loading */
    .masonry-loading-more {
      text-align: center;
      padding: 30px;
      color: #888;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.02em;
    }

    .masonry-loading-more::after {
      content: '...';
      animation: dots 1.5s steps(4, end) infinite;
    }

    @keyframes dots {
      0% { content: ''; }
      25% { content: '.'; }
      50% { content: '..'; }
      75% { content: '...'; }
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      text-align: center;
    }

    .loading-spinner {
      width: 50px;
      height: 50px;
      border: 4px solid #f0f0f0;
      border-top: 4px solid rgba(90, 33, 87, 0.8);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 20px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #1a1a1a;
    }

    .empty-state-icon {
      font-size: 48px;
      color: rgba(90, 33, 87, 0.4);
      margin-bottom: 20px;
    }

    .empty-state h3 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 12px;
    }

    .empty-state p {
      font-size: 16px;
      line-height: 1.7;
      opacity: 0.7;
    }

    .empty-clear-btn {
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 10px 24px;
      cursor: pointer;
      margin-top: 16px;
      font-weight: 700;
      transition: background 0.3s ease, border-color 0.3s ease;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      font-size: 13px;
    }

    .empty-clear-btn:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    .refresh-btn {
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 10px 24px;
      cursor: pointer;
      margin-top: 16px;
      font-weight: 700;
      transition: background 0.3s ease, border-color 0.3s ease;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      font-size: 13px;
    }

    .refresh-btn:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    /* ===== MOBILE OPTIMIZATIONS ===== */

    @media (max-width: 1024px) {
      .masonry-grid {
        column-count: 3;
        column-gap: 16px;
      }
      
      .masonry-item {
        margin-bottom: 16px;
      }

      .entrance-artwork {
        min-height: 250px;
      }
    }

    @media (max-width: 768px) {
      .masonry-grid {
        column-count: 2;
        column-gap: 12px;
      }

      .masonry-item {
        margin-bottom: 12px;
      }

      .masonry-label {
        padding: 8px 12px;
      }

      .masonry-title {
        font-size: 13px;
      }

      .masonry-artist {
        font-size: 12px;
      }

      .masonry-collection {
        font-size: 9px;
      }

      .masonry-bio {
        min-height: 150px;
        padding: 20px 16px;
      }

      .masonry-bio-name {
        font-size: 18px;
      }

      .masonry-bio-text {
        font-size: 13px;
      }

      .masonry-bio-label {
        font-size: 9px;
        letter-spacing: 0.10em;
      }

      .random-gallery-controls {
        flex-direction: column;
        align-items: stretch;
        margin-bottom: 20px;
      }

      .random-gallery-title {
        font-size: 22px;
        text-align: center;
      }

      .shuffle-btn {
        justify-content: center;
        padding: 10px 16px;
        font-size: 12px;
      }

      .collection-view-title {
        font-size: 26px;
      }

      .collection-view-description {
        font-size: 15px;
      }

      .filtered-grid-title {
        font-size: 20px;
      }

      .filtered-grid-header {
        flex-direction: column;
        align-items: stretch;
        text-align: center;
      }

      .clear-filters-btn {
        text-align: center;
      }

      .collection-view-back {
        font-size: 13px;
      }

      .entrance-artwork {
        min-height: 200px;
      }

      .entrance-artwork-title {
        font-size: 16px;
      }

      .entrance-artwork-artist {
        font-size: 13px;
      }

      .slideshow-indicators {
        bottom: 70px;
        padding: 4px 10px;
        gap: 6px;
      }

      .slideshow-dot {
        width: 6px;
        height: 6px;
      }

      .slideshow-pause {
        width: 30px;
        height: 30px;
        font-size: 12px;
        top: 12px;
        right: 12px;
      }
    }

    @media (max-width: 480px) {
      .masonry-grid {
        column-count: 2;
        column-gap: 8px;
      }

      .masonry-item {
        margin-bottom: 8px;
        border-width: 1px !important;
      }

      .masonry-label {
        padding: 6px 10px;
      }

      .masonry-title {
        font-size: 12px;
      }

      .masonry-artist {
        font-size: 11px;
      }

      .masonry-collection {
        font-size: 8px;
      }

      .masonry-bio {
        min-height: 120px;
        padding: 16px 12px;
      }

      .masonry-bio-name {
        font-size: 16px;
        margin: 4px 0 8px 0;
      }

      .masonry-bio-text {
        font-size: 12px;
        line-height: 1.4;
      }

      .masonry-bio-label {
        font-size: 8px;
        letter-spacing: 0.08em;
        margin-bottom: 4px;
      }

      .random-gallery-title {
        font-size: 18px;
      }

      .shuffle-btn {
        font-size: 11px;
        padding: 8px 14px;
      }

      .collection-view-title {
        font-size: 22px;
      }

      .collection-view-description {
        font-size: 14px;
      }

      .collection-view-back {
        font-size: 12px;
      }

      .collection-view-count {
        font-size: 12px;
      }

      .filtered-grid-title {
        font-size: 17px;
      }

      .masonry-loading-more {
        font-size: 12px;
        padding: 20px;
      }

      .entrance-artwork {
        min-height: 160px;
      }

      .entrance-artwork-title {
        font-size: 14px;
      }

      .entrance-artwork-artist {
        font-size: 12px;
      }

      .entrance-artwork-credit {
        padding: 12px 16px;
      }

      .slideshow-indicators {
        bottom: 60px;
        padding: 4px 8px;
        gap: 5px;
      }

      .slideshow-dot {
        width: 5px;
        height: 5px;
      }

      .slideshow-pause {
        width: 26px;
        height: 26px;
        font-size: 10px;
        top: 8px;
        right: 8px;
      }
    }
  `;

  const styleSheet = document.createElement("style");
  styleSheet.textContent = css;
  document.head.appendChild(styleSheet);
}

// ===== LANGUAGE SWITCH FUNCTION =====
function switchLanguage(lang) {
  if (lang === currentLanguage) return;
  currentLanguage = lang === "en" ? "en" : "es";

  // Save language preferences
  localStorage.setItem("lang", currentLanguage);
  localStorage.setItem("preferredLanguage", currentLanguage);
  localStorage.setItem("language", currentLanguage);

  // Update LanguageSwitch if available
  if (window.LanguageSwitch?.setLanguage) {
    window.LanguageSwitch.setLanguage(currentLanguage);
  }

  // Reload the page to apply changes
  window.location.reload();
}

// ===== EXPOSE GLOBAL FUNCTIONS =====
window.openViewer = openViewer;
window.closeViewer = closeViewer;
window.filterByCollection = filterByCollection;
window.clearFilters = clearFilters;
window.switchLanguage = switchLanguage;
window.restoreMainExhibition = restoreMainExhibition;
window.shuffleGallery = shuffleGallery;

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", async function () {
  // FIXED: Sync with LanguageSwitch
  const langFromSwitch = window.LanguageSwitch?.getCurrentLanguage?.();
  if (langFromSwitch) {
    currentLanguage = langFromSwitch;
  } else {
    // Fallback to localStorage
    const storedLanguage =
      localStorage.getItem("lang") ||
      localStorage.getItem("preferredLanguage") ||
      localStorage.getItem("language") ||
      "es";
    currentLanguage = storedLanguage === "en" ? "en" : "es";
  }

  // Ensure document language is set
  document.documentElement.lang = currentLanguage;

  // Ensure localStorage is consistent
  localStorage.setItem("lang", currentLanguage);
  localStorage.setItem("preferredLanguage", currentLanguage);
  localStorage.setItem("language", currentLanguage);

  // If LanguageSwitch is available, ensure it matches
  if (window.LanguageSwitch?.getCurrentLanguage?.() !== currentLanguage) {
    window.LanguageSwitch?.setLanguage?.(currentLanguage);
  }

  injectProgressiveLoadingCSS();
  applyStaticTranslations();
  imageLoader.setupObserver();
  await loadGalleryData(currentLanguage, true);

  const searchInput = document.getElementById("gallerySearch");
  const clearBtn = document.getElementById("searchClearBtn");

  if (searchInput) {
    searchInput.addEventListener(
      "input",
      function () {
        searchQuery = this.value;
        if (clearBtn) clearBtn.classList.toggle("visible", this.value.length > 0);
        cachedFilteredResults = null;
        _groupedCollectionsDirty = true;
        lastFilterKey = "";
        debouncedSearch();
      },
      { passive: true },
    );
  }

  if (clearBtn) {
    clearBtn.addEventListener(
      "click",
      function () {
        if (searchInput) {
          searchInput.value = "";
          searchQuery = "";
          clearBtn.classList.remove("visible");
          cachedFilteredResults = null;
          _groupedCollectionsDirty = true;
          _isInitialRender = true;
          lastFilterKey = "";
          renderExhibitionIncremental();
          searchInput.focus();
        }
      },
      { passive: true },
    );
  }

  setupFilters();
  setupFilterToggle();
  setupEventDelegation();

  setupBackToMenuMotion();

  const viewerClose = document.getElementById("viewerClose");
  if (viewerClose) {
    viewerClose.addEventListener("click", closeViewer, { passive: true });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeViewer();
    }
  });

  // Listen for language change events from LanguageSwitch
  document.addEventListener("languageChanged", function (e) {
    if (e.detail && e.detail.lang && e.detail.lang !== currentLanguage) {
      currentLanguage = e.detail.lang;
      document.documentElement.lang = currentLanguage;
      applyStaticTranslations();
      // Reload data with new language
      loadGalleryData(currentLanguage, false);
    }
  });

  cleanupGallery();
});
