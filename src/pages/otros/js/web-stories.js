const LANGUAGES = new Set(["en", "es"]);
const $ = (id) => document.getElementById(id);

let currentLang = getLanguage();
let data = null;
let filter = "all";
let query = "";
let loadToken = 0;

function getLanguage() {
  const stored = String(
    localStorage.getItem("lang") || localStorage.getItem("preferredLanguage") || "es",
  ).toLowerCase();

  return LANGUAGES.has(stored) ? stored : "es";
}

function statusKey(status) {
  if (status === "Featured in SS2 (partial)") return "featuredPartial";
  if (status === "Featured in SS") return "featured";
  return "notFeatured";
}

function tags(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAu(story) {
  return tags(story.type).some((type) => type.toUpperCase() === "AU");
}

function isCrossover(story) {
  return tags(story.type).some((type) => type.toLowerCase() === "crossover");
}

function isFeatured(story) {
  return String(story.status || "").startsWith("Featured");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeUrl(value) {
  const url = String(value || "").trim();
  const markdownLink = url.match(/^\[[^\]]*\]\((https?:\/\/[^\s)]+)\)$/);
  return markdownLink ? markdownLink[1] : url;
}

function applyTranslations() {
  const t = data.ui;
  document.documentElement.lang = t.lang;
  document.title = `Adashima - ${t.title}`;

  $("eyebrowText").textContent = t.eyebrow;
  $("pageTitle").textContent = t.title;
  $("pageIntro").textContent = t.intro;

  $("storyCountLabel").textContent = t.stories;
  $("featuredCountLabel").textContent = t.featuredVolume;
  $("auCountLabel").textContent = t.auChapters;
  $("auWeightLabel").textContent = t.auShare;
  $("statsStrip").setAttribute("aria-label", t.directoryStatsAria);

  $("search").placeholder = t.search;
  $("search").setAttribute("aria-label", t.searchAria);
  $("clearSearch").setAttribute("aria-label", t.clearSearchAria);
  $("filterRow").setAttribute("aria-label", t.filterAria);

  $("filterAll").textContent = t.all;
  $("filterFeatured").textContent = t.featured;
  $("filterNotFeatured").textContent = t.notFeatured;
  $("filterAU").textContent = t.au;
  $("filterCrossover").textContent = t.crossover;

  $("directoryKicker").textContent = t.directory;
  $("directoryHeading").textContent = t.directoryTitle;
  $("thJpTitle").textContent = t.jpTitle;
  $("thEnTitle").textContent = t.enTitle;
  $("thSource").textContent = t.source;
  $("thType").textContent = t.type;
  $("thStatus").textContent = t.status;
  $("thTranslator").textContent = t.translator;
  $("thNotes").textContent = t.notes;

  $("auKicker").textContent = t.reference;
  $("auHeading").textContent = t.auTitle;
  $("auIntro").textContent = t.auIntro;
  $("auToggle").setAttribute("aria-label", t.auToggleAria);

  $("notesKicker").textContent = t.reference;
  $("notesHeading").textContent = t.misc;
  $("notesToggle").setAttribute("aria-label", t.notesToggleAria);
}

function filteredStories() {
  const normalizedQuery = query.trim().toLowerCase();

  return data.stories.filter((story) => {
    if (filter === "featured" && !isFeatured(story)) return false;
    if (filter === "not-featured" && isFeatured(story)) return false;
    if (filter === "au" && !isAu(story)) return false;
    if (filter === "crossover" && !isCrossover(story)) return false;

    if (!normalizedQuery) return true;

    return [
      story.jpTitle,
      story.enTitle,
      story.source,
      story.type,
      story.status,
      story.notes,
      story.translator,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

function renderStories() {
  const t = data.ui;
  const stories = filteredStories();
  const featuredCount = data.stories.filter(isFeatured).length;
  const auCount = data.stories.filter(isAu).length;
  const crossoverCount = data.stories.filter(isCrossover).length;

  $("storyCount").textContent = data.stories.length;
  $("featuredCount").textContent = featuredCount;
  $("auCount").textContent = data.stats.auCount ?? auCount;
  $("auWeight").textContent = data.stats.auWeight;
  $("countAll").textContent = data.stories.length;
  $("countFeatured").textContent = featuredCount;
  $("countNotFeatured").textContent = data.stories.length - featuredCount;
  $("countAU").textContent = auCount;
  $("countCrossover").textContent = crossoverCount;

  $("resultCount").textContent = `${stories.length} ${
    stories.length === 1 ? t.resultOne : t.resultMany
  }`;

  $("storyRows").innerHTML = stories.length
    ? stories.map(renderTableRow).join("")
    : `<tr><td colspan="7" class="empty-cell">${escapeHtml(t.noResults)}</td></tr>`;

  $("mobileList").innerHTML = stories.length
    ? stories.map(renderMobileCard).join("")
    : `<div class="empty-cell">${escapeHtml(t.noResults)}</div>`;

  $("auGrid").innerHTML = data.auChapters
    .map(
      (chapter) => `
        <div class="au-item">
          <span class="au-number">${escapeHtml(chapter.number)}</span>
          <div>
            <strong>${escapeHtml(chapter.title)}</strong>
            <small>${escapeHtml(chapter.volume)}</small>
          </div>
        </div>`,
    )
    .join("");

  $("notesContent").innerHTML = escapeHtml(data.notes)
    .split("\n")
    .filter(Boolean)
    .map((note) => `<p>${note}</p>`)
    .join("");
}

function renderTableRow(story) {
  const t = data.ui;
  const status = t.statuses[statusKey(story.status)] || story.status;
  const typeBadges = tags(story.type)
    .map((type) => `<span class="type-badge">${escapeHtml(type)}</span>`)
    .join(" ");

  const sourceUrl = normalizeUrl(story.sourceUrl);
  const sourceLink = sourceUrl
    ? `<a class="story-link source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(story.source || t.source)}</a>`
    : `<span class="source-badge">${escapeHtml(story.source)}</span>`;
  const translationUrl = normalizeUrl(story.translationUrl);
  const translationLink = translationUrl
    ? `<a class="story-link translation-link" href="${escapeHtml(translationUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.engTl || "ENG TL")}</a>`
    : story.translator
      ? `<span class="translator">${escapeHtml(story.translator)}</span>`
      : '<span class="muted">—</span>';

  return `
    <tr>
      <td class="jp-title">${escapeHtml(story.jpTitle) || '<span class="muted">—</span>'}</td>
      <td class="en-title">${escapeHtml(story.enTitle) || '<span class="muted">—</span>'}</td>
      <td>${sourceLink}</td>
      <td>${typeBadges}</td>
      <td><span class="status-badge ${isFeatured(story) ? "status-featured" : "status-not-featured"}">${escapeHtml(status)}</span></td>
      <td>${translationLink}</td>
      <td class="notes-cell">${story.notes ? escapeHtml(story.notes) : '<span class="muted">—</span>'}</td>
    </tr>`;
}

function renderMobileCard(story) {
  const t = data.ui;
  const status = t.statuses[statusKey(story.status)] || story.status;
  const typeBadges = tags(story.type)
    .map((type) => `<span class="type-badge">${escapeHtml(type)}</span>`)
    .join(" ");

  const sourceUrl = normalizeUrl(story.sourceUrl);
  const sourceLink = sourceUrl
    ? `<a class="story-link source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(story.source || t.source)}</a>`
    : `<span class="source-badge">${escapeHtml(story.source)}</span>`;
  const translationUrl = normalizeUrl(story.translationUrl);
  const translationLink = translationUrl
    ? `<a class="story-link translation-link" href="${escapeHtml(translationUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.engTl || "ENG TL")}</a>`
    : story.translator
      ? `<span class="translator">${escapeHtml(story.translator)}</span>`
      : "";

  return `
    <article class="story-card">
      <div class="story-card-head">
        ${sourceLink}
        <span class="status-badge ${isFeatured(story) ? "status-featured" : "status-not-featured"}">${escapeHtml(status)}</span>
      </div>
      <div class="story-title-pair">
        <div><small>JP</small><p class="jp-title">${escapeHtml(story.jpTitle) || '<span class="muted">—</span>'}</p></div>
        <div><small>EN</small><p class="en-title">${escapeHtml(story.enTitle) || '<span class="muted">—</span>'}</p></div>
      </div>
      <div class="story-meta">
        <span><b>${escapeHtml(t.mobileType)}</b> ${typeBadges}</span>
        ${translationLink ? `<span><b>${escapeHtml(t.mobileTranslator)}</b> ${translationLink}</span>` : ""}
      </div>
      ${story.notes ? `<p class="story-note"><b>${escapeHtml(t.notes)}</b> ${escapeHtml(story.notes)}</p>` : ""}
    </article>`;
}

function collapse(buttonId, panelId) {
  const button = $(buttonId);
  const panel = $(panelId);

  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    panel.hidden = open;
  });
}

function createParticles() {
  const container = $("particles");
  for (let i = 0; i < 28; i += 1) {
    const star = document.createElement("span");
    star.className = "star";
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.animationDelay = `${Math.random() * 6}s`;
    container.appendChild(star);
  }
}

async function loadData(language = currentLang) {
  const token = ++loadToken;
  const requestedLanguage = LANGUAGES.has(language) ? language : "es";

  try {
    const response = await fetch(`/src/data/web-stories/${requestedLanguage}.json`, {
      cache: "no-cache",
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const nextData = await response.json();
    if (!nextData?.ui || !Array.isArray(nextData.stories)) {
      throw new Error("Invalid web stories data");
    }

    if (token !== loadToken) return;

    currentLang = requestedLanguage;
    data = nextData;
    applyTranslations();
    renderStories();
  } catch (error) {
    console.error("Web Stories directory failed to load:", error);
    if (token !== loadToken) return;

    const message =
      currentLang === "es"
        ? "No se pudo cargar el directorio. Recarga la página."
        : "Unable to load the directory. Please refresh the page.";

    $("storyRows").innerHTML =
      `<tr><td colspan="7" class="empty-cell">${escapeHtml(message)}</td></tr>`;
    $("mobileList").innerHTML = `<div class="empty-cell">${escapeHtml(message)}</div>`;
  }
}

function loadMenu() {
  const container = $("menu-container");

  fetch("/src/components/menu.html", { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .then((html) => {
      container.innerHTML = html;

      container.querySelectorAll("script").forEach((oldScript) => {
        const script = document.createElement("script");
        [...oldScript.attributes].forEach((attribute) => {
          script.setAttribute(attribute.name, attribute.value);
        });
        script.textContent = oldScript.textContent;
        oldScript.replaceWith(script);
      });

      if (typeof window.translateMenu === "function") {
        window.translateMenu(currentLang);
      }

      document.dispatchEvent(new CustomEvent("menuLoaded"));
    })
    .catch((error) => console.warn("Failed to load menu:", error));
}

function initialize() {
  collapse("auToggle", "auPanel");
  collapse("notesToggle", "notesPanel");

  document.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      filter = button.dataset.filter;
      if (data) renderStories();
    });
  });

  $("search").addEventListener("input", (event) => {
    query = event.target.value;
    $("clearSearch").classList.toggle("visible", Boolean(query));
    if (data) renderStories();
  });

  $("clearSearch").addEventListener("click", () => {
    $("search").value = "";
    query = "";
    $("clearSearch").classList.remove("visible");
    if (data) renderStories();
    $("search").focus();
  });

  document.addEventListener("languageChanged", (event) => {
    const language = event?.detail?.lang;
    const nextLanguage = LANGUAGES.has(language) ? language : getLanguage();
    if (nextLanguage !== currentLang) loadData(nextLanguage);
  });

  createParticles();
  loadMenu();
  loadData(currentLang);
}

document.addEventListener("DOMContentLoaded", initialize);
