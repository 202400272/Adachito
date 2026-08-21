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

// Fallback translations
const FALLBACK_TRANSLATIONS = {
  es: {
    pageTitle: "Adashima - Otros",
    headerTitle: "Otros",
    footer:
      "Fan site no oficial de Adachi to Shimamura.<br>Creado por fans, sin fines de lucro.<br>Adachi to Shimamura y todos sus derechos pertenecen a Hitoma Iruma.",
    floatingTitle: "¡Clickea para ir al mini-juego!",
    downloadOverlayText: "Descargando...",
    documents: [],
  },
  en: {
    pageTitle: "Adashima - Others",
    headerTitle: "Others",
    footer:
      "Unofficial Adachi to Shimamura fan site.<br>Created by fans, non-profit.<br>Adachi to Shimamura and all rights belong to Hitoma Iruma.",
    floatingTitle: "Click to go to the mini-game!",
    downloadOverlayText: "Downloading...",
    documents: [],
  },
};

async function loadTranslations(lang) {
  try {
    const url =
      window.LanguageSwitch && typeof window.LanguageSwitch.getDataUrl === "function"
        ? window.LanguageSwitch.getDataUrl("otros", lang) + "?v=" + Date.now()
        : `../data/otros/${lang}.json?v=${Date.now()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to load translations");
    const data = await response.json();
    translations = data;
    return data;
  } catch (e) {
    console.warn("Failed to load translations, using fallback:", e);
    translations = FALLBACK_TRANSLATIONS[lang] || FALLBACK_TRANSLATIONS.es;
    return translations;
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

function renderApp() {
  // Update title
  document.title = getText("pageTitle");
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = getText("headerTitle");

  // Footer is now the shared component (src/components/js/footer.js),
  // which handles its own translation.

  // Update floating link
  const floatingLink = document.getElementById("floatingLink");
  if (floatingLink) floatingLink.title = getText("floatingTitle");

  // Update download overlay text
  const downloadText = document.getElementById("downloadText");
  if (downloadText) downloadText.textContent = getText("downloadOverlayText");

  // Build document cards
  buildDocumentCards();
}

function buildDocumentCards() {
  const wrapper = document.getElementById("documentsWrapper");
  if (!wrapper) return;

  const docs = translations?.documents || [];
  if (docs.length === 0) {
    wrapper.innerHTML =
      '<p style="text-align:center;padding:40px;color:rgba(92,58,107,0.5);">No hay documentos disponibles.</p>';
    return;
  }

  wrapper.innerHTML = docs
    .map((doc) => {
      const normalizedUrl = doc.url.replace(
        /^(?:\.\/)?(?:otros\/)?Author_Archive(?:\.html)?$/i,
        "/otros/Author_Archive",
      );
      const isInternal =
        !!doc.isInternal || /^\/(?:otros\/)?Author_Archive(?:\.html)?$/i.test(normalizedUrl);
      const linkAttrs = isInternal ? "" : 'target="_blank" rel="noopener noreferrer"';
      return `
            <a href="${normalizedUrl}" ${linkAttrs} class="document-card" data-doc-id="${doc.id}">
                <div class="document-icon"><i class="fas ${doc.icon}"></i></div>
                <div class="document-info">
                    <h3>${doc.title}</h3>
                    <p>${doc.description}</p>
                </div>
                <div class="document-arrow"><i class="fas fa-chevron-right"></i></div>
            </a>
        `;
    })
    .join("");

  // Re-attach download handlers for media.adashimaverse.com links
  attachDownloadHandlers();
}

function attachDownloadHandlers() {
  const downloadOverlay = document.getElementById("downloadOverlay");

  document.querySelectorAll("a.document-card").forEach((el) => {
    const href = el.href || el.getAttribute("href");
    if (!href) return;
    // Only intercept links to media.adashimaverse.com
    if (href.indexOf("media.adashimaverse.com") === -1) return;

    el.addEventListener("click", async (e) => {
      e.preventDefault();
      if (downloadOverlay) {
        downloadOverlay.classList.add("show");
        downloadOverlay.setAttribute("aria-hidden", "false");
      }
      try {
        const resp = await fetch(href, { mode: "cors", cache: "no-store" });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const parts = href.split("/");
        a.download = decodeURIComponent(parts[parts.length - 1].split("?")[0]);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        const win = window.open(href, "_blank");
        if (!win) location.href = href;
      } finally {
        if (downloadOverlay) {
          downloadOverlay.classList.remove("show");
          downloadOverlay.setAttribute("aria-hidden", "true");
        }
      }
    });
  });
}

function loadMenu() {
  const menuVer = Math.floor(Date.now() / 86400000);
  fetch("/src/components/menu.html?v=" + menuVer)
    .then((response) => {
      if (!response.ok) throw new Error("Error HTTP " + response.status + " al cargar el menú");
      return response.text();
    })
    .then((data) => {
      data = data
        .replace(/src="\.\/(assets\/)/g, 'src="../../$1')
        .replace(/data-route="\.\.\/\.\.\/index\.html"/g, 'data-route="../../../index.html"');
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

      if (window.translateMenu) {
        window.translateMenu(currentLang);
      }

      document.dispatchEvent(new CustomEvent("menuLoaded"));
    })
    .catch((error) => {
      console.error("Error cargando menu.html:", error.message);
    });
}

function initParticles() {
  const particlesContainer = document.getElementById("particles");
  if (particlesContainer) {
    particlesContainer.innerHTML = "";
    for (let i = 0; i < 40; i++) {
      let star = document.createElement("div");
      star.className = "star";
      star.style.left = Math.random() * 100 + "vw";
      star.style.animationDuration = Math.random() * 5 + 5 + "s";
      star.style.animationDelay = Math.random() * 5 + "s";
      particlesContainer.appendChild(star);
    }
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  await loadTranslations(currentLang);
  renderApp();
  initParticles();
  loadMenu();
});

document.addEventListener("menuLoaded", function () {
  if (window.currentLanguage !== undefined) {
    currentLang = window.currentLanguage;
  }
  loadTranslations(currentLang).then(() => renderApp());
});

document.addEventListener("languageChanged", async function (event) {
  const nextLang =
    event?.detail?.lang ||
    window.LanguageSwitch?.getCurrentLanguage?.() ||
    localStorage.getItem("lang") ||
    currentLang;

  const normalizedLang = nextLang === "en" ? "en" : nextLang === "tg" ? "tg" : "es";
  if (normalizedLang === currentLang) return;

  currentLang = normalizedLang;
  window.currentLanguage = normalizedLang;
  window.currentLang = normalizedLang;

  await loadTranslations(currentLang);
  renderApp();
  if (window.translateMenu) window.translateMenu(currentLang);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      })
      .catch(() => {});
  });
}
