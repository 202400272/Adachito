// ---- global state ----
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
let isSwitching = false;
let currentRenderVersion = 0;
let globalAbortController = new AbortController();
const pdfCache = new Map();
const PDFJS_VERSION = "2.16.105";
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
} catch (e) {}

// ---- modal state ----
let modalPdfDoc = null;
let modalPageNum = 1;
let modalRendering = false;
let modalPendingPage = null;
let modalScale = 1.0;
let modalFitScale = 1.0;
let lastRenderedScale = 1.0;
let zoomRenderTimer = null;
let modalCurrentVolume = null;
let modalAbortController = new AbortController();
let modalRenderTask = null;
let modalThumbnails = [];
let modalThumbnailsVisible = false;
let modalThumbnailsRendered = false;
let modalThumbnailRenderVersion = 0;
let modalThumbnailAbortController = null;
let modalPreloadPage = null;

// ---- view mode + chrome visibility ----
let modalViewMode = "single"; // "single" | "cascade"
let modalToolbarHidden = false;
let toolbarAutoHideTimer = null;

// ---- cascade (continuous scroll) mode state ----
let cascadeContainerEl = null;
let cascadePageEntries = []; // [{ pageNum, wrapper, canvas, aspectRatio, rendered }]
let cascadeIO = null;
let cascadeRenderedOrder = []; // LRU of rendered page numbers, for eviction
const CASCADE_KEEP_RENDERED = 6; // how many rendered pages to keep at once
let cascadeRenderQueue = Promise.resolve();
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

function getCascadeBaseWidth() {
  if (cascadeBaseWidth !== null) return cascadeBaseWidth;
  const container =
    cascadeContainerEl || document.getElementById("pdfCascadeContainer");
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
      { id: "1", title: "Volumen 1", desc: "Publicado el 10 de marzo del 2013. Ilustrado por Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/01.webp", file: "Adachi to Shimamura Volumen 1 Español.pdf" },
      { id: "2", title: "Volumen 2", desc: "Publicado el 10 de septiembre del 2013.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/02.webp", file: "Adachi to Shimamura Volumen 2 Español.pdf" },
      { id: "3", title: "Volumen 3", desc: "Publicado el 9 de agosto del 2014. Ilustrado por Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/03.webp", file: "Adachi to Shimamura Volumen 3 Español.pdf" },
      { id: "4", title: "Volumen 4", desc: "Publicado el 9 de mayo del 2015. Ilustrado por Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/04.webp", file: "Adachi to Shimamura Volumen 4 Español.pdf" },
      { id: "5", title: "Volumen 5", desc: "Publicado el 10 de noviembre del 2015. Ilustrado por Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/05.webp", file: "Adachi to Shimamura Volumen 5 Español.pdf" },
      { id: "6", title: "Volumen 6", desc: "Publicado el 10 de mayo del 2016. Ilustrado por Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/06.webp", file: "Adachi to Shimamura Volumen 6 Español.pdf" },
      { id: "7", title: "Volumen 7", desc: "Publicado el 10 de noviembre del 2016. Ilustrado por Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/07.webp", file: "Adachi to Shimamura Volumen 7 Español.pdf" },
      { id: "8", title: "Volumen 8", desc: "Publicado el 10 de mayo del 2019.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/08.webp", file: "Adachi to Shimamura Volumen 8 Español.pdf" },
      { id: "8.5", title: "Especial Tarumi", desc: "Publicado en 2019.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/08.webp", file: "Adachi to Shimamura Especial Tarumi Español.pdf" },
      { id: "9", title: "Volumen 9", desc: "Publicado el 10 de octubre del 2020.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/09.webp", file: "Adachi to Shimamura Volumen 9 Español.pdf" },
      { id: "10", title: "Volumen 10", desc: "Publicado el 10 de septiembre del 2021. Ilustrado por Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/10.webp", file: "Adachi to Shimamura Volumen 10 Español.pdf" },
      { id: "11", title: "Volumen 11", desc: "Publicado el 9 de diciembre del 2022. Ilustrado por Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/11.webp", file: "Adachi to Shimamura Volumen 11 Español.pdf" },
      { id: "12", title: "Volumen 12", desc: "Publicado el 8 de noviembre del 2024. Ilustrado por Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/12.webp", file: "Adachi to Shimamura Volumen 12 Español.pdf" },
      { id: "13", title: "Volumen 13", desc: "Publicado el 8 de noviembre del 2025. Ilustrado por Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/13.webp", file: "Adachi to Shimamura Volumen 13 Español.pdf" },
      { id: "13.5", title: "Especiales Volumen 13", desc: "Publicado el 8 de noviembre del 2025.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/13.webp", file: "Especiales Volumen 13 Español.pdf" },
      { id: "E1", title: "Adachi to Shimamura Especial 1 Español", desc: "Publicado en 2020.", thumbnail: "../../assets/Imagenes/Especial1.webp", file: "Adachi to Shimamura Especial 1 Español (1).pdf" },
      { id: "E2", title: "Adachi to Shimamura Especial 2 Español", desc: "Publicado en 2020.", thumbnail: "../../assets/Imagenes/Especial2.webp", file: "Adachi to Shimamura Especial 2 Español (2).pdf" },
      { id: "E3", title: "Adachi to Shimamura Especial 3 Español", desc: "Publicado en 2020.", thumbnail: "../../assets/Imagenes/Especial3.webp", file: "Adachi to Shimamura Especial 3 Español (1).pdf" },
      { id: "E4", title: "Adachi to Shimamura Especial 4 Español", desc: "Publicado en 2020.", thumbnail: "../../assets/Imagenes/Especial4.webp", file: "Adachi to Shimamura Especial 4 Español (2).pdf" },
      { id: "99_9", title: "Volumen 99.9", desc: "Publicado el 10 de noviembre del 2023. Ilustrado por Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/99.webp", file: "Adachi to Shimamura Volumen 99.9 Español.pdf" },
      { id: "SS", title: "Volumen SS", desc: "Publicado el 10 de noviembre del 2023. Ilustrado por Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/SS1.webp", file: "Adachi to Shimamura Volumen SS Español.pdf" },
      { id: "SS2", title: "Volumen SS2", desc: "Publicado el 8 de noviembre del 2024. Ilustrado por Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/SS2.webp", file: "Adachi to Shimamura Volumen SS2 Español.pdf" },
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
      { id: "1", title: "Volume 1", desc: "Published on March 10, 2013. Illustrated by Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/01.webp", filePdf: "Adachi and Shimamura.pdf", fileEpub: "Adachi and Shimamura.epub", translator: "Sneikkimies" },
      { id: "2", title: "Volume 2", desc: "Published on September 10, 2013.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/02.webp", filePdf: "Adachi and Shimamura 2.pdf", fileEpub: "Adachi and Shimamura 2.epub", translator: "Sneikkimies" },
      { id: "3", title: "Volume 3", desc: "Published on August 9, 2014. Illustrated by Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/03.webp", filePdf: "Adachi and Shimamura 3.pdf", fileEpub: "Adachi and Shimamura 3.epub", translator: "Sneikkimies" },
      { id: "4", title: "Volume 4", desc: "Published on May 9, 2015. Illustrated by Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/04.webp", filePdf: "Adachi and Shimamura 4.pdf", fileEpub: "Adachi and Shimamura 4.epub", translator: "Sneikkimies" },
      { id: "5", title: "Volume 5", desc: "Published on November 10, 2015. Illustrated by Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/05.webp", filePdf: "Adachi and Shimamura 5.pdf", fileEpub: "Adachi and Shimamura 5.epub", translator: "Sneikkimies" },
      { id: "6", title: "Volume 6", desc: "Published on May 10, 2016. Illustrated by Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/06.webp", filePdf: "Adachi and Shimamura 6.pdf", fileEpub: "Adachi and Shimamura 6.epub", translator: "Sneikkimies" },
      { id: "7", title: "Volume 7", desc: "Published on November 10, 2016. Illustrated by Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/07.webp", filePdf: "Adachi and Shimamura 7.pdf", fileEpub: "Adachi and Shimamura 7.epub", translator: "Sneikkimies" },
      { id: "8", title: "Volume 8", desc: "Published on May 10, 2019.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/08.webp", filePdf: "Adachi and Shimamura 8.pdf", fileEpub: "Adachi and Shimamura 8.epub", translator: "Sneikkimies" },
      { id: "9", title: "Volume 9", desc: "Published on October 10, 2020.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/09.webp", filePdf: "Adachi and Shimamura 9.pdf", fileEpub: "Adachi and Shimamura 9.epub", translator: "Sneikkimies" },
      { id: "10", title: "Volume 10", desc: "Published on September 10, 2021. Illustrated by Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/10.webp", filePdf: "Adachi and Shimamura 10.pdf", fileEpub: "Adachi and Shimamura 10.epub", translator: "Sneikkimies" },
      { id: "11", title: "Volume 11", desc: "Published on December 9, 2022. Illustrated by Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/11.webp", filePdf: "Adachi and Shimamura 11.pdf", fileEpub: "Adachi and Shimamura 11.epub", translator: "Sneikkimies" },
      { id: "12", title: "Volume 12", desc: "Published on November 8, 2024. Illustrated by Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/12.webp", filePdf: "Adachi and Shimamura 12.pdf", fileEpub: "Adachi and Shimamura 12.epub", translator: "Sneikkimies" },
      { id: "13", title: "Volume 13", desc: "Published on November 8, 2025. Illustrated by Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/13.webp", filePdf: "Adachi and Shimamura 13.pdf", fileEpub: "Adachi and Shimamura 13.epub", translator: "Sneikkimies" },
      { id: "E1", title: "Special 1", desc: "Published in 2020.", thumbnail: "../../assets/Imagenes/Especial1.webp", filePdf: "Adachi and Shimamura - Anime Special Novel 1.pdf", fileEpub: "Adachi and Shimamura - Anime Special Novel 1.epub", translator: "Sneikkimies" },
      { id: "E2", title: "Special 2", desc: "Published in 2020.", thumbnail: "../../assets/Imagenes/Especial2.webp", filePdf: "Adachi and Shimamura BD Extra 2.pdf", fileEpub: "Adachi and Shimamura - Anime Special Novel 2.epub", translator: "Sneikkimies" },
      { id: "E3", title: "Special 3", desc: "Published in 2020.", thumbnail: "../../assets/Imagenes/Especial3.webp", filePdf: "Adachi and Shimamura BD Extra 3.pdf", fileEpub: "Adachi and Shimamura - Anime Special Novel 3.epub", translator: "Sneikkimies" },
      { id: "E4", title: "Special 4", desc: "Published in 2020.", thumbnail: "../../assets/Imagenes/Especial4.webp", filePdf: "Adachi and Shimamura BD Extra 4.pdf", fileEpub: "Adachi and Shimamura - Anime Special Novel 4.epub", translator: "Sneikkimies" },
      { id: "99_9", title: "Volume 99.9", desc: "Published on November 10, 2023. Illustrated by Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/99.webp", filePdf: "Adachi and Shimamura 99.pdf", fileEpub: "Adachi and Shimamura 99.epub", translator: "Sneikkimies" },
      { id: "SS", title: "Volume SS", desc: "Published on November 10, 2023. Illustrated by Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/SS1.webp", filePdf: "Adachi and Shimamura SS.pdf", fileEpub: "Adachi and Shimamura SS.epub", translator: "Sneikkimies" },
      { id: "SS2", title: "Volume SS2", desc: "Published on November 8, 2024. Illustrated by Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/SS2.webp", filePdf: "Adachi and Shimamura Novel Vol SS2.pdf", fileEpub: "Adachi and Shimamura SS2.epub", translator: "Sneikkimies" },
      { id: "ESC", title: "Extra Stories Collection", desc: "Extra stories collection.", thumbnail: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_G_2P7mtYJGqau2ZqkzFnlaK7cW23Xgdga-i3i-ZvuQQpKq13hDdOZH9M&s=10", filePdf: "_Adachi and Shimamura- Extra Stories Collection.pdf", fileEpub: null, translator: null, isExtra: true },
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
      { id: "1", title: "Volume 1", desc: "Inilathala noong Marso 10, 2013. Ilustrasyon ni Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/01.webp", filePdf: "Adachi and Shimamura.pdf", fileEpub: "Adachi and Shimamura.epub", translator: "Sneikkimies" },
      { id: "2", title: "Volume 2", desc: "Inilathala noong Setyembre 10, 2013.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/02.webp", filePdf: "Adachi and Shimamura 2.pdf", fileEpub: "Adachi and Shimamura 2.epub", translator: "Sneikkimies" },
      { id: "3", title: "Volume 3", desc: "Inilathala noong Agosto 9, 2014. Ilustrasyon ni Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/03.webp", filePdf: "Adachi and Shimamura 3.pdf", fileEpub: "Adachi and Shimamura 3.epub", translator: "Sneikkimies" },
      { id: "4", title: "Volume 4", desc: "Inilathala noong Mayo 9, 2015. Ilustrasyon ni Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/04.webp", filePdf: "Adachi and Shimamura 4.pdf", fileEpub: "Adachi and Shimamura 4.epub", translator: "Sneikkimies" },
      { id: "5", title: "Volume 5", desc: "Inilathala noong Nobyembre 10, 2015. Ilustrasyon ni Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/05.webp", filePdf: "Adachi and Shimamura 5.pdf", fileEpub: "Adachi and Shimamura 5.epub", translator: "Sneikkimies" },
      { id: "6", title: "Volume 6", desc: "Inilathala noong Mayo 10, 2016. Ilustrasyon ni Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/06.webp", filePdf: "Adachi and Shimamura 6.pdf", fileEpub: "Adachi and Shimamura 6.epub", translator: "Sneikkimies" },
      { id: "7", title: "Volume 7", desc: "Inilathala noong Nobyembre 10, 2016. Ilustrasyon ni Non.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/07.webp", filePdf: "Adachi and Shimamura 7.pdf", fileEpub: "Adachi and Shimamura 7.epub", translator: "Sneikkimies" },
      { id: "8", title: "Volume 8", desc: "Inilathala noong Mayo 10, 2019.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/08.webp", filePdf: "Adachi and Shimamura 8.pdf", fileEpub: "Adachi and Shimamura 8.epub", translator: "Sneikkimies" },
      { id: "9", title: "Volume 9", desc: "Inilathala noong Oktubre 10, 2020.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/09.webp", filePdf: "Adachi and Shimamura 9.pdf", fileEpub: "Adachi and Shimamura 9.epub", translator: "Sneikkimies" },
      { id: "10", title: "Volume 10", desc: "Inilathala noong Setyembre 10, 2021. Ilustrasyon ni Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/10.webp", filePdf: "Adachi and Shimamura 10.pdf", fileEpub: "Adachi and Shimamura 10.epub", translator: "Sneikkimies" },
      { id: "11", title: "Volume 11", desc: "Inilathala noong Disyembre 9, 2022. Ilustrasyon ni Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/11.webp", filePdf: "Adachi and Shimamura 11.pdf", fileEpub: "Adachi and Shimamura 11.epub", translator: "Sneikkimies" },
      { id: "12", title: "Volume 12", desc: "Inilathala noong Nobyembre 8, 2024. Ilustrasyon ni Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/12.webp", filePdf: "Adachi and Shimamura 12.pdf", fileEpub: "Adachi and Shimamura 12.epub", translator: "Sneikkimies" },
      { id: "13", title: "Volume 13", desc: "Inilathala noong Nobyembre 8, 2025. Ilustrasyon ni Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/13.webp", filePdf: "Adachi and Shimamura 13.pdf", fileEpub: "Adachi and Shimamura 13.epub", translator: "Sneikkimies" },
      { id: "E1", title: "Special 1", desc: "Inilathala noong 2020.", thumbnail: "../../assets/Imagenes/Especial1.webp", filePdf: "Adachi and Shimamura - Anime Special Novel 1.pdf", fileEpub: "Adachi and Shimamura - Anime Special Novel 1.epub", translator: "Sneikkimies" },
      { id: "E2", title: "Special 2", desc: "Inilathala noong 2020.", thumbnail: "../../assets/Imagenes/Especial2.webp", filePdf: "Adachi and Shimamura BD Extra 2.pdf", fileEpub: "Adachi and Shimamura - Anime Special Novel 2.epub", translator: "Sneikkimies" },
      { id: "E3", title: "Special 3", desc: "Inilathala noong 2020.", thumbnail: "../../assets/Imagenes/Especial3.webp", filePdf: "Adachi and Shimamura BD Extra 3.pdf", fileEpub: "Adachi and Shimamura - Anime Special Novel 3.epub", translator: "Sneikkimies" },
      { id: "E4", title: "Special 4", desc: "Inilathala noong 2020.", thumbnail: "../../assets/Imagenes/Especial4.webp", filePdf: "Adachi and Shimamura BD Extra 4.pdf", fileEpub: "Adachi and Shimamura - Anime Special Novel 4.epub", translator: "Sneikkimies" },
      { id: "99_9", title: "Volume 99.9", desc: "Inilathala noong Nobyembre 10, 2023. Ilustrasyon ni Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/99.webp", filePdf: "Adachi and Shimamura 99.pdf", fileEpub: "Adachi and Shimamura 99.epub", translator: "Sneikkimies" },
      { id: "SS", title: "Volume SS", desc: "Inilathala noong Nobyembre 10, 2023. Ilustrasyon ni Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/SS1.webp", filePdf: "Adachi and Shimamura SS.pdf", fileEpub: "Adachi and Shimamura SS.epub", translator: "Sneikkimies" },
      { id: "SS2", title: "Volume SS2", desc: "Inilathala noong Nobyembre 8, 2024. Ilustrasyon ni Raemz.", thumbnail: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/gallery/volumeCovers/englishEdition/SS2.webp", filePdf: "Adachi and Shimamura Novel Vol SS2.pdf", fileEpub: "Adachi and Shimamura SS2.epub", translator: "Sneikkimies" },
      { id: "ESC", title: "Koleksyon ng mga Dagdag na Kuwento", desc: "Koleksyon ng mga dagdag na kuwento.", thumbnail: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_G_2P7mtYJGqau2ZqkzFnlaK7cW23Xgdga-i3i-ZvuQQpKq13hDdOZH9M&s=10", filePdf: "_Adachi and Shimamura- Extra Stories Collection.pdf", fileEpub: null, translator: null, isExtra: true },
    ],
    generalDownloads: { pdf: "I-download ang Buong PDF", epub: "I-download ang Buong EPUB" },
  },
};

// FIXED: Use LanguageSwitch for data URL
async function loadTranslations(lang) {
  try {
    const url =
      window.LanguageSwitch &&
      typeof window.LanguageSwitch.getDataUrl === "function"
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
  if (epubBtn)
    epubBtn.title = getText("pdfControls.downloadEPUB") || "Download EPUB";

  const closeBtn = document.getElementById("pdfModalClose");
  if (closeBtn)
    closeBtn.setAttribute("aria-label", getText("modal.closeReader"));
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
  const novelItemClass = isExtraStories
    ? "novel-item extra-stories-special"
    : "novel-item";
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

  modalPreloadPage = null;
  invalidateModalContainerSize();

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

  document.getElementById("pdfToolbarSecondary")?.classList.remove("open");
  document.getElementById("pdfMoreToggle")?.setAttribute("aria-expanded", "false");
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
}

function cancelThumbnailRendering() {
  if (modalThumbnailAbortController) {
    modalThumbnailAbortController.abort();
    modalThumbnailAbortController = null;
  }
  modalThumbnailRenderVersion++;
  modalThumbnailsRendered = false;
}

function getPdfCacheKey(vol, isEnglish) {
  const fileTarget = vol.filePdf || vol.file;
  return `${currentLang}_${fileTarget}`;
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

  try {
    let pdfData = null;

    if (pdfCache.has(cacheKey)) {
      pdfData = pdfCache.get(cacheKey);
    } else {
      const response = await fetch(url, {
        signal: modalAbortController.signal,
      });
      if (!response.ok) throw new Error("Network error");
      const arrayBuffer = await response.arrayBuffer();
      pdfData = new Uint8Array(arrayBuffer);
      pdfCache.set(cacheKey, pdfData);
    }

    modalPdfDoc = await pdfjsLib.getDocument({
      data: pdfData,
      cMapUrl: `${PDFJS_CDN}/cmaps/`,
      cMapPacked: true,
      useSystemFonts: true,
    }).promise;

    document.getElementById("pageCountModal").textContent =
      modalPdfDoc.numPages;
    document.getElementById("mobilePageCountModal").textContent =
      modalPdfDoc.numPages;
    loadingEl.classList.remove("visible");
    canvas.style.display = "block";

    await queueModalRender();

    if (modalPdfDoc.numPages > 1) {
      preloadNextPage();
    }
  } catch (error) {
    if (error.name !== "AbortError") {
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
    const viewport = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = 0.5;
    const scaledViewport = page.getViewport({ scale });

    const offscreenCanvas = document.createElement("canvas");
    const clampedDpr = getClampedDpr(
      scaledViewport.width,
      scaledViewport.height,
      dpr,
    );
    offscreenCanvas.width = scaledViewport.width * clampedDpr;
    offscreenCanvas.height = scaledViewport.height * clampedDpr;
    const ctx = offscreenCanvas.getContext("2d");
    ctx.scale(clampedDpr, clampedDpr);

    await page.render({
      canvasContext: ctx,
      viewport: scaledViewport,
      signal: modalAbortController.signal,
    }).promise;

    modalPreloadPage = {
      pageNum: nextPageNum,
      canvas: offscreenCanvas,
    };

    page.cleanup();
  } catch (error) {
    if (error.name !== "AbortError") {
      console.warn("Preload failed:", error);
    }
  }
}

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
  const batchSize = 5;

  try {
    for (let start = 1; start <= totalPages; start += batchSize) {
      if (signal.aborted || renderVersion !== modalThumbnailRenderVersion) {
        return;
      }

      const end = Math.min(start + batchSize - 1, totalPages);
      const batchPromises = [];

      for (let pageNum = start; pageNum <= end; pageNum++) {
        if (signal.aborted || renderVersion !== modalThumbnailRenderVersion) {
          return;
        }

        batchPromises.push(
          renderSingleThumbnail(pdfDoc, pageNum, renderVersion, signal),
        );
      }

      const thumbnails = await Promise.all(batchPromises);

      if (signal.aborted || renderVersion !== modalThumbnailRenderVersion) {
        return;
      }

      thumbnails
        .filter((thumb) => thumb !== null)
        .forEach((thumb) => {
          grid.appendChild(thumb);
          modalThumbnails.push(thumb);
        });
    }

    modalThumbnailsRendered = true;
    updateThumbnailSelection();
  } catch (error) {
    if (error.name !== "AbortError") {
      console.warn("Thumbnail rendering failed:", error);
    }
  } finally {
    if (modalThumbnailAbortController === abortController) {
      modalThumbnailAbortController = null;
    }
  }
}

async function renderSingleThumbnail(pdfDoc, pageNum, renderVersion, signal) {
  if (!pdfDoc) return null;

  try {
    if (signal.aborted || renderVersion !== modalThumbnailRenderVersion) {
      return null;
    }

    const page = await pdfDoc.getPage(pageNum);

    if (signal.aborted || renderVersion !== modalThumbnailRenderVersion) {
      page.cleanup();
      return null;
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
      return null;
    }

    page.cleanup();

    const wrapper = document.createElement("div");
    wrapper.className = "pdf-thumbnail-wrapper";
    wrapper.dataset.page = pageNum;

    const pageLabel = document.createElement("span");
    pageLabel.className = "pdf-thumbnail-label";
    pageLabel.textContent = pageNum;

    wrapper.appendChild(canvas);
    wrapper.appendChild(pageLabel);

    wrapper.addEventListener("click", () => {
      goToPage(pageNum);
    });

    return wrapper;
  } catch (error) {
    if (error.name !== "AbortError") {
      console.warn("Failed to render thumbnail for page", pageNum, error);
    }
    return null;
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
  toolbarAutoHideTimer = setTimeout(() => {
    const modal = document.getElementById("pdfModal");
    if (!modal || !modal.classList.contains("open")) return;
    modalToolbarHidden = true;
    document
      .getElementById("pdfViewerModal")
      ?.classList.add("pdf-chrome-hidden");
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

let modalRenderQueue = Promise.resolve();

async function queueModalRender() {
  modalRenderQueue = modalRenderQueue.then(() => renderModalPage());
}

// Caps the actual pixels PDF.js has to rasterize/decode into. Without
// this, fit-width * zoom * devicePixelRatio can demand several million
// pixels on a big phone screen — the cost scales with page content
// (image-heavy/colored pages are far more expensive per pixel than
// text), so this is what keeps those pages from bogging down.
const MAX_RENDER_PIXELS = 2_400_000; // ~1550x1550
function getClampedDpr(cssWidth, cssHeight, dpr) {
  const rawPixels = cssWidth * cssHeight * dpr * dpr;
  if (rawPixels <= MAX_RENDER_PIXELS) return dpr;
  const clamped = Math.sqrt(MAX_RENDER_PIXELS / (cssWidth * cssHeight));
  return Math.max(1, clamped);
}

// Shows the zoom change instantly via a cheap CSS transform on the
// already-rendered canvas, instead of re-rasterizing the PDF. This is
// what keeps pinch/scroll zooming smooth and cool on mobile. Passing the
// pinch midpoint anchors the scale to the fingers instead of the page
// jumping to re-center — mirrors how native photo viewers pinch-zoom.
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
// it on every zoom-change event. When an anchor point is given (pinch),
// the scroll container is repositioned after the re-render so whatever
// was under the fingers stays under the fingers, instead of the view
// recentering on zoom.
function commitZoomRender(anchorClientPoint) {
  clearTimeout(zoomRenderTimer);
  zoomRenderTimer = null;
  const canvas = document.getElementById("pdfRenderModal");
  if (canvas) {
    canvas.style.transform = "none";
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

  if (!modalPdfDoc || modalPageNum < 1 || modalPageNum > modalPdfDoc.numPages)
    return;

  setNavButtonsDisabled(true);

  const canvasEl = document.getElementById("pdfRenderModal");
  if (canvasEl) canvasEl.style.transform = "none";
  lastRenderedScale = modalScale;

  try {
    const canvas = document.getElementById("pdfRenderModal");
    const outerContainer = document.getElementById("canvasContainerModal");
    const wrapperEl = document.getElementById("canvasWrapperModal");

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width: containerWidth, height: containerHeight } =
      getModalContainerSize(outerContainer, wrapperEl);

    // Preload bitmap (if any) is only ever a fast, low-res instant
    // placeholder for the page-turn — it is drawn immediately below,
    // then unconditionally replaced by a full-resolution page.render()
    // a few lines later. It must never be left on screen as the final
    // image, or the page looks blurry (it's ~0.5 scale stretched up
    // to full display size).
    const preloaded =
      modalPreloadPage && modalPreloadPage.pageNum === modalPageNum
        ? modalPreloadPage
        : null;
    modalPreloadPage = null;

    const page = await modalPdfDoc.getPage(modalPageNum);
    const viewport = page.getViewport({ scale: 1 });

    let contentScale = containerWidth / viewport.width;
    if (viewport.height * contentScale > containerHeight) {
      contentScale = containerHeight / viewport.height;
    }
    contentScale = contentScale * modalScale;

    const scaledViewport = page.getViewport({ scale: contentScale });
    const clampedDpr = getClampedDpr(
      scaledViewport.width,
      scaledViewport.height,
      dpr,
    );

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
      ctx.drawImage(
        preloaded.canvas,
        0,
        0,
        scaledViewport.width,
        scaledViewport.height,
      );
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
    canvas.style.transition = "opacity 0.2s ease, width 0.15s ease, height 0.15s ease";

    page.cleanup();

    document.getElementById("pageNumModal").textContent = modalPageNum;
    document.getElementById("mobilePageNumModal").textContent = modalPageNum;

    const progress = (modalPageNum / modalPdfDoc.numPages) * 100;
    document.getElementById("pdfProgressModal").style.width = progress + "%";

    updateThumbnailSelection();

    if (modalPageNum < modalPdfDoc.numPages) {
      preloadNextPage();
    }
  } catch (error) {
    if (
      error.name !== "AbortError" &&
      error.name !== "RenderingCancelledException"
    ) {
      console.error("Error rendering page:", error);
      const canvas = document.getElementById("pdfRenderModal");
      canvas.style.opacity = "0.3";
    }
  } finally {
    setNavButtonsDisabled(false);
    modalRendering = false;
  }
}

function setNavButtonsDisabled(disabled) {
  const buttons = ["pdfPrevModal", "pdfNextModal"];
  buttons.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  });
}

// ============================================================
// CASCADE (continuous scroll) MODE
//
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
// ============================================================

function resetCascadeUI() {
  teardownCascadeMode();
  modalViewMode = "single";
  const toggle = document.getElementById("pdfCascadeToggle");
  toggle?.classList.remove("active");
  toggle?.setAttribute("aria-pressed", "false");
  const singleContainer = document.getElementById("canvasContainerModal");
  if (singleContainer) singleContainer.style.display = "";
  const cascadeEl = document.getElementById("pdfCascadeContainer");
  if (cascadeEl) cascadeEl.style.display = "none";
}

async function enterCascadeMode() {
  if (!modalPdfDoc || modalViewMode === "cascade") return;

  modalViewMode = "cascade";
  const toggle = document.getElementById("pdfCascadeToggle");
  toggle?.classList.add("active");
  toggle?.setAttribute("aria-pressed", "true");

  const singleContainer = document.getElementById("canvasContainerModal");
  const cascadeContainer = document.getElementById("pdfCascadeContainer");
  if (singleContainer) singleContainer.style.display = "none";
  if (cascadeContainer) cascadeContainer.style.display = "";

  cascadeCurrentPage = modalPageNum;
  cascadeLastRenderedScale = modalScale;
  await buildCascadePages();
  scrollCascadeToPage(cascadeCurrentPage, "auto");
  scheduleToolbarAutoHide();
}

function exitCascadeMode() {
  if (modalViewMode !== "cascade") return;
  // Carry the reading position back into single-page mode.
  modalPageNum = cascadeCurrentPage;
  resetCascadeUI();
  queueModalRender();
}

function toggleCascadeMode() {
  if (modalViewMode === "cascade") exitCascadeMode();
  else enterCascadeMode();
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
  } catch (e) {}

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
    });
  }
  container.appendChild(frag);

  setupCascadeObserver();
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
}

function scrollCascadeToPage(pageNum, behavior = "smooth") {
  const entry = cascadePageEntries.find((e) => e.pageNum === pageNum);
  if (!entry) return;
  entry.wrapper.scrollIntoView({ behavior, block: "start" });
  cascadeCurrentPage = pageNum;
  updateCascadeProgress();
}

function queueCascadeRender(pageNum) {
  const entry = cascadePageEntries.find((e) => e.pageNum === pageNum);
  if (!entry || entry.rendered || entry.rendering) return;
  if (cascadePendingQueue.includes(pageNum)) return;
  cascadePendingQueue.push(pageNum);
  drainCascadeRenderQueue();
}

function drainCascadeRenderQueue() {
  while (
    cascadeActiveRenders < CASCADE_MAX_CONCURRENT &&
    cascadePendingQueue.length > 0
  ) {
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
  if (!entry || entry.rendered) return;
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
    const clampedDpr = getClampedDpr(
      scaledViewport.width,
      scaledViewport.height,
      dpr,
    );

    const canvas = entry.canvas;
    canvas.width = scaledViewport.width * clampedDpr;
    canvas.height = scaledViewport.height * clampedDpr;
    canvas.style.width = scaledViewport.width + "px";
    canvas.style.height = scaledViewport.height + "px";
    entry.wrapper.style.width = scaledViewport.width + "px";

    const ctx = canvas.getContext("2d");
    ctx.setTransform(clampedDpr, 0, 0, clampedDpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    if (token !== cascadeBuildToken) {
      page.cleanup();
      return;
    }

    await page.render({
      canvasContext: ctx,
      viewport: scaledViewport,
      signal: modalAbortController.signal,
    }).promise;

    if (token !== cascadeBuildToken) {
      page.cleanup();
      return;
    }

    entry.rendered = true;
    entry.wrapper.classList.add("rendered");
    cascadeRenderedOrder = cascadeRenderedOrder.filter((p) => p !== pageNum);
    cascadeRenderedOrder.push(pageNum);
    page.cleanup();

    evictFarCascadePages();
  } catch (error) {
    if (
      error.name !== "AbortError" &&
      error.name !== "RenderingCancelledException"
    ) {
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
    entry.wrapper.classList.remove("rendered");
    cascadeRenderedOrder = cascadeRenderedOrder.filter((p) => p !== pageNum);
  }
}

// Called after resize/orientation/fullscreen changes: existing canvases
// are stale at the old container width, so drop their pixels (keeping the
// placeholder box) and re-render whatever is currently near the viewport.
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
      entry.canvas.width = 0;
      entry.canvas.height = 0;
      entry.rendered = false;
      entry.wrapper.classList.remove("rendered");
    }
  });
  cascadeRenderedOrder = [];

  const containerRect = cascadeContainerEl?.getBoundingClientRect();
  if (!containerRect) return;
  cascadePageEntries.forEach((entry) => {
    const rect = entry.wrapper.getBoundingClientRect();
    if (
      rect.bottom > containerRect.top - 400 &&
      rect.top < containerRect.bottom + 400
    ) {
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
  const container = document.getElementById("pdfCascadeContainer");
  if (container) container.style.transform = "none";
  cascadeLastRenderedScale = modalScale;
  relayoutCascadePages();
}

function initModalEvents() {
  document
    .getElementById("pdfModalClose")
    .addEventListener("click", closePdfModal);
  document
    .getElementById("pdfModalBackdrop")
    .addEventListener("click", closePdfModal);

  document.getElementById("pdfPrevModal").addEventListener("click", () => {
    if (modalPageNum > 1 && !document.getElementById("pdfPrevModal").disabled) {
      modalPageNum--;
      queueModalRender();
    }
  });

  document.getElementById("pdfNextModal").addEventListener("click", () => {
    if (
      modalPdfDoc &&
      modalPageNum < modalPdfDoc.numPages &&
      !document.getElementById("pdfNextModal").disabled
    ) {
      modalPageNum++;
      queueModalRender();
    }
  });

  document.getElementById("pageInputModal").addEventListener("change", (e) => {
    const page = parseInt(e.target.value, 10);
    if (page && page > 0 && page <= (modalPdfDoc?.numPages || 1)) {
      goToPage(page);
    }
    e.target.value = "";
  });

  function updateZoomDisplay() {
    document.getElementById("zoomDisplayModal").textContent =
      Math.round(modalScale * 100) + "%";
  }

  // Shared by the toolbar buttons, keyboard shortcuts, wheel/trackpad
  // zoom, and double-tap-to-zoom: show the new scale immediately via
  // CSS preview, then debounce the actual re-render. anchorClientPoint
  // (cursor/tap position) keeps whatever's under the pointer fixed in
  // place while zooming, same as the pinch-zoom anchor.
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

  document
    .getElementById("pdfFullscreenModal")
    .addEventListener("click", () => {
      const elem = document.getElementById("pdfViewerModal");
      if (!document.fullscreenElement) {
        if (elem.requestFullscreen) elem.requestFullscreen();
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
        else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
        document
          .getElementById("fsIconModal")
          .classList.replace("fa-expand", "fa-compress");
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
        document
          .getElementById("fsIconModal")
          .classList.replace("fa-compress", "fa-expand");
      }
    });

  document.getElementById("pdfDownloadModal").addEventListener("click", () => {
    if (modalCurrentVolume) {
      const isEnglish = currentLang === "en";
      const baseUrl = isEnglish
        ? "https://media.adashimaverse.com/Novelas/Ingles/"
        : "https://media.adashimaverse.com/Novelas/";
      const fileTarget = isEnglish
        ? modalCurrentVolume.filePdf
        : modalCurrentVolume.file;
      if (fileTarget) {
        smartDownload(baseUrl + encodeURIComponent(fileTarget), fileTarget);
      }
    }
  });

  document.getElementById("epubDownloadModal").addEventListener("click", () => {
    if (modalCurrentVolume && currentLang === "en") {
      const baseUrl = "https://media.adashimaverse.com/Novelas/Ingles/";
      const fileTarget = modalCurrentVolume.fileEpub;
      if (fileTarget) {
        smartDownload(baseUrl + encodeURIComponent(fileTarget), fileTarget);
      }
    }
  });

  document.getElementById("pdfRetryModal").addEventListener("click", () => {
    if (modalCurrentVolume) {
      loadPdfInModal(modalCurrentVolume);
    }
  });

  document
    .getElementById("pdfThumbnailToggle")
    .addEventListener("click", toggleThumbnails);
  document
    .getElementById("pdfThumbnailsClose")
    .addEventListener("click", () => {
      document.getElementById("pdfThumbnailsSidebar").classList.remove("open");
      modalThumbnailsVisible = false;
    });

  document
    .getElementById("pdfCascadeToggle")
    .addEventListener("click", () => {
      toggleCascadeMode();
      // Closing the "more" panel after picking a mode keeps mobile tidy.
      document.getElementById("pdfToolbarSecondary")?.classList.remove("open");
      document
        .getElementById("pdfMoreToggle")
        ?.setAttribute("aria-expanded", "false");
    });

  document.getElementById("pdfMoreToggle").addEventListener("click", () => {
    const panel = document.getElementById("pdfToolbarSecondary");
    const btn = document.getElementById("pdfMoreToggle");
    const isOpen = panel.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(isOpen));
    toggleToolbarVisibility(true);
  });

  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("pdfModal");
    if (!modal.classList.contains("open")) return;

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
      case "A":
        e.preventDefault();
        if (modalPageNum > 1) {
          modalPageNum--;
          queueModalRender();
        }
        break;
      case "ArrowRight":
      case "d":
      case "D":
        e.preventDefault();
        if (modalPdfDoc && modalPageNum < modalPdfDoc.numPages) {
          modalPageNum++;
          queueModalRender();
        }
        break;
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
  let pinchStartDistance = 0;
  let pinchStartScale = 1;
  let pinchAnchor = null; // last known {clientX, clientY} midpoint of the two fingers
  let isPinching = false;
  // True once a single-finger touch has moved past a small jitter
  // threshold — distinguishes a genuine pan/drag from a tap so a slow
  // pan while zoomed can never fall through to page-turn/chrome-toggle
  // taps (which only key off distance-at-touchend, a coarser check).
  let singleTouchMoved = false;
  // Set the instant a pinch ends, and consumed by the very next touchend.
  // Without this, lifting the last finger off a pinch is itself a
  // touchend — with near-zero dx/dy/dt versus wherever the *first*
  // finger originally landed — so it was being read as a tap and
  // flipping the page right after the user zoomed. This flag makes the
  // "pinch is over" touchend a no-op instead of falling through to the
  // tap/page-turn logic.
  let suppressNextTap = false;
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  const canvasContainer = document.getElementById("canvasContainerModal");
  const cascadeScrollEl = document.getElementById("pdfCascadeContainer");

  // Ctrl/Cmd+wheel (and trackpad pinch, which browsers report as a
  // ctrlKey wheel event) zooms around the cursor, mirroring pinch-zoom's
  // anchor behavior. Plain wheel scrolling is left alone.
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
    if (e.target.closest(".pdf-toolbar") || e.target.closest("button"))
      return;
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panScrollLeft = canvasContainer.scrollLeft;
    panScrollTop = canvasContainer.scrollTop;
    canvasContainer.classList.add("panning");
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    canvasContainer.scrollLeft = panScrollLeft - (e.clientX - panStartX);
    canvasContainer.scrollTop = panScrollTop - (e.clientY - panStartY);
  });
  window.addEventListener("mouseup", () => {
    if (!isPanning) return;
    isPanning = false;
    canvasContainer.classList.remove("panning");
  });

  const getTouchDistance = (firstTouch, secondTouch) =>
    Math.hypot(
      firstTouch.clientX - secondTouch.clientX,
      firstTouch.clientY - secondTouch.clientY,
    );
  const getTouchMidpoint = (firstTouch, secondTouch) => ({
    clientX: (firstTouch.clientX + secondTouch.clientX) / 2,
    clientY: (firstTouch.clientY + secondTouch.clientY) / 2,
  });

  function handleTouchStart(e) {
    if (e.touches.length === 2) {
      // A second finger landing always wins, immediately — whatever the
      // first finger was doing (a nascent pan/tap) is abandoned right
      // here rather than left to resolve later, so a pinch can never be
      // misread as a swipe mid-gesture.
      pinchStartDistance = getTouchDistance(e.touches[0], e.touches[1]);
      pinchStartScale = modalScale;
      pinchAnchor = getTouchMidpoint(e.touches[0], e.touches[1]);
      isPinching = true;
      singleTouchMoved = false;
      return;
    }
    if (isPinching || e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (!touch) return;
    if (
      e.target.closest(".pdf-toolbar") ||
      e.target.closest("button") ||
      e.target.closest("input")
    )
      return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    singleTouchMoved = false;
  }

  function handleTouchMove(e) {
    if (!isPinching || e.touches.length !== 2) {
      // Single-finger movement: let the browser's native scroll/pan
      // handle it (no preventDefault) — we only need to know a real
      // drag happened, so touchend can tell it apart from a tap.
      if (!isPinching && e.touches.length === 1) {
        const touch = e.touches[0];
        if (touch) {
          const dx = Math.abs(touch.clientX - touchStartX);
          const dy = Math.abs(touch.clientY - touchStartY);
          if (dx > 8 || dy > 8) singleTouchMoved = true;
        }
      }
      return;
    }
    if (!pinchStartDistance) return;
    e.preventDefault();
    pinchAnchor = getTouchMidpoint(e.touches[0], e.touches[1]);
    const nextScale = Math.max(
      0.3,
      Math.min(
        3.0,
        pinchStartScale *
          (getTouchDistance(e.touches[0], e.touches[1]) / pinchStartDistance),
      ),
    );
    if (Math.abs(nextScale - modalScale) < 0.01) return;
    modalScale = nextScale;
    updateZoomDisplay();
    if (modalViewMode === "cascade") {
      applyCascadeZoomPreview();
      scheduleCascadeZoomCommit(220);
    } else {
      applyZoomPreview(pinchAnchor);
      scheduleZoomCommit(220, pinchAnchor);
    }
  }

  function handleTouchEnd(e) {
    if (isPinching) {
      if (e.touches.length < 2) {
        isPinching = false;
        pinchStartDistance = 0;
        pinchStartScale = modalScale;
        suppressNextTap = true;
        setTimeout(() => {
          suppressNextTap = false;
        }, 300);
        if (modalViewMode === "cascade") {
          commitCascadeZoomRender();
        } else {
          commitZoomRender(pinchAnchor);
        }
        pinchAnchor = null;
      }
      return;
    }
    if (suppressNextTap) return;
    const touch = e.changedTouches?.[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - touchStartX);
    const dy = Math.abs(touch.clientY - touchStartY);
    const dt = Date.now() - touchStartTime;
    const wasRealMove = singleTouchMoved || dt > 350 || dx > 40 || dy > 40;
    singleTouchMoved = false;
    if (wasRealMove) return;
    if (
      e.target.closest(".pdf-toolbar") ||
      e.target.closest("button") ||
      e.target.closest("input")
    )
      return;
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();

    // Double-tap to zoom, matching native photo/PDF viewer behavior.
    // Toggles between fit scale and 2x, anchored to the tap point.
    const now = Date.now();
    const dTapX = Math.abs(touch.clientX - lastTapX);
    const dTapY = Math.abs(touch.clientY - lastTapY);
    if (now - lastTapTime < 300 && dTapX < 40 && dTapY < 40) {
      lastTapTime = 0;
      modalScale = modalScale > (modalFitScale || 1) * 1.02 ? 1.0 : 2.0;
      applyZoomChange({ clientX: touch.clientX, clientY: touch.clientY });
      return;
    }
    lastTapTime = now;
    lastTapX = touch.clientX;
    lastTapY = touch.clientY;

    const relX = (touch.clientX - rect.left) / rect.width;

    // Middle band is a dead zone for page-turning on purpose — repurposed
    // as a tap target to show/hide the reading chrome (toolbar, progress
    // bar), the way most comic/book readers handle a center tap.
    if (relX > 0.35 && relX < 0.65) {
      toggleToolbarVisibility();
      return;
    }

    // Edge-tap page turning is a fit-scale, single-page-mode affordance.
    // In cascade mode scrolling is how you turn pages, and once the user
    // has zoomed in, an edge tap lands inside the zoomed content and must
    // not be misread as a page-turn.
    const isZoomed = modalScale > (modalFitScale || 1) * 1.02;
    if (modalViewMode === "cascade" || isZoomed) return;

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
    isPinching = false;
    pinchStartDistance = 0;
    pinchStartScale = modalScale;
    singleTouchMoved = false;
    pinchAnchor = null;
    if (modalViewMode === "cascade") {
      scheduleCascadeZoomCommit(0);
    } else {
      scheduleZoomCommit(0);
    }
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

  // Cascade mode scrolls in its own container, but pinch-zoom and the
  // center-tap chrome toggle should work there too.
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
  viewerEl.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".pdf-toolbar")) toggleToolbarVisibility(true);
  });
  viewerEl.addEventListener("mousemove", () => {
    const now = Date.now();
    if (now - lastActivityShow < 200) return;
    lastActivityShow = now;
    if (modalToolbarHidden) toggleToolbarVisibility(true);
    else scheduleToolbarAutoHide();
  });
  document
    .getElementById("pdfChromeReveal")
    ?.addEventListener("click", () => toggleToolbarVisibility(true));

  let resizeTimeout;
  function handleViewerResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (
        !modalPdfDoc ||
        !document.getElementById("pdfModal").classList.contains("open")
      )
        return;
      invalidateModalContainerSize();
      if (modalViewMode === "cascade") {
        relayoutCascadePages();
      } else {
        queueModalRender();
      }
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

  document.addEventListener("fullscreenchange", () => {
    const isFullscreen = document.fullscreenElement !== null;
    const icon = document.getElementById("fsIconModal");
    if (icon) {
      icon.classList.toggle("fa-expand", !isFullscreen);
      icon.classList.toggle("fa-compress", isFullscreen);
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
        if (!document.getElementById("pdfModal").classList.contains("open"))
          return;
        if (modalViewMode === "cascade") {
          relayoutCascadePages();
        } else if (modalPdfDoc) {
          queueModalRender();
        }
      });
    });
  });
}

let currentView = "grid";
let searchTerm = "";

function resetPageScrollToTop() {
  try {
    window.history.scrollRestoration = "manual";
  } catch (e) {}

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
    const title = (
      el.querySelector(".novel-summary span")?.textContent || ""
    ).toLowerCase();
    const desc = (
      el.querySelector(".novel-description p")?.textContent || ""
    ).toLowerCase();
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
    noResultsMsg.style.display =
      searchTerm && !hasVisibleResults ? "flex" : "none";
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
      .replace(
        /data-route="\.\.\/\.\.\/index\.html"/g,
        'data-route="../../index.html"',
      );
    const container =
      document.getElementById("sidebar-container") ||
      document.getElementById("menu-container");
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
  const footer = document.getElementById("footer-content");
  if (footer) footer.innerHTML = getText("footer");
  const floatingAdashima = document.getElementById("floating-link");
  if (floatingAdashima) floatingAdashima.title = getText("floatingTitle");

  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.placeholder = getText("searchPlaceholder");

  const viewListBtn = document.getElementById("viewListBtn");
  const viewGridBtn = document.getElementById("viewGridBtn");
  if (viewListBtn)
    viewListBtn.innerHTML = `<i class="fas fa-list-ul"></i> ${getText("viewList")}`;
  if (viewGridBtn)
    viewGridBtn.innerHTML = `<i class="fas fa-th"></i> ${getText("viewGrid")}`;

  const modalTitle = document.getElementById("pdfModalTitle");
  if (modalTitle)
    modalTitle.innerHTML = `${getText("modal.reading")} <span id="pdfVolumeTitle">Volumen</span>`;

  const closeBtn = document.getElementById("pdfModalClose");
  if (closeBtn)
    closeBtn.setAttribute("aria-label", getText("modal.closeReader"));

  const thumbToggle = document.getElementById("pdfThumbnailToggle");
  if (thumbToggle) thumbToggle.title = getText("pdfControls.thumbnails");

  const pageLabel = document.getElementById("pdfPageLabel");
  if (pageLabel) pageLabel.textContent = getText("pdfControls.page");

  const pageInput = document.getElementById("pageInputModal");
  if (pageInput) pageInput.placeholder = getText("pdfControls.goTo");

  const thumbTitle = document.getElementById("pdfThumbnailsTitle");
  if (thumbTitle) thumbTitle.textContent = getText("pdfControls.thumbnails");

  const loadingText = document.getElementById("pdfLoadingTextModal");
  if (loadingText)
    loadingText.textContent = getText("pdfControls.loadingDocument");

  const errorMsg = document.getElementById("pdfErrorMsgModal");
  if (errorMsg)
    errorMsg.textContent = getText("toastMessages.documentNotAvailable");

  const retryText = document.getElementById("pdfRetryText");
  if (retryText) retryText.textContent = getText("toastMessages.retry");

  renderVolumes();
  setView("grid");
}

// ===== LANGUAGE SWITCH FUNCTION =====
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

// ===== EXPOSE GLOBAL FUNCTIONS =====
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