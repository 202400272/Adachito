// language-switch.js
(function (window, document) {
  const STORAGE_KEYS = [
    "lang",
    "preferredLanguage",
    "language",
    "adashima_manga_lang",
  ];

  const DEFAULT_LANGUAGE = "es";

  const SUPPORTED_LANGUAGES = [
    { code: "es", label: "Español" },
    { code: "en", label: "English" },
    { code: "tg", label: "Tagalog" },
  ];

  const LANGUAGE_CHANGE_EVENT = "languageChanged";

  let currentLanguage = null;
  let initialized = false;

  function normalizeLanguage(value) {
    if (value === "en") return "en";
    if (value === "tg") return "tg";
    return "es";
  }

  function safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Ignore storage errors.
    }
  }

  function loadStoredLanguage() {
    for (const key of STORAGE_KEYS) {
      try {
        const stored = localStorage.getItem(key);

        if (stored) {
          return normalizeLanguage(stored);
        }
      } catch (error) {
        continue;
      }
    }

    return DEFAULT_LANGUAGE;
  }

  function saveLanguage(lang) {
    for (const key of STORAGE_KEYS) {
      safeSetItem(key, lang);
    }
  }

  function getBasePath() {
    const path = window.location.pathname;

    // If we're in a subdirectory like /src/pages/
    if (path.includes("/src/pages/")) {
      return "../../";
    }

    // If we're in /src/ but not /src/pages/
    if (path.includes("/src/")) {
      return "../";
    }

    // Root level and clean routed pages should resolve from the site root
    return "/";
  }

  function getDataUrl(folder, lang) {
    const base = getBasePath();

    const url = new URL(
      `${base}src/data/${folder}/${lang}.json`,
      window.location.href,
    );

    return url.href + "?v=" + Date.now();
  }

  function getDataFolderUrl(folder) {
    const base = getBasePath();

    const url = new URL(`${base}src/data/${folder}/`, window.location.href);

    const href = url.href;

    return href.endsWith("/") ? href : href + "/";
  }

  function getMenuDataUrl(lang) {
    const base = getBasePath();

    const url = new URL(
      `${base}src/data/menu/${lang}.json`,
      window.location.href,
    );

    return url.href + "?v=" + Date.now();
  }

  function updateDocumentLanguage(lang) {
    if (document.documentElement) {
      document.documentElement.lang = lang;
    }
  }

  function getLanguageLabel(lang) {
    const language = SUPPORTED_LANGUAGES.find((item) => item.code === lang);

    return language ? language.label : SUPPORTED_LANGUAGES[0].label;
  }

  function updateLanguageUI(root = document) {
    const selectedLang = currentLanguage;

    root
      .querySelectorAll(".lang-option, .menu-lang-option")
      .forEach((option) => {
        const isActive = option.dataset.lang === selectedLang;

        option.classList.toggle("active", isActive);

        option.setAttribute("aria-pressed", isActive ? "true" : "false");

        if (isActive && option.closest(".language-selector")) {
          const parent = option.closest(".language-selector");
          if (parent) {
            parent.dataset.currentLang = selectedLang;
          }
        }
      });

    const dropdowns = root.querySelectorAll(".lang-dropdown");

    dropdowns.forEach((dropdown) => {
      const toggle = dropdown.querySelector(".lang-dropdown-toggle");

      if (!toggle) return;

      const labelEl =
        toggle.querySelector("#langSelectedLabel") ||
        toggle.querySelector("span");

      if (!labelEl) return;

      const selectedOption = dropdown.querySelector(
        `.lang-option[data-lang="${selectedLang}"], .menu-lang-option[data-lang="${selectedLang}"]`,
      );

      if (selectedOption) {
        labelEl.textContent =
          selectedOption.dataset.label || selectedOption.textContent;
      } else {
        labelEl.textContent = getLanguageLabel(selectedLang);
      }
    });
  }

  function updateI18nElements(lang) {
    const elements = document.querySelectorAll(
      "[data-i18n-es], [data-i18n-en], [data-i18n-tg]",
    );

    elements.forEach((element) => {
      const translation =
        element.getAttribute(`data-i18n-${lang}`) ||
        element.getAttribute("data-i18n-es") ||
        element.getAttribute("data-i18n-en") ||
        element.getAttribute("data-i18n-tg");

      if (translation == null) return;

      const attrKeys = ["placeholder", "title", "alt", "value", "href", "src"];

      let updated = false;

      attrKeys.forEach((attrKey) => {
        const override = element.getAttribute(`data-i18n-${attrKey}-${lang}`);

        if (override !== null) {
          element.setAttribute(attrKey, override);
          updated = true;
        }
      });

      if (updated) return;

      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        if (element.hasAttribute("placeholder")) {
          element.placeholder = translation;
        } else {
          element.value = translation;
        }
      } else {
        element.textContent = translation;
      }
    });
  }

  function closeAllDropdowns() {
    document.querySelectorAll(".lang-dropdown.open").forEach((dropdown) => {
      dropdown.classList.remove("open");

      const toggle = dropdown.querySelector(".lang-dropdown-toggle");

      if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  function attachLanguageControls(root = document) {
    const dropdowns = root.querySelectorAll(".lang-dropdown");

    dropdowns.forEach((dropdown) => {
      if (dropdown.dataset.languageSwitchAttached === "true") {
        return;
      }

      const toggle = dropdown.querySelector(".lang-dropdown-toggle");

      const options = dropdown.querySelectorAll(
        ".lang-option, .menu-lang-option",
      );

      if (!toggle || options.length === 0) {
        return;
      }

      dropdown.dataset.languageSwitchAttached = "true";

      toggle.addEventListener("click", (event) => {
        event.stopPropagation();

        const isOpen = dropdown.classList.toggle("open");

        toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });
    });

    root
      .querySelectorAll(".lang-option, .menu-lang-option")
      .forEach((option) => {
        if (option.dataset.languageSwitchAttached === "true") {
          return;
        }

        option.dataset.languageSwitchAttached = "true";

        option.addEventListener("click", () => {
          const selectedLang = normalizeLanguage(option.dataset.lang);

          const parentDropdown = option.closest(".lang-dropdown");

          if (parentDropdown) {
            parentDropdown.classList.remove("open");

            const toggle = parentDropdown.querySelector(
              ".lang-dropdown-toggle",
            );

            if (toggle) {
              toggle.setAttribute("aria-expanded", "false");
            }
          }

          setLanguage(selectedLang);
        });
      });
  }

  function dispatchLanguageChanged(lang) {
    document.dispatchEvent(
      new CustomEvent(LANGUAGE_CHANGE_EVENT, {
        detail: {
          lang,
        },
      }),
    );
  }

  async function setLanguage(lang) {
    const normalized = normalizeLanguage(lang);

    if (normalized === currentLanguage) {
      return;
    }

    currentLanguage = normalized;

    saveLanguage(normalized);

    updateDocumentLanguage(normalized);

    updateLanguageUI();

    updateI18nElements(normalized);

    if (window.translateMenu && typeof window.translateMenu === "function") {
      try {
        window.translateMenu(normalized);
      } catch (error) {
        console.warn("translateMenu failed:", error);
      }
    }

    dispatchLanguageChanged(normalized);

    await new Promise(resolve => setTimeout(resolve, 50));
    
    window.location.reload();
  }

  function handleStorageEvent(event) {
    if (!event.key || !STORAGE_KEYS.includes(event.key)) {
      return;
    }

    const newLang = normalizeLanguage(event.newValue);

    if (newLang === currentLanguage) {
      return;
    }

    currentLanguage = newLang;

    updateDocumentLanguage(newLang);

    updateLanguageUI();

    updateI18nElements(newLang);

    dispatchLanguageChanged(newLang);
  }

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    currentLanguage = loadStoredLanguage();
    
    if (typeof window.currentLang !== "undefined") {
      window.currentLang = currentLanguage;
    }

    updateDocumentLanguage(currentLanguage);

    attachLanguageControls();

    updateLanguageUI();

    updateI18nElements(currentLanguage);

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".lang-dropdown")) {
        closeAllDropdowns();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeAllDropdowns();
      }
    });

    window.addEventListener("storage", handleStorageEvent);

    document.addEventListener("menuLoaded", () => {
      currentLanguage = loadStoredLanguage();
      
      if (typeof window.currentLang !== "undefined") {
        window.currentLang = currentLanguage;
      }
      
      attachLanguageControls();

      updateLanguageUI();

      if (window.translateMenu && typeof window.translateMenu === "function") {
        try {
          window.translateMenu(currentLanguage);
        } catch (error) {
          console.warn("translateMenu failed:", error);
        }
      }
    });
  }

  window.LanguageSwitch = {
    init,

    getCurrentLanguage: () => currentLanguage,

    setLanguage,

    supportedLanguages: SUPPORTED_LANGUAGES,

    getMenuDataUrl,

    getDataUrl,

    getDataFolderUrl,

    normalizeLanguage,

    loadStoredLanguage,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
