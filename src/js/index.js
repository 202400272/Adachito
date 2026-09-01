if (
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.hostname === "[::1]"
) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
  }

  caches.keys().then((names) => {
    names.forEach((name) => caches.delete(name));
  });
}

// ===== LOADING SCREEN =====
(function initLoadingScreen() {
  const loadingScreen = document.getElementById("loadingScreen");
  const _prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
      version: document.querySelector('meta[name="version"]')?.content || "v1.5.0",
      browser: this.getBrowserInfo(),
      os: this.getOSInfo(),
      screenResolution: window.screen.width + " × " + window.screen.height,
      viewport: window.innerWidth + " × " + window.innerHeight,
      language: document.documentElement.lang || navigator.language || "unknown",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
      userAgent: navigator.userAgent,
    };
  },

  getBrowserInfo: function () {
    const ua = navigator.userAgent;
    if (ua.includes("Chrome")) return "Chrome " + (ua.match(/Chrome\/(\d+)/)?.[1] || "?");
    if (ua.includes("Firefox")) return "Firefox " + (ua.match(/Firefox\/(\d+)/)?.[1] || "?");
    if (ua.includes("Safari") && !ua.includes("Chrome"))
      return "Safari " + (ua.match(/Version\/(\d+)/)?.[1] || "?");
    if (ua.includes("Edge")) return "Edge " + (ua.match(/Edg\/(\d+)/)?.[1] || "?");
    return "Unknown Browser";
  },

  getOSInfo: function () {
    const ua = navigator.userAgent;
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Mac OS")) return "macOS";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
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

  // Custom feedback type dropdown
  // The native <select id="feedbackType"> stays in the DOM as the real
  // source of truth (form value, i18n text, existing validation all still
  // read/write it directly) but is visually hidden. This trigger+listbox
  // pair is a styled stand-in that mirrors it.
  const typeSelect = document.getElementById("feedbackType");
  const typeWrap = document.getElementById("feedbackTypeSelectWrap");
  const typeTrigger = document.getElementById("feedbackTypeTrigger");
  const typeTriggerLabel = document.getElementById("feedbackTypeTriggerLabel");
  const typeListbox = document.getElementById("feedbackTypeListbox");
  let typeActiveIndex = -1;

  function getTypeOptionEls() {
    return Array.from(typeListbox?.querySelectorAll(".feedback-select-option") || []);
  }

  function renderFeedbackTypeOptions() {
    if (!typeSelect || !typeListbox || !typeTrigger) return;
    typeListbox.innerHTML = "";
    Array.from(typeSelect.options).forEach((opt) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.id = "fbTypeOpt_" + (opt.id || opt.value || "empty");
      li.dataset.value = opt.value;
      li.textContent = opt.textContent;
      li.className = "feedback-select-option" + (opt.value === "" ? " is-placeholder" : "");
      const isSelected = opt.value === typeSelect.value;
      li.setAttribute("aria-selected", isSelected ? "true" : "false");
      if (isSelected) li.classList.add("is-active");
      li.addEventListener("click", () => selectFeedbackType(opt.value));
      typeListbox.appendChild(li);
    });
    const selectedOption = typeSelect.options[typeSelect.selectedIndex];
    typeTriggerLabel.textContent = selectedOption ? selectedOption.textContent : "";
    typeTrigger.classList.toggle("has-value", !!typeSelect.value);
  }

  function setTypeActiveIndex(idx) {
    const opts = getTypeOptionEls();
    if (!opts.length) return;
    typeActiveIndex = Math.max(0, Math.min(idx, opts.length - 1));
    opts.forEach((el, i) => el.classList.toggle("is-active", i === typeActiveIndex));
    typeListbox.setAttribute("aria-activedescendant", opts[typeActiveIndex].id);
    opts[typeActiveIndex].scrollIntoView({ block: "nearest" });
  }

  function openTypeListbox() {
    if (!typeListbox || !typeTrigger) return;
    typeListbox.hidden = false;
    typeTrigger.setAttribute("aria-expanded", "true");
    typeWrap?.classList.add("is-open");
    const opts = getTypeOptionEls();
    const currentIdx = opts.findIndex((el) => el.dataset.value === typeSelect.value);
    setTypeActiveIndex(currentIdx >= 0 ? currentIdx : 0);
    typeListbox.focus();
  }

  function closeTypeListbox() {
    if (!typeListbox || !typeTrigger) return;
    typeListbox.hidden = true;
    typeTrigger.setAttribute("aria-expanded", "false");
    typeWrap?.classList.remove("is-open");
  }

  function selectFeedbackType(value) {
    if (typeSelect.value !== value) {
      typeSelect.value = value;
      renderFeedbackTypeOptions();
      // Programmatic value changes don't fire native events, so dispatch
      // them manually — the existing validation/error-clearing listeners
      // below already react to "input" on this element.
      typeSelect.dispatchEvent(new Event("input", { bubbles: true }));
      typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      scheduleDraftSave();
    }
    closeTypeListbox();
    typeTrigger.focus();
  }

  typeTrigger?.addEventListener("click", () => {
    if (typeListbox?.hidden === false) closeTypeListbox();
    else openTypeListbox();
  });
  typeTrigger?.addEventListener("blur", () => validateField("feedbackType"));

  typeListbox?.addEventListener("keydown", (e) => {
    const opts = getTypeOptionEls();
    if (!opts.length) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setTypeActiveIndex(typeActiveIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        setTypeActiveIndex(typeActiveIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        setTypeActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setTypeActiveIndex(opts.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (typeActiveIndex >= 0) selectFeedbackType(opts[typeActiveIndex].dataset.value);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        closeTypeListbox();
        typeTrigger.focus();
        break;
      case "Tab":
        closeTypeListbox();
        break;
    }
  });

  document.addEventListener("click", (e) => {
    if (typeWrap && !typeWrap.contains(e.target)) closeTypeListbox();
  });

  window.syncFeedbackTypeCustomUI = renderFeedbackTypeOptions;

  // Draft auto-save
  // Saves in-progress (unsent) feedback to localStorage so an accidental
  // close/refresh doesn't lose what someone typed. Restored the next time
  // the form is opened, and cleared once feedback actually sends.
  const DRAFT_KEY = "adashimaverse_feedback_draft";
  const draftNotice = document.getElementById("feedbackDraftNotice");
  const draftClearBtn = document.getElementById("feedbackDraftClear");
  const titleInput = document.getElementById("feedbackTitleInput");
  const descInput = document.getElementById("feedbackDescription");
  const emailInput = document.getElementById("feedbackEmail");
  let draftSaveTimer = null;

  function readDraftFields() {
    return {
      type: typeSelect?.value || "",
      title: titleInput?.value || "",
      description: descInput?.value || "",
      email: emailInput?.value || "",
    };
  }

  function saveDraft() {
    const data = readDraftFields();
    const isEmpty =
      !data.type && !data.title.trim() && !data.description.trim() && !data.email.trim();
    if (isEmpty) {
      clearDraft();
      return;
    }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
    } catch {
      /* localStorage unavailable (private mode, quota, etc.) — skip silently */
    }
  }

  function scheduleDraftSave() {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(saveDraft, 500);
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    if (draftNotice) draftNotice.style.display = "none";
  }

  function applyDraft(draft) {
    if (typeSelect) typeSelect.value = draft.type || "";
    if (titleInput) titleInput.value = draft.title || "";
    if (descInput) descInput.value = draft.description || "";
    if (emailInput) emailInput.value = draft.email || "";
    updateCharCounter("titleCount", (draft.title || "").length, 100);
    updateCharCounter("descCount", (draft.description || "").length, 3000);
    renderFeedbackTypeOptions();
    if (draftNotice) draftNotice.style.display = "flex";
  }

  draftClearBtn?.addEventListener("click", () => {
    clearDraft();
    form.reset();
    updateCharCounter("titleCount", 0, 100);
    updateCharCounter("descCount", 0, 3000);
    renderFeedbackTypeOptions();
    document.getElementById("feedbackTitleInput")?.focus();
  });

  emailInput?.addEventListener("input", scheduleDraftSave);

  function openModal() {
    if (!modal) return;
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
    form.reset();
    form.style.display = "block";
    successEl.style.display = "none";
    document.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
    document.querySelectorAll(".has-error").forEach((el) => el.classList.remove("has-error"));
    document.querySelectorAll(".form-error-message").forEach((el) => el.remove());
    submitBtn.disabled = false;
    submitBtn.querySelector(".submit-text").style.display = "inline";
    submitBtn.querySelector(".submit-spinner").style.display = "none";
    isSending = false;
    document.getElementById("titleCount").textContent = "0";
    document.getElementById("descCount").textContent = "0";
    if (draftNotice) draftNotice.style.display = "none";
    applyFeedbackI18n();
    renderFeedbackTypeOptions();

    const draft = loadDraft();
    if (draft) applyDraft(draft);
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
    const fields = ["feedbackType", "feedbackTitleInput", "feedbackDescription"];
    let allValid = true;
    fields.forEach((id) => {
      if (!validateField(id)) allValid = false;
    });
    return allValid;
  }

  function showError(message) {
    document.querySelectorAll(".form-error-message").forEach((el) => el.remove());
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
      description: document.getElementById("feedbackDescription")?.value.trim() || "",
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
      .send(FEEDBACK_CONFIG.SERVICE_ID, FEEDBACK_CONFIG.TEMPLATE_ID, templateParams)
      .then((response) => {
        console.log("[Feedback] Success:", response);
        clearDraft();
        form.style.display = "none";
        successEl.style.display = "block";
        setTimeout(closeModal, 2000);
      })
      .catch((error) => {
        console.error("[Feedback] Send failed:", error);
        let errorMsg = "Failed to send feedback. ";
        if (error.status === 400) {
          errorMsg += "Please check your EmailJS template variables. Make sure they match exactly.";
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
  closeBtn?.addEventListener("click", () => {
    saveDraft();
    closeModal();
  });
  cancelBtn?.addEventListener("click", () => {
    saveDraft();
    closeModal();
  });
  overlay?.addEventListener("click", () => {
    saveDraft();
    closeModal();
  });
  form?.addEventListener("submit", handleSubmit);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal?.style.display === "flex") {
      saveDraft();
      closeModal();
    }
  });

  document.getElementById("feedbackTitleInput")?.addEventListener("input", function () {
    updateCharCounter("titleCount", this.value.length, 100);
    scheduleDraftSave();
  });
  document.getElementById("feedbackDescription")?.addEventListener("input", function () {
    updateCharCounter("descCount", this.value.length, 3000);
    scheduleDraftSave();
  });

  ["feedbackType", "feedbackTitleInput", "feedbackDescription"].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("blur", () => validateField(id));
    el?.addEventListener("input", () => {
      const errorEl = document.getElementById(id + "Error");
      if (errorEl) errorEl.textContent = "";
      el.closest(".feedback-field")?.classList.remove("has-error");
    });
  });

  console.log("[Feedback] Modal initialized");
})();

let currentLang = localStorage.getItem("lang") || localStorage.getItem("preferredLanguage") || "es";
let _isSwitching = false;
let _newsVisible = false;
let contentData = null;
let rawNewsData = null;

let NEWS_CONTENT = {
  title: "",
  messages: [],
  publishDate: null,
};

const navHrefs = {
  timeline: "/Adashima_Linea",
  novels: "/Adashima_Novelas",
  manga: "/Adashima_Manga",
  extraStories: "/Adashima_Extra_Stories",
  drama: "/Adashima_Drama",
  music: "/Adashima_Music",
  miniAnime: "/Adashima_Mini_Anime",
  constellation: "/Adashima_Estrella",
  anime: "/Adashima_Anime",
  others: "/Adashima_Otros",
  authorArchive: "/otros/Author_Archive",
  stats: "/Adashima_Stats",
  about: "/Adashima_About",
  help: "/Adashima_Help",
  gallery: "/Adashima_Gallery",
};

async function loadContent(lang) {
  const res = await fetch(`src/data/index/${lang}.json?v=1.5.2`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function updateLangLabel() {
  const sel = document.querySelector(`.lang-option[data-lang="${currentLang}"]`);
  const label = document.getElementById("langSelectedLabel");
  if (sel && label) {
    label.textContent = sel.getAttribute("data-label");
    document.querySelectorAll(".lang-option").forEach((o) => o.classList.remove("selected"));
    sel.classList.add("selected");
  }
}

// Font Awesome class names (as they still arrive from the JSON content
// files) mapped to their closest Lucide icon name. Anything not listed
// falls back to stripping the "fa-" prefix and trying that directly.
const FA_TO_LUCIDE = {
  "fa-arrow-right": "arrow-right",
  "fa-arrow-up-right-from-square": "external-link",
  "fa-book": "book",
  "fa-book-open": "book-open",
  "fa-feather-alt": "feather",
  "fa-feather": "feather",
  "fa-scroll": "scroll",
  "fa-music": "music",
  "fa-compact-disc": "disc",
  "fa-images": "images",
  "fa-image": "image",
  "fa-user": "user",
  "fa-circle-question": "circle-help",
  "fa-info-circle": "info",
  "fa-star": "star",
  "fa-stars": "sparkles",
  "fa-sparkles": "sparkles",
  "fa-timeline": "list-tree",
  "fa-clock-rotate-left": "history",
  "fa-comments": "message-circle",
  "fa-chart-simple": "bar-chart-3",
  "fa-tv": "monitor",
  "fa-film": "clapperboard",
};
function faToLucide(icon) {
  if (!icon) return "arrow-right";
  const key = icon.trim();
  return FA_TO_LUCIDE[key] || key.replace(/^fa-/, "");
}

function refreshLucideIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function renderNav(data) {
  const grid = document.getElementById("navGrid");
  const secondaryGrid = document.getElementById("navGridSecondary");
  if (!grid) return;

  const navItems = Array.isArray(data?.nav?.items) ? data.nav.items : [];
  const featuredKeys = ["novels", "manga", "anime"];
  const moreKeys = [
    "extraStories",
    "drama",
    "music",
    "gallery",
    "constellation",
    "timeline",
    "others",
    ...(currentLang === "es" ? [] : ["stats"]),
    "about",
    "help",
  ];

  const storyKickers = {
    novels:
      currentLang === "en"
        ? "ORIGINAL NOVELS"
        : currentLang === "tg"
          ? "ORIHINAL NA NOVELS"
          : "NOVELAS ORIGINALES",
    manga:
      currentLang === "en"
        ? "MANGA ADAPTATION"
        : currentLang === "tg"
          ? "MANGA ADAPTATION"
          : "ADAPTACIÓN AL MANGA",
    anime:
      currentLang === "en"
        ? "ANIME ADAPTATION"
        : currentLang === "tg"
          ? "ANIME ADAPTATION"
          : "ADAPTACIÓN AL ANIME",
  };

  function buildCard(item, variant = "story", index = 0) {
    const href = navHrefs[item.key] || "#";
    const card = document.createElement("a");
    card.href = href;
    card.setAttribute("aria-label", item.title || item.key);

    if (variant === "more") {
      card.className = `nav-card nav-card-${variant}`;
      card.innerHTML = `
        <span class="nav-card-icon" aria-hidden="true"><i data-lucide="${faToLucide(item.icon)}"></i></span>
        <span class="nav-card-content">
          <span class="nav-card-title">${item.title || ""}</span>
        </span>
        <i data-lucide="arrow-right" class="nav-card-arrow" aria-hidden="true"></i>
      `;
      return card;
    }

    const isFeatured = index === 0;
    const kicker = storyKickers[item.key] || "";
    const storyIcons = {
      novels: "book-open",
      manga: "panels-top-left",
      anime: "clapperboard",
    };
    const storyIcon = storyIcons[item.key] || faToLucide(item.icon);

    card.className = `nav-card nav-card-story ${
      isFeatured ? "nav-card-featured" : "nav-card-side"
    } nav-card-${item.key || ""}`;

    card.innerHTML = `
      <div class="story-card-header">
        <span class="story-card-kicker">
          <span>${kicker}</span>
        </span>
        <span class="story-card-arrow" aria-hidden="true">
          <i data-lucide="arrow-up-right"></i>
        </span>
      </div>

      <div class="story-card-body">
        <h3 class="story-card-title">${item.title || ""}</h3>
        ${item.desc ? `<p class="story-card-desc">${item.desc}</p>` : ""}
      </div>

      <span class="story-card-mark" aria-hidden="true">
        <i data-lucide="${storyIcon}"></i>
      </span>
    `;

    return card;
  }

  grid.replaceChildren();
  if (secondaryGrid) secondaryGrid.replaceChildren();

  featuredKeys
    .map((key) => navItems.find((item) => item.key === key))
    .filter(Boolean)
    .forEach((item, index) => grid.appendChild(buildCard(item, "story", index)));

  if (secondaryGrid) {
    moreKeys
      .map((key) => navItems.find((item) => item.key === key))
      .filter(Boolean)
      .forEach((item) => secondaryGrid.appendChild(buildCard(item, "more")));
    secondaryGrid.hidden = secondaryGrid.children.length === 0;
  }

  refreshLucideIcons();
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
  if (galleryTitle && data.gallery.title) galleryTitle.textContent = data.gallery.title;
  if (gallerySubtitle && data.gallery.subtitle) gallerySubtitle.textContent = data.gallery.subtitle;

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
    img?.addEventListener("click", () => openLightbox(item, data.gallery.items));

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
  document.getElementById("feedbackTypeLabelText").textContent = t.typeLabel;
  document.getElementById("fbTypePlaceholder").textContent = t.typePlaceholder;
  document.getElementById("fbTypeBug").textContent = t.typeBug;
  document.getElementById("fbTypeTranslation").textContent = t.typeTranslation;
  document.getElementById("fbTypeMissing").textContent = t.typeMissing;
  document.getElementById("fbTypeBroken").textContent = t.typeBroken;
  document.getElementById("fbTypeFeature").textContent = t.typeFeature;
  document.getElementById("fbTypeGeneral").textContent = t.typeGeneral;
  if (typeof window.syncFeedbackTypeCustomUI === "function") {
    window.syncFeedbackTypeCustomUI();
  }
  if (t.draftNoticeText) {
    document.getElementById("feedbackDraftNoticeText").textContent = t.draftNoticeText;
  }
  if (t.draftClear) {
    document.getElementById("feedbackDraftClearLabel").textContent = t.draftClear;
  }
  document.getElementById("feedbackTitleLabel").textContent = t.titleLabel;
  document.getElementById("feedbackTitleInput").placeholder = t.titlePlaceholder;
  document.getElementById("feedbackDescLabel").textContent = t.descLabel;
  document.getElementById("feedbackDescription").placeholder = t.descPlaceholder;
  document.getElementById("feedbackEmailLabel").textContent = t.emailLabel;
  document.getElementById("feedbackEmailHint").textContent = t.emailHint;
  document.getElementById("fbCancelLabel").textContent = t.cancel;
  document.getElementById("fbSubmitLabel").textContent = t.submit;
  document.getElementById("fbSuccessTitle").textContent = t.successTitle;
  document.getElementById("fbSuccessText").textContent = t.successText;
  document.getElementById("feedbackFooterLabel").textContent = t.footerBtn;
}

function applyHomepageFooterI18n(data) {
  const footer = document.getElementById("footer");
  if (!footer) return;

  const copy =
    currentLang === "en"
      ? {
          tagline: "An unofficial fan archive dedicated to <em>Adachi to Shimamura</em>.",
          description:
            "A place to read, explore, and keep track of the stories, adaptations, and little details that make Adachi and Shimamura worth revisiting.",
          community: "COMMUNITY",
          help: "HELP KEEP IT BETTER",
          feedback: "Found a typo, missing content, or something that could be improved?",
        }
      : currentLang === "tg"
        ? {
            tagline:
              "Isang hindi opisyal na fan archive na nakatuon sa <em>Adachi to Shimamura</em>.",
            description:
              "Isang lugar para magbasa, mag-explore, at subaybayan ang mga kuwento, adaptation, at maliliit na detalyeng nagpapahalagang balikan sina Adachi at Shimamura.",
            community: "KOMUNIDAD",
            help: "TULUNGANG PAGANDAHIN ITO",
            feedback: "May nakita ka bang typo, kulang na content, o bagay na maaaring pagandahin?",
          }
        : {
            tagline: "Un archivo de fans no oficial dedicado a <em>Adachi to Shimamura</em>.",
            description:
              "Un lugar para leer, explorar y seguir las historias, adaptaciones y pequeños detalles que hacen que Adachi y Shimamura merezcan ser revisitadas.",
            community: "COMUNIDAD",
            help: "AYUDA A MEJORARLO",
            feedback: "¿Encontraste un error, contenido faltante o algo que podría mejorarse?",
          };

  const tagline = footer.querySelector(".footer-tagline");
  const description = footer.querySelector(".footer-description");
  const columnTitles = footer.querySelectorAll(".footer-column-title");
  const feedbackCopy = footer.querySelector(".footer-feedback-copy");
  const disclaimer = footer.querySelector(".footer-disclaimer");
  const legalLinks = footer.querySelectorAll(".footer-legal-link");

  if (tagline) tagline.innerHTML = copy.tagline;
  if (description) description.textContent = copy.description;
  if (columnTitles[0]) columnTitles[0].textContent = copy.community;
  if (columnTitles[1]) columnTitles[1].textContent = copy.help;
  if (feedbackCopy) feedbackCopy.textContent = copy.feedback;
  if (disclaimer && data?.footer) disclaimer.innerHTML = data.footer;
  legalLinks.forEach((link) => {
    const translated = link.getAttribute(`data-${currentLang}`);
    if (translated) link.innerHTML = translated;
  });
}

document.addEventListener("footerLoaded", () => {
  applyHomepageFooterI18n(contentData);
});

function applyHomepageCopy() {
  const copy =
    currentLang === "en"
      ? {
          infoEyebrow: "THE SERIES",
          infoSub: "An introduction for new readers",
          exploreEyebrow: "THE STORY",
          exploreTitle: "Explore Adachi & Shimamura",
          exploreSub: "Novels, manga, anime, and other stories from the series.",
          updatesEyebrow: "SERIES NEWS",
          updatesTitle: "What's New",
          updatesSub:
            "News, announcements, and recent developments from the world of Adachi & Shimamura.",
          discoverEyebrow: "THE ARCHIVE",
          discoverTitle: "More from the Archive",
          discoverSub: "Additional stories, media, artwork, and discoveries.",
        }
      : currentLang === "tg"
        ? {
            infoEyebrow: "ANG SERYE",
            infoSub: "Panimula para sa mga bagong mambabasa",
            exploreEyebrow: "ANG KUWENTO",
            exploreTitle: "Tuklasin sina Adachi at Shimamura",
            exploreSub: "Mga nobela, manga, anime, at iba pang kuwento mula sa serye.",
            updatesEyebrow: "BALITA NG SERYE",
            updatesTitle: "Ano ang Bago",
            updatesSub:
              "Mga balita, anunsyo, at mga bagong kaganapan tungkol sa Adachi at Shimamura.",
            discoverEyebrow: "ANG ARCHIVE",
            discoverTitle: "Higit pa sa Archive",
            discoverSub: "Mga dagdag na kuwento, media, artwork, at iba pang tuklas.",
          }
        : {
            infoEyebrow: "LA SERIE",
            infoSub: "Una introducción para nuevos lectores",
            exploreEyebrow: "LA HISTORIA",
            exploreTitle: "Explora Adachi & Shimamura",
            exploreSub: "Novelas, manga, anime y otras historias de la serie.",
            updatesEyebrow: "NOTICIAS DE LA SERIE",
            updatesTitle: "Novedades",
            updatesSub: "Noticias, anuncios y novedades recientes de Adachi & Shimamura.",
            discoverEyebrow: "EL ARCHIVO",
            discoverTitle: "Más del archivo",
            discoverSub: "Historias adicionales, medios, ilustraciones y descubrimientos.",
          };

  const map = {
    infoEyebrow: copy.infoEyebrow,
    infoSub: copy.infoSub,
    exploreEyebrow: copy.exploreEyebrow,
    exploreSectionTitle: copy.exploreTitle,
    exploreSectionSub: copy.exploreSub,
    updatesEyebrow: copy.updatesEyebrow,
    updatesTitle: copy.updatesTitle,
    updatesSub: copy.updatesSub,
    discoverEyebrow: copy.discoverEyebrow,
    discoverSectionTitle: copy.discoverTitle,
    discoverSectionSub: copy.discoverSub,
  };

  Object.entries(map).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });

  const infoTitle = document.getElementById("infoTitle");
  if (infoTitle) {
    infoTitle.textContent =
      currentLang === "en"
        ? "What is Adachi to Shimamura?"
        : currentLang === "tg"
          ? "Ano ang Adachi to Shimamura?"
          : "¿Qué es Adachi to Shimamura?";
  }
}

function formatBulletinDate(dateStr) {
  if (!dateStr) return "";
  const parsed = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(parsed.getTime())) return dateStr;
  const locale = currentLang === "es" ? "es-ES" : currentLang === "tg" ? "fil-PH" : "en-US";
  return parsed.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function sanitizeNewsMessage(message) {
  if (!message) return "";
  return String(message)
    .replace(/^\s*Ho-ho-ho!\s*(?:[^.!?]+[.!?]\s*)?/i, "")
    .replace(/\s*Ho-ho-ho!\s*$/i, "")
    .trim();
}

function getLocalizedUpdateText(update) {
  if (!update) return null;
  return update[currentLang] || update.en || update.es || update.tg || null;
}

// Returns a comparable number for an id like "1", "2", "news_series-3", etc.
// Non-numeric / fallback-generated ids (e.g. "news_series-2026-08-16-0-Title")
// simply won't compare as numbers, which is fine — they fall back to date.
function getComparableBulletinId(id) {
  const match = String(id ?? "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

// The bulletin's recency rule: sort by publishDate first, but when two
// entries share the same date (or a date is missing/unparseable), the entry
// with the numerically greater id is the more recent one. This is what lets
// entries with an identical publishDate — like a batch of Series News items
// all stamped the same day — still resolve to a definite "latest" item.
function isBulletinItemNewer(a, b) {
  const dateA = String(a.date || "");
  const dateB = String(b.date || "");
  if (dateA !== dateB) return dateA > dateB;

  const idA = getComparableBulletinId(a.id);
  const idB = getComparableBulletinId(b.id);
  if (idA !== null && idB !== null && idA !== idB) return idA > idB;

  return false;
}

function compareBulletinRecency(a, b) {
  if (isBulletinItemNewer(a, b)) return -1;
  if (isBulletinItemNewer(b, a)) return 1;
  return 0;
}

// The single most recent Series News entry — used to drive the feature card,
// which is always meant to show the latest series announcement (the section
// eyebrow literally reads "SERIES NEWS"), independent of whether any
// dev-update happens to be dated later or an explicit `featured` flag is set.
function pickLatestSeriesNews(updates) {
  return updates
    .filter((item) => item.isSeriesNews)
    .reduce((latest, item) => (!latest || isBulletinItemNewer(item, latest) ? item : latest), null);
}

function getBulletinUpdates() {
  if (!rawNewsData) return [];

  const updates = [];
  const seen = new Set();

  function registerUpdate(canonicalUpdate) {
    if (!canonicalUpdate || !canonicalUpdate.title) return;

    // Deduplicate by stable ID, and also by the actual bulletin identity.
    // This prevents the same item from appearing twice when a folder contains
    // both a legacy and a normalized representation.
    const identity = `${String(canonicalUpdate.type).toLowerCase()}|${canonicalUpdate.date}|${canonicalUpdate.title}`;
    if (seen.has(canonicalUpdate.id) || seen.has(identity)) return;
    seen.add(canonicalUpdate.id);
    seen.add(identity);

    updates.push(canonicalUpdate);
  }

  // The bulletin's source of truth is the dedicated folders:
  //   src/data/news_series/{lang}.json
  //   src/data/news_dev/{lang}.json
  // `normalizeNewsFolder()` (called from `loadNewsContent()`) already turns
  // those files into fully-flattened, already-localized canonical objects —
  // {id, date, type, title, text, body, sourceUrl, isSeriesNews, featured}.
  // They're pushed straight through here with no further locale-resolution,
  // because re-running locale lookup on an already-flat object is exactly
  // what was silently discarding the title/body for Series News before.
  if (Array.isArray(rawNewsData.folderUpdates)) {
    rawNewsData.folderUpdates.forEach(registerUpdate);
  }

  // Only use the old noticia.json structures as a fallback for older installs
  // where the dedicated news folders have not been added yet. This path
  // genuinely deals with locale-wrapped raw objects (e.g. `{ en: {...} }`),
  // so it's the only place locale resolution still needs to happen.
  if (!rawNewsData.folderUpdatesLoaded) {
    function addLegacyUpdate(update, fallback = {}) {
      if (!update) return;

      const copy = getLocalizedUpdateText(update) || {};
      const localized = { ...fallback, ...copy };

      const title = localized.title || update.title || fallback.title || "";
      if (!title) return;

      const date = update.date || update.publishDate || fallback.date || "";
      const type = update.type || fallback.type || "NEWS";
      const id = update.id || fallback.id || `${type}-${date}-${title}`;
      const isSeriesNews = String(type).toUpperCase() === "SERIES NEWS";

      const rawBody = localized.body || update.body || [];
      const body = Array.isArray(rawBody) ? rawBody.map(sanitizeNewsMessage).filter(Boolean) : [];

      const text = sanitizeNewsMessage(
        localized.text || localized.summary || update.text || update.summary || body[0] || "",
      );

      registerUpdate({
        id,
        date,
        type,
        title,
        text,
        body,
        sourceUrl: isSeriesNews
          ? update.sourceUrl || localized.sourceUrl || fallback.sourceUrl || ""
          : "",
        sources: isSeriesNews
          ? Array.isArray(update.sources || localized.sources)
            ? (update.sources || localized.sources)
                .map((source) => (typeof source === "string" ? { url: source, label: "" } : source))
                .filter((source) => source?.url)
            : []
          : [],
        author: !isSeriesNews
          ? String(update.author || localized.author || fallback.author || "").trim()
          : "",
        isSeriesNews,
        featured: Boolean(update.featured || fallback.featured),
      });
    }

    if (Array.isArray(rawNewsData.updates)) {
      rawNewsData.updates.forEach((update) => addLegacyUpdate(update));
    }

    const legacy = rawNewsData[currentLang] || rawNewsData.en || rawNewsData.es || rawNewsData.tg;
    if (legacy?.title) {
      addLegacyUpdate(legacy, {
        id: "legacy-dev-update",
        date: rawNewsData.publishDate || "",
        type: "DEV UPDATE",
        body: legacy.messages || [],
      });
    }

    const series = rawNewsData.seriesNews;
    if (series) {
      const seriesCopy = getLocalizedUpdateText(series) || {};
      addLegacyUpdate(series, {
        id: "legacy-series-news",
        date: series.publishDate || series.releaseDate || "",
        type: "SERIES NEWS",
        featured: Boolean(series.featured),
        title: seriesCopy.title,
        text: seriesCopy.text,
      });
    }
  }

  return updates.sort(compareBulletinRecency);
}

let bulletinFilter = "all";
let _activeBulletinUpdate = null;
let lastBulletinTrigger = null;
const BULLETIN_CONTENT_SEEN_KEY = "adashima_bulletin_content_seen";

// Cached result of the last getBulletinUpdates() call used to render the
// bulletin. The archive list and the modal must render from the exact same
// normalized objects, so the modal reuses this cache (for numbering) instead
// of recomputing — and uses the item it was actually clicked with for
// everything else, rather than re-looking it up.
let bulletinUpdatesCache = [];

const BULLETIN_MODAL_COPY = {
  en: { close: "Close update", read: "Read full update", source: "Sources", author: "By" },
  es: {
    close: "Cerrar actualización",
    read: "Leer actualización completa",
    source: "Fuentes",
    author: "Por",
  },
  tg: {
    close: "Isara ang update",
    read: "Basahin ang buong update",
    source: "Mga source",
    author: "Ni",
  },
};

const BULLETIN_SECTION_COPY = {
  en: {
    archiveKicker: "ARCHIVE",
    listTitle: "Latest updates",
    emptyType: "LATEST",
    emptyTitle: "Adachi to Shimamura",
    emptyText: "News and announcements about the series will appear here.",
    contentEmpty: "No content updates are available in this language yet.",
    source: "Sources",
    author: "By",
  },
  es: {
    archiveKicker: "ARCHIVO",
    listTitle: "Novedades",
    emptyType: "ÚLTIMO",
    emptyTitle: "Adachi to Shimamura",
    emptyText: "Aquí aparecerán las noticias y anuncios sobre la serie.",
    contentEmpty: "Por el momento no hay novedades de contenido disponibles en este idioma.",
    source: "Fuentes",
    author: "Por",
  },
  tg: {
    archiveKicker: "ARCHIVE",
    listTitle: "Mga pinakabagong update",
    emptyType: "PINAKABAGO",
    emptyTitle: "Adachi to Shimamura",
    emptyText: "Dito lalabas ang mga balita at anunsyo tungkol sa serye.",
    contentEmpty: "Wala pang available na content updates sa wikang ito sa ngayon.",
    source: "Mga source",
    author: "Ni",
  },
};

function getBulletinModalCopy() {
  return BULLETIN_MODAL_COPY[currentLang] || BULLETIN_MODAL_COPY.en;
}

function getBulletinSectionCopy() {
  return BULLETIN_SECTION_COPY[currentLang] || BULLETIN_SECTION_COPY.en;
}

function openBulletinModal(update, trigger = null) {
  const modal = document.getElementById("bulletinModal");
  const type = document.getElementById("bulletinModalType");
  const date = document.getElementById("bulletinModalDate");
  const title = document.getElementById("bulletinModalTitle");
  const body = document.getElementById("bulletinModalBody");
  const sources = document.getElementById("bulletinModalSources");
  const author = document.getElementById("bulletinModalAuthor");
  const number = document.getElementById("bulletinModalNumber");
  if (!modal || !update) return;

  // `update` is already the exact same normalized object the archive/feature
  // card rendered from (see getBulletinUpdates()). There is no second
  // "reconstruction" step here on purpose — re-deriving a separate copy for
  // the modal was how the title/body were previously getting lost, and it
  // also let a previously-opened item's data leak into the next click.
  const normalizedType = String(update.type || "NEWS").trim();
  const normalizedTitle = String(update.title || "").trim();
  const normalizedDate = update.date || "";
  const normalizedText = String(update.text || "").trim();
  const normalizedBody =
    Array.isArray(update.body) && update.body.length
      ? update.body.filter(Boolean)
      : normalizedText
        ? [normalizedText]
        : [];

  if (!normalizedTitle) {
    console.error("[Bulletin] openBulletinModal called with an item missing a title.", update);
  }

  _activeBulletinUpdate = update;
  lastBulletinTrigger = trigger;

  type.textContent = normalizedType;
  date.textContent = formatBulletinDate(normalizedDate);
  title.textContent = normalizedTitle;

  const index = bulletinUpdatesCache.findIndex((item) => item.id === update.id);
  number.textContent = String(Math.max(1, index + 1)).padStart(2, "0");

  body.replaceChildren();
  normalizedBody.forEach((paragraph) => {
    const p = document.createElement("p");
    p.textContent = paragraph;
    body.appendChild(p);
  });

  const copy = getBulletinModalCopy();
  const closeButton = document.getElementById("bulletinModalClose");
  if (closeButton) closeButton.setAttribute("aria-label", copy.close);

  author.hidden = true;
  author.textContent = "";
  if (!update.isSeriesNews && update.author) {
    author.textContent = `${copy.author} ${update.author}`;
    author.hidden = false;
  }

  sources.hidden = true;
  sources.replaceChildren();
  const sourceControl = createBulletinSources(update, copy);
  if (sourceControl) {
    sources.appendChild(sourceControl);
    sources.hidden = false;
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  lockBulletinScroll();
  requestAnimationFrame(() => closeButton?.focus());
}

let bulletinScrollLockY = 0;

function lockBulletinScroll() {
  bulletinScrollLockY = window.scrollY || window.pageYOffset || 0;
  document.body.classList.add("bulletin-modal-open");
  document.body.style.top = `-${bulletinScrollLockY}px`;
}

function unlockBulletinScroll() {
  document.body.classList.remove("bulletin-modal-open");
  document.body.style.top = "";
  window.scrollTo(0, bulletinScrollLockY);
}

function closeBulletinModal() {
  const modal = document.getElementById("bulletinModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  unlockBulletinScroll();
  _activeBulletinUpdate = null;
  lastBulletinTrigger?.focus?.();
  lastBulletinTrigger = null;
}

(function initBulletinModal() {
  const modal = document.getElementById("bulletinModal");
  if (!modal) return;

  // The modal used to live inside `.main-content`, which establishes its own
  // stacking context (position: relative + z-index). That trapped the modal
  // below anything outside `.main-content` with a higher stacking order —
  // the mobile nav/menu in particular — no matter how high the modal's own
  // z-index was set. Moving it to be a direct child of <body> removes it
  // from that stacking context entirely, so z-index actually applies against
  // the whole page as intended.
  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  document.getElementById("bulletinModalClose")?.addEventListener("click", closeBulletinModal);
  modal
    .querySelectorAll("[data-bulletin-close]")
    .forEach((el) => el.addEventListener("click", closeBulletinModal));
  document.addEventListener("keydown", (event) => {
    if (!modal.classList.contains("is-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeBulletinModal();
    }
  });
})();

function getBulletinFilterLabel(filter) {
  const labels = {
    en: {
      all: "All",
      series: "Series News",
      dev: "Dev Updates",
      content: "Content Updates",
    },
    es: {
      all: "Todo",
      series: "Noticias de la serie",
      dev: "Actualizaciones de desarrollo",
      content: "Novedades de contenido",
    },
    tg: {
      all: "Lahat",
      series: "Balita ng Serye",
      dev: "Dev Updates",
      content: "Mga bagong content",
    },
  };
  return labels[currentLang]?.[filter] || labels.en[filter];
}

function getFilteredBulletinUpdates(updates) {
  if (bulletinFilter === "series") return updates.filter((item) => item.isSeriesNews);
  if (bulletinFilter === "dev") {
    return updates.filter((item) => !item.isSeriesNews && !item.isContentNews);
  }
  if (bulletinFilter === "content") return updates.filter((item) => item.isContentNews);
  return updates;
}

function getContentBulletinSignature(updates) {
  return updates
    .filter((item) => item.isContentNews)
    .map((item) => [item.id, item.date, item.title, item.text, ...(item.body || [])].join("|"))
    .sort()
    .join("||");
}

function hasUnseenContentBulletins(updates) {
  const signature = getContentBulletinSignature(updates);
  if (!signature) return false;
  try {
    return localStorage.getItem(BULLETIN_CONTENT_SEEN_KEY) !== signature;
  } catch {
    return true;
  }
}

function markContentBulletinsSeen(updates) {
  const signature = getContentBulletinSignature(updates);
  if (!signature) return;
  try {
    localStorage.setItem(BULLETIN_CONTENT_SEEN_KEY, signature);
  } catch {
    return;
  }
}

function normalizeBulletinSources(update) {
  if (!update?.isSeriesNews) return [];
  const sources = Array.isArray(update.sources) ? update.sources : [];
  return sources.length
    ? sources.filter((source) => source?.url)
    : update.sourceUrl
      ? [{ url: update.sourceUrl, label: "" }]
      : [];
}

function createBulletinSources(update, copy) {
  const sources = normalizeBulletinSources(update);
  if (!sources.length) return null;

  const wrapper = document.createElement("div");
  wrapper.className = "bulletin-sources";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "bulletin-source";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-haspopup", "true");
  button.innerHTML = `<i data-lucide="link-2" aria-hidden="true"></i><span>${copy.source}${sources.length > 1 ? ` · ${sources.length}` : ""}</span><i class="bulletin-source-chevron" data-lucide="chevron-down" aria-hidden="true"></i>`;

  const menu = document.createElement("div");
  menu.className = "bulletin-source-menu";
  menu.hidden = true;
  sources.forEach((source, index) => {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "bulletin-source-option";
    let hostname = source.url;
    try {
      hostname = new URL(source.url, window.location.href).hostname;
    } catch {
      // Keep the original URL as a readable fallback.
    }
    link.innerHTML = `<span class="bulletin-source-option-index">${String(index + 1).padStart(2, "0")}</span><span class="bulletin-source-option-label">${source.label || hostname}</span><i data-lucide="external-link" aria-hidden="true"></i>`;
    menu.appendChild(link);
  });

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const shouldOpen = menu.hidden;
    document.querySelectorAll(".bulletin-source-menu:not([hidden])").forEach((other) => {
      other.hidden = true;
      other.previousElementSibling?.setAttribute("aria-expanded", "false");
    });
    menu.hidden = !shouldOpen;
    button.setAttribute("aria-expanded", String(shouldOpen));
  });
  menu.addEventListener("click", (event) => event.stopPropagation());
  wrapper.append(button, menu);
  return wrapper;
}

function renderBulletin() {
  const feature = document.getElementById("bulletinFeature");
  const featureType = document.getElementById("bulletinFeatureType");
  const featureDate = document.getElementById("bulletinFeatureDate");
  const featureTitle = document.getElementById("bulletinFeatureTitle");
  const featureText = document.getElementById("bulletinFeatureText");
  const featureSources = document.getElementById("bulletinFeatureSources");
  const list = document.getElementById("bulletinList");
  const count = document.getElementById("bulletinCount");
  const filters = document.getElementById("bulletinFilters");
  if (!feature || !list) return;

  const updates = getBulletinUpdates();
  bulletinUpdatesCache = updates;
  const visibleUpdates = getFilteredBulletinUpdates(updates);
  const sectionCopy = getBulletinSectionCopy();
  const archiveKicker = document.querySelector(".bulletin-list-kicker");
  const listTitle = document.getElementById("bulletinListTitle");

  if (archiveKicker) archiveKicker.textContent = sectionCopy.archiveKicker;
  if (listTitle) listTitle.textContent = sectionCopy.listTitle;

  filters?.querySelectorAll(".bulletin-filter").forEach((button) => {
    const active = button.dataset.bulletinFilter === bulletinFilter;
    button.textContent = getBulletinFilterLabel(button.dataset.bulletinFilter);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    if (button.dataset.bulletinFilter === "content") {
      button.classList.toggle("has-unread", hasUnseenContentBulletins(updates));
    }
  });

  const featured = pickLatestSeriesNews(updates);
  if (!featured) {
    featureType.textContent = sectionCopy.emptyType;
    featureDate.textContent = "";
    featureTitle.textContent = sectionCopy.emptyTitle;
    featureText.textContent = sectionCopy.emptyText;
    featureSources.hidden = true;
    featureSources.replaceChildren();
  } else {
    featureType.textContent = featured.type;
    featureDate.textContent = formatBulletinDate(featured.date);
    featureTitle.textContent = featured.title;
    featureText.textContent = featured.text || featured.body[0] || "";
    featureSources.replaceChildren();
    const sourceControl = createBulletinSources(featured, sectionCopy);
    if (sourceControl) {
      featureSources.appendChild(sourceControl);
      featureSources.hidden = false;
    } else {
      featureSources.hidden = true;
    }
    const featureRead = document.getElementById("bulletinFeatureRead");
    if (featureRead) {
      featureRead.hidden = false;
      featureRead.querySelector("span").textContent = getBulletinModalCopy().read;
      featureRead.onclick = () => openBulletinModal(featured, featureRead);
    }
  }

  list.replaceChildren();
  visibleUpdates.forEach((item, visibleIndex) => {
    const row = document.createElement("article");
    row.className = "bulletin-item";

    const marker = document.createElement("span");
    marker.className = "bulletin-item-index";
    marker.textContent = String(visibleIndex + 1).padStart(2, "0");
    marker.setAttribute("aria-hidden", "true");

    const content = document.createElement("div");
    content.className = "bulletin-item-content";

    const meta = document.createElement("div");
    meta.className = "bulletin-item-meta";
    meta.innerHTML = `<span>${item.type}</span><time>${formatBulletinDate(item.date)}</time>`;

    const title = document.createElement("h4");
    const titleButton = document.createElement("button");
    titleButton.type = "button";
    titleButton.className = "bulletin-item-title";
    titleButton.textContent = item.title;
    titleButton.setAttribute("aria-label", `${getBulletinModalCopy().read}: ${item.title}`);
    titleButton.addEventListener("click", () => openBulletinModal(item, titleButton));
    title.appendChild(titleButton);

    const summary = document.createElement("p");
    summary.textContent = item.text || item.body[0] || "";
    content.append(meta, title, summary);

    if (!item.isSeriesNews && item.author) {
      const author = document.createElement("div");
      author.className = "bulletin-item-author";
      author.innerHTML = `<i data-lucide="pen-line" aria-hidden="true"></i><span>${getBulletinModalCopy().author} ${item.author}</span>`;
      content.appendChild(author);
    }
    if (item.isSeriesNews) {
      const sourceControl = createBulletinSources(item, sectionCopy);
      if (sourceControl) {
        sourceControl.classList.add("bulletin-item-sources");
        content.appendChild(sourceControl);
      }
    }

    row.append(marker, content);
    list.appendChild(row);
  });

  if (!visibleUpdates.length) {
    const empty = document.createElement("p");
    empty.className = "bulletin-filter-empty";
    empty.textContent =
      bulletinFilter === "content"
        ? sectionCopy.contentEmpty
        : currentLang === "es"
          ? "No hay actualizaciones en esta categoría."
          : currentLang === "tg"
            ? "Walang update sa kategoryang ito."
            : "No updates in this category yet.";
    list.appendChild(empty);
  }

  count.textContent = String(visibleUpdates.length).padStart(2, "0");
  refreshLucideIcons();
}

const NOTIFICATION_STORAGE_PREFIX = "adashima_content_notification_seen_";

function getNotificationFileCode(lang) {
  const key = String(lang || "es").toLowerCase();
  if (key === "es") return "es";
  if (key === "en") return "en";
  if (key === "tg") return "tg";
  return "es";
}

function readContentNotificationPayload(payload) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0] || null;
  if (Array.isArray(payload.items)) return payload.items[0] || null;
  return payload;
}

function getContentNotificationText(payload) {
  const item = readContentNotificationPayload(payload);
  if (!item) return "";
  return String(item.text || item.message || item.news || "").trim();
}

function getContentNotificationSignature(payload) {
  return JSON.stringify(payload || {});
}

async function showContentNotification() {
  const targetLang = getNotificationFileCode(currentLang);
  const notificationUrl = new URL(
    `src/data/Notificaciones/${targetLang}.json`,
    window.location.href,
  ).toString();

  try {
    const response = await fetch(`${notificationUrl}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    const text = getContentNotificationText(payload);
    if (!text) return;

    const signature = getContentNotificationSignature(payload);
    const storageKey = `${NOTIFICATION_STORAGE_PREFIX}${targetLang}`;

    try {
      const seenSignature = localStorage.getItem(storageKey);
      if (seenSignature === signature) return;
    } catch {
      return;
    }

    const existing = document.getElementById("contentNotificationBubble");
    if (existing) existing.remove();

    const bubble = document.createElement("div");
    bubble.id = "contentNotificationBubble";
    bubble.className = "content-notification-bubble";
    bubble.setAttribute("role", "status");
    bubble.setAttribute("aria-live", "polite");

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "content-notification-close";
    closeButton.setAttribute("aria-label", "Close notification");
    closeButton.textContent = "×";

    const inner = document.createElement("div");
    inner.className = "content-notification-inner";

    const image = document.createElement("img");
    image.src = "/assets/Imagenes/yashironoticia.webp";
    image.alt = "Yashiro";
    image.className = "content-notification-image";

    const copy = document.createElement("div");
    copy.className = "content-notification-copy";

    const message = document.createElement("span");
    message.className = "content-notification-text";
    message.textContent = text;

    copy.appendChild(message);
    inner.append(image, copy);
    bubble.append(closeButton, inner);

    const closeNotification = () => {
      try {
        localStorage.setItem(storageKey, signature);
      } catch {
        // Notification dismissal should still continue when storage is unavailable.
      }
      bubble.classList.remove("is-visible");
      setTimeout(() => bubble.remove(), 220);
    };

    closeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      closeNotification();
    });
    bubble.addEventListener("click", (event) => {
      if (event.target.closest(".content-notification-close")) return;
      closeNotification();
    });

    document.body.appendChild(bubble);
    requestAnimationFrame(() => bubble.classList.add("is-visible"));
  } catch {
    return;
  }
}

document.getElementById("bulletinFilters")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-bulletin-filter]");
  if (!button) return;
  bulletinFilter = button.dataset.bulletinFilter || "all";
  if (bulletinFilter === "content") markContentBulletinsSeen(bulletinUpdatesCache);
  renderBulletin();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".bulletin-sources")) {
    document.querySelectorAll(".bulletin-source-menu:not([hidden])").forEach((menu) => {
      menu.hidden = true;
      menu.previousElementSibling?.setAttribute("aria-expanded", "false");
    });
  }
});

function renderApp(data) {
  if (!data) throw new Error("No data provided to renderApp");

  applyHomepageCopy();

  const heroTitle = document.getElementById("heroTitle");
  if (heroTitle) heroTitle.textContent = data.header.title;

  const heroSub = document.getElementById("heroSub");
  if (heroSub && data.hero) heroSub.textContent = data.hero.subtitle;

  const bikeImage = document.querySelector(".floating-bike");
  if (bikeImage) {
    bikeImage.style.cursor = "pointer";
    bikeImage.addEventListener("click", () => {
      window.location.href = "/Juego";
    });
  }

  const infoTitle = document.getElementById("infoTitle");
  if (infoTitle && data.info) infoTitle.textContent = data.info.title;
  const infoEyebrow = document.getElementById("infoEyebrow");
  if (infoEyebrow) infoEyebrow.textContent = currentLang === "en" ? "THE SERIES" : "LA SERIE";

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
  if (updateBadge) updateBadge.innerHTML = `<i data-lucide="clock"></i> ${data.release.lastUpdate}`;

  const updateDetails = document.getElementById("updateDetails");
  if (updateDetails) {
    updateDetails.innerHTML = `
          <strong>${data.release.volNum}</strong> <span class="release-sep">·</span> ${data.release.date}
          <span class="release-sep">·</span> <i data-lucide="check-circle"></i> ${data.release.status}
        `;
  }

  const nextBadge = document.getElementById("nextBadge");
  if (nextBadge)
    nextBadge.innerHTML = `<i data-lucide="flame" class="flame-icon"></i> ${data.release.nextLabel}`;

  const nextDetails = document.getElementById("nextDetails");
  if (nextDetails) {
    nextDetails.innerHTML = `
          <span class="next-pill"><i data-lucide="sparkles"></i> ${data.release.nextBadge}</span>
          <strong>${data.release.nextVol}</strong>
          <span class="release-sep">·</span> <span class="next-date">${data.release.nextDate}</span>
          <span class="release-sep">·</span> <i data-lucide="hourglass"></i> ${data.release.nextStatus}
        `;
  }

  renderBulletin();
  refreshLucideIcons();

  applyHomepageFooterI18n(data);

  document.documentElement.lang = currentLang;
  applyFeedbackI18n();
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

function getNewsFolderUrl(folder, lang) {
  return new URL(`src/data/${folder}/${lang}.json`, window.location.href).toString();
}

async function fetchNewsFolder(folder, lang) {
  const response = await fetch(`${getNewsFolderUrl(folder, lang)}?v=1.0.0`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${folder}: HTTP ${response.status}`);
  return response.json();
}

function normalizeNewsFolder(folder, payload, lang) {
  if (!payload) return [];

  // Accept all of the practical formats we may use for bulletin files:
  //   { title, text, ... }
  //   { en: { title, text, ... }, ... }
  //   { updates: [ ... ] }
  //   [ ... ]
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.updates)
      ? payload.updates
      : [payload];

  return source.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];

    const localized =
      entry[lang] && typeof entry[lang] === "object"
        ? entry[lang]
        : entry.en && typeof entry.en === "object"
          ? entry.en
          : entry.es && typeof entry.es === "object"
            ? entry.es
            : entry.tg && typeof entry.tg === "object"
              ? entry.tg
              : entry;

    // Flatten the localized content into the canonical shape used by the
    // bulletin. This is important: the modal should never have to know
    // whether an update originally came from { en: {...} } or from a flat JSON.
    const title = String(localized.title || entry.title || "").trim();
    if (!title) return [];

    const bodySource = localized.body ?? localized.messages ?? entry.body ?? entry.messages ?? [];
    const body = Array.isArray(bodySource)
      ? bodySource.map(sanitizeNewsMessage).filter(Boolean)
      : bodySource
        ? [sanitizeNewsMessage(bodySource)].filter(Boolean)
        : [];

    const text = sanitizeNewsMessage(
      localized.text || localized.summary || entry.text || entry.summary || body[0] || "",
    );

    const date = entry.date || entry.publishDate || localized.date || localized.publishDate || "";
    const type =
      entry.type || localized.type || (folder === "news_series" ? "SERIES NEWS" : "DEV UPDATE");

    // The folder an entry came from is the single source of truth for whether
    // it's Series News — not a string match against a free-text `type` field.
    // Series News never gets a source link, even if legacy data still has a
    // sourceUrl/source field lying around; we strip it right here so no
    // downstream renderer has to remember the rule.
    const isSeriesNews = folder === "news_series";
    const isContentNews = folder === "news_content";
    const sourceUrl = entry.sourceUrl || localized.sourceUrl || "";
    const rawSources =
      localized.sources ?? entry.sources ?? localized.sourceUrls ?? entry.sourceUrls ?? [];
    const sourceList = Array.isArray(rawSources)
      ? rawSources
          .map((source) => {
            if (typeof source === "string") return { url: source, label: "" };
            if (!source || typeof source !== "object" || !source.url) return null;
            return {
              url: String(source.url).trim(),
              label: String(source.label || source.name || "").trim(),
            };
          })
          .filter(Boolean)
      : [];
    if (sourceUrl && !sourceList.some((source) => source.url === sourceUrl)) {
      sourceList.unshift({ url: sourceUrl, label: "" });
    }

    return [
      {
        id: entry.id || `${folder}-${date}-${index}-${title}`,
        date,
        type,
        title,
        text,
        body,
        sourceUrl: isSeriesNews ? sourceList[0]?.url || "" : "",
        sources: isSeriesNews ? sourceList : [],
        author:
          !isSeriesNews && !isContentNews
            ? String(localized.author || entry.author || "").trim()
            : "",
        isSeriesNews,
        isContentNews,
        featured: Boolean(entry.featured || localized.featured),
      },
    ];
  });
}

async function loadNewsContent() {
  // Prefer the dedicated bulletin folders. This prevents the same update from
  // being read once from noticia.json and once from a news folder.
  try {
    const [seriesResult, devResult, contentResult] = await Promise.allSettled([
      fetchNewsFolder("news_series", currentLang),
      fetchNewsFolder("news_dev", currentLang),
      fetchNewsFolder("news_content", currentLang),
    ]);

    const folderUpdates = [];
    if (seriesResult.status === "fulfilled") {
      folderUpdates.push(...normalizeNewsFolder("news_series", seriesResult.value, currentLang));
    }
    if (devResult.status === "fulfilled") {
      folderUpdates.push(...normalizeNewsFolder("news_dev", devResult.value, currentLang));
    }
    if (contentResult.status === "fulfilled") {
      folderUpdates.push(...normalizeNewsFolder("news_content", contentResult.value, currentLang));
    }

    if (folderUpdates.length) {
      rawNewsData = {
        folderUpdates,
        folderUpdatesLoaded: true,
      };
      applyNewsLanguage();
      return;
    }
  } catch (error) {
    console.warn("Dedicated news folders could not be loaded; using legacy noticia.json.", error);
  }

  // Backward-compatible fallback for installations that have not created the
  // dedicated folders yet.
  try {
    const response = await fetch(getNewsDataUrl());
    if (!response.ok) throw new Error(`noticia.json: HTTP ${response.status}`);
    rawNewsData = await response.json();
    rawNewsData.folderUpdatesLoaded = false;
    applyNewsLanguage();
  } catch (error) {
    console.warn("Unable to load bulletin data.", error);
    rawNewsData = null;
    renderBulletin();
  }
}

function applyNewsLanguage() {
  if (!rawNewsData) return;
  const langData = rawNewsData[currentLang] || rawNewsData.es;
  NEWS_CONTENT.title = langData?.title || "";
  NEWS_CONTENT.messages = langData?.messages || [];
  NEWS_CONTENT.publishDate = rawNewsData.publishDate || null;
  renderBulletin();
}

function setInfoExpanded(expanded) {
  const content = document.getElementById("infoContent");
  const chevron = document.getElementById("infoChevron");
  const toggle = document.getElementById("infoToggle");
  const panel = document.getElementById("infoPanel");
  if (!content || !toggle) return;

  // Keep one authoritative state. Do not toggle the state twice through
  // hidden/display changes; that was causing the accordion to snap shut.
  const isExpanded = Boolean(expanded);
  toggle.setAttribute("aria-expanded", String(isExpanded));
  content.classList.toggle("open", isExpanded);
  panel?.classList.toggle("expanded", isExpanded);
  chevron?.classList.toggle("rotated", isExpanded);

  if (isExpanded) {
    content.hidden = false;
    content.classList.add("open");
    content.style.maxHeight = `${content.scrollHeight}px`;
  } else {
    content.classList.remove("open");
    content.style.maxHeight = "0px";
    content.hidden = true;
  }
}

window.addEventListener("resize", () => {
  const toggle = document.getElementById("infoToggle");
  const content = document.getElementById("infoContent");

  if (toggle?.getAttribute("aria-expanded") === "true" && content) {
    content.style.maxHeight = `${content.scrollHeight}px`;
  }
});

function bindInfoToggle() {
  if (document.documentElement.dataset.infoToggleBound === "true") return;

  // Delegate the click so the control keeps working even if homepage
  // content is rendered or replaced after this script is evaluated.
  document.addEventListener("click", (event) => {
    const toggle = event.target.closest?.("#infoToggle");
    if (!toggle) return;

    event.preventDefault();
    const currentlyExpanded = toggle.getAttribute("aria-expanded") === "true";
    setInfoExpanded(!currentlyExpanded);
  });

  document.documentElement.dataset.infoToggleBound = "true";
}

bindInfoToggle();

// eslint-disable-next-line no-unused-vars -- may be invoked from an inline onclick handler in HTML
function toggleInfo() {
  const toggle = document.getElementById("infoToggle");
  setInfoExpanded(toggle?.getAttribute("aria-expanded") !== "true");
}

// Lightbox event listeners
document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("lightboxClose")?.addEventListener("click", closeLightbox);
  document.getElementById("lightboxPrev")?.addEventListener("click", () => navigateLightbox(-1));
  document.getElementById("lightboxNext")?.addEventListener("click", () => navigateLightbox(1));

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

document.addEventListener("DOMContentLoaded", async function () {
  try {
    emailjs.init(FEEDBACK_CONFIG.PUBLIC_KEY);
    console.log("[EmailJS] Initialized");
  } catch (e) {
    console.warn("[EmailJS] Init error:", e);
  }

  updateLangLabel();
  setInfoExpanded(false);

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
  showContentNotification();

  const menuVer = Math.floor(Date.now() / 86400000);
  fetch("/src/components/menu.html?v=" + menuVer)
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    })
    .then((html) => {
      const container =
        document.getElementById("sidebar-container") || document.getElementById("menu-container");
      if (!container) return;
      html = html.replace(/data-route="\.\.\/\.\.\/index\.html"/g, 'data-route="/index.html"');
      container.innerHTML = html;
      const scripts = container.querySelectorAll("script");
      scripts.forEach((old) => {
        const neu = document.createElement("script");
        Array.from(old.attributes).forEach((a) => neu.setAttribute(a.name, a.value));
        neu.appendChild(document.createTextNode(old.innerHTML));
        old.parentNode.replaceChild(neu, old);
      });
      setTimeout(() => document.dispatchEvent(new CustomEvent("menuLoaded")), 100);
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

// Time Theme Detection Script
(function () {
  const APPEARANCE_STORAGE_KEY = "adashima_time_based_appearance";
  const MANUAL_THEME_STORAGE_KEY = "adashima_manual_appearance";
  const VALID_THEMES = ["morning", "afternoon", "night"];

  function getTimePeriod() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 19) return "afternoon";
    return "night";
  }

  function normalizeTheme(theme) {
    return VALID_THEMES.includes(theme) ? theme : getTimePeriod();
  }

  function getTimeBasedPreference() {
    try {
      const value = localStorage.getItem(APPEARANCE_STORAGE_KEY);
      if (value === null) return true;
      return value === "true";
    } catch {
      return true;
    }
  }

  function setTimeBasedPreference(value) {
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, String(value));
    } catch {
      // Ignore storage issues.
    }
  }

  function getStoredManualTheme() {
    try {
      const value = localStorage.getItem(MANUAL_THEME_STORAGE_KEY);
      return normalizeTheme(value);
    } catch {
      return getTimePeriod();
    }
  }

  function setStoredManualTheme(theme) {
    try {
      localStorage.setItem(MANUAL_THEME_STORAGE_KEY, normalizeTheme(theme));
    } catch {
      // Ignore storage issues.
    }
  }

  function applyTheme(theme) {
    const period = normalizeTheme(theme);
    const body = document.body;
    body.classList.remove("time-morning", "time-afternoon", "time-night");
    body.classList.add("time-" + period);
    body.dataset.theme = period;
    window.__currentTheme = period;
  }

  function getActiveTheme() {
    if (getTimeBasedPreference()) {
      return getTimePeriod();
    }
    return getStoredManualTheme();
  }

  function setAppearanceTheme(theme, useAutoMode = false) {
    const nextTheme = normalizeTheme(theme);

    if (useAutoMode) {
      setTimeBasedPreference(true);
      applyTheme(getTimePeriod());
      return;
    }

    setTimeBasedPreference(false);
    setStoredManualTheme(nextTheme);
    applyTheme(nextTheme);
  }

  function updateTimeTheme() {
    const period = getActiveTheme();
    applyTheme(period);

    document.dispatchEvent(
      new CustomEvent("appearanceThemeChanged", {
        detail: {
          theme: period,
          auto: getTimeBasedPreference(),
        },
      }),
    );
  }

  window.updateTimeTheme = updateTimeTheme;
  window.setAppearanceTheme = setAppearanceTheme;
  window.getActiveTheme = getActiveTheme;
  window.getTimePeriod = getTimePeriod;

  updateTimeTheme();

  setInterval(updateTimeTheme, 60000);

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      updateTimeTheme();
    }
  });

  window.addEventListener("storage", function (event) {
    if (event.key === APPEARANCE_STORAGE_KEY || event.key === MANUAL_THEME_STORAGE_KEY) {
      updateTimeTheme();
    }
  });
});

(function initDecorPause() {
  function syncDecorPauseState() {
    document.body.classList.toggle("decor-paused", document.hidden);
  }

  document.addEventListener("visibilitychange", syncDecorPauseState);
  syncDecorPauseState();
})();
