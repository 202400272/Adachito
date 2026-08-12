/* pdf-reader.js - Self-contained PDF Reader Component with Performance Optimizations */
(function (global) {
  "use strict";

  // ========================================
  // Configuration
  // ========================================
  const DEFAULTS = {
    container: "#pdf-reader",
    pdf: "",
    title: "Document",
  };

  // ========================================
  // State
  // ========================================
  const state = {
    pdfDoc: null,
    currentPage: 1,
    totalPages: 0,
    scale: 1.0,
    fitWidth: false,
    isFullscreen: false,
    loading: false,
    container: null,
    canvas: null,
    ctx: null,
    wrapper: null,
    pageInput: null,
    pageSpan: null,
    zoomPercent: null,
    spinner: null,
    title: "",
    renderTimeout: null,
    isRendering: false,
    pendingRender: false,
  };

  // ========================================
  // Local Storage Helpers
  // ========================================
  function getStorageKey() {
    const path = state.pdfPath || "default";
    return `pdf-reader_${path.replace(/[^a-zA-Z0-9]/g, "_")}`;
  }

  function saveState() {
    try {
      const key = getStorageKey();
      const data = {
        page: state.currentPage,
        scale: state.scale,
        fitWidth: state.fitWidth,
      };
      localStorage.setItem(key, JSON.stringify(data));
    } catch (_) {
      /* ignore */
    }
  }

  function loadState() {
    try {
      const key = getStorageKey();
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  // ========================================
  // HTML Generation
  // ========================================
  function buildHTML(title) {
    return `
      <div class="pdf-toolbar">
        <div class="pdf-toolbar-left">
          <button class="pdf-back-btn" title="Back">←</button>
          <button class="pdf-prev-btn" title="Previous page">‹</button>
          <div class="pdf-page-indicator">
            <input type="number" class="pdf-page-input" min="1" value="1" />
            <span>of <span class="pdf-total-pages">0</span></span>
          </div>
          <button class="pdf-next-btn" title="Next page">›</button>
        </div>
        <div class="pdf-toolbar-right">
          <button class="pdf-zoom-out" title="Zoom Out">−</button>
          <span class="pdf-zoom-percent">100%</span>
          <button class="pdf-zoom-in" title="Zoom In">+</button>
          <button class="pdf-fit-width" title="Fit Width">⊡</button>
          <button class="pdf-fullscreen" title="Fullscreen">⛶</button>
        </div>
      </div>
      <div class="pdf-viewport">
        <div class="pdf-canvas-wrapper">
          <canvas></canvas>
        </div>
        <div class="pdf-spinner"></div>
      </div>
    `;
  }

  // ========================================
  // DOM References
  // ========================================
  function cacheDOM(container) {
    state.container = container;
    state.wrapper = container.querySelector(".pdf-canvas-wrapper");
    state.canvas = container.querySelector("canvas");
    state.ctx = state.canvas.getContext("2d");
    state.pageInput = container.querySelector(".pdf-page-input");
    state.pageSpan = container.querySelector(".pdf-total-pages");
    state.zoomPercent = container.querySelector(".pdf-zoom-percent");
    state.spinner = container.querySelector(".pdf-spinner");
  }

  // ========================================
  // PDF Loading with better error handling
  // ========================================
  function loadPDF(url) {
    if (state.loading) return;
    state.loading = true;
    showSpinner(true);

    // Set a timeout for loading
    const loadTimeout = setTimeout(() => {
      if (state.loading) {
        showSpinner(false);
        state.loading = false;
        alert("PDF loading timed out. Please try again.");
      }
    }, 30000);

    const loadingTask = global.pdfjsLib.getDocument({
      url: url,
      cMapUrl: "https://cdn.jsdelivr.net/npm/pdf.js@2.16.105/cmaps/",
      cMapPacked: true,
      disableFontFace: false,
      useSystemFonts: true,
    });

    loadingTask.promise
      .then(function (pdf) {
        clearTimeout(loadTimeout);
        state.pdfDoc = pdf;
        state.totalPages = pdf.numPages;
        state.pageSpan.textContent = state.totalPages;

        // Restore saved state
        const saved = loadState();
        if (saved) {
          state.currentPage = Math.min(saved.page, state.totalPages) || 1;
          state.scale = saved.scale || 1.0;
          state.fitWidth = saved.fitWidth || false;
        } else {
          state.currentPage = 1;
          state.scale = 1.0;
          state.fitWidth = false;
        }

        renderPage();
        updateUI();
        state.loading = false;
        showSpinner(false);
      })
      .catch(function (err) {
        clearTimeout(loadTimeout);
        console.error("PDF load error:", err);
        state.loading = false;
        showSpinner(false);
        alert("Failed to load PDF. Please check the file path.");
      });
  }

  // ========================================
  // Rendering with throttling
  // ========================================
  function renderPage() {
    if (!state.pdfDoc) return;
    if (state.isRendering) {
      state.pendingRender = true;
      return;
    }

    state.isRendering = true;
    const pageNum = state.currentPage;

    state.pdfDoc
      .getPage(pageNum)
      .then(function (page) {
        // Calculate viewport with device pixel ratio for sharp rendering
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let viewport = page.getViewport({ scale: state.scale });

        // Handle fit-width
        if (state.fitWidth) {
          const containerWidth = state.wrapper.parentElement.clientWidth - 32;
          const scaleX = containerWidth / viewport.width;
          const newScale = Math.max(0.25, Math.min(3, scaleX));
          if (Math.abs(newScale - state.scale) > 0.01) {
            state.scale = newScale;
            state.isRendering = false;
            state.pendingRender = false;
            renderPage();
            updateUI();
            saveState();
            return;
          }
        }

        // Apply DPR for crisp rendering
        const scaledViewport = page.getViewport({ scale: state.scale * dpr });
        const canvas = state.canvas;
        const context = state.ctx;

        // Set canvas size with DPR
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        // CSS size (logical pixels)
        canvas.style.width = viewport.width + "px";
        canvas.style.height = viewport.height + "px";

        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport,
          background: "#fff",
        };

        // Render with high quality
        page
          .render(renderContext)
          .promise.then(function () {
            state.wrapper.style.width = viewport.width + "px";
            state.wrapper.style.height = viewport.height + "px";
            state.isRendering = false;

            // Check if there's a pending render
            if (state.pendingRender) {
              state.pendingRender = false;
              renderPage();
            }

            updateUI();
            saveState();
          })
          .catch(function (err) {
            console.error("Render error:", err);
            state.isRendering = false;
            state.pendingRender = false;
          });
      })
      .catch(function (err) {
        console.error("Page load error:", err);
        state.isRendering = false;
        state.pendingRender = false;
      });
  }

  // ========================================
  // Navigation with debouncing
  // ========================================
  let navigationTimeout = null;

  function goToPage(num) {
    if (!state.pdfDoc) return;
    num = Math.max(1, Math.min(state.totalPages, Math.floor(num)));
    if (num === state.currentPage) {
      updateUI();
      return;
    }

    // Debounce rapid page changes
    clearTimeout(navigationTimeout);
    navigationTimeout = setTimeout(() => {
      state.currentPage = num;
      state.pendingRender = false;
      state.isRendering = false;
      renderPage();
      updateUI();
      saveState();
    }, 50);
  }

  function prevPage() {
    if (state.currentPage > 1) {
      goToPage(state.currentPage - 1);
    }
  }

  function nextPage() {
    if (state.currentPage < state.totalPages) {
      goToPage(state.currentPage + 1);
    }
  }

  // ========================================
  // Zoom with smooth transitions
  // ========================================
  function zoomIn() {
    state.scale = Math.min(3.0, state.scale + 0.15);
    state.fitWidth = false;
    state.pendingRender = false;
    state.isRendering = false;
    renderPage();
    updateUI();
    saveState();
  }

  function zoomOut() {
    state.scale = Math.max(0.25, state.scale - 0.15);
    state.fitWidth = false;
    state.pendingRender = false;
    state.isRendering = false;
    renderPage();
    updateUI();
    saveState();
  }

  function fitWidth() {
    state.fitWidth = true;
    state.pendingRender = false;
    state.isRendering = false;
    renderPage();
    updateUI();
    saveState();
  }

  // ========================================
  // Fullscreen
  // ========================================
  function toggleFullscreen() {
    const el = state.container;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.() || el.webkitRequestFullscreen?.();
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.();
    }
  }

  // ========================================
  // UI Updates
  // ========================================
  function updateUI() {
    if (state.pageInput) {
      state.pageInput.value = state.currentPage;
      state.pageInput.max = state.totalPages;
    }
    if (state.zoomPercent) {
      state.zoomPercent.textContent = Math.round(state.scale * 100) + "%";
    }
    // Update back button
    const backBtn = state.container.querySelector(".pdf-back-btn");
    if (backBtn) {
      backBtn.onclick = function () {
        if (window.closePdfReader) {
          window.closePdfReader();
        } else if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = window.location.pathname;
        }
      };
    }
  }

  function showSpinner(active) {
    if (state.spinner) {
      state.spinner.classList.toggle("active", active);
    }
  }

  // ========================================
  // Events with passive listeners
  // ========================================
  function bindEvents() {
    const container = state.container;

    // Previous - use passive: false for mousewheel but not needed here
    container
      .querySelector(".pdf-prev-btn")
      .addEventListener("click", prevPage);

    // Next
    container
      .querySelector(".pdf-next-btn")
      .addEventListener("click", nextPage);

    // Page input
    state.pageInput.addEventListener("change", function () {
      const val = parseInt(this.value, 10);
      if (!isNaN(val) && val >= 1 && val <= state.totalPages) {
        goToPage(val);
      } else {
        this.value = state.currentPage;
      }
    });

    // Zoom In
    container.querySelector(".pdf-zoom-in").addEventListener("click", zoomIn);

    // Zoom Out
    container.querySelector(".pdf-zoom-out").addEventListener("click", zoomOut);

    // Fit Width
    container
      .querySelector(".pdf-fit-width")
      .addEventListener("click", fitWidth);

    // Fullscreen
    container
      .querySelector(".pdf-fullscreen")
      .addEventListener("click", toggleFullscreen);

    // Keyboard shortcuts with throttling
    let keyTimeout = null;
    document.addEventListener("keydown", function (e) {
      if (!state.container || !state.container.isConnected) return;

      // Check if we're in an input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;

      clearTimeout(keyTimeout);
      keyTimeout = setTimeout(() => {
        if (e.key === "ArrowLeft" || e.key === "PageUp") {
          e.preventDefault();
          prevPage();
        } else if (
          e.key === "ArrowRight" ||
          e.key === "PageDown" ||
          e.key === " "
        ) {
          e.preventDefault();
          nextPage();
        } else if (e.key === "f" || e.key === "F") {
          toggleFullscreen();
        } else if (e.key === "Escape") {
          if (document.fullscreenElement) {
            document.exitFullscreen?.() || document.webkitExitFullscreen?.();
          } else if (window.closePdfReader) {
            window.closePdfReader();
          }
        }
      }, 100);
    });

    // Resize with debouncing
    let resizeTimer;
    window.addEventListener(
      "resize",
      function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          if (state.fitWidth && state.pdfDoc) {
            renderPage();
            updateUI();
          }
        }, 200);
      },
      { passive: true },
    );
  }

  // ========================================
  // Initialization
  // ========================================
  function init(options) {
    // Merge options
    const config = Object.assign({}, DEFAULTS, options || {});
    state.pdfPath = config.pdf;

    // Get container
    const containerEl = document.querySelector(config.container);
    if (!containerEl) {
      console.error("PDFReader: Container not found:", config.container);
      return;
    }

    // Clear and build
    containerEl.innerHTML = buildHTML(config.title);
    containerEl.classList.add("pdf-reader");
    state.title = config.title || "";

    // Cache DOM elements
    cacheDOM(containerEl);

    // Bind events
    bindEvents();

    // Load the PDF
    if (config.pdf) {
      loadPDF(config.pdf);
    }
  }

  // ========================================
  // Public API
  // ========================================
  const PDFReader = {
    init: init,
    // Expose for debugging
    _state: state,
  };

  // Expose globally
  global.PDFReader = PDFReader;
})(window);
