(() => {
  const VALID_THEMES = ["morning", "afternoon", "night"];
  const AUTO_KEY = "adashima_time_based_appearance";
  const MANUAL_KEY = "adashima_manual_appearance";
  const LANGUAGES = ["en", "es", "tg"];

  let data = null;
  let deferredPrompt = null;
  let started = false;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
  });

  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    })[char]);

  const richText = (value) =>
    escapeHtml(value).replace(/&lt;(\/?)(strong|em)&gt;/g, "<$1$2>");

  const getLanguage = () => {
    const stored =
      window.LanguageSwitch?.getCurrentLanguage?.() ||
      localStorage.getItem("lang") ||
      localStorage.getItem("preferredLanguage") ||
      "es";
    const normalized = String(stored).toLowerCase().split("-")[0];
    return LANGUAGES.includes(normalized) ? normalized : "es";
  };

  async function loadData() {
    const language = getLanguage();
    const response = await fetch(`/src/data/pwa/${language}.json?v=1`, { cache: "no-store" });
    if (!response.ok) throw new Error(`PWA data failed: ${response.status}`);
    data = await response.json();

    document.documentElement.lang = language;
    document.title = data.meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", data.meta.description);
  }

  const icon = (name) => {
    const map = {
      android: "fa-brands fa-android",
      apple: "fa-brands fa-apple",
      "window-maximize": "fa-solid fa-window-maximize",
      "window-restore": "fa-solid fa-window-restore",
      house: "fa-solid fa-house",
      bolt: "fa-solid fa-bolt",
      store: "fa-solid fa-store",
      globe: "fa-solid fa-globe",
      rocket: "fa-solid fa-rocket",
      "arrows-rotate": "fa-solid fa-arrows-rotate",
      wifi: "fa-solid fa-wifi",
      desktop: "fa-solid fa-desktop",
      database: "fa-solid fa-database",
      "cloud-arrow-down": "fa-solid fa-cloud-arrow-down",
    };
    return `<i class="${map[name] || "fa-solid fa-circle-info"}" aria-hidden="true"></i>`;
  };

  const card = (item) => `
    <article class="pwa-note">
      <span class="pwa-note-icon">${icon(item.icon)}</span>
      <h3>${richText(item.title)}</h3>
      <p>${richText(item.text)}</p>
    </article>`;

  function render() {
    if (!data) return;
    const $ = (id) => document.getElementById(id);

    $("pwaHeroKicker").innerHTML = `${icon("desktop")} ${escapeHtml(data.hero.kicker)}`;
    $("pwaHeroTitle").textContent = data.hero.title;
    $("pwaHeroDescription").innerHTML = richText(data.hero.description);
    $("pwaGuideInstallLabel").textContent = data.hero.install;
    $("pwaHeroGuide").textContent = data.hero.guide;

    $("overviewEyebrow").textContent = data.overview.eyebrow;
    $("overviewTitle").textContent = data.overview.title;
    $("overviewIntro").textContent = data.overview.intro;
    $("overviewGrid").innerHTML = data.overview.cards.map(card).join("");

    $("meaningEyebrow").textContent = data.whatItMeans.eyebrow;
    $("meaningTitle").textContent = data.whatItMeans.title;
    $("meaningGrid").innerHTML = data.whatItMeans.points.map(card).join("");

    $("installEyebrow").textContent = data.installation.eyebrow;
    $("installTitle").textContent = data.installation.title;
    $("installIntro").textContent = data.installation.intro;
    $("installGuides").innerHTML = data.installation.guides
      .map(
        (guide) => `
          <article class="pwa-guide-card">
            <div class="pwa-guide-top">
              <span class="pwa-guide-icon">${icon(guide.icon)}</span>
              <div>
                <span class="pwa-guide-label">${escapeHtml(guide.label)}</span>
                <h3>${escapeHtml(guide.title)}</h3>
              </div>
            </div>
            <ol>${guide.steps.map((step) => `<li>${richText(step)}</li>`).join("")}</ol>
            <p class="pwa-tip"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i><span>${richText(guide.tip)}</span></p>
          </article>`,
      )
      .join("");

    $("featuresEyebrow").textContent = data.features.eyebrow;
    $("featuresTitle").textContent = data.features.title;
    $("featuresGrid").innerHTML = data.features.items.map(card).join("");

    $("faqEyebrow").textContent = data.faq.eyebrow;
    $("faqTitle").textContent = data.faq.title;
    $("faqList").innerHTML = data.faq.items
      .map((item) => `<details><summary>${escapeHtml(item.q)}</summary><p>${richText(item.a)}</p></details>`)
      .join("");

  }

  function getPeriod() {
    if (typeof window.getTimePeriod === "function") return window.getTimePeriod();
    const hour = new Date().getHours();
    return hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 19 ? "afternoon" : "night";
  }

  function syncTheme() {
    // The menu is the source of truth for the site's appearance system.
    if (typeof window.updateTimeTheme === "function") {
      window.updateTimeTheme();
      return;
    }

    let theme = getPeriod();
    try {
      const auto = localStorage.getItem(AUTO_KEY) !== "false";
      const manual = localStorage.getItem(MANUAL_KEY);
      if (!auto && VALID_THEMES.includes(manual)) theme = manual;
    } catch {
      return;
    }

    document.body.classList.remove("time-morning", "time-afternoon", "time-night");
    document.body.classList.add(`time-${theme}`);
    document.body.dataset.theme = theme;
  }

  function initInstall() {
    const button = document.getElementById("pwaGuideInstall");
    if (!button || button.dataset.initialized) return;
    button.dataset.initialized = "true";

    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      const label = document.getElementById("pwaGuideInstallLabel");
      if (label && data) label.textContent = data.hero.installed;
      button.disabled = true;
    });

    button.addEventListener("click", async () => {
      if (!deferredPrompt) {
        document.getElementById("installSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const prompt = deferredPrompt;
      deferredPrompt = null;
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch {
        // The browser controls the install UI; a dismissed prompt needs no extra action.
      }
    });

    document.getElementById("pwaHeroGuide")?.addEventListener("click", () => {
      document.getElementById("installSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function loadMenu() {
    const container = document.getElementById("menu-container");
    if (!container || container.dataset.menuLoaded === "true") return;

    const menuVer = Math.floor(Date.now() / 86400000);
    const response = await fetch(`/src/components/menu.html?v=${menuVer}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Menu failed: ${response.status}`);

    const html = await response.text();
    const normalized = html
      .replace(/src="\.\/(assets\/)/g, 'src="../../$1')
      .replace(/data-route="\.\.\/\.\.\/index\.html"/g, 'data-route="../../../index.html"');

    const doc = new DOMParser().parseFromString(normalized, "text/html");
    const fragment = document.createDocumentFragment();

    [...doc.head.childNodes, ...doc.body.childNodes].forEach((node) => {
      if (node.nodeName.toLowerCase() === "script") {
        const script = document.createElement("script");
        if (node.src) script.src = node.src;
        else script.textContent = node.textContent;
        fragment.appendChild(script);
      } else {
        fragment.appendChild(node.cloneNode(true));
      }
    });

    container.replaceChildren(fragment);
    container.dataset.menuLoaded = "true";

    await new Promise((resolve) => setTimeout(resolve, 100));
    document.dispatchEvent(new CustomEvent("menuLoaded"));
  }

  async function refreshContent() {
    try {
      await loadData();
      render();
    } catch (error) {
      console.error("Failed to load PWA data", error);
    }
  }

  async function start() {
    if (started) return;
    started = true;

    try {
      await loadMenu();
    } catch (error) {
      console.warn("Failed to load shared menu", error);
    }

    syncTheme();
    await refreshContent();
    initInstall();

    document.addEventListener("languageChanged", refreshContent);
    document.addEventListener("appearanceThemeChanged", syncTheme);
    window.addEventListener("storage", (event) => {
      if (event.key === AUTO_KEY || event.key === MANUAL_KEY || event.key === "lang") syncTheme();
    });

    setInterval(syncTheme, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
