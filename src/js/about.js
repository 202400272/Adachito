// ========================================
// MAIN LOGIC
// ========================================
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

let translations = null;
let _isSwitching = false;
let _changelogData = [];
let _selectedVersion = null;

// ========================================
// TOAST MESSAGE
// ========================================
function showMessage(msg) {
  const t = document.getElementById("toast-message");
  if (!t) return;
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 3000);
}

// ========================================
// LANGUAGE DROPDOWN
// ========================================
// ========================================
// TRANSLATIONS
// ========================================
async function loadTranslations(lang) {
  try {
    const url =
      window.LanguageSwitch && typeof window.LanguageSwitch.getDataUrl === "function"
        ? window.LanguageSwitch.getDataUrl("about", lang) + "?v=" + Date.now()
        : `../data/about/${lang}.json?v=${Date.now()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to load translations");
    const data = await response.json();
    translations = data;
    return data;
  } catch (e) {
    console.error("Failed to load translations:", e);
    showMessage("Error loading translations. Please refresh.");
    return null;
  }
}

function getText(key) {
  if (!translations) return key;
  const keys = key.split(".");
  let value = translations;
  for (const k of keys) {
    if (value && typeof value === "object" && k in value) value = value[k];
    else return key;
  }
  return value || key;
}

// ========================================
// TRANSLATOR MATERIALS MODAL
// ========================================
const materialsOverlay = document.getElementById("translatorMaterialsOverlay");
const materialsBody = document.getElementById("translatorMaterialsBody");
const materialsCloseBtn = document.getElementById("closeMaterialsBtn");

function openMaterialsModal(translatorIndex) {
  const translators = getText("translators");
  if (!Array.isArray(translators) || !translators[translatorIndex]) {
    showMessage("Translator not found");
    return;
  }

  const translator = translators[translatorIndex];

  document.getElementById("materialsModalTitle").textContent =
    `${getText("materialsModal.titlePrefix") || "Translated Materials"} - ${translator.name}`;

  const works = translator.works || [];

  if (works.length === 0) {
    materialsBody.innerHTML = `
          <div class="materials-empty">
            <span class="iconify" data-icon="mdi:bookshelf"></span>
            <p>${getText("materialsModal.empty") || "This translator hasn't shared any materials yet."}</p>
          </div>
        `;
  } else {
    const grouped = {};
    const novelItems = ["Vol.", "SS", "99.9", "BD Specials"];
    const mangaItems = ["Manga", "Ch.", "Cap."];
    const extraItems = ["Extra"];

    works.forEach((work) => {
      let type = getText("materialsModal.types.general") || "General";
      if (mangaItems.some((item) => work.includes(item))) {
        type = getText("materialsModal.types.manga") || "Manga";
      } else if (novelItems.some((item) => work.includes(item))) {
        type = getText("materialsModal.types.novel") || "Light Novel";
      } else if (extraItems.some((item) => work.includes(item))) {
        type = getText("materialsModal.types.extras") || "Extras";
      }

      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(work);
    });

    let html = "";
    for (const [type, items] of Object.entries(grouped)) {
      html += `
            <div class="materials-group">
              <div class="materials-group-header">
                <span class="iconify" data-icon="mdi:folder-outline"></span>
                <span>${type}</span>
                <span class="materials-count">${items.length}</span>
              </div>
              <div class="materials-list">
                ${items
                  .map(
                    (work) => `
                  <div class="material-item">
                    <div class="material-info">
                      <span class="material-title">${work}</span>
                    </div>
                    <span class="material-status status-complete">${getText("materialsModal.complete") || "Complete"}</span>
                  </div>
                `,
                  )
                  .join("")}
              </div>
            </div>
          `;
    }

    materialsBody.innerHTML = html;
  }

  materialsOverlay.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeMaterialsModal() {
  materialsOverlay.classList.remove("active");
  document.body.style.overflow = "";
}

// Materials modal event listeners
if (materialsCloseBtn) {
  materialsCloseBtn.addEventListener("click", closeMaterialsModal);
}

if (materialsOverlay) {
  materialsOverlay.addEventListener("click", (e) => {
    if (e.target === materialsOverlay) closeMaterialsModal();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMaterialsModal();
});

// ========================================
// RENDER PAGE
// ========================================
function renderPage(data) {
  if (!data) {
    console.error("No translation data available");
    return;
  }

  document.getElementById("heroTitle").innerHTML = getText("heroTitle") || "About";
  document.getElementById("heroSubtitle").textContent = getText("heroSubtitle") || "";
  document.getElementById("badgeSince").textContent = getText("badgeSince") || "Since 2026";

  // Project
  document.getElementById("projectTitle").textContent = getText("projectTitle") || "";
  document.getElementById("projectSubtitle").textContent = getText("projectSubtitle") || "";
  const pf = document.getElementById("projectFeatures");
  if (pf) {
    const features = getText("projectFeatures");
    if (Array.isArray(features)) {
      pf.innerHTML = features
        .map(
          (f) => `
            <div class="about-feature">
              <div class="about-feature-icon"><span class="iconify" data-icon="${f.icon || "mdi:circle-outline"}"></span></div>
              <div class="about-feature-content"><h4>${f.title || ""}</h4><p>${f.desc || ""}</p></div>
            </div>
          `,
        )
        .join("");
    }
  }

  // Translation Credits
  document.getElementById("translationTitle").textContent = getText("translatorTitle") || "";
  document.getElementById("translationSubtitle").textContent = getText("translatorSubtitle") || "";
  const tc = document.getElementById("translatorCards");
  if (tc) {
    const translators = getText("translators");
    if (Array.isArray(translators)) {
      tc.innerHTML = translators
        .map((t, index) => {
          const hasLink = t.link && t.link.trim() !== "";
          const hasWorks = t.works && t.works.length > 0;

          let nameHtml = t.name || "Unknown";
          if (hasLink) {
            nameHtml = `<a href="${t.link}" target="_blank" rel="noopener noreferrer" class="translator-link">${t.name}<span class="link-icon"><span class="iconify" data-icon="mdi:open-in-new"></span></span></a>`;
          }

          return `
              <div class="translator-card">
                <div class="translator-icon"><span class="iconify" data-icon="${t.icon || "mdi:account-outline"}"></span></div>
                <div class="translator-info">
                  <h4>${nameHtml}</h4>
                  <div class="translator-role">${t.role || ""}</div>
                  ${t.badge ? `<span class="translator-badge">${t.badge}</span>` : ""}
                  <p class="translator-desc">${t.description || ""}</p>
                  ${
                    hasWorks
                      ? `
                    <button class="view-materials-btn" data-translator-index="${index}">
                      <span class="iconify" data-icon="mdi:bookshelf"></span>
                      ${getText("materialsModal.viewButton") || "View Translated Materials"} (${t.works.length})
                    </button>
                  `
                      : ""
                  }
                </div>
              </div>
            `;
        })
        .join("");

      // Attach click events to material buttons
      document.querySelectorAll(".view-materials-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
          const index = parseInt(this.getAttribute("data-translator-index"));
          openMaterialsModal(index);
        });
      });
    }
  }

  // Statistics
  const stats = getText("stats") || {
    contributors: 0,
    languages: "English / Spanish",
  };
  document.getElementById("statContributors").textContent = stats.contributors || 0;
  document.getElementById("statLanguages").textContent = stats.languages || "English / Spanish";

  // Version Information
  document.getElementById("versionTitle").textContent = getText("versionTitle") || "";
  const vg = document.getElementById("versionGrid");
  if (vg) {
    const versionItems = getText("versionItems");
    if (Array.isArray(versionItems)) {
      vg.innerHTML = versionItems
        .map(
          (v) => `
            <div class="version-item">
              <span class="version-label">${v.label || ""}</span>
              <span class="version-value">${v.value || ""}</span>
            </div>
          `,
        )
        .join("");
    }
  }

  // Changelog button
  document.getElementById("changelogBtnLabel").textContent =
    getText("changelogBtn") || "View Changelog";

  // Footer is now the shared component (src/components/js/footer.js),
  // which handles its own translation.

  // Modal title
  const modalTitle = document.getElementById("modalChangelogTitle");
  if (modalTitle)
    modalTitle.textContent = getText("modal.changelogTitle") || getText("changelogBtn");

  // Nav versions label
  const navLabel = document.getElementById("navVersionsLabel");
  if (navLabel) navLabel.textContent = getText("navVersionsLabel") || "Versions";

  // Support the Original Work
  renderSupportSection();

  // Track Section
  renderTrackSection();

  // Legal
  renderLegalSection();

  // Disclaimer
  renderDisclaimerSection();

  // Refresh Iconify icons
  if (window.Iconify) {
    window.Iconify.scan();
  }

  // Animate
  setTimeout(() => {
    document
      .querySelectorAll(".translator-card, .about-card")
      .forEach((el) => el.classList.add("visible"));
  }, 100);
}

// ========================================
// RENDER SUPPORT SECTION
// ========================================
function renderSupportSection() {
  document.getElementById("supportTitle").textContent = getText("supportTitle") || "";
  document.getElementById("supportSubtitle").textContent = getText("supportSubtitle") || "";

  const supportGrid = document.getElementById("supportGrid");
  if (!supportGrid) return;

  const supportItems = getText("supportItems");
  if (!Array.isArray(supportItems)) return;

  supportGrid.innerHTML = supportItems
    .map((item) => {
      if (item.id === "author-blog") {
        return `
            <div class="support-item">
              <div class="support-item-header">
                <span class="iconify" data-icon="${item.icon || "mdi:blog"}"></span>
                <span>${item.title}</span>
              </div>
              ${item.description ? `<div class="support-item-description">${item.description}</div>` : ""}
              <div class="support-button-group">
                ${(item.buttons || [])
                  .map(
                    (btn) => `
                  <a href="${btn.url}" target="_blank" rel="noopener noreferrer" class="support-btn">
                    <span class="iconify" data-icon="${btn.icon || "mdi:link"}"></span>
                    ${btn.label}
                  </a>
                `,
                  )
                  .join("")}
              </div>
            </div>
          `;
      }

      if (item.regions && Array.isArray(item.regions)) {
        let regionsHtml = "";
        item.regions.forEach((region) => {
          regionsHtml += `
              <div class="support-region-label">${region.label}</div>
              <div class="support-button-group">
                ${(region.buttons || [])
                  .map(
                    (btn) => `
                  <a href="${btn.url}" target="_blank" rel="noopener noreferrer" class="support-btn">
                    <span class="iconify" data-icon="${btn.icon || "mdi:link"}"></span>
                    ${btn.label}
                  </a>
                `,
                  )
                  .join("")}
              </div>
            `;
        });

        return `
            <div class="support-item">
              <div class="support-item-header">
                <span class="iconify" data-icon="${item.icon || "mdi:book-open-variant"}"></span>
                <span>${item.title}</span>
              </div>
              ${regionsHtml}
            </div>
          `;
      }

      return "";
    })
    .join("");
}

// ========================================
// RENDER TRACK SECTION
// ========================================
function renderTrackSection() {
  document.getElementById("trackTitle").textContent = getText("trackTitle") || "";
  document.getElementById("trackSubtitle").textContent = getText("trackSubtitle") || "";

  const trackGrid = document.getElementById("trackGrid");
  if (!trackGrid) return;

  const trackItems = getText("trackItems");
  if (!Array.isArray(trackItems)) return;

  trackGrid.innerHTML = trackItems
    .map(
      (category) => `
        <div class="track-item">
          <div class="track-item-header">
            <span class="iconify" data-icon="mdi:chart-timeline-variant"></span>
            <span>${category.category}</span>
          </div>
          <div class="support-button-group">
            ${(category.buttons || [])
              .map(
                (btn) => `
              <a href="${btn.url}" target="_blank" rel="noopener noreferrer" class="support-btn">
                <span class="iconify" data-icon="${btn.icon || "mdi:link"}"></span>
                ${btn.label}
              </a>
            `,
              )
              .join("")}
          </div>
        </div>
      `,
    )
    .join("");
}

// ========================================
// RENDER LEGAL SECTION
// ========================================
function renderLegalSection() {
  document.getElementById("legalTitle").textContent = getText("legalTitle") || "";
  const lc = document.getElementById("legalContent");
  if (lc) {
    const legalItems = getText("legalItems");
    if (Array.isArray(legalItems)) {
      lc.innerHTML = `
            <div class="legal-notice">
              <span class="iconify" data-icon="mdi:alert-circle-outline"></span>
              <div><strong>${getText("legalNotice") || ""}</strong><p>${getText("legalDesc") || ""}</p></div>
            </div>
            <div class="legal-list">${legalItems.map((item) => `<div class="legal-item"><span class="iconify" data-icon="mdi:check"></span><span>${item || ""}</span></div>`).join("")}</div>
          `;
    }
  }
}

// ========================================
// RENDER DISCLAIMER SECTION
// ========================================
function renderDisclaimerSection() {
  document.getElementById("disclaimerTitle").textContent = getText("disclaimerTitle") || "";
  const dc = document.getElementById("disclaimerContent");
  if (dc) {
    const disclaimerItems = getText("disclaimerItems");
    if (Array.isArray(disclaimerItems)) {
      dc.innerHTML = `
            <p>${getText("disclaimerText") || ""}</p>
            <ul>${disclaimerItems.map((item) => `<li><span class="iconify" data-icon="mdi:pen"></span> ${item || ""}</li>`).join("")}</ul>
            <p class="disclaimer-note">${getText("disclaimerNote") || ""}</p>
          `;
    }
  }
}

// ========================================
// CHANGELOG MANAGER
// ========================================
class ChangelogManager {
  constructor(lang) {
    this.lang = lang || "es";
    this.changelogData = [];
    this.selectedVersion = null;
    this.overlay = document.getElementById("changelogOverlay");
    this.navList = document.getElementById("changelogNavList");
    this.detailsContent = document.getElementById("changelogDetailsContent");
    this.openBtn = document.getElementById("openChangelogBtn");
    this.closeBtn = document.getElementById("closeChangelogBtn");
  }

  init() {
    if (!this.overlay) return;

    this.openBtn?.addEventListener("click", () => this.open());
    this.closeBtn?.addEventListener("click", () => this.close());
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  async loadChangelog() {
    try {
      const url =
        window.LanguageSwitch && typeof window.LanguageSwitch.getDataUrl === "function"
          ? window.LanguageSwitch.getDataUrl("changelog", this.lang) + "?v=" + Date.now()
          : `../data/changelog/${this.lang}.json?v=${Date.now()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to load changelog");
      const data = await response.json();
      this.changelogData = data;
      return data;
    } catch (e) {
      console.warn("Failed to load changelog:", e.message);
      return [];
    }
  }

  renderNav(versions) {
    if (!this.navList) return;

    if (!versions || versions.length === 0) {
      this.navList.innerHTML = `
            <div class="changelog-nav-empty">
              <span class="iconify" data-icon="mdi:alert-circle-outline"></span>
              <span>No versions available</span>
            </div>
          `;
      return;
    }

    this.navList.innerHTML = versions
      .map((entry, index) => {
        const isNew = index === 0;
        const isSelected = this.selectedVersion === entry.version;
        return `
            <div class="changelog-nav-item ${isSelected ? "selected" : ""}" 
                 data-version="${entry.version}"
                 onclick="changelogInstance.selectVersion('${entry.version}')">
              <div class="changelog-nav-item-version">${entry.version}</div>
              <div class="changelog-nav-item-date">${entry.date}</div>
              ${isNew ? `<span class="changelog-nav-item-badge">New</span>` : ""}
            </div>
          `;
      })
      .join("");

    const selectedEl = this.navList.querySelector(".changelog-nav-item.selected");
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  renderDetails(entry) {
    if (!this.detailsContent) return;

    if (!entry) {
      this.detailsContent.innerHTML = `
            <div class="changelog-details-empty">
              <span class="iconify" data-icon="mdi:alert-circle-outline"></span>
              <span>Select a version to view details</span>
            </div>
          `;
      return;
    }

    const changes = entry.changes || {};
    const categories = [
      { key: "new", icon: "mdi:star-outline", label: "New" },
      { key: "improvements", icon: "mdi:brush-outline", label: "Improvements" },
      { key: "fixes", icon: "mdi:bug-outline", label: "Fixes" },
      { key: "notes", icon: "mdi:note-text-outline", label: "Notes" },
    ];

    let changesHtml = "";
    categories.forEach((cat) => {
      if (changes[cat.key] && changes[cat.key].length > 0) {
        changesHtml += `
              <div class="changelog-details-category">
                <div class="changelog-details-category-header">
                  <span class="iconify" data-icon="${cat.icon}"></span>
                  <span class="changelog-details-category-label">${cat.label}</span>
                </div>
                <ul class="changelog-details-category-list">
                  ${changes[cat.key].map((item) => `<li>${item}</li>`).join("")}
                </ul>
              </div>
            `;
      }
    });

    this.detailsContent.innerHTML = `
          <div class="changelog-details-header">
            <div class="changelog-details-version">${entry.version}</div>
            <div class="changelog-details-meta">
              <span class="changelog-details-build">Build ${entry.build || "N/A"}</span>
              <span class="changelog-details-date">${entry.date}</span>
            </div>
            ${entry.subtitle ? `<div class="changelog-details-subtitle">${entry.subtitle}</div>` : ""}
          </div>
          <div class="changelog-details-body">
            ${changesHtml || '<p class="changelog-details-empty-changes">No changes documented for this version.</p>'}
          </div>
        `;
  }

  selectVersion(version) {
    this.selectedVersion = version;
    const entry = this.changelogData.find((e) => e.version === version);
    if (entry) {
      this.renderNav(this.changelogData);
      this.renderDetails(entry);
    }
  }

  async open() {
    if (!this.overlay) return;

    if (this.changelogData.length === 0) {
      const data = await this.loadChangelog();
      if (data && data.length > 0) {
        this.changelogData = data;
        this.selectedVersion = data[0].version;
        this.renderNav(data);
        this.renderDetails(data[0]);
      }
    }

    window.changelogInstance = this;
    this.overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  close() {
    if (this.overlay) {
      this.overlay.classList.remove("active");
      document.body.style.overflow = "";
    }
  }

  async updateLanguage(lang) {
    this.lang = lang;
    this.changelogData = [];
    this.selectedVersion = null;
    if (this.overlay.classList.contains("active")) {
      await this.open();
    }
  }
}

// ========================================
// LANGUAGE SWITCHER
// ========================================
// ========================================
// INIT
// ========================================
document.addEventListener("DOMContentLoaded", async function () {
  const data = await loadTranslations(currentLang);
  if (data) {
    renderPage(data);
  } else {
    console.error("Failed to load translations");
    document.querySelector(".about-main").innerHTML = `
          <div style="text-align:center;padding:4rem 2rem;background:rgba(255,255,255,0.4);border-radius:2rem;backdrop-filter:blur(8px);">
            <span class="iconify" data-icon="mdi:alert" style="font-size:3rem;color:var(--dusty-rose);"></span>
            <h2 style="color:var(--plum);margin:1rem 0;">Translation files not found</h2>
            <p style="color:#5f4b6b;opacity:0.7;">Please ensure the JSON files exist at <code>../data/about/es.json</code> and <code>../data/about/en.json</code></p>
          </div>
        `;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("visible");
      });
    },
    { threshold: 0.05, rootMargin: "0px 0px -20px 0px" },
  );
  document.querySelectorAll(".about-card, .translator-card").forEach((el) => observer.observe(el));

  const changelog = new ChangelogManager(currentLang);
  changelog.init();
  window.changelogInstance = changelog;

  const menuVer = Math.floor(Date.now() / 86400000);
  fetch("/src/components/menu.html?v=" + menuVer)
    .then((response) => {
      if (!response.ok) throw new Error("Error HTTP " + response.status + " al cargar el menú");
      return response.text();
    })
    .then((data) => {
      const container =
        document.getElementById("sidebar-container") || document.getElementById("menu-container");
      if (!container) return;
      const normalizedData = data
        .replace(/src="\.\/(assets\/)/g, 'src="../../$1')
        .replace(/data-route="\.\.\/\.\.\/index\.html"/g, 'data-route="../../../index.html"');
      const doc = new DOMParser().parseFromString(normalizedData, "text/html");
      const frag = document.createDocumentFragment();
      [...doc.head.childNodes, ...doc.body.childNodes].forEach((node) => {
        if (node.nodeName.toLowerCase() === "script") {
          const s = document.createElement("script");
          if (node.src) s.src = node.src;
          else s.textContent = node.textContent;
          frag.appendChild(s);
        } else {
          frag.appendChild(node.cloneNode(true));
        }
      });
      container.innerHTML = "";
      container.appendChild(frag);
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent("menuLoaded"));
      }, 100);
    })
    .catch((e) => console.warn("menu.html no disponible:", e.message));

  document.addEventListener("menuLoaded", function () {
    if (typeof window.translateMenu === "function") {
      window.translateMenu(currentLang);
    }
  });
});
