(() => {
  let translations = {};
  let currentLang = "es";
  const scriptBase = document.currentScript
    ? new URL(".", document.currentScript.src)
    : new URL("/src/js/", window.location.href);

  const STORAGE_KEYS = ["lang", "preferredLanguage", "language", "adashima_manga_lang"];

  const normalizeLanguage = (value) => {
    if (value === "en") return "en";
    if (value === "tg") return "tg";
    return "es";
  };

  const getLanguage = () => {
    for (const key of STORAGE_KEYS) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) return normalizeLanguage(stored);
      } catch (error) {
        // Ignore storage exceptions and continue.
      }
    }
    return "es";
  };

  const getValue = (path) => path.split(".").reduce((obj, key) => obj?.[key], translations);

  async function fetchTranslations(lang) {
    const url = new URL(`../data/help/${lang}.json`, scriptBase);
    url.searchParams.set("v", Math.floor(Date.now() / 86400000));
    const response = await fetch(url.href, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Help translations HTTP ${response.status}`);
    return response.json();
  }

  async function loadTranslations(lang = getLanguage()) {
    const requestedLang = normalizeLanguage(lang);

    try {
      translations = await fetchTranslations(requestedLang);
      currentLang = requestedLang;
    } catch (error) {
      if (requestedLang !== "en") {
        translations = await fetchTranslations("en");
        currentLang = "en";
      } else {
        throw error;
      }
    }
  }

  const escapeAttr = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function renderHelp() {
    const categoryRoot = document.getElementById("helpCategories");
    const sectionRoot = document.getElementById("helpSections");
    if (!categoryRoot || !sectionRoot) return;

    categoryRoot.innerHTML = (translations.categories || []).map((category) => `
      <a class="help-category" href="#${escapeAttr(category.id)}">
        <span class="help-category-icon"><i class="fa-solid ${escapeAttr(category.icon)}"></i></span>
        <span><strong>${category.title}</strong><small>${category.description}</small></span>
      </a>
    `).join("");

    sectionRoot.innerHTML = (translations.sections || []).map((section) => `
      <section class="help-section" id="${escapeAttr(section.id)}">
        <div class="help-section-heading">
          <span><i class="fa-solid ${escapeAttr(section.icon)}"></i></span>
          <div><p class="help-eyebrow">${section.eyebrow}</p><h2>${section.title}</h2></div>
        </div>
        <div class="help-card-list">
          ${(section.items || []).map((item, index) => `
            <article class="help-card" data-help-index="${index}">
              <h3>${item.question}</h3>
              <p>${item.answer}</p>
            </article>
          `).join("")}
        </div>
      </section>
    `).join("");

    document.title = translations.pageTitle || document.title;
    document.documentElement.lang = currentLang;
  }

  function applyStaticLanguage() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const value = getValue(el.dataset.i18n);
      if (value !== undefined) el.innerHTML = value;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const value = getValue(el.dataset.i18nPlaceholder);
      if (value !== undefined) el.placeholder = value;
    });
  }

  function initMenu() {
    const menuVer = Math.floor(Date.now() / 86400000);
    fetch(`/src/components/menu.html?v=${menuVer}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Menu HTTP ${r.status}`);
        return r.text();
      })
      .then((data) => {
        const doc = new DOMParser().parseFromString(data, "text/html");
        const frag = document.createDocumentFragment();
        [...doc.head.childNodes, ...doc.body.childNodes].forEach((node) => {
          if (node.nodeName.toLowerCase() === "script") {
            const script = document.createElement("script");
            if (node.src) script.src = node.src;
            else script.textContent = node.textContent;
            frag.appendChild(script);
          } else {
            frag.appendChild(node.cloneNode(true));
          }
        });
        const container = document.getElementById("sidebar-container");
        if (!container) return;
        container.replaceChildren(frag);
        requestAnimationFrame(() => {
          if (window.translateMenu) window.translateMenu(localStorage.getItem("lang") || currentLang);
          document.dispatchEvent(new CustomEvent("menuLoaded"));
        });
      })
      .catch((error) => console.warn("menu.html unavailable:", error.message));
  }

  function setupSearch() {
    const input = document.getElementById("helpSearch");
    const noResults = document.querySelector(".help-no-results");
    if (!input || input.dataset.ready === "true") return;
    input.dataset.ready = "true";

    const filter = () => {
      const query = input.value.trim().toLowerCase();
      let matches = 0;
      document.querySelectorAll(".help-section").forEach((section) => {
        let sectionMatches = 0;
        const sectionText = section.querySelector(".help-section-heading")?.textContent.toLowerCase() || "";
        section.querySelectorAll(".help-card").forEach((card) => {
          const show = !query || card.textContent.toLowerCase().includes(query) || sectionText.includes(query);
          card.classList.toggle("is-hidden", !show);
          if (show) sectionMatches++;
        });
        section.hidden = sectionMatches === 0;
        matches += sectionMatches;
      });
      document.querySelectorAll(".help-category").forEach((category) => {
        category.classList.toggle("is-hidden", !!query && !category.textContent.toLowerCase().includes(query));
      });
      const meta = document.getElementById("helpSearchMeta");
      if (meta) {
        const idleText = getValue("hero.searchMeta") || "Search questions, features, settings, or archive terms.";
        meta.textContent = query
          ? `${matches} ${matches === 1 ? "help topic" : "help topics"} found`
          : idleText;
      }
      if (noResults) {
        noResults.textContent = translations.noResults || "No matching help topics found.";
        noResults.hidden = !query || matches > 0;
      }
    };


    input.addEventListener("input", filter);
    document.addEventListener("keydown", (event) => {
      if (event.key === "/" && document.activeElement !== input && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        input.focus();
      }
    });
    filter();
  }

  function showLoadError() {
    const root = document.getElementById("helpSections");
    if (!root) return;
    root.innerHTML = `<div class="help-load-error"><i class="fa-solid fa-circle-exclamation"></i><h2>Help content could not be loaded.</h2><p>Please refresh the page and try again.</p></div>`;
  }

  document.addEventListener("languageChanged", async (event) => {
    const lang = event.detail?.lang || getLanguage();
    try {
      await loadTranslations(lang);
      renderHelp();
      applyStaticLanguage();
      setupSearch();
    } catch (error) {
      console.warn("Help translation unavailable:", error.message);
      showLoadError();
    }
  });

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await loadTranslations();
      renderHelp();
      applyStaticLanguage();
      setupSearch();
    } catch (error) {
      console.warn("Help translation unavailable:", error.message);
      showLoadError();
    }
    initMenu();
  });
})();
