const PDFJS_VERSION = "2.16.105";
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
} catch {
  // Ignore persistence failures when storage is unavailable.
}

let modalPdfDoc = null;
let modalPageNum = 1;
let modalScale = 1.0;
let _modalCurrentId = null;
let modalCurrentUrl = null;
let modalAbortController = new AbortController();
let modalRenderTask = null;
let modalThumbnails = [];
let modalThumbnailsVisible = false;
let modalThumbnailsRendered = false;
const savedPdfMode = localStorage.getItem("adashima_pdf_mode");
let modalReadingMode = savedPdfMode === "continuous" ? "cascade" : "single";
let cascadeObserver = null;
let cascadeScrollObserver = null;
let cascadeUnloadObserver = null;
let cascadeRendering = new Set();
let cascadeRenderedPages = new Set();
let cascadeBuilt = false;
let cascadePageEls = new Map(); // pageNum -> { wrapper, canvas }
let cascadeRenderQueue = [];
let cascadeActiveRenders = 0;
const CASCADE_MAX_CONCURRENT_RENDERS = 2;
const CASCADE_MAX_DPR = 2;
let lastRenderedScale = 1.0;
let zoomRenderTimer = null;
let cascadeLastRenderedScale = 1.0;
let cascadeZoomTimer = null;

function showToast(message) {
  const el = document.getElementById("toast-message");
  if (!el) return;
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.classList.remove("visible");
  }, 3000);
}

function updatePdfUITranslations() {
  const modeCascadeBtn = document.getElementById("pdfModeCascade");
  if (modeCascadeBtn)
    modeCascadeBtn.title = getPdfText("pdfControls.modeCascade") || "Cascade reading";
  const prevBtn = document.getElementById("pdfPrevModal");
  if (prevBtn) prevBtn.title = getPdfText("pdfControls.prevPage") || "Previous page (←)";
  const nextBtn = document.getElementById("pdfNextModal");
  if (nextBtn) nextBtn.title = getPdfText("pdfControls.nextPage") || "Next page (→)";
  const zoomOutBtn = document.getElementById("pdfZoomOutModal");
  if (zoomOutBtn) zoomOutBtn.title = getPdfText("pdfControls.zoomOut") || "Zoom out (-)";
  const zoomInBtn = document.getElementById("pdfZoomInModal");
  if (zoomInBtn) zoomInBtn.title = getPdfText("pdfControls.zoomIn") || "Zoom in (+)";
  const zoomResetBtn = document.getElementById("pdfZoomResetModal");
  if (zoomResetBtn) zoomResetBtn.title = getPdfText("pdfControls.zoomReset") || "Reset zoom (0)";
  const fullscreenBtn = document.getElementById("pdfFullscreenModal");
  if (fullscreenBtn) fullscreenBtn.title = getPdfText("pdfControls.fullscreen") || "Fullscreen (F)";
  const downloadBtn = document.getElementById("pdfDownloadModal");
  if (downloadBtn) downloadBtn.title = getPdfText("pdfControls.downloadPDF") || "Download PDF";
  const closeBtn = document.getElementById("pdfModalClose");
  if (closeBtn)
    closeBtn.setAttribute("aria-label", getPdfText("modal.closeReader") || "Close reader");
}

function openPdfModal(chapterId, url) {
  _modalCurrentId = chapterId;
  modalCurrentUrl = url;

  if (modalRenderTask) {
    modalRenderTask.cancel();
    modalRenderTask = null;
  }
  modalAbortController.abort();
  modalAbortController = new AbortController();

  const volumeTitle = document.getElementById("pdfVolumeTitle");
  if (volumeTitle) {
    const chapterLabel = getPdfText("chapterLabels.chapter") || "Chapter";
    volumeTitle.textContent = `${chapterLabel} ${chapterId}`;
  }

  resetPdfViewer();

  const modal = document.getElementById("pdfModal");
  modal.classList.add("open");
  document.body.style.overflow = "hidden";

  updatePdfUITranslations();
  loadPdfFromUrl(url);
}

function closePdfModal() {
  const modal = document.getElementById("pdfModal");
  modal.classList.remove("open");
  document.body.style.overflow = "";

  if (modalRenderTask) {
    modalRenderTask.cancel();
    modalRenderTask = null;
  }

  if (modalPdfDoc) {
    modalPdfDoc = null;
  }
  modalAbortController.abort();
  modalAbortController = new AbortController();

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
  clearTimeout(zoomRenderTimer);
  zoomRenderTimer = null;
  lastRenderedScale = 1.0;
  canvas.style.transform = "none";
  modalThumbnails = [];
  modalThumbnailsRendered = false;
  document.getElementById("pdfThumbnailsSidebar").classList.remove("open");
  modalThumbnailsVisible = false;
  document.getElementById("pdfThumbnailsList").innerHTML = "";
  teardownCascadeView();
}

function resetPdfViewer() {
  const canvas = document.getElementById("pdfRenderModal");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.style.display = "none";
  canvas.style.transform = "none";
  document.getElementById("pageNumModal").textContent = "-";
  document.getElementById("pageCountModal").textContent = "-";
  document.getElementById("pdfProgressModal").style.width = "0%";
  document.getElementById("pdfLoadingModal").classList.remove("visible");
  document.getElementById("pdfErrorModal").style.display = "none";
  document.getElementById("zoomDisplayModal").textContent = "100%";
  modalPageNum = 1;
  modalPdfDoc = null;
  clearTimeout(zoomRenderTimer);
  zoomRenderTimer = null;
  lastRenderedScale = modalScale;
  document.getElementById("pdfThumbnailsList").innerHTML = "";
  modalThumbnails = [];
  modalThumbnailsRendered = false;
  teardownCascadeView();
  applyReadingModeUI();
}

function teardownCascadeView() {
  if (cascadeObserver) {
    cascadeObserver.disconnect();
    cascadeObserver = null;
  }
  if (cascadeScrollObserver) {
    cascadeScrollObserver.disconnect();
    cascadeScrollObserver = null;
  }
  if (cascadeUnloadObserver) {
    cascadeUnloadObserver.disconnect();
    cascadeUnloadObserver = null;
  }
  cascadeRendering.clear();
  cascadeRenderedPages.clear();
  cascadeRenderQueue = [];
  cascadeActiveRenders = 0;
  cascadeBuilt = false;
  cascadePageEls.clear();
  clearTimeout(cascadeZoomTimer);
  cascadeZoomTimer = null;
  cascadeLastRenderedScale = modalScale;
  const cascadeContainer = document.getElementById("pdfCascadeContainer");
  if (cascadeContainer) {
    cascadeContainer.style.transform = "none";
    cascadeContainer.innerHTML = "";
  }
}

function applyReadingModeUI() {
  const singleBtn = document.getElementById("pdfModeSingle");
  const cascadeBtn = document.getElementById("pdfModeCascade");
  const canvasWrapper = document.getElementById("canvasWrapperModal");
  const cascadeContainer = document.getElementById("pdfCascadeContainer");
  const isCascade = modalReadingMode === "cascade";

  if (singleBtn) singleBtn.classList.toggle("active", !isCascade);
  if (cascadeBtn) cascadeBtn.classList.toggle("active", isCascade);
  if (canvasWrapper) canvasWrapper.style.display = isCascade ? "none" : "flex";
  if (cascadeContainer) cascadeContainer.style.display = isCascade ? "block" : "none";
}

function setReadingMode(mode) {
  if (mode === modalReadingMode) return;
  modalReadingMode = mode;
  localStorage.setItem("adashima_pdf_mode", mode);
  applyReadingModeUI();

  if (!modalPdfDoc) return;

  if (mode === "cascade") {
    renderCascadeView();
  } else {
    teardownCascadeView();
    renderPdfPage();
  }
}

async function loadPdfFromUrl(url) {
  const loadingEl = document.getElementById("pdfLoadingModal");
  const errorEl = document.getElementById("pdfErrorModal");
  const canvas = document.getElementById("pdfRenderModal");

  loadingEl.classList.add("visible");
  errorEl.style.display = "none";
  canvas.style.display = "none";

  try {
    const response = await fetch(url, { signal: modalAbortController.signal });
    if (!response.ok) throw new Error("Network error");
    const arrayBuffer = await response.arrayBuffer();
    const pdfData = new Uint8Array(arrayBuffer);

    modalPdfDoc = await pdfjsLib.getDocument({
      data: pdfData,
      cMapUrl: `${PDFJS_CDN}/cmaps/`,
      cMapPacked: true,
      useSystemFonts: true,
    }).promise;

    document.getElementById("pageCountModal").textContent = modalPdfDoc.numPages;
    document.getElementById("mobilePageCountModal").textContent = modalPdfDoc.numPages;
    loadingEl.classList.remove("visible");
    canvas.style.display = modalReadingMode === "cascade" ? "none" : "block";

    renderPdfThumbnails();
    if (modalReadingMode === "cascade") {
      renderCascadeView();
    } else {
      await renderPdfPage();
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      errorEl.style.display = "flex";
      document.getElementById("pdfErrorMsgModal").textContent =
        getPdfText("toastMessages.documentNotAvailable") || "Document not available.";
    }
  }
}

async function renderPdfThumbnails() {
  const pdfDoc = modalPdfDoc;
  if (!pdfDoc || modalThumbnailsRendered) return;

  const list = document.getElementById("pdfThumbnailsList");
  list.innerHTML = "";
  modalThumbnails = [];

  const totalPages = pdfDoc.numPages;
  const thumbnailContainer = document.createElement("div");
  thumbnailContainer.className = "pdf-thumbnails-grid";

  const batchSize = 10;
  for (let start = 1; start <= totalPages; start += batchSize) {
    const end = Math.min(start + batchSize - 1, totalPages);
    const batchPromises = [];

    for (let pageNum = start; pageNum <= end; pageNum++) {
      batchPromises.push(renderSingleThumbnail(pdfDoc, pageNum));
    }

    const thumbnails = await Promise.all(batchPromises);
    if (modalPdfDoc !== pdfDoc) return;
    thumbnails.forEach((thumb) => {
      if (thumb) {
        thumbnailContainer.appendChild(thumb);
        modalThumbnails.push(thumb);
      }
    });
  }

  if (modalPdfDoc !== pdfDoc) return;
  list.appendChild(thumbnailContainer);
  modalThumbnailsRendered = true;
  updatePdfThumbnailSelection();
}

async function renderSingleThumbnail(pdfDoc, pageNum) {
  try {
    if (!pdfDoc || modalPdfDoc !== pdfDoc) return null;
    const page = await pdfDoc.getPage(pageNum);
    if (modalPdfDoc !== pdfDoc) return null;
    const viewport = page.getViewport({ scale: 0.3 });

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

    const wrapper = document.createElement("div");
    wrapper.className = "pdf-thumbnail-wrapper";
    wrapper.dataset.page = pageNum;

    const pageLabel = document.createElement("span");
    pageLabel.className = "pdf-thumbnail-label";
    pageLabel.textContent = pageNum;

    wrapper.appendChild(canvas);
    wrapper.appendChild(pageLabel);

    wrapper.addEventListener("click", () => {
      goToPdfPage(pageNum);
    });

    return wrapper;
  } catch (e) {
    console.warn("Failed to render thumbnail for page", pageNum, e);
    return null;
  }
}

function updatePdfThumbnailSelection() {
  const wrappers = document.querySelectorAll(".pdf-thumbnail-wrapper");
  wrappers.forEach((w) => {
    w.classList.toggle("active", parseInt(w.dataset.page) === modalPageNum);
    if (w.classList.contains("active")) {
      w.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
}

function togglePdfThumbnails() {
  const sidebar = document.getElementById("pdfThumbnailsSidebar");
  modalThumbnailsVisible = !modalThumbnailsVisible;
  sidebar.classList.toggle("open", modalThumbnailsVisible);

  if (modalThumbnailsVisible && !modalThumbnailsRendered && modalPdfDoc) {
    renderPdfThumbnails();
  }
}

function goToPdfPage(pageNum) {
  if (!modalPdfDoc || pageNum < 1 || pageNum > modalPdfDoc.numPages) return;
  modalPageNum = pageNum;
  updatePdfThumbnailSelection();
  if (modalReadingMode === "cascade") {
    const pageEl = cascadePageEls.get(pageNum)?.wrapper;
    if (pageEl) {
      pageEl.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    updatePdfPageIndicators();
  } else {
    renderPdfPage();
  }
}

function updatePdfPageIndicators() {
  document.getElementById("pageNumModal").textContent = modalPageNum;
  document.getElementById("mobilePageNumModal").textContent = modalPageNum;
  const progress = (modalPageNum / modalPdfDoc.numPages) * 100;
  document.getElementById("pdfProgressModal").style.width = progress + "%";
}

function renderCascadeView() {
  const pdfDoc = modalPdfDoc;
  if (!pdfDoc) return;
  const container = document.getElementById("pdfCascadeContainer");
  if (!container) return;

  teardownCascadeView();
  container.style.display = "block";

  const totalPages = pdfDoc.numPages;
  const fragment = document.createDocumentFragment();

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const pageWrapper = document.createElement("div");
    pageWrapper.className = "pdf-cascade-page";
    pageWrapper.dataset.page = pageNum;

    const pageCanvas = document.createElement("canvas");
    pageCanvas.className = "pdf-cascade-canvas";
    pageCanvas.dataset.page = pageNum;

    const label = document.createElement("span");
    label.className = "pdf-cascade-page-label";
    label.textContent = `${pageNum} / ${totalPages}`;

    pageWrapper.appendChild(pageCanvas);
    pageWrapper.appendChild(label);
    fragment.appendChild(pageWrapper);

    // Cache refs up front so hot paths never need querySelector.
    cascadePageEls.set(pageNum, { wrapper: pageWrapper, canvas: pageCanvas });
  }

  container.appendChild(fragment);
  cascadeBuilt = true;

  const root = document.getElementById("canvasContainerModal");

  // Loads pages as they approach the viewport. Once a page is scheduled it
  // is unobserved here so a burst of scrolling can't re-queue it repeatedly;
  // the unload observer below re-attaches it if it's ever purged.
  cascadeObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const pageNum = parseInt(entry.target.dataset.page, 10);
          scheduleCascadeRender(pdfDoc, pageNum);
          cascadeObserver.unobserve(entry.target);
        }
      });
    },
    {
      root,
      rootMargin: "600px 0px 600px 0px",
    },
  );

  // Frees rendered canvases once a page is far enough outside the viewport
  // that it's unlikely to be seen soon. Without this, a long chapter keeps
  // every page's full-resolution bitmap alive in memory for the whole
  // session, which is what makes cascade mode slow down/lag over time.
  cascadeUnloadObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const pageNum = parseInt(entry.target.dataset.page, 10);
        if (!entry.isIntersecting) {
          unloadCascadePage(pdfDoc, pageNum);
        }
      });
    },
    {
      root,
      rootMargin: "2500px 0px 2500px 0px",
    },
  );

  cascadeScrollObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          const pageNum = parseInt(entry.target.dataset.page, 10);
          if (modalPdfDoc !== pdfDoc) return;
          modalPageNum = pageNum;
          updatePdfPageIndicators();
          updatePdfThumbnailSelection();
        }
      });
    },
    {
      root,
      threshold: [0.5],
    },
  );

  cascadePageEls.forEach(({ wrapper }) => {
    cascadeObserver.observe(wrapper);
    cascadeUnloadObserver.observe(wrapper);
    cascadeScrollObserver.observe(wrapper);
  });

  updatePdfPageIndicators();
}

// eslint-disable-next-line no-unused-vars -- may be invoked from an inline onclick handler in HTML
async function renderCascadePage(pageNum) {
  const pdfDoc = modalPdfDoc;
  if (!pdfDoc) return;
  return renderCascadePageForDoc(pdfDoc, pageNum);
}

// Queues a page render with a concurrency cap so a fast scroll or the
// initial rootMargin prefetch doesn't fire off a dozen simultaneous
// pdf.js render tasks and stall the main thread.
function scheduleCascadeRender(pdfDoc, pageNum) {
  if (cascadeRenderedPages.has(pageNum) || cascadeRendering.has(pageNum)) return;
  if (cascadeRenderQueue.includes(pageNum)) return;
  cascadeRenderQueue.push(pageNum);
  pumpCascadeRenderQueue(pdfDoc);
}

function pumpCascadeRenderQueue(pdfDoc) {
  if (modalPdfDoc !== pdfDoc) {
    cascadeRenderQueue = [];
    return;
  }
  while (cascadeActiveRenders < CASCADE_MAX_CONCURRENT_RENDERS && cascadeRenderQueue.length) {
    const pageNum = cascadeRenderQueue.shift();
    cascadeActiveRenders++;
    renderCascadePageForDoc(pdfDoc, pageNum).finally(() => {
      cascadeActiveRenders--;
      pumpCascadeRenderQueue(pdfDoc);
    });
  }
}

async function renderCascadePageForDoc(pdfDoc, pageNum) {
  if (cascadeRenderedPages.has(pageNum) || cascadeRendering.has(pageNum)) return;
  if (!pdfDoc || modalPdfDoc !== pdfDoc) return;
  cascadeRendering.add(pageNum);

  try {
    const page = await pdfDoc.getPage(pageNum);
    if (modalPdfDoc !== pdfDoc) return;
    const els = cascadePageEls.get(pageNum);
    const canvas = els?.canvas;
    if (!canvas) {
      cascadeRendering.delete(pageNum);
      return;
    }

    // Cap DPR: on 3x+ displays an uncapped scale factor produces canvases
    // several times larger (and slower to paint) than the visible gain in
    // sharpness justifies, especially multiplied across many pages.
    const dpr = Math.min(window.devicePixelRatio || 1, CASCADE_MAX_DPR);
    const container = document.getElementById("pdfCascadeContainer");
    // container.clientWidth can briefly read as 0 (e.g. right as the
    // container is switched from display:none to visible, before layout
    // has caught up), which previously produced a negative containerWidth
    // and made canvas.width throw. Fall back to a sane width instead of
    // letting that happen.
    const rawWidth = container.clientWidth || window.innerWidth;
    const containerWidth = Math.min(Math.max(rawWidth - 48, 100), 800);

    const baseViewport = page.getViewport({ scale: 1 });
    const scale = (containerWidth / baseViewport.width) * modalScale;
    const scaledViewport = page.getViewport({ scale });

    canvas.width = scaledViewport.width * dpr;
    canvas.height = scaledViewport.height * dpr;
    canvas.style.width = scaledViewport.width + "px";
    canvas.style.height = scaledViewport.height + "px";
    // The wrapper defaults to full container width via normal block
    // layout, which is only right at modalScale 1. Set it explicitly
    // once we know the real zoomed size, or the canvas (sized correctly
    // above) ends up wider/narrower than its own wrapper box — the
    // "weird" cascade-zoom layout glitch.
    if (els?.wrapper) els.wrapper.style.width = scaledViewport.width + "px";

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    await page.render({
      canvasContext: ctx,
      viewport: scaledViewport,
    }).promise;

    cascadeRenderedPages.add(pageNum);
    // Reveal the canvas now that it actually has pixels in it — the CSS
    // keeps every cascade canvas at opacity:0 until its wrapper gets this
    // class, so without it the page renders successfully but stays
    // invisible (cascade mode looks completely blank).
    if (els?.wrapper) els.wrapper.classList.add("rendered");
  } catch (e) {
    if (e.name !== "RenderingCancelledException") {
      console.warn("Failed to render cascade page", pageNum, e);
    }
    // The intersection observer unobserves a page as soon as it schedules
    // a render, whether or not that render succeeds. If it failed here,
    // the page never lands in cascadeRenderedPages, so re-arm the load
    // observer for it - otherwise it's stuck blank forever with nothing
    // left to trigger a retry.
    if (modalPdfDoc === pdfDoc && cascadeObserver) {
      const els = cascadePageEls.get(pageNum);
      if (els?.wrapper) cascadeObserver.observe(els.wrapper);
    }
  } finally {
    cascadeRendering.delete(pageNum);
  }
}

// Drops a rendered page's canvas bitmap to reclaim memory once it's well
// outside the viewport, and re-arms the load observer so scrolling back
// re-renders it on demand.
function unloadCascadePage(pdfDoc, pageNum) {
  if (modalPdfDoc !== pdfDoc) return;
  if (!cascadeRenderedPages.has(pageNum)) return;

  const els = cascadePageEls.get(pageNum);
  if (els?.canvas) {
    const ctx = els.canvas.getContext("2d");
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    // Zeroing dimensions releases the backing bitmap immediately instead
    // of waiting on GC, which matters when dozens of pages accumulate.
    els.canvas.width = 0;
    els.canvas.height = 0;
  }
  if (els?.wrapper) els.wrapper.classList.remove("rendered");

  cascadeRenderedPages.delete(pageNum);
  const idx = cascadeRenderQueue.indexOf(pageNum);
  if (idx !== -1) cascadeRenderQueue.splice(idx, 1);

  if (els?.wrapper && cascadeObserver) {
    cascadeObserver.observe(els.wrapper);
  }
}

function rerenderCascadeVisible() {
  const pdfDoc = modalPdfDoc;
  if (modalReadingMode !== "cascade" || !cascadeBuilt || !pdfDoc) return;
  const containerRect = document.getElementById("canvasContainerModal").getBoundingClientRect();

  cascadePageEls.forEach(({ wrapper }, pageNum) => {
    const rect = wrapper.getBoundingClientRect();
    const nearViewport =
      rect.bottom > containerRect.top - 600 && rect.top < containerRect.bottom + 600;

    if (nearViewport) {
      // Force a fresh render at the new scale, even if already rendered.
      cascadeRenderedPages.delete(pageNum);
      scheduleCascadeRender(pdfDoc, pageNum);
    } else if (cascadeRenderedPages.has(pageNum)) {
      // Out of view at zoom-change time: just drop it instead of
      // re-rendering at the old scale, so it picks up the new scale
      // lazily via the load observer when scrolled into view.
      unloadCascadePage(pdfDoc, pageNum);
    }
  });
}

let _pdfRenderQueue = Promise.resolve();

async function renderPdfPage() {
  const pdfDoc = modalPdfDoc;
  if (modalRenderTask) {
    modalRenderTask.cancel();
    modalRenderTask = null;
  }

  if (!pdfDoc || modalPageNum < 1 || modalPageNum > pdfDoc.numPages) return;

  const previewCanvas = document.getElementById("pdfRenderModal");
  if (previewCanvas) previewCanvas.style.transform = "none";
  lastRenderedScale = modalScale;

  setPdfNavButtonsDisabled(true);

  try {
    const page = await pdfDoc.getPage(modalPageNum);
    if (modalPdfDoc !== pdfDoc) return;
    const canvas = document.getElementById("pdfRenderModal");
    const outerContainer = document.getElementById("canvasContainerModal");
    const wrapperEl = document.getElementById("canvasWrapperModal");
    canvas.style.display = "block";

    const dpr = window.devicePixelRatio || 1;
    // Measure the stable outer scroll box, not the inner wrapper: a
    // wrapper that shrink-wraps to its canvas (no explicit width/height)
    // inside an overflow:auto ancestor can collapse to the canvas's own
    // current size instead of the real available space.
    const wrapperStyle = getComputedStyle(wrapperEl);
    const padX =
      (parseFloat(wrapperStyle.paddingLeft) || 0) + (parseFloat(wrapperStyle.paddingRight) || 0);
    const padY =
      (parseFloat(wrapperStyle.paddingTop) || 0) + (parseFloat(wrapperStyle.paddingBottom) || 0);
    const containerWidth = outerContainer.clientWidth - padX;
    const containerHeight = outerContainer.clientHeight - padY;

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

    if (modalPdfDoc !== pdfDoc) return;

    canvas.style.opacity = "1";
    canvas.style.transition = "opacity 0.2s ease";

    document.getElementById("pageNumModal").textContent = modalPageNum;
    document.getElementById("mobilePageNumModal").textContent = modalPageNum;

    const progress = (modalPageNum / pdfDoc.numPages) * 100;
    document.getElementById("pdfProgressModal").style.width = progress + "%";

    updatePdfThumbnailSelection();
  } catch (error) {
    if (error.name !== "AbortError" && error.name !== "RenderingCancelledException") {
      console.error("Error rendering page:", error);
      const canvas = document.getElementById("pdfRenderModal");
      canvas.style.opacity = "0.3";
    }
  } finally {
    setPdfNavButtonsDisabled(false);
  }
}

function setPdfNavButtonsDisabled(disabled) {
  const buttons = ["pdfPrevModal", "pdfNextModal"];
  buttons.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  });
}

// Shows a zoom change instantly via a cheap CSS transform on the
// already-rendered canvas instead of re-rasterizing the PDF on every
// single zoom-change event. This is what keeps pinch-zoom (and rapid
// +/- clicks) smooth on mobile instead of stuttering through a full
// pdf.js render per touchmove tick. Passing the pinch midpoint anchors
// the scale to the fingers instead of the page jumping to re-center.
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

// Actually re-renders the page at the new scale. Expensive, so callers
// debounce this (scheduleZoomCommit) rather than call it on every
// zoom-change event. When an anchor point is given (pinch), the scroll
// container is repositioned after the re-render so whatever was under
// the fingers stays under the fingers instead of the view recentering.
function commitZoomRender(anchorClientPoint) {
  clearTimeout(zoomRenderTimer);
  zoomRenderTimer = null;

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

  renderPdfPage().then(() => {
    if (!anchorFrac) return;
    const c = document.getElementById("canvasContainerModal");
    if (!c) return;
    c.scrollLeft = anchorFrac.fracX * c.scrollWidth - anchorFrac.localX;
    c.scrollTop = anchorFrac.fracY * c.scrollHeight - anchorFrac.localY;
  });
}

function scheduleZoomCommit(delay = 180, anchorClientPoint) {
  clearTimeout(zoomRenderTimer);
  zoomRenderTimer = setTimeout(() => commitZoomRender(anchorClientPoint), delay);
}

// Same idea for cascade mode: scale the whole page stack with a CSS
// transform while the gesture is live, and debounce the real re-render
// (which re-rasterizes every nearby page) until it settles.
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
  rerenderCascadeVisible();
}

function initPdfEvents() {
  document.getElementById("pdfModalClose").addEventListener("click", closePdfModal);
  document.getElementById("pdfModalBackdrop").addEventListener("click", closePdfModal);

  document.getElementById("pdfPrevModal").addEventListener("click", () => {
    if (modalPageNum > 1 && !document.getElementById("pdfPrevModal").disabled) {
      goToPdfPage(modalPageNum - 1);
    }
  });

  document.getElementById("pdfNextModal").addEventListener("click", () => {
    if (
      modalPdfDoc &&
      modalPageNum < modalPdfDoc.numPages &&
      !document.getElementById("pdfNextModal").disabled
    ) {
      goToPdfPage(modalPageNum + 1);
    }
  });

  document.getElementById("pageInputModal").addEventListener("change", (e) => {
    const page = parseInt(e.target.value, 10);
    if (page && page > 0 && page <= (modalPdfDoc?.numPages || 1)) {
      goToPdfPage(page);
    }
    e.target.value = "";
  });

  function updatePdfZoomDisplay() {
    document.getElementById("zoomDisplayModal").textContent = Math.round(modalScale * 100) + "%";
  }

  // Shared by the toolbar buttons, keyboard shortcuts, and wheel/trackpad
  // zoom: show the new scale immediately via CSS preview, then debounce
  // the actual re-render. anchorClientPoint (cursor position) keeps
  // whatever's under the pointer fixed in place while zooming, same as
  // the pinch-zoom anchor.
  function applyZoomChange(anchorClientPoint) {
    updatePdfZoomDisplay();
    if (modalReadingMode === "cascade") {
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

  document.getElementById("pdfFullscreenModal").addEventListener("click", () => {
    const elem = document.getElementById("pdfViewerModal");
    if (!document.fullscreenElement) {
      if (elem.requestFullscreen) elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
      else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
      document.getElementById("fsIconModal").classList.replace("fa-expand", "fa-compress");
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
      document.getElementById("fsIconModal").classList.replace("fa-compress", "fa-expand");
    }
  });

  document.getElementById("pdfDownloadModal").addEventListener("click", async () => {
    if (!modalCurrentUrl) return;
    const filename = decodeURIComponent(modalCurrentUrl.split("/").pop()) || "document.pdf";
    try {
      const response = await fetch(modalCurrentUrl);
      if (!response.ok || !response.body) throw new Error("Download request failed");
      const reader = response.body.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const blob = new Blob(chunks);
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      a.remove();
    } catch {
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = modalCurrentUrl;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast(
        "⚠️ Your browser or ad blocker prevented direct download. The file opened in a new tab; save it from there.",
      );
    }
  });

  document.getElementById("pdfRetryModal").addEventListener("click", () => {
    if (modalCurrentUrl) {
      loadPdfFromUrl(modalCurrentUrl);
    }
  });

  document.getElementById("pdfThumbnailToggle").addEventListener("click", togglePdfThumbnails);
  document.getElementById("pdfThumbnailsClose").addEventListener("click", () => {
    document.getElementById("pdfThumbnailsSidebar").classList.remove("open");
    modalThumbnailsVisible = false;
  });

  document
    .getElementById("pdfModeSingle")
    .addEventListener("click", () => setReadingMode("single"));
  document
    .getElementById("pdfModeCascade")
    .addEventListener("click", () => setReadingMode("cascade"));

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
          goToPdfPage(modalPageNum - 1);
        }
        break;
      case "ArrowRight":
      case "d":
      case "D":
        e.preventDefault();
        if (modalPdfDoc && modalPageNum < modalPdfDoc.numPages) {
          goToPdfPage(modalPageNum + 1);
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
        togglePdfThumbnails();
        break;
    }
  });

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let pinchStartDistance = 0;
  let pinchStartScale = 1;
  let pinchAnchor = null;
  let isPinching = false;
  let singleTouchMoved = false;
  // Right as a pinch ends, the lifting fingers can register on touchend
  // as a tap with near-zero dx/dy/dt versus wherever the first finger
  // originally landed, which would misread as a page turn immediately
  // after zooming. This flag makes that touchend a no-op instead.
  let suppressNextTap = false;
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  const canvasContainer = document.getElementById("canvasContainerModal");

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

  // Click-drag panning once zoomed in, for desktop/mouse users who don't
  // have pinch or a scroll-wheel-only workflow. Only engages past a
  // "just zoomed" threshold so normal edge-tap page turning at fit
  // scale is untouched.
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panScrollLeft = 0;
  let panScrollTop = 0;
  canvasContainer.addEventListener("mousedown", (e) => {
    if (modalReadingMode === "cascade") return;
    if (modalScale <= 1.02) return;
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

  const getTouchDistance = (firstTouch, secondTouch) =>
    Math.hypot(firstTouch.clientX - secondTouch.clientX, firstTouch.clientY - secondTouch.clientY);
  const getTouchMidpoint = (firstTouch, secondTouch) => ({
    clientX: (firstTouch.clientX + secondTouch.clientX) / 2,
    clientY: (firstTouch.clientY + secondTouch.clientY) / 2,
  });

  canvasContainer.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        // A second finger landing always wins immediately — whatever the
        // first finger was doing (a nascent pan/tap) is abandoned here
        // rather than left to resolve later, so a pinch is never
        // misread as a swipe mid-gesture.
        pinchStartDistance = getTouchDistance(e.touches[0], e.touches[1]);
        pinchStartScale = modalScale;
        pinchAnchor = getTouchMidpoint(e.touches[0], e.touches[1]);
        isPinching = true;
        singleTouchMoved = false;
        return;
      }
      if (isPinching || e.touches.length !== 1) return;
      const touch = e.touches?.[0];
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
    },
    { passive: true },
  );

  canvasContainer.addEventListener(
    "touchmove",
    (e) => {
      if (!isPinching || e.touches.length !== 2) {
        // Single-finger movement: let native scroll/pan handle it (no
        // preventDefault) — we only need to know a real drag happened
        // so touchend can tell it apart from a tap.
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
          pinchStartScale * (getTouchDistance(e.touches[0], e.touches[1]) / pinchStartDistance),
        ),
      );
      if (Math.abs(nextScale - modalScale) < 0.01) return;
      modalScale = nextScale;
      document.getElementById("zoomDisplayModal").textContent = Math.round(modalScale * 100) + "%";
      // Instant CSS-transform preview during the gesture — the real,
      // expensive re-render is debounced until the pinch settles, so a
      // fast pinch never queues up a stack of overlapping pdf.js
      // render calls.
      if (modalReadingMode === "cascade") {
        applyCascadeZoomPreview();
        scheduleCascadeZoomCommit(220);
      } else {
        applyZoomPreview(pinchAnchor);
        scheduleZoomCommit(220, pinchAnchor);
      }
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
          suppressNextTap = true;
          setTimeout(() => {
            suppressNextTap = false;
          }, 300);
          if (modalReadingMode === "cascade") {
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
      if (modalReadingMode === "cascade") return;
      const rect = document.getElementById("canvasContainerModal").getBoundingClientRect();

      // Double-tap to zoom, matching native photo/PDF viewer behavior.
      // Toggles between fit scale and 2x, anchored to the tap point.
      const now = Date.now();
      const dTapX = Math.abs(touch.clientX - lastTapX);
      const dTapY = Math.abs(touch.clientY - lastTapY);
      if (now - lastTapTime < 300 && dTapX < 40 && dTapY < 40) {
        lastTapTime = 0;
        modalScale = modalScale > 1.02 ? 1.0 : 2.0;
        applyZoomChange({ clientX: touch.clientX, clientY: touch.clientY });
        return;
      }
      lastTapTime = now;
      lastTapX = touch.clientX;
      lastTapY = touch.clientY;

      const relX = (touch.clientX - rect.left) / rect.width;
      if (relX <= 0.45) {
        if (modalPageNum > 1) {
          goToPdfPage(modalPageNum - 1);
        }
      } else if (relX >= 0.55) {
        if (modalPdfDoc && modalPageNum < modalPdfDoc.numPages) {
          goToPdfPage(modalPageNum + 1);
        }
      }
    },
    { passive: true },
  );

  canvasContainer.addEventListener("touchcancel", () => {
    isPinching = false;
    pinchStartDistance = 0;
    pinchStartScale = modalScale;
    singleTouchMoved = false;
    pinchAnchor = null;
    if (modalReadingMode === "cascade") {
      scheduleCascadeZoomCommit(0);
    } else {
      scheduleZoomCommit(0);
    }
  });

  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (modalPdfDoc && document.getElementById("pdfModal").classList.contains("open")) {
        if (modalReadingMode === "cascade") rerenderCascadeVisible();
        else renderPdfPage();
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

const R2_BASE_URL = "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev/";

let currentVersion = "moke";
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
let _isSwitching = false;
let translations = null;

// Supported languages
const SUPPORTED_LANGUAGES = ["es", "en", "tg"];

// Normalize language with Spanish fallback
function normalizeLanguage(lang, fallback) {
  fallback = fallback || "es";
  if (!lang) return fallback;
  const normalized = lang.toLowerCase().trim();
  if (SUPPORTED_LANGUAGES.includes(normalized)) return normalized;
  // Handle partial matches (e.g., 'en-US' -> 'en', 'tg-PH' -> 'tg')
  for (const supported of SUPPORTED_LANGUAGES) {
    if (normalized.startsWith(supported + "-") || normalized === supported) {
      return supported;
    }
  }
  return fallback;
}

// Expose for other scripts
window.normalizeLanguage = normalizeLanguage;
window.SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;

// Load version data from JSON
function getVersionData(version) {
  if (!translations || !translations.versions) return null;
  return translations.versions[version] || null;
}

function getChaptersForVersion(version) {
  const data = getVersionData(version);
  if (!data || !data.chapters) return {};
  return data.chapters;
}

function getDescriptionsForVersion(version) {
  const data = getVersionData(version);
  if (!data || !data.descriptions) return {};
  return data.descriptions;
}

function getPathForVersion(version) {
  const data = getVersionData(version);
  if (!data || !data.path) return "manga/";
  return data.path;
}

function getVolumeThumbnail(version, volume) {
  if (!translations || !translations.volumeThumbnails) return null;
  const versionThumbs = translations.volumeThumbnails[version];
  if (!versionThumbs) return null;
  return versionThumbs[`volume_${volume}`] || null;
}

// Manga reader configuration
const MANGA_CONFIG = {
  get chapters() {
    const chapters = getChaptersForVersion(currentVersion);
    let ids = Object.keys(chapters).map(Number);
    return ids.sort((a, b) => {
      const volA = this.getVolume(a) || 999;
      const volB = this.getVolume(b) || 999;
      if (volA !== volB) return volA - volB;
      return a - b;
    });
  },
  getPdfUrl(chapter) {
    const path = getPathForVersion(currentVersion);
    const pdfMap = translations?.chapterPdfMap || {};
    let fileName = pdfMap[`${currentVersion}:${chapter}`] || pdfMap[String(chapter)];
    if (!fileName) {
      fileName = `Ch. ${chapter}.pdf`;
    }
    if (/^https?:\/\//i.test(fileName)) {
      return fileName;
    }
    if (currentLang === "es") {
      return `https://media.adashimaverse.com/Manga_descarga/${fileName}`;
    }
    return `${R2_BASE_URL}${path}${fileName}`;
  },

  getVolume(chapter) {
    const chapters = getChaptersForVersion(currentVersion);
    return chapters[chapter] || null;
  },

  getDescription(chapter) {
    const descriptions = getDescriptionsForVersion(currentVersion);
    return descriptions[String(chapter)] || "";
  },

  getVersionLabel() {
    const data = getVersionData(currentVersion);
    return data?.label || currentVersion.charAt(0).toUpperCase() + currentVersion.slice(1);
  },

  isVersionAvailable() {
    const chapters = getChaptersForVersion(currentVersion);
    return Object.keys(chapters).length > 0;
  },

  getVolumeThumbnail(volume) {
    return getVolumeThumbnail(currentVersion, volume);
  },
};

// FIXED: Use LanguageSwitch for data URL
async function loadTranslations(lang) {
  // Normalize the language code
  lang = normalizeLanguage(lang, "en");

  try {
    const url =
      window.LanguageSwitch && typeof window.LanguageSwitch.getDataUrl === "function"
        ? window.LanguageSwitch.getDataUrl("manga", lang)
        : (() => {
            // Fallback path resolution
            const path = window.location.pathname;
            if (path.includes("/src/pages/")) {
              return `../../data/manga/${lang}.json?v=${Date.now()}`;
            } else if (path.includes("/src/")) {
              return `../data/manga/${lang}.json?v=${Date.now()}`;
            }
            return `./src/data/manga/${lang}.json?v=${Date.now()}`;
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
    return data;
  } catch (e) {
    console.error("Failed to load translations:", e);
    showToast("Failed to load manga data. Please refresh the page.");
    return null;
  }
}

function getText(key) {
  if (!translations) return key;
  const keys = key.split(".");
  let value = translations;
  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = value[k];
    } else {
      return key;
    }
  }
  return value || key;
}

function getPdfText(key) {
  return getText(key);
}

function applyUITranslations() {
  document.title = getText("pageTitle") || "Adashima - Manga";
  const titleEl = document.querySelector(".update-title");
  if (titleEl) titleEl.textContent = getText("headerTitle") || "Manga";

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.placeholder = getText("searchPlaceholder") || "Search by chapter, volume...";
  }

  document.querySelectorAll(".view-label").forEach((el) => {
    if (el.closest("#viewListBtn")) {
      el.textContent = getText("viewList") || "List";
    } else if (el.closest("#viewGridBtn")) {
      el.textContent = getText("viewGrid") || "Grid";
    }
  });

  const versionMokeLabel = document.getElementById("versionMokeLabel");
  const versionManiLabel = document.getElementById("versionManiLabel");
  const versionAnthologyLabel = document.getElementById("versionAnthologyLabel");
  if (versionMokeLabel) versionMokeLabel.textContent = getText("versionMoke") || "Moke";
  if (versionManiLabel) versionManiLabel.textContent = getText("versionMani") || "Mani";
  if (versionAnthologyLabel)
    versionAnthologyLabel.textContent = getText("versionAnthology") || "Anthology";

  const versionManiBtn = document.getElementById("versionManiBtn");
  if (versionManiBtn) versionManiBtn.style.display = currentLang === "es" ? "none" : "";

  // Set initial version toggle state
  const activeIndex = currentVersion === "moke" ? 0 : currentVersion === "mani" ? 1 : 2;
  document.querySelectorAll(".version-toggle-btn").forEach((btn, i) => {
    btn.classList.toggle("active", i === activeIndex);
  });
  const slider = document.getElementById("versionToggleSlider");
  if (slider) {
    slider.style.transform = `translateX(${activeIndex * 100}%)`;
  }

  const downloadBtn = document.querySelector(".download-all-btn");
  if (downloadBtn) {
    const btnText = document.getElementById("downloadBtnText");
    if (btnText) btnText.textContent = getText("downloadButton") || "Download All Chapters";
    downloadBtn.style.display = "none";
  }

  // Footer is now the shared component (src/components/js/footer.js),
  // which handles its own translation — nothing to do here.
}

function openPdfReader(chapterId) {
  const url = MANGA_CONFIG.getPdfUrl(chapterId);
  openPdfModal(chapterId, url);
}

let currentView = "grid";
let searchTerm = "";

function setView(view) {
  currentView = view;
  const container = document.getElementById("chapters-container");
  if (container) {
    container.classList.remove("view-grid", "view-list");
    container.classList.add(`view-${view}`);
  }

  // Update button states
  const listBtn = document.getElementById("viewListBtn");
  const gridBtn = document.getElementById("viewGridBtn");
  if (listBtn) listBtn.classList.toggle("active", view === "list");
  if (gridBtn) gridBtn.classList.toggle("active", view === "grid");

  // Update slider position
  const slider = document.getElementById("viewToggleSlider");
  const activeBtn = view === "grid" ? gridBtn : listBtn;
  if (activeBtn && slider) {
    const btnWidth = activeBtn.offsetWidth;
    const sliderWidth = slider.offsetWidth;
    const offset = activeBtn.offsetLeft + (btnWidth - sliderWidth) / 2;
    slider.style.transform = `translateX(${offset}px)`;
  }

  // Show/hide content containers
  const listContent = document.getElementById("listViewContainer");
  const gridContent = document.getElementById("gridViewContainer");
  if (listContent) listContent.style.display = view === "list" ? "" : "none";
  if (gridContent) gridContent.style.display = view === "grid" ? "" : "none";

  // Re-apply search
  if (searchTerm) {
    applySearch(searchTerm);
  }
}

function setVersion(version) {
  if (version === currentVersion) return;

  // Check if version has chapters
  const chapters = getChaptersForVersion(version);
  if (Object.keys(chapters).length === 0) {
    showToast(getText("versionNotAvailable") || "This version is not available yet.");
    return;
  }

  currentVersion = version;

  const mokeBtn = document.getElementById("versionMokeBtn");
  const maniBtn = document.getElementById("versionManiBtn");
  const anthologyBtn = document.getElementById("versionAnthologyBtn");

  if (mokeBtn) mokeBtn.classList.toggle("active", version === "moke");
  if (maniBtn) maniBtn.classList.toggle("active", version === "mani");
  if (anthologyBtn) anthologyBtn.classList.toggle("active", version === "anthology");

  // Update slider position
  const slider = document.getElementById("versionToggleSlider");
  const btns = document.querySelectorAll(".version-toggle-btn");
  let activeIndex = 0;
  btns.forEach((btn, i) => {
    if (btn.classList.contains("active")) activeIndex = i;
  });
  const translateX = activeIndex * 100;
  if (slider) {
    slider.style.transform = `translateX(${translateX}%)`;
  }

  localStorage.setItem("adashima_manga_version", version);
  initAllChapters();
}

function applySearch(term) {
  searchTerm = term.toLowerCase().trim();
  let hasVisible = false;

  document.querySelectorAll(".manga-item").forEach((el) => {
    const text = el.textContent.toLowerCase();
    const match = !searchTerm || text.includes(searchTerm);
    el.classList.toggle("hidden-by-search", !match);
    if (match) hasVisible = true;
  });

  document.querySelectorAll(".volume-card").forEach((el) => {
    const text = el.textContent.toLowerCase();
    const match = !searchTerm || text.includes(searchTerm);
    el.classList.toggle("hidden-by-search", !match);
    if (match) hasVisible = true;
  });

  const gridContainer = document.getElementById("gridViewContainer");
  const listContainer = document.getElementById("listViewContainer");

  if (!hasVisible && searchTerm) {
    showEmptyState(gridContainer, listContainer);
  } else {
    removeEmptyState(gridContainer, listContainer);
  }
}

function showEmptyState(gridContainer, listContainer) {
  const emptyHtml = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-search"></i></div>
                <div class="empty-state-title">${getText("emptyStateTitle") || "No results found"}</div>
                <div class="empty-state-desc">${getText("emptyStateDesc") || "Try a different search term"}</div>
                <div class="empty-state-suggestion">${getText("emptyStateSuggestion") || "Try searching by chapter number or volume"}</div>
            </div>
        `;

  if (currentView === "grid" && gridContainer) {
    const existing = gridContainer.querySelector(".empty-state");
    if (!existing) {
      const wrapper = document.createElement("div");
      wrapper.className = "empty-state-wrapper";
      wrapper.style.width = "100%";
      wrapper.style.gridColumn = "1 / -1";
      wrapper.innerHTML = emptyHtml;
      gridContainer.appendChild(wrapper);
    }
  } else if (listContainer) {
    const existing = listContainer.querySelector(".empty-state");
    if (!existing) {
      const wrapper = document.createElement("div");
      wrapper.className = "empty-state-wrapper";
      wrapper.innerHTML = emptyHtml;
      listContainer.appendChild(wrapper);
    }
  }
}

function removeEmptyState(gridContainer, listContainer) {
  if (gridContainer) {
    const wrapper = gridContainer.querySelector(".empty-state-wrapper");
    if (wrapper) wrapper.remove();
  }
  if (listContainer) {
    const wrapper = listContainer.querySelector(".empty-state-wrapper");
    if (wrapper) wrapper.remove();
  }
}

function groupChaptersByVolume(allIds) {
  const volumeGroups = new Map();

  for (const ch of allIds) {
    const volume = MANGA_CONFIG.getVolume(ch);
    if (volume === null) continue;

    if (!volumeGroups.has(volume)) {
      volumeGroups.set(volume, []);
    }
    volumeGroups.get(volume).push({
      id: ch,
      volume: volume,
    });
  }

  return volumeGroups;
}

function buildListVolumeHTML(volume, chapters) {
  const volumeLabel = getText("chapterLabels.volume") || "Volume";
  const displayTitle = `${volumeLabel} ${volume}`;
  const chapterLabel = getText("chapterLabels.chapter") || "Chapter";
  let chaptersHtml = "";

  for (const ch of chapters) {
    chaptersHtml += buildListChapterHTML(ch);
  }

  const desc = chapters.length > 0 ? MANGA_CONFIG.getDescription(chapters[0].id) || "" : "";

  return `<details class="manga-item" data-volume="${volume}">
            <summary class="manga-summary">
                <span class="summary-title-wrap">
                    <i class="fas fa-book-open"></i>
                    <span>${displayTitle}</span>
                    <span class="summary-volume-badge">${chapters.length} ${chapterLabel}${chapters.length > 1 ? "s" : ""}</span>
                    ${desc ? `<span class="summary-desc-preview">${desc}</span>` : ""}
                </span>
                <i class="fas fa-chevron-down chevron-icon"></i>
            </summary>
            <div class="manga-content">
                ${desc ? `<div class="manga-description"><p>${desc}</p></div>` : ""}
                ${chaptersHtml}
            </div>
        </details>`;
}

function buildListChapterHTML(ch) {
  const readLabel = getText("read") || "Read";
  const chapterLabel = getText("chapterLabels.chapter") || "Chapter";
  const desc = MANGA_CONFIG.getDescription(ch.id);

  return `
            <div class="chapter-row" data-chapter="${ch.id}">
                <div class="chapter-info">
                    <span class="chapter-title">${chapterLabel} ${ch.id}</span>
                    ${desc ? `<span class="chapter-subtitle">${desc}</span>` : ""}
                </div>
                <div class="chapter-actions">
            <button class="chapter-btn read-btn" data-chapter="${ch.id}">
                        <i class="fas fa-book-open"></i> ${readLabel}
                    </button>
                </div>
            </div>
        `;
}

function getGridTranslationCredit() {
  const credits = {
    moke: { name: "Cuetie Scans", url: "https://discord.gg/xCRUwzhqyJ" },
    mani: { name: "Sneikkimies", url: "https://sneikkimies.github.io/" },
    anthology: { name: "Sneikkimies", url: "https://sneikkimies.github.io/" },
  };
  return credits[currentVersion] || null;
}

function buildGridVolumeHTML(volume, chapters) {
  const volumeLabel = getText("chapterLabels.volume") || "Volume";
  const displayTitle = `${volumeLabel} ${volume}`;
  const chapterLabel = getText("chapterLabels.chapter") || "Chapter";
  const desc = chapters.length > 0 ? MANGA_CONFIG.getDescription(chapters[0].id) || "" : "";
  const thumbUrl = MANGA_CONFIG.getVolumeThumbnail(volume);
  const thumbAlt = displayTitle;
  const summary = `${chapters.length} ${chapterLabel}${chapters.length > 1 ? "s" : ""}${desc ? ` · ${desc}` : ""}`;
  return `
    <article class="volume-card" data-volume="${volume}" tabindex="0" role="button" aria-label="Open ${displayTitle}">
      ${thumbUrl ? `<img class="card-img" src="${thumbUrl}" alt="${thumbAlt}" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\'card-img card-img-placeholder\'><i class=\'fas fa-book-open\'></i></div>'">` : `<div class="card-img card-img-placeholder"><i class="fas fa-book-open"></i></div>`}
      <div class="card-body">
        <div class="card-title">${displayTitle}</div>
        <div class="card-desc">${summary}</div>
      </div>
    </article>`;
}

let volumeModalCloseTimer = null;

function openVolumeModal(volume) {
  const data = getVersionData(currentVersion);
  const chapters = Object.keys(data?.chapters || {})
    .map(Number)
    .filter(Number.isFinite)
    .filter((id) => Number(data.chapters[id]) === Number(volume));
  const modal = document.getElementById("volumeModal");
  const content = document.getElementById("volumeModalContent");
  if (!modal || !content) return;

  clearTimeout(volumeModalCloseTimer);
  modal.classList.remove("is-closing");

  const title = `${getText("chapterLabels.volume") || "Volume"} ${volume}`;
  const chapterLabel = getText("chapterLabels.chapter") || "Chapter";
  const credit = getGridTranslationCredit();
  const cover = MANGA_CONFIG.getVolumeThumbnail(volume);
  const list = chapters.map((id) => buildGridChapterHTML({ id })).join("");
  const translationLabel = getText("volumeModal.translation") || "Translation";

  content.innerHTML = `
    <div class="volume-modal-content">
      <div class="volume-modal-cover-panel">
        ${cover ? `<img class="volume-modal-cover" src="${cover}" alt="${title}">` : `<div class="volume-modal-cover card-img-placeholder"><i class="fas fa-book-open"></i></div>`}
      </div>
      <div class="volume-modal-details">
        <div class="volume-modal-header">
          <h2 class="volume-modal-title">${title}</h2>
          <p class="volume-modal-meta">${chapters.length} ${chapterLabel}${chapters.length !== 1 ? "s" : ""}</p>
        </div>
        ${credit ? `<div class="volume-modal-credit"><i class="fas fa-language" aria-hidden="true"></i><span>${translationLabel}</span><a href="${credit.url}" target="_blank" rel="noopener noreferrer">${credit.name}</a></div>` : ""}
        <div class="volume-modal-chapters">${list}</div>
      </div>
    </div>`;

  modal.hidden = false;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    modal.classList.add("is-open");
    modal.querySelector(".volume-modal-close")?.focus({ preventScroll: true });
  });
}

function closeVolumeModal(immediate = false) {
  const modal = document.getElementById("volumeModal");
  if (!modal || modal.hidden) return;
  clearTimeout(volumeModalCloseTimer);

  if (immediate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    modal.classList.remove("is-open", "is-closing");
    modal.hidden = true;
    document.body.style.overflow = "";
    return;
  }

  modal.classList.remove("is-open");
  modal.classList.add("is-closing");
  volumeModalCloseTimer = setTimeout(() => {
    modal.hidden = true;
    modal.classList.remove("is-closing");
    document.body.style.overflow = "";
  }, 220);
}

function buildGridChapterHTML(ch) {
  const readLabel = getText("read") || "Read";
  const chapterLabel = getText("chapterLabels.chapter") || "Chapter";
  const desc = MANGA_CONFIG.getDescription(ch.id);

  return `
    <button class="chapter-row chapter-read-row read-btn" type="button" data-chapter="${ch.id}" aria-label="${readLabel} ${chapterLabel} ${ch.id}">
      <span class="chapter-info">
        <span class="chapter-title">${chapterLabel} ${ch.id}</span>
        ${desc ? `<span class="chapter-subtitle">${desc}</span>` : ""}
      </span>
      <span class="chapter-open-icon" aria-hidden="true"><i class="fas fa-book-open-reader"></i></span>
    </button>
  `;
}

function attachVolumeModalListeners() {
  const modal = document.getElementById("volumeModal");
  if (!modal || modal.dataset.listenersBound === "1") return;
  modal.dataset.listenersBound = "1";

  modal.addEventListener("click", (event) => {
    const readRow = event.target.closest(".volume-modal-chapters .read-btn");
    if (!readRow) return;
    event.preventDefault();
    const chapterId = Number(readRow.dataset.chapter);
    if (Number.isNaN(chapterId)) return;
    closeVolumeModal(true);
    requestAnimationFrame(() => openReader(chapterId));
  });
}

function attachAccordionListeners() {
  document.querySelectorAll("details.manga-item").forEach((d) => attachSingleListener(d));
}

function attachChapterActionListeners(container) {
  if (!container || container.dataset.chapterActionsBound === "1") return;
  container.dataset.chapterActionsBound = "1";
  container.addEventListener("click", (e) => {
    const readBtn = e.target.closest(".read-btn");
    if (readBtn) {
      e.preventDefault();
      e.stopPropagation();
      const chapterId = Number(readBtn.dataset.chapter);
      if (!Number.isNaN(chapterId)) {
        closeVolumeModal(true);
        requestAnimationFrame(() => openReader(chapterId));
      }
      return;
    }

    const volumeCard = e.target.closest(".volume-card");
    if (volumeCard && !e.target.closest(".chapter-row")) {
      e.preventDefault();
      openVolumeModal(Number(volumeCard.dataset.volume));
    }
  });

  container.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const volumeCard = e.target.closest(".volume-card");
    if (!volumeCard || e.target.closest("button, a")) return;
    e.preventDefault();
    openVolumeModal(Number(volumeCard.dataset.volume));
  });
}

function attachSingleListener(detail) {
  if (detail.dataset.listenerAttached) return;
  detail.dataset.listenerAttached = "1";
  detail.addEventListener("toggle", () => {
    if (!detail.open) return;
    document.querySelectorAll("details.manga-item").forEach((other) => {
      if (other !== detail && other.open) other.removeAttribute("open");
    });
  });
}

function openReader(chapterId) {
  openPdfReader(chapterId);
}

function initAllChapters() {
  const container = document.getElementById("chapters-container");
  if (!container) return;

  const allIds = MANGA_CONFIG.chapters;

  if (allIds.length === 0) {
    container.innerHTML = `
                <div class="coming-soon-state">
                    <div class="coming-soon-icon"><i class="fas fa-pen-fancy"></i></div>
                    <div class="coming-soon-title">Coming Soon!</div>
                    <div class="coming-soon-desc">This version is currently in preparation and will be available soon.</div>
                    <button class="coming-soon-btn" onclick="setVersion('moke')">
                        <i class="fas fa-book-open"></i> Switch to Moke
                    </button>
                </div>
            `;
    return;
  }

  const volumeGroups = groupChaptersByVolume(allIds);

  let listHtml = "";
  for (const [volume, chapters] of volumeGroups) {
    listHtml += buildListVolumeHTML(volume, chapters);
  }

  let gridHtml = "";
  for (const [volume, chapters] of volumeGroups) {
    gridHtml += buildGridVolumeHTML(volume, chapters);
  }

  if (!listHtml || volumeGroups.size === 0) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:rgba(92,58,107,0.5);">${getText("noChapters") || "No chapters available."}</div>`;
    return;
  }

  // Always create both views
  container.innerHTML = `
            <div class="view-list-content" id="listViewContainer">${listHtml}</div>
            <div class="volumes-grid" id="gridViewContainer">${gridHtml}</div>
        `;

  // Set the view (default is grid)
  setView(currentView);
  attachAccordionListeners();
  attachChapterActionListeners(container);
}

(function () {
  const c = document.getElementById("particles");
  if (!c) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 50; i++) {
    const s = document.createElement("div");
    s.className = "star";
    s.style.cssText = `left:${Math.random() * 100}%;animation-duration:${5 + Math.random() * 10}s,3s;animation-delay:${Math.random() * 10}s,0s;width:${2 + Math.random() * 4}px;height:${2 + Math.random() * 4}px;`;
    frag.appendChild(s);
  }
  c.appendChild(frag);
})();

document.addEventListener("DOMContentLoaded", async function () {
  // Load saved version preference
  const savedVersion = localStorage.getItem("adashima_manga_version");
  if (savedVersion === "mani" || savedVersion === "anthology" || savedVersion === "moke") {
    currentVersion = savedVersion;
  }

  // FIXED: Use LanguageSwitch for current language with 'en' fallback
  const langFromSwitch = window.LanguageSwitch?.getCurrentLanguage?.();
  if (langFromSwitch) {
    currentLang = normalizeLanguage(langFromSwitch, "en");
  } else {
    // Fallback: read from localStorage
    const savedLang =
      localStorage.getItem("lang") ||
      localStorage.getItem("preferredLanguage") ||
      localStorage.getItem("adashima_manga_lang") ||
      "en";
    currentLang = normalizeLanguage(savedLang, "en");
  }

  // Ensure we have a valid language
  currentLang = normalizeLanguage(currentLang, "en");
  document.documentElement.lang = currentLang;

  // Ensure localStorage is consistent
  localStorage.setItem("lang", currentLang);
  localStorage.setItem("preferredLanguage", currentLang);
  localStorage.setItem("adashima_manga_lang", currentLang);

  // If LanguageSwitch is available, ensure it matches
  if (window.LanguageSwitch?.getCurrentLanguage?.() !== currentLang) {
    window.LanguageSwitch?.setLanguage?.(currentLang);
  }

  // Mani version only available in English
  if (currentLang === "es" && currentVersion === "mani") {
    currentVersion = "moke";
  }

  const data = await loadTranslations(currentLang);
  if (!data) {
    const container = document.getElementById("chapters-container");
    if (container) {
      container.innerHTML = `
            <div class="error-state" style="padding:60px 20px;text-align:center;">
                <div style="font-size:3rem;color:rgba(209,163,198,0.3);margin-bottom:1rem;">⚠️</div>
                <h3 style="color:#4a3b52;margin-bottom:0.5rem;">Failed to load manga data</h3>
                <p style="color:rgba(92,58,107,0.6);">Please refresh the page or try again later.</p>
                <button onclick="location.reload()" style="margin-top:1rem;padding:0.6rem 2rem;background:linear-gradient(135deg,#d1a3c6,#b88ab0);color:white;border:none;border-radius:30px;font-family:'Quicksand',sans-serif;font-weight:700;cursor:pointer;">Refresh</button>
            </div>
        `;
    }
    return;
  }

  // Load saved view preference
  const savedView = localStorage.getItem("adashima_manga_view");
  if (savedView === "list" || savedView === "grid") {
    currentView = savedView;
  }

  applyUITranslations();

  const menuVer = Date.now();
  fetch("/src/components/menu.html?v=" + menuVer, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  })
    .then((response) => {
      if (!response.ok) throw new Error("Error HTTP " + response.status + " loading menu");
      return response.text();
    })
    .then((data) => {
      data = data
        .replace(/src="\.\/(assets\/)/g, 'src="../../$1')
        .replace(/data-route="\.\.\/\.\.\/index\.html"/g, 'data-route="../../../index.html"');
      const container = document.getElementById("menu-container");
      if (!container) return;
      container.innerHTML = data;

      container.querySelectorAll("script").forEach((oldScript) => {
        const s = document.createElement("script");
        Array.from(oldScript.attributes).forEach((a) => s.setAttribute(a.name, a.value));
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

  initPdfEvents();
  initAllChapters();
  attachVolumeModalListeners();

  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("searchClearBtn");

  if (searchInput) {
    let searchDebounceTimer;
    searchInput.addEventListener("input", function () {
      const hasValue = this.value.length > 0;
      if (clearBtn) clearBtn.classList.toggle("visible", hasValue);
      const value = this.value;
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        applySearch(value);
      }, 150);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      if (searchInput) {
        searchInput.value = "";
        clearBtn.classList.remove("visible");
        applySearch("");
        searchInput.focus();
      }
    });
  }

  // VIEW TOGGLE - FIXED

  const viewListBtn = document.getElementById("viewListBtn");
  const viewGridBtn = document.getElementById("viewGridBtn");
  const viewSlider = document.getElementById("viewToggleSlider");

  // Function to update slider position
  function updateViewSlider(activeBtn) {
    if (!activeBtn || !viewSlider) return;
    const btnWidth = activeBtn.offsetWidth;
    const sliderWidth = viewSlider.offsetWidth;
    const offset = activeBtn.offsetLeft + (btnWidth - sliderWidth) / 2;
    viewSlider.style.transform = `translateX(${offset}px)`;
  }

  // Set initial slider position
  setTimeout(() => {
    const activeBtn = document.querySelector(".view-toggle-btn.active");
    if (activeBtn) {
      updateViewSlider(activeBtn);
    }
    // Ensure container has correct class
    const container = document.getElementById("chapters-container");
    if (container) {
      container.classList.remove("view-grid", "view-list");
      container.classList.add(`view-${currentView}`);
    }
  }, 100);

  // List button click
  if (viewListBtn) {
    viewListBtn.addEventListener("click", function () {
      setView("list");
      localStorage.setItem("adashima_manga_view", "list");
      updateViewSlider(this);
    });
  }

  // Grid button click
  if (viewGridBtn) {
    viewGridBtn.addEventListener("click", function () {
      setView("grid");
      localStorage.setItem("adashima_manga_view", "grid");
      updateViewSlider(this);
    });
  }

  // Update slider on resize
  let viewResizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(viewResizeTimer);
    viewResizeTimer = setTimeout(() => {
      const activeBtn = document.querySelector(".view-toggle-btn.active");
      if (activeBtn) updateViewSlider(activeBtn);
    }, 100);
  });

  // Version toggle listeners
  const versionMokeBtn = document.getElementById("versionMokeBtn");
  const versionManiBtn = document.getElementById("versionManiBtn");
  const versionAnthologyBtn = document.getElementById("versionAnthologyBtn");

  if (versionMokeBtn) {
    versionMokeBtn.addEventListener("click", function () {
      setVersion("moke");
    });
  }
  if (versionManiBtn) {
    versionManiBtn.addEventListener("click", function () {
      setVersion("mani");
    });
  }
  if (versionAnthologyBtn) {
    versionAnthologyBtn.addEventListener("click", function () {
      setVersion("anthology");
    });
  }

  const stickyEl = document.getElementById("libraryControlsSticky");
  if (stickyEl) {
    let scrollTicking = false;
    window.addEventListener(
      "scroll",
      function () {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(function () {
          stickyEl.classList.toggle("scrolled", window.scrollY > 10);
          scrollTicking = false;
        });
      },
      { passive: true },
    );
  }

  // Expose functions to global scope
  window.openReader = openReader;
  window.openPdfReader = openPdfReader;
  window.openPdfModal = openPdfModal;
  window.closePdfModal = closePdfModal;
  window.MANGA_CONFIG = MANGA_CONFIG;
  window.getText = getText;
  document
    .querySelectorAll("[data-volume-modal-close]")
    .forEach((el) => el.addEventListener("click", () => closeVolumeModal()));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeVolumeModal();
  });

  window.updatePdfUITranslations = updatePdfUITranslations;
  window.setVersion = setVersion;
  window.setView = setView;
  window.applySearch = applySearch;
  window.showToast = showToast;
});
