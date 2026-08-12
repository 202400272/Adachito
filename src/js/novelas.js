// ---- global state ----
let currentLang = (() => {
  const storedLang =
    localStorage.getItem("lang") ||
    localStorage.getItem("preferredLanguage") ||
    localStorage.getItem("language") ||
    localStorage.getItem("adashima_manga_lang") ||
    "en";
  
  // Normalize the language code - support 'tg' and fallback to 'en' if invalid
  const normalized = storedLang.toLowerCase().trim();
  const supported = ["es", "en", "tg"];
  
  if (supported.includes(normalized)) return normalized;
  
  // Handle partial matches (e.g., 'en-US' -> 'en')
  for (const lang of supported) {
    if (normalized.startsWith(lang + "-") || normalized === lang) {
      return lang;
    }
  }
  
  return "en"; 
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
let modalCurrentVolume = null;
let modalAbortController = new AbortController();
let modalRenderTask = null;
let modalThumbnails = [];
let modalThumbnailsVisible = false;
let modalThumbnailsRendered = false;
let modalThumbnailRenderVersion = 0;
let modalThumbnailAbortController = null;
let modalPreloadPage = null;

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
    volumes: [],
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
    volumes: [],
    generalDownloads: { pdf: "Download PDF Full", epub: "Download EPUB Full" },
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

  const canvas = document.getElementById("pdfRenderModal");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.style.display = "none";
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
}

function resetModalViewer() {
  const canvas = document.getElementById("pdfRenderModal");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.style.display = "none";
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
  const fileTarget = isEnglish ? vol.filePdf : vol.file;
  return isEnglish ? `en_${fileTarget}` : `es_${fileTarget}`;
}

async function loadPdfInModal(vol) {
  const isEnglish = currentLang === "en";
  const baseUrl = isEnglish
    ? "https://media.adashimaverse.com/Novelas/Ingles/"
    : "https://media.adashimaverse.com/Novelas/";
  const fileTarget = isEnglish ? vol.filePdf : vol.file;

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
    offscreenCanvas.width = scaledViewport.width * dpr;
    offscreenCanvas.height = scaledViewport.height * dpr;
    const ctx = offscreenCanvas.getContext("2d");
    ctx.scale(dpr, dpr);

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

function updateThumbnailSelection() {
  const wrappers = document.querySelectorAll(".pdf-thumbnail-wrapper");
  wrappers.forEach((w) => {
    w.classList.toggle("active", parseInt(w.dataset.page) === modalPageNum);
    if (w.classList.contains("active")) {
      w.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
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
  modalPageNum = pageNum;
  updateThumbnailSelection();
  queueModalRender();
}

let modalRenderQueue = Promise.resolve();

async function queueModalRender() {
  modalRenderQueue = modalRenderQueue.then(() => renderModalPage());
}

async function renderModalPage() {
  if (modalRenderTask) {
    modalRenderTask.cancel();
    modalRenderTask = null;
  }

  if (!modalPdfDoc || modalPageNum < 1 || modalPageNum > modalPdfDoc.numPages)
    return;

  setNavButtonsDisabled(true);

  try {
    const canvas = document.getElementById("pdfRenderModal");
    const container = document.getElementById("canvasWrapperModal");

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    let page = null;

    if (modalPreloadPage && modalPreloadPage.pageNum === modalPageNum) {
      const preloaded = modalPreloadPage;
      const viewport = await modalPdfDoc
        .getPage(modalPageNum)
        .then((p) => p.getViewport({ scale: 1 }));
      let scale = containerWidth / viewport.width;
      if (viewport.height * scale > containerHeight) {
        scale = containerHeight / viewport.height;
      }
      scale = scale * modalScale;

      const scaledViewport = viewport.clone({ scale });

      canvas.width = scaledViewport.width * dpr;
      canvas.height = scaledViewport.height * dpr;
      canvas.style.width = scaledViewport.width + "px";
      canvas.style.height = scaledViewport.height + "px";

      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.imageSmoothingEnabled = true;

      ctx.drawImage(
        preloaded.canvas,
        0,
        0,
        scaledViewport.width,
        scaledViewport.height,
      );

      modalPreloadPage = null;

      page = await modalPdfDoc.getPage(modalPageNum);
      page.cleanup();
    } else {
      page = await modalPdfDoc.getPage(modalPageNum);

      const viewport = page.getViewport({ scale: 1 });
      let scale = containerWidth / viewport.width;
      if (viewport.height * scale > containerHeight) {
        scale = containerHeight / viewport.height;
      }
      scale = scale * modalScale;

      const scaledViewport = page.getViewport({ scale });
      canvas.width = scaledViewport.width * dpr;
      canvas.height = scaledViewport.height * dpr;
      canvas.style.width = scaledViewport.width + "px";
      canvas.style.height = scaledViewport.height + "px";

      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.imageSmoothingEnabled = true;

      canvas.style.opacity = "0.5";

      modalRenderTask = page.render({
        canvasContext: ctx,
        viewport: scaledViewport,
        signal: modalAbortController.signal,
      });

      await modalRenderTask.promise;
      modalRenderTask = null;

      canvas.style.opacity = "1";
      canvas.style.transition = "opacity 0.2s ease";

      page.cleanup();
    }

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

  document.getElementById("pdfZoomInModal").addEventListener("click", () => {
    modalScale = Math.min(modalScale * 1.1, 3.0);
    updateZoomDisplay();
    queueModalRender();
  });

  document.getElementById("pdfZoomOutModal").addEventListener("click", () => {
    modalScale = Math.max(modalScale * 0.9, 0.3);
    updateZoomDisplay();
    queueModalRender();
  });

  document.getElementById("pdfZoomResetModal").addEventListener("click", () => {
    modalScale = 1.0;
    updateZoomDisplay();
    queueModalRender();
  });

  function updateZoomDisplay() {
    document.getElementById("zoomDisplayModal").textContent =
      Math.round(modalScale * 100) + "%";
  }

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
        updateZoomDisplay();
        queueModalRender();
        break;
      case "-":
        e.preventDefault();
        modalScale = Math.max(modalScale * 0.9, 0.3);
        updateZoomDisplay();
        queueModalRender();
        break;
      case "0":
        e.preventDefault();
        modalScale = 1.0;
        updateZoomDisplay();
        queueModalRender();
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
  let isPinching = false;
  const canvasContainer = document.getElementById("canvasContainerModal");

  const getTouchDistance = (firstTouch, secondTouch) =>
    Math.hypot(
      firstTouch.clientX - secondTouch.clientX,
      firstTouch.clientY - secondTouch.clientY,
    );

  canvasContainer.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        pinchStartDistance = getTouchDistance(e.touches[0], e.touches[1]);
        pinchStartScale = modalScale;
        isPinching = true;
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
    },
    { passive: true },
  );

  canvasContainer.addEventListener(
    "touchmove",
    (e) => {
      if (!isPinching || e.touches.length !== 2) return;
      if (!pinchStartDistance) return;
      e.preventDefault();
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
      queueModalRender();
    },
    { passive: false },
  );

  canvasContainer.addEventListener(
    "touchend",
    (e) => {
      if (isPinching) {
        if (e.touches.length < 2) {
          isPinching = false;
          pinchStartDistance = 0;
          pinchStartScale = modalScale;
        }
        return;
      }
      const touch = e.changedTouches?.[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - touchStartX);
      const dy = Math.abs(touch.clientY - touchStartY);
      const dt = Date.now() - touchStartTime;
      if (dt > 350 || dx > 40 || dy > 40) return;
      if (
        e.target.closest(".pdf-toolbar") ||
        e.target.closest("button") ||
        e.target.closest("input")
      )
        return;
      const rect = canvasContainer.getBoundingClientRect();
      const relX = (touch.clientX - rect.left) / rect.width;
      if (relX <= 0.45) {
        if (modalPageNum > 1) {
          modalPageNum--;
          queueModalRender();
        }
      } else if (relX >= 0.55) {
        if (modalPdfDoc && modalPageNum < modalPdfDoc.numPages) {
          modalPageNum++;
          queueModalRender();
        }
      }
    },
    { passive: true },
  );

  canvasContainer.addEventListener("touchcancel", () => {
    isPinching = false;
    pinchStartDistance = 0;
    pinchStartScale = modalScale;
  });

  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (
        modalPdfDoc &&
        document.getElementById("pdfModal").classList.contains("open")
      ) {
        queueModalRender();
      }
    }, 200);
  });

  document.addEventListener("fullscreenchange", () => {
    const isFullscreen = document.fullscreenElement !== null;
    const icon = document.getElementById("fsIconModal");
    if (icon) {
      icon.classList.toggle("fa-expand", !isFullscreen);
      icon.classList.toggle("fa-compress", isFullscreen);
    }
  });
}

let currentView = "list";
let searchTerm = "";

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
  currentView = view;
  applyView(view);
  document
    .getElementById("viewListBtn")
    .classList.toggle("active", view === "list");
  document
    .getElementById("viewGridBtn")
    .classList.toggle("active", view === "grid");
  const container = document.getElementById("novels-container");
  if (container) {
    container.classList.toggle("view-list", view === "list");
    container.classList.toggle("view-grid", view === "grid");
  }
}

function applyView(view) {
  const container = document.getElementById("novels-container");
  if (!container) return;
  container.classList.toggle("view-list", view === "list");
  container.classList.toggle("view-grid", view === "grid");
  const listView = document.getElementById("listViewContainer");
  const gridView = document.getElementById("gridViewContainer");
  if (listView) listView.style.display = view === "list" ? "" : "none";
  if (gridView) gridView.style.display = view === "grid" ? "" : "none";
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
    const response = await fetch(`../components/menu.html?v=${menuVer}`, {
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
  setView("list");
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
