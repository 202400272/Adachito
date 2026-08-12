const storedLanguage =
  localStorage.getItem("lang") ||
  localStorage.getItem("preferredLanguage") ||
  localStorage.getItem("language") ||
  "es";
let currentLanguage = storedLanguage === "es" ? "es" : "en";
let archiveData = [];
let articleContentCache = {};
let currentFilter = "all";
let currentYear = "all";
let currentSort = "newest";
let searchQuery = "";

const scrollObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("scroll-reveal");
        observer.unobserve(entry.target);
      }
    });
  },
  { root: null, rootMargin: "0px", threshold: 0.1 },
);

function getBasePath() {
  return `../../data/author_archive/${currentLanguage}/`;
}

const I18N = {
  en: {
    heroTitle: "Author Archive",
    heroSubtitle:
      "A curated collection of interviews, commentaries, afterwords, magazine features,<br>and other historical material from Hitoma Iruma.",
    statTotal: "Total Articles",
    statInterviews: "Interviews",
    statAfterwords: "Afterwords",
    statCommentaries: "Commentaries",
    statMagazine: "Magazine",
    statYears: "Years",
    searchPlaceholder:
      "Search articles by title, publication, year, or topic...",
    pillAll: "All",
    pillInterview: "Interview",
    pillCommentary: "Commentary",
    pillAfterword: "Afterword",
    pillMagazine: "Magazine",
    pillBlog: "Blog",
    pillTwitter: "Twitter",
    pillEvent: "Event",
    filterLabelYear: "Year",
    filterLabelSort: "Sort",
    yearAll: "All Years",
    sortNewest: "Newest First",
    sortOldest: "Oldest First",
    sortTitle: "Alphabetical",
    footer:
      "Unofficial Adachi to Shimamura fan site.<br>Created by fans, non-profit.<br>Adachi to Shimamura and all rights belong to Hitoma Iruma.",
    referencePanelTitle: "References",
    loadingArchive: "Loading archive...",
    loadingArchiveWait: "Please wait while we load the articles.",
    failedArchiveTitle: "Failed to load archive",
    failedArchiveText: "Please refresh the page or try again later.",
    refresh: "Refresh",
    failedArchiveToast: "Failed to load archive data. Please refresh the page.",
    noArticlesTitle: "No articles found",
    noArticlesText: "Try adjusting your filters or search terms",
    resetFilters: "Reset Filters",
    filtersResetToast: "Filters reset",
    loadingArticle: "Loading article...",
    noReferences: "No references for this article",
    viewOriginalSource: "View Original Source",
    contentNotAvailable: "<p>Content not available.</p>",
    failedArticleContent:
      "<p>Failed to load article content. Please try again later.</p>",
    types: {
      interview: "Interview",
      commentary: "Commentary",
      afterword: "Afterword",
      magazine: "Magazine Feature",
      blog: "Blog Post",
      twitter: "Twitter Thread",
      event: "Event Report",
    },
  },
  es: {
    heroTitle: "Archivo del Autor",
    heroSubtitle:
      "Una colección curada de entrevistas, comentarios, epílogos, artículos de revistas<br>y otro material histórico de Hitoma Iruma.",
    statTotal: "Artículos Totales",
    statInterviews: "Entrevistas",
    statAfterwords: "Epílogos",
    statCommentaries: "Comentarios",
    statMagazine: "Revistas",
    statYears: "Años",
    searchPlaceholder: "Busca artículos por título, publicación, año o tema...",
    pillAll: "Todos",
    pillInterview: "Entrevista",
    pillCommentary: "Comentario",
    pillAfterword: "Epílogo",
    pillMagazine: "Revista",
    pillBlog: "Blog",
    pillTwitter: "Twitter",
    pillEvent: "Evento",
    filterLabelYear: "Año",
    filterLabelSort: "Ordenar",
    yearAll: "Todos los Años",
    sortNewest: "Más Recientes",
    sortOldest: "Más Antiguos",
    sortTitle: "Alfabético",
    footer:
      "Fan site no oficial de Adachi to Shimamura.<br>Creado por fans, sin fines de lucro.<br>Adachi to Shimamura y todos sus derechos pertenecen a Hitoma Iruma.",
    referencePanelTitle: "Referencias",
    loadingArchive: "Cargando archivo...",
    loadingArchiveWait: "Por favor espera mientras cargamos los artículos.",
    failedArchiveTitle: "Error al cargar el archivo",
    failedArchiveText:
      "Por favor actualiza la página o intenta de nuevo más tarde.",
    refresh: "Actualizar",
    failedArchiveToast:
      "Error al cargar los datos del archivo. Por favor actualiza la página.",
    noArticlesTitle: "No se encontraron artículos",
    noArticlesText: "Intenta ajustar tus filtros o términos de búsqueda",
    resetFilters: "Restablecer Filtros",
    filtersResetToast: "Filtros restablecidos",
    loadingArticle: "Cargando artículo...",
    noReferences: "No hay referencias para este artículo",
    viewOriginalSource: "Ver Fuente Original",
    contentNotAvailable: "<p>Contenido no disponible.</p>",
    failedArticleContent:
      "<p>Error al cargar el contenido del artículo. Por favor intenta de nuevo más tarde.</p>",
    types: {
      interview: "Entrevista",
      commentary: "Comentario",
      afterword: "Epílogo",
      magazine: "Artículo de Revista",
      blog: "Entrada de Blog",
      twitter: "Hilo de Twitter",
      event: "Reporte de Evento",
    },
  },
};

function t(key) {
  return I18N[currentLanguage][key];
}

function applyUITranslations(lang) {
  const dict = I18N[lang];
  document.documentElement.lang = lang;
  document.getElementById("heroTitleText").textContent = dict.heroTitle;
  document.getElementById("heroSubtitleText").innerHTML = dict.heroSubtitle;
  document.getElementById("statLabelTotal").textContent = dict.statTotal;
  document.getElementById("statLabelInterviews").textContent =
    dict.statInterviews;
  document.getElementById("statLabelAfterwords").textContent =
    dict.statAfterwords;
  document.getElementById("statLabelCommentaries").textContent =
    dict.statCommentaries;
  document.getElementById("statLabelMagazine").textContent = dict.statMagazine;
  document.getElementById("statLabelYears").textContent = dict.statYears;
  document.getElementById("archiveSearch").placeholder = dict.searchPlaceholder;
  document.getElementById("pillTextAll").textContent = dict.pillAll;
  document.getElementById("pillTextInterview").textContent = dict.pillInterview;
  document.getElementById("pillTextCommentary").textContent =
    dict.pillCommentary;
  document.getElementById("pillTextAfterword").textContent = dict.pillAfterword;
  document.getElementById("pillTextMagazine").textContent = dict.pillMagazine;
  document.getElementById("pillTextBlog").textContent = dict.pillBlog;
  document.getElementById("pillTextTwitter").textContent = dict.pillTwitter;
  document.getElementById("pillTextEvent").textContent = dict.pillEvent;
  document.getElementById("filterLabelYear").textContent = dict.filterLabelYear;
  document.getElementById("filterLabelSort").textContent = dict.filterLabelSort;
  document.getElementById("yearFilterAllOption").textContent = dict.yearAll;
  document.getElementById("sortNewestOption").textContent = dict.sortNewest;
  document.getElementById("sortOldestOption").textContent = dict.sortOldest;
  document.getElementById("sortTitleOption").textContent = dict.sortTitle;
  document.getElementById("footerText").innerHTML = dict.footer;
  document.getElementById("referencePanelTitle").textContent =
    dict.referencePanelTitle;
}

function getTypeLabel(type) {
  return I18N[currentLanguage].types[type] || type;
}

function getTypeIcon(type) {
  const icons = {
    interview: "fa-microphone-lines",
    commentary: "fa-message",
    afterword: "fa-book-open-reader",
    magazine: "fa-newspaper",
    blog: "fa-feather-pointed",
    twitter: "fa-twitter",
    event: "fa-calendar-day",
  };
  return icons[type] || "fa-file-lines";
}

function getTypeColor(type) {
  const colors = {
    interview: "#d1a3c6",
    commentary: "#8c5a96",
    afterword: "#5c3a6b",
    magazine: "#c9b8e8",
    blog: "#f0c8d8",
    twitter: "#1da1f2",
    event: "#b8d4c8",
  };
  return colors[type] || "#d1a3c6";
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const locale = currentLanguage === "es" ? "es-ES" : "en-US";
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getYear(dateString) {
  return new Date(dateString).getFullYear();
}

function showToast(message) {
  const el = document.getElementById("toast-message");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("visible");
  void el.offsetWidth;
  el.classList.add("visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("visible"), 2500);
}

function animateStats(elementId, targetValue) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const current = parseInt(el.textContent) || 0;
  const duration = 800;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(current + (targetValue - current) * eased);
    el.textContent = value;
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

function switchLanguage(lang) {
  if (currentLanguage === lang) return;
  const normalizedLang = lang === "en" ? "en" : "es";
  currentLanguage = normalizedLang;
  localStorage.setItem("lang", normalizedLang);
  localStorage.setItem("preferredLanguage", normalizedLang);
  localStorage.setItem("language", normalizedLang);
  document.documentElement.lang = normalizedLang;
  if (typeof window.translateMenu === "function") {
    window.translateMenu(lang);
  }
  location.reload();
}

async function loadArticleContent(article) {
  if (!article.contentPath) {
    return article.content || t("contentNotAvailable");
  }
  if (articleContentCache[article.id]) {
    return articleContentCache[article.id];
  }
  try {
    const url = `${getBasePath()}${article.contentPath}?v=${Date.now()}`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
    if (!response.ok) throw new Error("Failed to load article content");
    const data = await response.json();
    const articleReferences = data.references || [];
    let content = "";
    if (data.sections && data.sections.length > 0) {
      content = data.sections
        .map((section) => {
          let html = "";
          if (section.heading) {
            html += `<h3>${section.heading}</h3>`;
          }
          html += processContentWithNotes(
            section.content || "",
            articleReferences,
          );
          return html;
        })
        .join("");
    } else {
      content = processContentWithNotes(
        data.content || t("contentNotAvailable"),
        articleReferences,
      );
    }
    article.references = articleReferences;
    articleContentCache[article.id] = content;
    return content;
  } catch (error) {
    return t("failedArticleContent");
  }
}

function processContentWithNotes(content, references) {
  return content.replace(/\[ref:([^\]]+)\]/g, (match, refId) => {
    const ref = references.find((r) => r.id === refId);
    if (ref) {
      return `<span class="reference-marker" data-ref="${refId}" onclick="toggleNote('${refId}')">
                <i class="fas fa-bookmark"></i>
                <span class="reference-tooltip">${ref.title}</span>
            </span>`;
    }
    return match;
  });
}

function toggleNote(refId) {
  const note = document.querySelector(`.reference-note[data-ref="${refId}"]`);
  if (note) {
    note.classList.toggle("visible");
    return;
  }
  const modal = document.getElementById("articleModal");
  if (!modal.classList.contains("open")) return;
  const articleId = parseInt(modal.dataset.articleId);
  const article = archiveData.find((a) => a.id === articleId);
  if (!article || !article.references) return;
  const ref = article.references.find((r) => r.id === refId);
  if (!ref || !ref.note) return;
  const marker = document.querySelector(
    `.reference-marker[data-ref="${refId}"]`,
  );
  if (marker) {
    const noteEl = document.createElement("div");
    noteEl.className = "reference-note visible";
    noteEl.dataset.ref = refId;
    noteEl.innerHTML = `
            <div class="reference-note-content">
                <div class="reference-note-title">${ref.title}</div>
                <div class="reference-note-body">${ref.note}</div>
                <button class="reference-note-close" onclick="this.parentElement.parentElement.classList.remove('visible')">
                    <i class="fas fa-xmark"></i>
                </button>
            </div>
        `;
    marker.parentElement.insertBefore(noteEl, marker.nextSibling);
  }
}

function updateReferencePanel(article) {
  const list = document.getElementById("referenceList");
  const count = document.getElementById("referenceCount");
  const references = article?.references || [];
  count.textContent = references.length;
  if (!references || references.length === 0) {
    list.innerHTML = `
            <div class="reference-empty">
                <i class="fas fa-circle-info" style="display:block;font-size:1.2rem;margin-bottom:6px;opacity:0.5;"></i>
                ${t("noReferences")}
            </div>
        `;
    return;
  }
  list.innerHTML = references
    .map(
      (ref) => `
        <div class="reference-item" onclick="toggleNote('${ref.id}')">
            <div class="reference-item-title">${ref.title}</div>
            <div class="reference-item-source">${ref.source || ""} ${ref.date ? "· " + formatDate(ref.date) : ""}</div>
        </div>
    `,
    )
    .join("");
}

async function loadArchiveData() {
  try {
    const grid = document.getElementById("archiveGrid");
    grid.innerHTML = `
            <div class="empty-state" style="padding:40px 20px;">
                <div class="empty-state-icon"><i class="fas fa-spinner fa-spin"></i></div>
                <h3>${t("loadingArchive")}</h3>
                <p>${t("loadingArchiveWait")}</p>
            </div>
        `;
    const url = `${getBasePath()}index.json?v=${Date.now()}`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
    if (!response.ok) throw new Error("Failed to load archive index");
    const data = await response.json();
    archiveData = data.articles.map((article) => ({
      ...article,
      contentLoaded: false,
      content: article.content || "",
      references: [],
    }));
    populateYearFilter(archiveData);
    updateFilterCounts(archiveData);
    filterAndRender();
  } catch (error) {
    showToast(t("failedArchiveToast"));
    document.getElementById("archiveGrid").innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-triangle-exclamation"></i></div>
                <h3>${t("failedArchiveTitle")}</h3>
                <p>${t("failedArchiveText")}</p>
                <button class="empty-action" onclick="location.reload()">
                    <i class="fas fa-rotate"></i> ${t("refresh")}
                </button>
            </div>
        `;
  }
}

function updateFilterCounts(items) {
  const counts = {
    all: items.length,
    interview: items.filter((i) => i.type === "interview").length,
    commentary: items.filter((i) => i.type === "commentary").length,
    afterword: items.filter((i) => i.type === "afterword").length,
    magazine: items.filter((i) => i.type === "magazine").length,
    blog: items.filter((i) => i.type === "blog").length,
    twitter: items.filter((i) => i.type === "twitter").length,
    event: items.filter((i) => i.type === "event").length,
  };
  Object.keys(counts).forEach((key) => {
    const el = document.getElementById(
      `count${key.charAt(0).toUpperCase() + key.slice(1)}`,
    );
    if (el) el.textContent = counts[key];
  });
}

function updateStatsFromData(items, animate = true) {
  const total = items.length;
  const interviews = items.filter((i) => i.type === "interview").length;
  const afterwords = items.filter((i) => i.type === "afterword").length;
  const commentaries = items.filter((i) => i.type === "commentary").length;
  const magazines = items.filter((i) => i.type === "magazine").length;
  const years = new Set(items.map((i) => getYear(i.date)));

  if (animate) {
    animateStats("totalSources", total);
    animateStats("interviewCount", interviews);
    animateStats("afterwordCount", afterwords);
    animateStats("commentaryCount", commentaries);
    animateStats("magazineCount", magazines);
    animateStats("yearCount", years.size);
  } else {
    document.getElementById("totalSources").textContent = total;
    document.getElementById("interviewCount").textContent = interviews;
    document.getElementById("afterwordCount").textContent = afterwords;
    document.getElementById("commentaryCount").textContent = commentaries;
    document.getElementById("magazineCount").textContent = magazines;
    document.getElementById("yearCount").textContent = years.size;
  }
}

function populateYearFilter(items) {
  const years = new Set(items.map((i) => getYear(i.date)));
  const yearSelect = document.getElementById("yearFilter");
  const currentValue = yearSelect.value;
  yearSelect.innerHTML = `<option value="all">${t("yearAll")}</option>`;
  Array.from(years)
    .sort((a, b) => b - a)
    .forEach((year) => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      yearSelect.appendChild(option);
    });
  yearSelect.value = currentValue;
}

function filterAndRender() {
  const filtered = archiveData.filter((item) => {
    if (currentFilter !== "all" && item.type !== currentFilter) return false;
    if (currentYear !== "all" && getYear(item.date).toString() !== currentYear)
      return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const searchable = [
        item.title,
        item.publication,
        item.summary || "",
        item.type,
        item.translator || "",
        item.magazineIssue || "",
      ]
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(query)) return false;
    }
    return true;
  });

  const sorted = sortArticles(filtered);
  renderArchiveGrid(sorted);
  updateStatsFromData(sorted, true);
  updateFilterCounts(archiveData);
}

function sortArticles(items) {
  const sorted = [...items];
  switch (currentSort) {
    case "newest":
      return sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
    case "oldest":
      return sorted.sort((a, b) => new Date(a.date) - new Date(b.date));
    case "title":
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return sorted;
  }
}

function renderArchiveGrid(items) {
  const grid = document.getElementById("archiveGrid");
  if (items.length === 0) {
    grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-magnifying-glass"></i></div>
                <h3>${t("noArticlesTitle")}</h3>
                <p>${t("noArticlesText")}</p>
                <button class="empty-action" onclick="resetFilters()">
                    <i class="fas fa-rotate-left"></i> ${t("resetFilters")}
                </button>
            </div>
        `;
    return;
  }
  grid.innerHTML = items
    .map(
      (item) => `
        <div class="archive-card" data-id="${item.id}" onclick="toggleArticle(${item.id})">
            <div class="card-image">
                ${item.thumbnail ? `<img src="${item.thumbnail}" alt="${item.title}" loading="lazy">` : `<div class="card-image-placeholder" style="background:linear-gradient(135deg, ${getTypeColor(item.type)}44, ${getTypeColor(item.type)}22);"><i class="fas ${getTypeIcon(item.type)}"></i></div>`}
                <span class="card-type-badge"><i class="fas ${getTypeIcon(item.type)}"></i> ${getTypeLabel(item.type)}</span>
            </div>
            <div class="card-content">
                <div class="card-header">
                    <span class="card-date"><i class="far fa-calendar-days"></i> ${formatDate(item.date)}</span>
                    <span class="card-language">${item.language.toUpperCase()}</span>
                </div>
                <h3 class="card-title">${item.title}</h3>
                <p class="card-summary">${item.summary || ""}</p>
                <div class="card-footer">
                    <span class="card-publication"><i class="fas fa-building"></i> ${item.publication}</span>
                    <span class="card-reading-time"><i class="fas fa-clock"></i> ${item.readingTime || "?"} min</span>
                </div>
            </div>
        </div>
    `,
    )
    .join("");

  document.querySelectorAll(".archive-card").forEach((card) => {
    scrollObserver.observe(card);
  });
}

function resetFilters() {
  searchQuery = "";
  currentFilter = "all";
  currentYear = "all";
  document.getElementById("archiveSearch").value = "";
  document.getElementById("searchClearBtn").classList.remove("visible");
  document.getElementById("yearFilter").value = "all";
  document
    .querySelectorAll(".filter-pill")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelector('.filter-pill[data-filter="all"]')
    .classList.add("active");
  filterAndRender();
  showToast(t("filtersResetToast"));
}

async function openArticle(id) {
  const item = archiveData.find((d) => d.id === id);
  if (!item) return;
  const modal = document.getElementById("articleModal");
  modal.dataset.articleId = id;
  const meta = document.getElementById("modalMeta");
  const body = document.getElementById("modalBody");
  body.innerHTML = `
        <div style="text-align:center;padding:40px 0;">
            <div style="display:inline-block;width:40px;height:40px;border:3px solid rgba(209,163,198,0.12);border-top-color:#d1a3c6;border-radius:50%;animation:spin 0.75s linear infinite;"></div>
            <p style="margin-top:12px;color:rgba(92,58,107,0.5);">${t("loadingArticle")}</p>
        </div>
    `;
  let content = item.content;
  if (!content || content === "") {
    content = await loadArticleContent(item);
  }
  updateReferencePanel(item);
  meta.innerHTML = `
        <span class="modal-type"><i class="fas ${getTypeIcon(item.type)}"></i> <span class="modal-type-text">${getTypeLabel(item.type)}</span></span>
        <span class="modal-date"><i class="far fa-calendar-days"></i> ${formatDate(item.date)}</span>
        <span class="modal-language">${item.language.toUpperCase()}</span>
    `;
  body.innerHTML = `
        <h2 class="modal-title">${item.title}</h2>
        <div class="modal-publication"><i class="fas fa-building"></i> ${item.publication}</div>
        <div class="modal-content-body">${content}</div>
        ${
          item.sourceLink
            ? `
            <div class="modal-source-link">
                <a href="${item.sourceLink}" target="_blank" rel="noopener noreferrer" class="source-link-btn">
                    <i class="fas fa-arrow-up-right-from-square"></i> ${t("viewOriginalSource")}
                </a>
            </div>
        `
            : ""
        }
    `;
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeArticle() {
  const modal = document.getElementById("articleModal");
  modal.classList.remove("open");
  document.body.style.overflow = "";
}

function toggleArticle(id) {
  const modal = document.getElementById("articleModal");
  if (
    modal.classList.contains("open") &&
    Number(modal.dataset.articleId) === Number(id)
  ) {
    closeArticle();
  } else {
    openArticle(id);
  }
}

async function loadSidebar() {
  const container = document.getElementById("sidebar-container");
  if (!container) return;
  try {
    const menuVer = Math.floor(Date.now() / 86400000);
    const res = await fetch(`/src/components/menu.html?v=` + menuVer);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    let html = await res.text();
    html = html.replace(/src="\.\/(assets\/)/g, 'src="../../../$1');
    html = html.replace(/\.\.\/data\/menu\//g, "../../data/menu/");
    container.innerHTML = html;
    container.querySelectorAll("script").forEach((oldScript) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) =>
        newScript.setAttribute(attr.name, attr.value),
      );
      newScript.appendChild(document.createTextNode(oldScript.innerHTML));
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
    setTimeout(() => {
      if (typeof window.translateMenu === "function") {
        window.translateMenu(currentLanguage);
      }
    }, 100);
  } catch (error) {}
}

document.addEventListener("DOMContentLoaded", function () {
  loadSidebar();
  applyUITranslations(currentLanguage);
  loadArchiveData();

  const langToggle = document.getElementById("langToggle");
  const langDropdown = document.getElementById("langDropdown");
  const langMenu = document.getElementById("langMenu");
  const langSelectedLabel = document.getElementById("langSelectedLabel");

  langMenu.querySelectorAll(".lang-option").forEach((option) => {
    const isSelected = option.dataset.lang === currentLanguage;
    option.classList.toggle("selected", isSelected);
    if (isSelected) langSelectedLabel.textContent = option.dataset.label;
  });

  langToggle.addEventListener("click", function (e) {
    e.stopPropagation();
    const isOpen = langDropdown.classList.toggle("open");
    langToggle.setAttribute("aria-expanded", isOpen);
  });

  langMenu.querySelectorAll(".lang-option").forEach((option) => {
    option.addEventListener("click", function () {
      switchLanguage(this.dataset.lang);
    });
  });

  document.addEventListener("click", function () {
    langDropdown.classList.remove("open");
    langToggle.setAttribute("aria-expanded", "false");
  });

  langMenu.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  const searchInput = document.getElementById("archiveSearch");
  const clearBtn = document.getElementById("searchClearBtn");

  searchInput.addEventListener("input", function () {
    searchQuery = this.value;
    clearBtn.classList.toggle("visible", this.value.length > 0);
    filterAndRender();
  });

  clearBtn.addEventListener("click", function () {
    searchInput.value = "";
    searchQuery = "";
    clearBtn.classList.remove("visible");
    filterAndRender();
    searchInput.focus();
  });

  document.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.addEventListener("click", function () {
      document
        .querySelectorAll(".filter-pill")
        .forEach((p) => p.classList.remove("active"));
      this.classList.add("active");
      currentFilter = this.dataset.filter;
      filterAndRender();
    });
  });

  document.getElementById("yearFilter").addEventListener("change", function () {
    currentYear = this.value;
    filterAndRender();
  });

  document.getElementById("sortFilter").addEventListener("change", function () {
    currentSort = this.value;
    filterAndRender();
  });

  document.getElementById("modalClose").addEventListener("click", closeArticle);
  document
    .getElementById("modalBackdrop")
    .addEventListener("click", closeArticle);

  document
    .querySelector(".modal-content")
    .addEventListener("click", function (e) {
      if (
        !e.target.closest("a") &&
        !e.target.closest("button") &&
        !e.target.closest(".reference-marker") &&
        !e.target.closest(".reference-note") &&
        !e.target.closest(".reference-panel")
      ) {
        closeArticle();
      }
    });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeArticle();
  });

  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "/" || e.key === "s") {
      e.preventDefault();
      document.getElementById("archiveSearch").focus();
    }
  });

  window.openArticle = openArticle;
  window.toggleArticle = toggleArticle;
  window.closeArticle = closeArticle;
  window.showToast = showToast;
  window.toggleNote = toggleNote;
  window.switchLanguage = switchLanguage;
  window.resetFilters = resetFilters;

  const style = document.createElement("style");
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);

  const c = document.getElementById("particles");
  if (c) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 50; i++) {
      const s = document.createElement("div");
      s.className = "star";
      s.style.cssText = `left:${Math.random() * 100}%;animation-duration:${5 + Math.random() * 10}s,3s;animation-delay:${Math.random() * 10}s,0s;width:${2 + Math.random() * 4}px;height:${2 + Math.random() * 4}px;`;
      frag.appendChild(s);
    }
    c.appendChild(frag);
  }
});
