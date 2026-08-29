// src/components/js/footer.js
//
// Shared site footer component. Fetches src/components/footer.html into
// any <div id="footer-container"> on the page, applies the visitor's
// language to the one translatable string it contains (the legal
// disclaimer), and fires a "footerLoaded" event once it's in the DOM so
// other scripts (feedback.js, menu translation, etc.) can safely wire up
// against it regardless of load order.
//
// This replaces the footer markup that used to be copy/pasted into every
// page, plus the ~8 different (and mostly broken) per-page footer
// translation snippets that used to live in each page's own JS file.

const FOOTER_LANGUAGE_STORAGE_KEYS = [
  "lang",
  "preferredLanguage",
  "language",
  "adashima_manga_lang",
];
const FOOTER_DEFAULT_LANGUAGE = "es";
const FOOTER_SUPPORTED_LANGUAGES = ["es", "en", "tg"];

function detectFooterLanguage() {
  // Prefer the language-switch module's own state if it has already
  // initialized on this page.
  if (window.LanguageSwitch && typeof window.LanguageSwitch.getCurrentLanguage === "function") {
    const current = window.LanguageSwitch.getCurrentLanguage();
    if (FOOTER_SUPPORTED_LANGUAGES.includes(current)) return current;
  }

  for (const key of FOOTER_LANGUAGE_STORAGE_KEYS) {
    try {
      const stored = localStorage.getItem(key);
      if (FOOTER_SUPPORTED_LANGUAGES.includes(stored)) return stored;
    } catch {
      // Ignore storage access errors (e.g. private browsing) and keep
      // checking the remaining keys.
      continue;
    }
  }

  return FOOTER_DEFAULT_LANGUAGE;
}

function applyFooterTranslation(footerEl, lang) {
  footerEl.querySelectorAll("[data-es][data-en]").forEach((element) => {
    const translated = element.getAttribute(`data-${lang}`);

    if (translated) element.innerHTML = translated;
  });

  const disclaimer = footerEl.querySelector("#footerDisclaimerText");
  if (disclaimer) {
    const translated = disclaimer.getAttribute(`data-${lang}`);

    if (translated) disclaimer.innerHTML = translated;
  }
}

document.addEventListener("languageChanged", (event) => {
  const footer = document.querySelector("#footer");
  const lang = event.detail?.lang;

  if (footer && FOOTER_SUPPORTED_LANGUAGES.includes(lang)) {
    applyFooterTranslation(footer, lang);
  }
});

function loadFooter() {
  const container = document.getElementById("footer-container");
  if (!container) return;

  // If a page has already injected a real footer into the container
  // (shouldn't normally happen, but avoids double-loading), skip.
  if (container.querySelector("#footer")) return;

  fetch("/src/components/footer.html", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error("HTTP " + response.status + " loading footer");
      }
      return response.text();
    })
    .then((html) => {
      container.innerHTML = html;

      if (container.hasAttribute("data-hide-feedback")) {
        container.querySelector(".footer-feedback-column")?.remove();
      }

      const footerEl = container.querySelector("#footer");
      if (footerEl) {
        applyFooterTranslation(footerEl, detectFooterLanguage());
      }

      document.dispatchEvent(new CustomEvent("footerLoaded"));
    })
    .catch((error) => {
      console.warn("[Footer] Failed to load footer.html:", error.message);
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadFooter);
} else {
  loadFooter();
}
