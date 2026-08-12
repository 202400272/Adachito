// ===== LOADING SCREEN =====
(function initLoadingScreen() {
  const loadingScreen = document.getElementById("loadingScreen");
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (!loadingScreen) return;

  // Function to hide the loading screen
  function hideLoadingScreen() {
    if (!loadingScreen) return;
    loadingScreen.classList.add("hidden");
    document.body.style.overflow = "";

    // Remove from DOM after transition to prevent interference
    setTimeout(() => {
      if (loadingScreen && loadingScreen.parentNode) {
        loadingScreen.remove();
      }
    }, 800);
  }

  // Prevent scrolling while loading
  document.body.style.overflow = "hidden";

  // Set loading message with i18n if content is available
  const loadingMessage = document.getElementById("loadingMessage");
  if (loadingMessage) {
    const currentLang = localStorage.getItem("lang") || "es";
    const messages = {
      es: "Cargando archivo...",
      en: "Loading archive...",
    };
    loadingMessage.textContent = messages[currentLang] || messages.es;
  }

  // Hide immediately on DOM ready (not waiting for full load)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function onDOMReady() {
      // Wait one frame to ensure initial paint is complete
      requestAnimationFrame(() => {
        hideLoadingScreen();
      });
      document.removeEventListener("DOMContentLoaded", onDOMReady);
    });
  } else {
    // DOM already ready
    requestAnimationFrame(() => {
      hideLoadingScreen();
    });
  }

  // Safety fallback: hide after 2.5 seconds regardless
  // This ensures the loader doesn't stay visible if something goes wrong
  const fallbackTimer = setTimeout(() => {
    hideLoadingScreen();
  }, 2500);

  // Clear fallback if the screen hides naturally
  const observer = new MutationObserver(() => {
    if (loadingScreen.classList.contains("hidden")) {
      clearTimeout(fallbackTimer);
      observer.disconnect();
    }
  });
  observer.observe(loadingScreen, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // Also hide when window is fully loaded (covers async resources)
  window.addEventListener("load", function onLoad() {
    // Only hide if not already hidden
    if (!loadingScreen.classList.contains("hidden")) {
      hideLoadingScreen();
    }
    window.removeEventListener("load", onLoad);
  });
})();

const FEEDBACK_CONFIG = {
  SERVICE_ID: "service_n0xzgps",
  TEMPLATE_ID: "template_lui1cw4",
  PUBLIC_KEY: "6IPX1SB_fT0DIA5i2",
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 3000,

  getMetadata: function () {
    return {
      url: window.location.href,
      pageTitle: document.title,
      version:
        document.querySelector('meta[name="version"]')?.content || "v1.5.0",
      browser: this.getBrowserInfo(),
      os: this.getOSInfo(),
      screenResolution: window.screen.width + " × " + window.screen.height,
      viewport: window.innerWidth + " × " + window.innerHeight,
      language:
        document.documentElement.lang || navigator.language || "unknown",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
      userAgent: navigator.userAgent,
    };
  },

  getBrowserInfo: function () {
    const ua = navigator.userAgent;
    if (ua.includes("Chrome"))
      return "Chrome " + (ua.match(/Chrome\/(\d+)/)?.[1] || "?");
    if (ua.includes("Firefox"))
      return "Firefox " + (ua.match(/Firefox\/(\d+)/)?.[1] || "?");
    if (ua.includes("Safari") && !ua.includes("Chrome"))
      return "Safari " + (ua.match(/Version\/(\d+)/)?.[1] || "?");
    if (ua.includes("Edge"))
      return "Edge " + (ua.match(/Edg\/(\d+)/)?.[1] || "?");
    return "Unknown Browser";
  },

  getOSInfo: function () {
    const ua = navigator.userAgent;
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Mac OS")) return "macOS";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad"))
      return "iOS";
    return "Unknown OS";
  },
};

(function () {
  const modal = document.getElementById("feedbackModal");
  const openBtn = document.getElementById("feedbackOpenBtn");
  const closeBtn = document.getElementById("feedbackClose");
  const cancelBtn = document.getElementById("feedbackCancel");
  const overlay = modal?.querySelector(".feedback-overlay");
  const form = document.getElementById("feedbackForm");
  const successEl = document.getElementById("feedbackSuccess");
  const submitBtn = document.getElementById("feedbackSubmit");
  let isSending = false;

  function openModal() {
    if (!modal) return;
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
    form.reset();
    form.style.display = "block";
    successEl.style.display = "none";
    document
      .querySelectorAll(".field-error")
      .forEach((el) => (el.textContent = ""));
    document
      .querySelectorAll(".has-error")
      .forEach((el) => el.classList.remove("has-error"));
    document
      .querySelectorAll(".form-error-message")
      .forEach((el) => el.remove());
    submitBtn.disabled = false;
    submitBtn.querySelector(".submit-text").style.display = "inline";
    submitBtn.querySelector(".submit-spinner").style.display = "none";
    isSending = false;
    document.getElementById("titleCount").textContent = "0";
    document.getElementById("descCount").textContent = "0";
    applyFeedbackI18n();
  }

  function closeModal() {
    if (!modal) return;
    modal.style.display = "none";
    document.body.style.overflow = "";
  }

  function updateCharCounter(id, count, max) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count;
    const parent = el.closest(".char-counter");
    if (parent) {
      parent.classList.toggle("over-limit", count > max);
    }
  }

  function validateField(fieldId) {
    const el = document.getElementById(fieldId);
    const errorEl = document.getElementById(fieldId + "Error");
    if (!el || !errorEl) return true;

    const value = el.value.trim();
    let isValid = true;
    let message = "";

    switch (fieldId) {
      case "feedbackType":
        if (!value) {
          message = "Please select a feedback type.";
          isValid = false;
        }
        break;
      case "feedbackTitleInput":
        if (!value) {
          message = "Please enter a title.";
          isValid = false;
        } else if (value.length > 100) {
          message = "Title must be 100 characters or less.";
          isValid = false;
        }
        break;
      case "feedbackDescription":
        if (!value) {
          message = "Please enter a description.";
          isValid = false;
        } else if (value.length > 3000) {
          message = "Description must be 3000 characters or less.";
          isValid = false;
        }
        break;
    }

    errorEl.textContent = message;
    el.closest(".feedback-field")?.classList.toggle("has-error", !isValid);
    return isValid;
  }

  function validateForm() {
    const fields = [
      "feedbackType",
      "feedbackTitleInput",
      "feedbackDescription",
    ];
    let allValid = true;
    fields.forEach((id) => {
      if (!validateField(id)) allValid = false;
    });
    return allValid;
  }

  function showError(message) {
    document
      .querySelectorAll(".form-error-message")
      .forEach((el) => el.remove());
    const actions = document.querySelector(".feedback-actions");
    if (actions) {
      const errorMsg = document.createElement("div");
      errorMsg.className = "form-error-message field-error";
      errorMsg.textContent = "✕ " + message;
      actions.parentNode?.insertBefore(errorMsg, actions);
      setTimeout(() => errorMsg.remove(), 6000);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (isSending) return;

    const honeypot = document.getElementById("honeypotField");
    if (honeypot && honeypot.value.length > 0) {
      showError("Submission blocked. Please try again.");
      return;
    }

    if (!validateForm()) {
      const firstError = form?.querySelector(
        ".has-error select, .has-error input, .has-error textarea",
      );
      if (firstError) firstError.focus();
      return;
    }

    if (typeof emailjs === "undefined") {
      showError("Email service not available. Please try again later.");
      return;
    }

    isSending = true;
    submitBtn.disabled = true;
    submitBtn.querySelector(".submit-text").style.display = "none";
    submitBtn.querySelector(".submit-spinner").style.display = "inline";

    const formData = {
      type: document.getElementById("feedbackType")?.value || "",
      title: document.getElementById("feedbackTitleInput")?.value.trim() || "",
      description:
        document.getElementById("feedbackDescription")?.value.trim() || "",
      email: document.getElementById("feedbackEmail")?.value.trim() || "",
    };

    const metadata = FEEDBACK_CONFIG.getMetadata();

    const templateParams = {
      feedback_type: formData.type,
      feedback_title: formData.title,
      feedback_description: formData.description,
      feedback_email: formData.email || "Not provided",
      page_url: metadata.url,
      page_title: metadata.pageTitle,
      website_version: metadata.version,
      browser: metadata.browser,
      operating_system: metadata.os,
      screen_resolution: metadata.screenResolution,
      viewport: metadata.viewport,
      language: metadata.language,
      timezone: metadata.timezone,
      timestamp: metadata.timestamp,
      user_agent: metadata.userAgent,
    };

    console.log("[Feedback] Sending...");

    emailjs
      .send(
        FEEDBACK_CONFIG.SERVICE_ID,
        FEEDBACK_CONFIG.TEMPLATE_ID,
        templateParams,
      )
      .then((response) => {
        console.log("[Feedback] Success:", response);
        form.style.display = "none";
        successEl.style.display = "block";
        setTimeout(closeModal, 2000);
      })
      .catch((error) => {
        console.error("[Feedback] Send failed:", error);
        let errorMsg = "Failed to send feedback. ";
        if (error.status === 400) {
          errorMsg +=
            "Please check your EmailJS template variables. Make sure they match exactly.";
        } else if (error.status === 401) {
          errorMsg += "Authentication failed. Please check your Public Key.";
        } else if (error.status === 404) {
          errorMsg += "Service or Template not found. Please check your IDs.";
        } else if (error.text) {
          errorMsg += error.text;
        } else {
          errorMsg += "Please try again.";
        }
        showError(errorMsg);
        submitBtn.disabled = false;
        submitBtn.querySelector(".submit-text").style.display = "inline";
        submitBtn.querySelector(".submit-spinner").style.display = "none";
        isSending = false;
      });
  }

  openBtn?.addEventListener("click", openModal);
  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);
  overlay?.addEventListener("click", closeModal);
  form?.addEventListener("submit", handleSubmit);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal?.style.display === "flex") closeModal();
  });

  document
    .getElementById("feedbackTitleInput")
    ?.addEventListener("input", function () {
      updateCharCounter("titleCount", this.value.length, 100);
    });
  document
    .getElementById("feedbackDescription")
    ?.addEventListener("input", function () {
      updateCharCounter("descCount", this.value.length, 3000);
    });

  ["feedbackType", "feedbackTitleInput", "feedbackDescription"].forEach(
    (id) => {
      const el = document.getElementById(id);
      el?.addEventListener("blur", () => validateField(id));
      el?.addEventListener("input", () => {
        const errorEl = document.getElementById(id + "Error");
        if (errorEl) errorEl.textContent = "";
        el.closest(".feedback-field")?.classList.remove("has-error");
      });
    },
  );

  console.log("[Feedback] Modal initialized");
})();

let currentLang =
  localStorage.getItem("lang") ||
  localStorage.getItem("preferredLanguage") ||
  "es";
let isSwitching = false;
let newsVisible = false;
let contentData = null;
let rawNewsData = null;
let typingTimeout = null;

let newsDialogState = {
  currentMessageIndex: 0,
  isTyping: false,
  isComplete: false,
  typeSpeed: 15,
};

let NEWS_CONTENT = {
  title: "",
  messages: [],
  publishDate: null,
};

const navHrefs = {
  timeline: "src/pages/Adashima_Linea.html",
  novels: "src/pages/Adashima_Novelas.html",
  manga: "src/pages/Adashima_Manga.html",
  extraStories: "src/pages/Adashima_Extra_Stories.html",
  drama: "src/pages/Adashima_Drama.html",
  music: "src/pages/Adashima_Music.html",
  miniAnime: "src/pages/Adashima_Mini_Anime.html",
  constellation: "src/pages/Adashima_Estrella.html",
  anime: "src/pages/Adashima_Anime.html",
  others: "src/pages/Adashima_Otros.html",
  stats: "src/pages/Adashima_Stats.html",
  about: "src/pages/Adashima_About.html",
  gallery: "src/pages/Adashima_Gallery.html",
};

async function loadContent(lang) {
  const res = await fetch(`src/data/index/${lang}.json?v=${Date.now()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function updateLangLabel() {
  const sel = document.querySelector(
    `.lang-option[data-lang="${currentLang}"]`,
  );
  const label = document.getElementById("langSelectedLabel");
  if (sel && label) {
    label.textContent = sel.getAttribute("data-label");
    document
      .querySelectorAll(".lang-option")
      .forEach((o) => o.classList.remove("selected"));
    sel.classList.add("selected");
  }
}

function renderNav(data) {
  const grid = document.getElementById("navGrid");
  if (!grid) return;

  let navItems = data.nav.items;

  if (currentLang === "es") {
    navItems = navItems.filter((item) => item.key !== "stats");
  }

  grid.innerHTML = "";

  navItems.forEach((item) => {
    const href = navHrefs[item.key] || "#";
    const card = document.createElement("a");
    card.href = href;
    card.className = "nav-card";
    card.setAttribute("data-tooltip", item.tooltip || "");

    card.innerHTML = `
          <div class="nav-card-icon"><i class="fas ${item.icon}"></i></div>
          <div class="nav-card-content">
            <span class="nav-card-title">${item.title}</span>
            <span class="nav-card-desc">${item.desc || ""}</span>
          </div>
          <i class="fas fa-chevron-right nav-card-arrow"></i>
        `;
    grid.appendChild(card);
  });
}

function renderGallery(data) {
  const gallerySection = document.getElementById("gallerySection");
  const galleryGrid = document.getElementById("galleryGrid");
  const galleryTitle = document.getElementById("galleryTitle");
  const gallerySubtitle = document.getElementById("gallerySubtitle");

  if (!galleryGrid) return;

  if (!data.gallery || !data.gallery.items || data.gallery.items.length === 0) {
    if (gallerySection) gallerySection.style.display = "none";
    return;
  }

  if (gallerySection) gallerySection.style.display = "block";
  if (galleryTitle && data.gallery.title)
    galleryTitle.textContent = data.gallery.title;
  if (gallerySubtitle && data.gallery.subtitle)
    gallerySubtitle.textContent = data.gallery.subtitle;

  galleryGrid.innerHTML = "";

  data.gallery.items.forEach((item) => {
    const col = document.createElement("div");
    col.className = "gallery-col";

    col.innerHTML = `
            <div class="gallery-item" data-id="${item.id}">
                <img src="${item.image}" alt="${item.alt || item.title}" loading="lazy">
                <div class="gallery-overlay">
                    <h3>${item.title}</h3>
                    <p>${item.description || ""}</p>
                </div>
            </div>
        `;

    const img = col.querySelector(".gallery-item");
    img?.addEventListener("click", () =>
      openLightbox(item, data.gallery.items),
    );

    galleryGrid.appendChild(col);
  });
}

function openLightbox(item, allItems) {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxTitle = document.getElementById("lightboxTitle");
  const lightboxDesc = document.getElementById("lightboxDesc");
  const lightboxCounter = document.getElementById("lightboxCounter");

  if (!lightbox) return;

  const currentIndex = allItems.findIndex((i) => i.id === item.id);

  lightboxImg.src = item.image;
  lightboxImg.alt = item.alt || item.title;
  lightboxTitle.textContent = item.title;
  lightboxDesc.textContent = item.description || "";
  lightboxCounter.textContent = `${currentIndex + 1} / ${allItems.length}`;

  lightbox.dataset.currentIndex = currentIndex;
  lightbox.dataset.totalItems = allItems.length;
  lightbox.style.display = "flex";
  document.body.style.overflow = "hidden";

  window._lightboxItems = allItems;
}

function closeLightbox() {
  const lightbox = document.getElementById("lightbox");
  if (lightbox) {
    lightbox.style.display = "none";
    document.body.style.overflow = "";
  }
}

function navigateLightbox(direction) {
  const lightbox = document.getElementById("lightbox");
  if (!lightbox) return;

  const currentIndex = parseInt(lightbox.dataset.currentIndex);
  const items = window._lightboxItems;

  if (!items || items.length === 0) return;

  let newIndex = currentIndex + direction;
  if (newIndex < 0) newIndex = items.length - 1;
  if (newIndex >= items.length) newIndex = 0;

  const item = items[newIndex];
  openLightbox(item, items);
}

function applyFeedbackI18n() {
  const t = contentData?.feedback;
  if (!t) return;

  document.getElementById("feedbackTitle").textContent = t.title;
  document.getElementById("feedbackSubtitle").textContent = t.subtitle;
  document.getElementById("feedbackTypeLabel").textContent = t.typeLabel;
  document.getElementById("fbTypePlaceholder").textContent = t.typePlaceholder;
  document.getElementById("fbTypeBug").textContent = t.typeBug;
  document.getElementById("fbTypeTranslation").textContent = t.typeTranslation;
  document.getElementById("fbTypeMissing").textContent = t.typeMissing;
  document.getElementById("fbTypeBroken").textContent = t.typeBroken;
  document.getElementById("fbTypeFeature").textContent = t.typeFeature;
  document.getElementById("fbTypeGeneral").textContent = t.typeGeneral;
  document.getElementById("feedbackTitleLabel").textContent = t.titleLabel;
  document.getElementById("feedbackTitleInput").placeholder =
    t.titlePlaceholder;
  document.getElementById("feedbackDescLabel").textContent = t.descLabel;
  document.getElementById("feedbackDescription").placeholder =
    t.descPlaceholder;
  document.getElementById("feedbackEmailLabel").textContent = t.emailLabel;
  document.getElementById("feedbackEmailHint").textContent = t.emailHint;
  document.getElementById("fbCancelLabel").textContent = t.cancel;
  document.getElementById("fbSubmitLabel").textContent = t.submit;
  document.getElementById("fbSuccessTitle").textContent = t.successTitle;
  document.getElementById("fbSuccessText").textContent = t.successText;
  document.getElementById("feedbackFooterLabel").textContent = t.footerBtn;
}

function renderApp(data) {
  if (!data) throw new Error("No data provided to renderApp");

  const heroTitle = document.getElementById("heroTitle");
  if (heroTitle) heroTitle.textContent = data.header.title;

  const heroSub = document.getElementById("heroSub");
  if (heroSub && data.hero) heroSub.textContent = data.hero.subtitle;

  const bikeImage = document.querySelector(".floating-bike");
  if (bikeImage) {
    bikeImage.style.cursor = "pointer";
    bikeImage.addEventListener("click", () => {
      window.location.href = "/src/pages/Juego.html";
    });
  }

  const infoTitle = document.getElementById("infoTitle");
  if (infoTitle && data.info) infoTitle.textContent = data.info.title;

  const infoSub = document.getElementById("infoSub");
  if (infoSub && data.info) infoSub.textContent = data.info.subtitle;

  const chips = document.querySelectorAll(".chip-text");
  if (data.info && data.info.chips) {
    data.info.chips.forEach((chipText, i) => {
      if (chips[i]) chips[i].textContent = chipText;
    });
  }

  if (data.info && data.info.paragraphs) {
    const p1 = document.getElementById("infoP1");
    const p2 = document.getElementById("infoP2");
    const p3 = document.getElementById("infoP3");
    if (p1) p1.innerHTML = data.info.paragraphs[0] || "";
    if (p2) p2.innerHTML = data.info.paragraphs[1] || "";
    if (p3) p3.innerHTML = data.info.paragraphs[2] || "";
  }

  renderNav(data);
  renderGallery(data);

  const updateBadge = document.getElementById("updateBadge");
  if (updateBadge)
    updateBadge.innerHTML = `<i class="fas fa-clock"></i> ${data.release.lastUpdate}`;

  const updateDetails = document.getElementById("updateDetails");
  if (updateDetails) {
    updateDetails.innerHTML = `
          <strong>${data.release.volNum}</strong> <span class="release-sep">·</span> ${data.release.date}
          <span class="release-sep">·</span> <i class="fas fa-check-circle"></i> ${data.release.status}
        `;
  }

  const nextBadge = document.getElementById("nextBadge");
  if (nextBadge)
    nextBadge.innerHTML = `<i class="fas fa-fire flame-icon"></i> ${data.release.nextLabel}`;

  const nextDetails = document.getElementById("nextDetails");
  if (nextDetails) {
    nextDetails.innerHTML = `
          <span class="next-pill"><i class="fas fa-sparkles"></i> ${data.release.nextBadge}</span>
          <strong>${data.release.nextVol}</strong>
          <span class="release-sep">·</span> <span class="next-date">${data.release.nextDate}</span>
          <span class="release-sep">·</span> <i class="fas fa-hourglass-half"></i> ${data.release.nextStatus}
        `;
  }

  const newsText = document.getElementById("newsText");
  if (newsText && data.news) newsText.innerHTML = data.news.text;

  const newsHint = document.getElementById("newsHint");
  if (newsHint && data.news) newsHint.textContent = data.news.hint;

  const yashiroTooltip = document.getElementById("yashiroTooltip");
  if (yashiroTooltip && data.news)
    yashiroTooltip.textContent = data.news.tooltip;

  const footer = document.getElementById("footer");
  if (footer) {
    const footerText = footer.querySelector(".footer-text");
    if (footerText && data.footer) footerText.innerHTML = data.footer;
  }

  document.documentElement.lang = currentLang;
  applyFeedbackI18n();
}

function toggleInfo() {
  const content = document.getElementById("infoContent");
  const chevron = document.getElementById("infoChevron");
  const panel = document.getElementById("infoPanel");
  if (content) content.classList.toggle("open");
  if (chevron) chevron.classList.toggle("rotated");
  if (panel) panel.classList.toggle("expanded");
}

function getNewsHash(data) {
  return JSON.stringify({ date: data.publishDate, en: data.en, es: data.es });
}

function hasUnreadNews() {
  if (!rawNewsData) return false;
  const currentHash = getNewsHash(rawNewsData);
  const storedHash = localStorage.getItem("newsHash");
  return currentHash !== storedHash;
}

function markNewsAsRead() {
  if (rawNewsData) {
    const currentHash = getNewsHash(rawNewsData);
    localStorage.setItem("newsHash", currentHash);
  }
}

function updateNewsIndicator() {
  const indicator = document.getElementById("newsIndicator");
  if (!indicator) return;
  if (hasUnreadNews()) {
    indicator.classList.add("show");
  } else {
    indicator.classList.remove("show");
  }
}

function getNewsDataUrl() {
  const currentScript = document.currentScript?.src;
  if (currentScript) {
    const resolvedScriptUrl = new URL(currentScript, window.location.href);
    const siteRootUrl = new URL("../..", resolvedScriptUrl);
    return new URL("src/data/noticia.json", siteRootUrl).toString();
  }

  return new URL("src/data/noticia.json", window.location.href).toString();
}

function loadNewsContent() {
  fetch(getNewsDataUrl())
    .then((response) => {
      if (!response.ok) throw new Error();
      return response.json();
    })
    .then((data) => {
      rawNewsData = data;
      applyNewsLanguage();
      updateNewsIndicator();
    })
    .catch(() => {});
}

function applyNewsLanguage() {
  if (!rawNewsData) return;
  const langData = rawNewsData[currentLang] || rawNewsData["es"];
  NEWS_CONTENT.title = langData.title || "";
  NEWS_CONTENT.messages = langData.messages || [];
  NEWS_CONTENT.publishDate = rawNewsData.publishDate || null;

  const hintEl = document.getElementById("newsHint");
  if (hintEl) updateHint();

  const dialog = document.getElementById("newsDialog");
  if (dialog && dialog.classList.contains("active")) {
    if (newsDialogState.isTyping) {
      newsDialogState.isTyping = false;
      clearTimeout(typingTimeout);
    }
    newsDialogState.isComplete = false;
    typeNextMessage();
  }
}

function openNewsDialog() {
  const dialog = document.getElementById("newsDialog");
  const overlay = document.querySelector(".news-dialog-overlay");
  if (dialog) {
    dialog.classList.add("active");
    if (overlay) overlay.style.pointerEvents = "all";
  }
  newsDialogState.currentMessageIndex = 0;
  newsDialogState.isTyping = false;
  newsDialogState.isComplete = false;
  markNewsAsRead();
  updateNewsIndicator();
  typeNextMessage();
}

function closeNewsDialog(preserveUnread = false) {
  const dialog = document.getElementById("newsDialog");
  const overlay = document.querySelector(".news-dialog-overlay");
  if (dialog) {
    dialog.classList.remove("active");
    if (overlay) overlay.style.pointerEvents = "none";
  }
  clearTimeout(typingTimeout);
  if (!preserveUnread) {
    markNewsAsRead();
    updateNewsIndicator();
  }
}

function toggleNews() {
  const dialog = document.getElementById("newsDialog");
  if (dialog && dialog.classList.contains("active")) {
    if (!newsDialogState.isTyping) closeNewsDialog();
  } else {
    openNewsDialog();
  }
}

function typeNextMessage() {
  if (newsDialogState.currentMessageIndex >= NEWS_CONTENT.messages.length) {
    completeDialog();
    return;
  }
  const message = NEWS_CONTENT.messages[newsDialogState.currentMessageIndex];
  newsDialogState.isTyping = true;
  newsDialogState.isComplete = false;
  const textEl = document.getElementById("newsText");
  if (textEl) textEl.textContent = "";
  typeMessage(message);
}

function typeMessage(message) {
  let currentIndex = 0;
  const hintEl = document.getElementById("newsHint");
  if (hintEl) hintEl.style.opacity = "0";
  clearTimeout(typingTimeout);

  const type = () => {
    if (!newsDialogState.isTyping) return;
    const textEl = document.getElementById("newsText");
    if (currentIndex < message.length) {
      if (textEl) textEl.textContent += message[currentIndex];
      currentIndex++;
      typingTimeout = setTimeout(type, newsDialogState.typeSpeed);
    } else {
      newsDialogState.isTyping = false;
      newsDialogState.isComplete = true;
      if (hintEl) hintEl.style.opacity = "1";
      updateHint();
    }
  };
  type();
}

function updateHint() {
  const hintEl = document.getElementById("newsHint");
  if (!hintEl) return;
  if (newsDialogState.currentMessageIndex < NEWS_CONTENT.messages.length - 1) {
    hintEl.textContent =
      contentData?.news?.hintNext ||
      (currentLang === "en"
        ? "Click to continue..."
        : "Haz clic para continuar...");
  } else {
    hintEl.textContent =
      contentData?.news?.hintClose ||
      (currentLang === "en" ? "Click to close" : "Haz clic para cerrar");
  }
}

function completeDialog() {
  newsDialogState.isTyping = false;
  newsDialogState.isComplete = true;
  const hintEl = document.getElementById("newsHint");
  if (hintEl) {
    hintEl.style.opacity = "1";
    hintEl.textContent =
      contentData?.news?.hintClose ||
      (currentLang === "en" ? "Click to close" : "Haz clic para cerrar");
  }
}

// Lightbox event listeners
document.addEventListener("DOMContentLoaded", function () {
  document
    .getElementById("lightboxClose")
    ?.addEventListener("click", closeLightbox);
  document
    .getElementById("lightboxPrev")
    ?.addEventListener("click", () => navigateLightbox(-1));
  document
    .getElementById("lightboxNext")
    ?.addEventListener("click", () => navigateLightbox(1));

  document.addEventListener("keydown", (e) => {
    const lightbox = document.getElementById("lightbox");
    if (lightbox && lightbox.style.display === "flex") {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") navigateLightbox(-1);
      if (e.key === "ArrowRight") navigateLightbox(1);
    }
  });

  document.getElementById("lightbox")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeLightbox();
  });
});

document.getElementById("newsDialog")?.addEventListener("click", (e) => {
  if (e.target.closest(".news-dialog-container")) {
    if (newsDialogState.isTyping) return;
    if (newsDialogState.isComplete) {
      if (
        newsDialogState.currentMessageIndex <
        NEWS_CONTENT.messages.length - 1
      ) {
        newsDialogState.currentMessageIndex++;
        typeNextMessage();
      } else {
        closeNewsDialog();
      }
    }
  }
});

document.addEventListener("click", (e) => {
  const dialog = document.getElementById("newsDialog");
  const widget = document.getElementById("yashiroWidget");
  if (
    dialog &&
    dialog.classList.contains("active") &&
    !dialog.contains(e.target) &&
    widget &&
    !widget.contains(e.target)
  ) {
    if (!newsDialogState.isTyping) closeNewsDialog();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const dialog = document.getElementById("newsDialog");
    if (
      dialog &&
      dialog.classList.contains("active") &&
      !newsDialogState.isTyping
    ) {
      closeNewsDialog();
    }
  }
});

document.addEventListener("DOMContentLoaded", async function () {
  try {
    emailjs.init(FEEDBACK_CONFIG.PUBLIC_KEY);
    console.log("[EmailJS] Initialized");
  } catch (e) {
    console.warn("[EmailJS] Init error:", e);
  }

  updateLangLabel();

  try {
    const data = await loadContent(currentLang);
    contentData = data;
    renderApp(data);
  } catch (e) {
    console.error("Failed to load content:", e);
    document.body.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;font-family:sans-serif;padding:20px;text-align:center;">
                <h1 style="color:#e74c3c;">⚠️ Error Loading Content</h1>
                <p style="color:#666;max-width:500px;">Failed to load content for language: ${currentLang}. Please check your connection or try again later.</p>
                <button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;background:#3498db;color:white;border:none;border-radius:4px;cursor:pointer;">Reload Page</button>
            </div>
        `;
    return;
  }

  loadNewsContent();

  const menuVer = Math.floor(Date.now() / 86400000);
  fetch("./src/components/menu.html?v=" + menuVer)
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    })
    .then((html) => {
      const container =
        document.getElementById("sidebar-container") ||
        document.getElementById("menu-container");
      if (!container) return;
      html = html.replace(
        /data-route="\.\.\/\.\.\/index\.html"/g,
        'data-route="/index.html"',
      );
      container.innerHTML = html;
      const scripts = container.querySelectorAll("script");
      scripts.forEach((old) => {
        const neu = document.createElement("script");
        Array.from(old.attributes).forEach((a) =>
          neu.setAttribute(a.name, a.value),
        );
        neu.appendChild(document.createTextNode(old.innerHTML));
        old.parentNode.replaceChild(neu, old);
      });
      setTimeout(
        () => document.dispatchEvent(new CustomEvent("menuLoaded")),
        100,
      );
    })
    .catch((err) => console.error("Error cargando menu:", err.message));
});

document.addEventListener("menuLoaded", function () {
  if (typeof window.translateMenu === "function") {
    window.translateMenu(currentLang);
  }
  const backBtn = document.getElementById("menu-back-home");
  if (backBtn) backBtn.style.display = "none";
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    })
    .catch(() => {});
  if (window.caches && caches.keys) {
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => {});
  }
}
// Time Theme Detection Script
(function () {
  const APPEARANCE_STORAGE_KEY = "adashima_time_based_appearance";
  const MANUAL_THEME_STORAGE_KEY = "adashima_manual_appearance";

  function getTimePeriod() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 19) return "afternoon";
    return "night";
  }

  function getTimeBasedPreference() {
    try {
      const value = localStorage.getItem(APPEARANCE_STORAGE_KEY);
      if (value === null) return true;
      return value === "true";
    } catch (e) {
      return true;
    }
  }

  function getStoredManualTheme() {
    try {
      return localStorage.getItem(MANUAL_THEME_STORAGE_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function getActiveTheme() {
    if (getTimeBasedPreference()) {
      return getTimePeriod();
    }
    return getStoredManualTheme() || getTimePeriod();
  }

  function updateTimeTheme() {
    const period = getActiveTheme();
    const body = document.body;
    const newClass = "time-" + period;

    if (!body.classList.contains(newClass)) {
      body.classList.remove("time-morning", "time-afternoon", "time-night");
      body.classList.add(newClass);
    }
  }

  window.updateTimeTheme = updateTimeTheme;

  // Run immediately
  updateTimeTheme();

  // Check every minute
  setInterval(updateTimeTheme, 60000);

  // Also update when visibility changes (user returns to tab)
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      updateTimeTheme();
    }
  });
})();