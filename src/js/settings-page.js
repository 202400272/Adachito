const VERSION = "2.3.8";
const KEYS = {
  reducedMotion: "adashima_reduced_motion",
  autoplay: "adashima_autoplay_next",
  dataSaver: "adashima_data_saver",
  mangaView: "adashima_manga_view",
  novelsView: "adashima_novels_view",
  animeView: "episodeView",
  musicView: "adashima_music_view",
  pdfView: "adashima_pdf_mode",
  hideBurger: "adashima_hide_burger_other_pages",
  compactSidebar: "adashima_sidebar_compact",
};

const copy = {
  es: {
    kicker: "ADASHIMAVERSE",
    title: "Configuración",
    subtitle: "Personaliza cómo funciona el archivo y cómo recuerda tus preferencias.",
    back: "Volver",
    languageEyebrow: "PREFERENCIAS",
    languageTitle: "Idioma",
    appearanceEyebrow: "APARIENCIA",
    appearanceTitle: "Apariencia",
    autoAppearanceTitle: "Apariencia basada en la hora",
    autoAppearanceDesc: "Adapta automáticamente el tema según la hora del día.",
    morning: "Mañana",
    afternoon: "Tarde",
    night: "Noche",
    accessibilityEyebrow: "ACCESIBILIDAD",
    accessibilityTitle: "Accesibilidad",
    reducedMotionTitle: "Reducir movimiento",
    reducedMotionDesc:
      "Reduce animaciones y transiciones, independientemente de la preferencia del sistema.",
    playbackEyebrow: "REPRODUCCIÓN",
    playbackTitle: "Reproducción",
    autoplayTitle: "Reproducir siguiente automáticamente",
    autoplayDesc: "Continúa automáticamente con el siguiente episodio o pista.",
    viewsEyebrow: "VISTAS Y LECTURA",
    viewsTitle: "Vistas predeterminadas",
    manga: "Vista de Manga",
    mangaDesc: "Vista predeterminada de la biblioteca.",
    novels: "Vista de novelas",
    novelsDesc: "Vista predeterminada de la biblioteca de novelas ligeras.",
    anime: "Vista de episodios",
    animeDesc: "Cómo se muestran los episodios de Anime.",
    music: "Vista de Música",
    musicDesc: "Vista predeterminada de la biblioteca musical.",
    pdf: "Modo del lector PDF",
    pdfDesc: "Cómo se muestran las páginas del PDF.",
    dataEyebrow: "DATOS",
    dataTitle: "Ahorrar datos",
    dataSaverTitle: "Ahorrar datos",
    dataSaverDesc:
      "Carga las imágenes de forma diferida y reduce su prioridad de red cuando es posible.",
    savedDataEyebrow: "DATOS GUARDADOS",
    savedDataTitle: "Administrar datos locales",
    resetProgress: "Restablecer progreso de lectura",
    resetProgressDesc: "Borra el progreso guardado.",
    favorites: "Borrar favoritos",
    favoritesDesc: "Borra tus favoritos de Música.",
    bookmarks: "Borrar marcadores",
    bookmarksDesc: "Borra tus marcadores guardados.",
    resetSite: "Restablecer todos los datos",
    resetSiteDesc: "Borra preferencias, progreso, favoritos y vistas guardadas.",
    navigationEyebrow: "NAVEGACIÓN",
    navigationTitle: "Navegación",
    hideBurger: "Ocultar menú en otras páginas",
    hideBurgerDesc: "Oculta el botón del menú en páginas distintas a la de inicio.",
    compactSidebar: "Barra lateral compacta",
    compactSidebarDesc: "Usa una barra lateral solo con iconos en escritorio y móvil.",
    updatesEyebrow: "ACTUALIZACIONES",
    updatesTitle: "¿Qué hay de nuevo?",
    versionDesc: "Ver las novedades de AdashimaVerse.",
    footnote:
      "Tus preferencias se almacenan localmente en tu navegador. No se suben a AdashimaVerse.",
    howSettingsEyebrow: "SOBRE ESTOS AJUSTES",
    howSettingsTitle: "Cómo funcionan estos ajustes",
    explanation: [
      "Estas preferencias se guardan localmente en este navegador, por lo que solo se aplican a este dispositivo y perfil del navegador. No se sincronizan con una cuenta.",
      "Las vistas predeterminadas se usan cuando se abre una biblioteca o lector. Si cambias una vista directamente en una página, también se actualiza la preferencia guardada de esa página.",
      "Restablecer los datos guardados elimina la información seleccionada de este navegador; no elimina ningún contenido de AdashimaVerse.",
    ],
    confirmProgress: "¿Restablecer todo el progreso de lectura? Esta acción no se puede deshacer.",
    doneProgress: "El progreso de lectura se ha restablecido.",
    confirmFavorites: "¿Borrar todos los favoritos de Música? Esta acción no se puede deshacer.",
    doneFavorites: "Los favoritos se han borrado.",
    confirmBookmarks: "¿Borrar todos los marcadores? Esta acción no se puede deshacer.",
    doneBookmarks: "Los marcadores se han borrado.",
    confirmSite:
      "¿Restablecer todos los datos guardados de AdashimaVerse? Esta acción no se puede deshacer.",
    doneSite: "Los datos guardados se han restablecido.",
    modalConfirmTitle: "Confirmar acción",
    modalSuccessTitle: "Listo",
    modalCancel: "Cancelar",
    modalConfirm: "Confirmar",
    modalClose: "Cerrar",
    views: {
      manga: ["Cuadrícula", "Lista"],
      novels: ["Cuadrícula", "Lista"],
      anime: ["Lista", "Cuadrícula"],
      music: ["Estándar", "Compacta"],
      pdf: ["Página única", "Continuo"],
    },
  },
  en: {
    kicker: "ADASHIMAVERSE",
    title: "Settings",
    subtitle: "Customize how the archive behaves and remembers your preferences.",
    back: "Back",
    languageEyebrow: "PREFERENCES",
    languageTitle: "Language",
    appearanceEyebrow: "APPEARANCE",
    appearanceTitle: "Appearance",
    autoAppearanceTitle: "Time-based appearance",
    autoAppearanceDesc: "Automatically adapt the theme to the time of day.",
    morning: "Morning",
    afternoon: "Afternoon",
    night: "Night",
    accessibilityEyebrow: "ACCESSIBILITY",
    accessibilityTitle: "Accessibility",
    reducedMotionTitle: "Reduce motion",
    reducedMotionDesc: "Reduce animations and transitions, regardless of the OS preference.",
    playbackEyebrow: "PLAYBACK",
    playbackTitle: "Playback",
    autoplayTitle: "Autoplay next",
    autoplayDesc: "Automatically continue to the next episode or music track.",
    viewsEyebrow: "VIEWS & READING",
    viewsTitle: "Default views",
    manga: "Manga view",
    mangaDesc: "Default library view.",
    novels: "Novel view",
    novelsDesc: "Default view for the Light Novel library.",
    anime: "Episode view",
    animeDesc: "How Anime episodes are displayed.",
    music: "Music view",
    musicDesc: "Default music library view.",
    pdf: "PDF reader mode",
    pdfDesc: "How PDF pages are displayed.",
    dataEyebrow: "DATA",
    dataTitle: "Data saver",
    dataSaverTitle: "Save data",
    dataSaverDesc: "Lazy-load images and lower their network priority where possible.",
    savedDataEyebrow: "SAVED DATA",
    savedDataTitle: "Manage local data",
    resetProgress: "Reset reading progress",
    resetProgressDesc: "Delete saved reading progress.",
    favorites: "Clear favorites",
    favoritesDesc: "Delete saved Music favorites.",
    bookmarks: "Clear bookmarks",
    bookmarksDesc: "Delete saved bookmarks.",
    resetSite: "Reset all site data",
    resetSiteDesc: "Delete saved preferences, progress, favorites, and views.",
    navigationEyebrow: "NAVIGATION",
    navigationTitle: "Navigation",
    hideBurger: "Hide menu on other pages",
    compactSidebar: "Compact sidebar",
    compactSidebarDesc: "Use an icon-only sidebar on desktop and mobile.",
    hideBurgerDesc: "Hide the mobile menu button away from the homepage.",
    updatesEyebrow: "UPDATES",
    updatesTitle: "What's new?",
    versionDesc: "See what's new in AdashimaVerse.",
    footnote:
      "Your preferences are stored locally in your browser. They are not uploaded to AdashimaVerse.",
    howSettingsEyebrow: "ABOUT THESE SETTINGS",
    howSettingsTitle: "How these settings work",
    explanation: [
      "These preferences are saved locally in this browser, so they apply only to this device and browser profile. They are not synced to an account.",
      "Default views are used when a library or reader opens. If you change a view directly on a page, that page’s saved preference is updated too.",
      "Resetting saved data removes the selected information from this browser; it does not delete any AdashimaVerse content.",
    ],
    confirmProgress: "Reset all saved reading progress? This cannot be undone.",
    doneProgress: "Reading progress has been reset.",
    confirmFavorites: "Clear all saved Music favorites? This cannot be undone.",
    doneFavorites: "Favorites have been cleared.",
    confirmBookmarks: "Clear all saved bookmarks? This cannot be undone.",
    doneBookmarks: "Bookmarks have been cleared.",
    confirmSite: "Reset all saved AdashimaVerse data? This cannot be undone.",
    doneSite: "Saved data has been reset.",
    modalConfirmTitle: "Confirm action",
    modalSuccessTitle: "Done",
    modalCancel: "Cancel",
    modalConfirm: "Confirm",
    modalClose: "Close",
    views: {
      manga: ["Grid", "List"],
      novels: ["Grid", "List"],
      anime: ["List", "Grid"],
      music: ["Standard", "Compact"],
      pdf: ["Single page", "Continuous"],
    },
  },
  tg: {
    kicker: "ADASHIMAVERSE",
    title: "Mga Setting",
    subtitle:
      "I-personalize kung paano gumagana ang archive at kung paano nito iniingatan ang iyong mga preference.",
    back: "Bumalik",
    languageEyebrow: "PREFERENCES",
    languageTitle: "Wika",
    appearanceEyebrow: "ITSURA",
    appearanceTitle: "Itsura",
    autoAppearanceTitle: "Itsura ayon sa oras",
    autoAppearanceDesc: "Awtomatikong iangkop ang tema ayon sa oras ng araw.",
    morning: "Umaga",
    afternoon: "Hapon",
    night: "Gabi",
    accessibilityEyebrow: "ACCESSIBILITY",
    accessibilityTitle: "Accessibility",
    reducedMotionTitle: "Bawasan ang galaw",
    reducedMotionDesc: "Bawasan ang animations at transitions kahit ano ang system preference.",
    playbackEyebrow: "PAGPAPALABAS",
    playbackTitle: "Playback",
    autoplayTitle: "Awtomatikong susunod",
    autoplayDesc: "Awtomatikong magpatuloy sa susunod na episode o music track.",
    viewsEyebrow: "VIEWS AT PAGBASA",
    viewsTitle: "Default na views",
    manga: "Manga view",
    mangaDesc: "Default na view ng library.",
    novels: "Novel view",
    novelsDesc: "Default na view ng Light Novel library.",
    anime: "Episode view",
    animeDesc: "Kung paano ipinapakita ang Anime episodes.",
    music: "Music view",
    musicDesc: "Default na view ng music library.",
    pdf: "PDF reader mode",
    pdfDesc: "Kung paano ipinapakita ang PDF pages.",
    dataEyebrow: "DATA",
    dataTitle: "Data saver",
    dataSaverTitle: "Mag-save ng data",
    dataSaverDesc: "I-lazy-load ang images at babaan ang network priority kung maaari.",
    savedDataEyebrow: "NAKAIMPLENG DATA",
    savedDataTitle: "Pamahalaan ang local data",
    resetProgress: "I-reset ang reading progress",
    resetProgressDesc: "Burahin ang naka-save na reading progress.",
    favorites: "Burahin ang favorites",
    favoritesDesc: "Burahin ang Music favorites.",
    bookmarks: "Burahin ang bookmarks",
    bookmarksDesc: "Burahin ang naka-save na bookmarks.",
    resetSite: "I-reset ang lahat ng site data",
    resetSiteDesc: "Burahin ang preferences, progress, favorites, at views.",
    navigationEyebrow: "NAVIGATION",
    navigationTitle: "Navigation",
    hideBurger: "Itago ang menu sa ibang pahina",
    compactSidebar: "Compact na sidebar",
    compactSidebarDesc: "Gamitin ang sidebar na puro icons sa desktop at mobile.",
    hideBurgerDesc: "Itago ang mobile menu button sa mga pahinang hindi homepage.",
    updatesEyebrow: "MGA UPDATE",
    updatesTitle: "Ano ang bago?",
    versionDesc: "Tingnan ang mga bagong update ng AdashimaVerse.",
    footnote:
      "Ang iyong preferences ay naka-save lamang sa browser. Hindi ito ina-upload sa AdashimaVerse.",
    howSettingsEyebrow: "TUNGKOL SA MGA SETTING",
    howSettingsTitle: "Paano gumagana ang mga setting na ito",
    explanation: [
      "Ang mga preference na ito ay naka-save lang sa browser na ito, kaya para lang ito sa device at browser profile na ito. Hindi ito sini-sync sa isang account.",
      "Ginagamit ang default views kapag binuksan ang isang library o reader. Kapag nagpalit ka ng view direkta sa isang page, naa-update rin ang naka-save na preference nito.",
      "Kapag nag-reset ka ng saved data, aalisin lang ang napiling impormasyon sa browser na ito; hindi nito dine-delete ang anumang content ng AdashimaVerse.",
    ],
    howSettingsEyebrow: "TUNGKOL SA MGA SETTING",
    howSettingsTitle: "Paano gumagana ang mga setting na ito",
    explanation: [
      "Ang mga preference na ito ay naka-save lang sa browser na ito, kaya para lang ito sa device at browser profile na ito. Hindi ito sini-sync sa isang account.",
      "Ginagamit ang default views kapag binuksan ang isang library o reader. Kapag nagpalit ka ng view direkta sa isang page, naa-update rin ang naka-save na preference nito.",
      "Kapag nag-reset ka ng saved data, aalisin lang ang napiling impormasyon sa browser na ito; hindi nito dine-delete ang anumang content ng AdashimaVerse.",
    ],
    confirmProgress: "I-reset ang lahat ng reading progress? Hindi na ito maibabalik.",
    doneProgress: "Na-reset na ang reading progress.",
    confirmFavorites: "Burahin ang lahat ng Music favorites? Hindi na ito maibabalik.",
    doneFavorites: "Nabura na ang favorites.",
    confirmBookmarks: "Burahin ang lahat ng bookmarks? Hindi na ito maibabalik.",
    doneBookmarks: "Nabura na ang bookmarks.",
    confirmSite: "I-reset ang lahat ng naka-save na AdashimaVerse data? Hindi na ito maibabalik.",
    doneSite: "Na-reset na ang naka-save na data.",
    views: {
      manga: ["Grid", "Listahan"],
      novels: ["Grid", "Listahan"],
      anime: ["Listahan", "Grid"],
      music: ["Standard", "Compact"],
      pdf: ["Isang pahina", "Tuluy-tuloy"],
    },
  },
};

function getLang() {
  return ["es", "en", "tg"].includes(localStorage.getItem("lang"))
    ? localStorage.getItem("lang")
    : "es";
}
function bool(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "true";
  } catch {
    return fallback;
  }
}
function setBool(key, value) {
  try {
    localStorage.setItem(key, String(Boolean(value)));
  } catch {
    /* ignore storage errors */
  }
}
function setValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore storage errors */
  }
}
function remove(keys) {
  try {
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore storage errors */
  }
}

function applyReducedMotion(enabled) {
  document.documentElement.classList.toggle("adashima-reduced-motion", enabled);
  document.body.classList.toggle("adashima-reduced-motion", enabled);
}
function applyDataSaver(enabled) {
  document.documentElement.classList.toggle("adashima-data-saver", enabled);
  document.body.classList.toggle("adashima-data-saver", enabled);
  document.querySelectorAll("img").forEach((img) => {
    if (enabled) {
      img.loading = "lazy";
      img.setAttribute("fetchpriority", "low");
    }
  });
}
function applyBurgerSetting() {
  if (window.applyBurgerVisibility) window.applyBurgerVisibility();
}

function renderLanguage(lang) {
  const t = copy[lang] || copy.en;
  const map = {
    settingsKicker: "kicker",
    settingsTitle: "title",
    settingsSubtitle: "subtitle",
    languageEyebrow: "languageEyebrow",
    languageTitle: "languageTitle",
    appearanceEyebrow: "appearanceEyebrow",
    appearanceTitle: "appearanceTitle",
    autoAppearanceTitle: "autoAppearanceTitle",
    autoAppearanceDesc: "autoAppearanceDesc",
    themeMorning: "morning",
    themeAfternoon: "afternoon",
    themeNight: "night",
    accessibilityEyebrow: "accessibilityEyebrow",
    accessibilityTitle: "accessibilityTitle",
    reducedMotionTitle: "reducedMotionTitle",
    reducedMotionDesc: "reducedMotionDesc",
    playbackEyebrow: "playbackEyebrow",
    playbackTitle: "playbackTitle",
    autoplayTitle: "autoplayTitle",
    autoplayDesc: "autoplayDesc",
    viewsEyebrow: "viewsEyebrow",
    viewsTitle: "viewsTitle",
    mangaViewTitle: "manga",
    mangaViewDesc: "mangaDesc",
    novelsViewTitle: "novels",
    novelsViewDesc: "novelsDesc",
    animeViewTitle: "anime",
    animeViewDesc: "animeDesc",
    musicViewTitle: "music",
    musicViewDesc: "musicDesc",
    pdfViewTitle: "pdf",
    pdfViewDesc: "pdfDesc",
    dataEyebrow: "dataEyebrow",
    dataTitle: "dataTitle",
    dataSaverTitle: "dataSaverTitle",
    dataSaverDesc: "dataSaverDesc",
    savedDataEyebrow: "savedDataEyebrow",
    savedDataTitle: "savedDataTitle",
    resetProgressTitle: "resetProgress",
    resetProgressDesc: "resetProgressDesc",
    clearFavoritesTitle: "favorites",
    clearFavoritesDesc: "favoritesDesc",
    clearBookmarksTitle: "bookmarks",
    clearBookmarksDesc: "bookmarksDesc",
    resetSiteTitle: "resetSite",
    resetSiteDesc: "resetSiteDesc",
    navigationEyebrow: "navigationEyebrow",
    navigationTitle: "navigationTitle",
    hideBurgerTitle: "hideBurger",
    hideBurgerDesc: "hideBurgerDesc",
    compactSidebarTitle: "compactSidebar",
    compactSidebarDesc: "compactSidebarDesc",
    updatesEyebrow: "updatesEyebrow",
    updatesTitle: "updatesTitle",
    versionDesc: "versionDesc",
    settingsFootnote: "footnote",
    howSettingsEyebrow: "howSettingsEyebrow",
    howSettingsTitle: "howSettingsTitle",
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t[key];
  });
  const backButton = document.getElementById("settingsBackButton");
  const backButtonText = document.getElementById("settingsBackButtonText");
  if (backButton) backButton.setAttribute("aria-label", t.back);
  if (backButtonText) backButtonText.textContent = t.back;
  const explanation = document.getElementById("settingsExplanation");
  if (explanation && Array.isArray(t.explanation))
    explanation.innerHTML = t.explanation.map((text) => `<p>${text}</p>`).join("");
  document.documentElement.lang = lang;
  document.querySelectorAll(".language-option").forEach((button) => {
    const active = button.dataset.lang === lang;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const labels = t.views;
  [
    ["default-manga-view", labels.manga],
    ["default-novels-view", labels.novels],
    ["default-anime-view", labels.anime],
    ["default-music-view", labels.music],
    ["default-pdf-view", labels.pdf],
  ].forEach(([id, values]) => {
    const select = document.getElementById(id);
    if (select)
      [...select.options].forEach((option, i) => {
        option.textContent = values[i];
      });
  });
}

function syncUI() {
  document.getElementById("appearance-toggle-checkbox").checked = bool(
    "adashima_time_based_appearance",
    true,
  );
  document.getElementById("reduced-motion-toggle-checkbox").checked = bool(
    KEYS.reducedMotion,
    false,
  );
  document.getElementById("autoplay-next-toggle-checkbox").checked = bool(KEYS.autoplay, true);
  document.getElementById("data-saver-toggle-checkbox").checked = bool(KEYS.dataSaver, false);
  document.getElementById("hide-burger-toggle-checkbox").checked = bool(KEYS.hideBurger, false);
  document.getElementById("compact-sidebar-toggle-checkbox").checked = bool(
    KEYS.compactSidebar,
    false,
  );
  const views = [
    ["default-manga-view", KEYS.mangaView, "grid"],
    ["default-novels-view", KEYS.novelsView, "grid"],
    ["default-anime-view", KEYS.animeView, "list"],
    ["default-music-view", KEYS.musicView, "standard"],
    ["default-pdf-view", KEYS.pdfView, "single"],
  ];
  views.forEach(([id, key, fallback]) => {
    const el = document.getElementById(id);
    if (el) el.value = localStorage.getItem(key) || fallback;
  });
  const auto = bool("adashima_time_based_appearance", true);
  document.getElementById("themeOptions").hidden = auto;
  const activeTheme =
    window.getActiveTheme?.() || localStorage.getItem("adashima_manual_appearance") || "night";
  document
    .querySelectorAll(".theme-option")
    .forEach((button) => button.classList.toggle("active", button.dataset.theme === activeTheme));
  applyReducedMotion(bool(KEYS.reducedMotion, false));
  applyDataSaver(bool(KEYS.dataSaver, false));
}

function wire() {
  document.querySelectorAll(".language-option").forEach((button) =>
    button.addEventListener("click", () => {
      const lang = button.dataset.lang;
      localStorage.setItem("lang", lang);
      localStorage.setItem("preferredLanguage", lang);
      localStorage.setItem("language", lang);
      localStorage.setItem("adashima_manga_lang", lang);
      renderLanguage(lang);
      window.translateMenu?.(lang);
      document.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
    }),
  );
  const backButton = document.getElementById("settingsBackButton");

  backButton?.addEventListener("click", () => {
    const referrer = document.referrer;
    const target = referrer && referrer.startsWith(window.location.origin) ? referrer : "/";

    try {
      window.location.replace(target);
    } catch {
      window.location.href = target;
    }
  });

  document.getElementById("appearance-toggle-checkbox").addEventListener("change", (e) => {
    window.setAppearanceTheme?.(null, e.target.checked);
    syncUI();
  });
  document.querySelectorAll(".theme-option").forEach((button) =>
    button.addEventListener("click", () => {
      window.setAppearanceTheme?.(button.dataset.theme, false);
      syncUI();
    }),
  );
  document.getElementById("reduced-motion-toggle-checkbox").addEventListener("change", (e) => {
    setBool(KEYS.reducedMotion, e.target.checked);
    applyReducedMotion(e.target.checked);
  });
  document.getElementById("autoplay-next-toggle-checkbox").addEventListener("change", (e) => {
    setBool(KEYS.autoplay, e.target.checked);
    window.dispatchEvent(
      new CustomEvent("adashimaAutoplayChanged", { detail: { enabled: e.target.checked } }),
    );
  });
  document.getElementById("data-saver-toggle-checkbox").addEventListener("change", (e) => {
    setBool(KEYS.dataSaver, e.target.checked);
    applyDataSaver(e.target.checked);
    window.dispatchEvent(
      new CustomEvent("adashimaDataSaverChanged", { detail: { enabled: e.target.checked } }),
    );
  });
  const viewMap = [
    ["default-manga-view", KEYS.mangaView],
    ["default-novels-view", KEYS.novelsView],
    ["default-anime-view", KEYS.animeView],
    ["default-music-view", KEYS.musicView],
    ["default-pdf-view", KEYS.pdfView],
  ];
  viewMap.forEach(([id, key]) =>
    document.getElementById(id).addEventListener("change", (e) => {
      setValue(key, e.target.value);
      window.dispatchEvent(
        new CustomEvent("adashimaViewPreferenceChanged", {
          detail: { key, value: e.target.value },
        }),
      );
    }),
  );
  document.getElementById("hide-burger-toggle-checkbox").addEventListener("change", (e) => {
    setBool(KEYS.hideBurger, e.target.checked);
    applyBurgerSetting();
  });
  document.getElementById("compact-sidebar-toggle-checkbox").addEventListener("change", (e) => {
    setBool(KEYS.compactSidebar, e.target.checked);
    window.dispatchEvent(
      new CustomEvent("adashimaSidebarCompactChanged", { detail: { enabled: e.target.checked } }),
    );
  });

  const t = () => copy[getLang()] || copy.en;

  const modal = document.getElementById("settingsActionModal");
  const modalTitle = document.getElementById("settingsActionModalTitle");
  const modalMessage = document.getElementById("settingsActionModalMessage");
  const modalIcon = document.getElementById("settingsActionModalIcon");
  const modalIconGlyph = modalIcon?.querySelector("i");
  const modalCancel = document.getElementById("settingsActionModalCancel");
  const modalConfirm = document.getElementById("settingsActionModalConfirm");
  const modalClose = document.getElementById("settingsActionModalClose");
  let pendingAction = null;

  function closeActionModal() {
    if (!modal) return;
    modal.classList.remove("open", "success");
    modal.setAttribute("aria-hidden", "true");
    pendingAction = null;
    document.body.classList.remove("settings-modal-open");
  }

  function openConfirmModal(message, action) {
    if (!modal) return;
    const labels = t();
    pendingAction = action;
    modal.classList.remove("success");
    modalTitle.textContent = labels.modalConfirmTitle;
    modalMessage.textContent = message;
    if (modalIconGlyph) modalIconGlyph.className = "fas fa-triangle-exclamation";
    modalCancel.hidden = false;
    modalConfirm.hidden = false;
    modalClose.hidden = true;
    modalConfirm.textContent = labels.modalConfirm;
    modalCancel.textContent = labels.modalCancel;
    modal.setAttribute("aria-hidden", "false");
    modal.classList.add("open");
    document.body.classList.add("settings-modal-open");
    modalConfirm.focus();
  }

  function showSuccessModal(message) {
    if (!modal) return;
    const labels = t();
    pendingAction = null;
    modal.classList.add("success");
    modalTitle.textContent = labels.modalSuccessTitle;
    modalMessage.textContent = message;
    if (modalIconGlyph) modalIconGlyph.className = "fas fa-circle-check";
    modalCancel.hidden = true;
    modalConfirm.hidden = true;
    modalClose.hidden = false;
    modalClose.textContent = labels.modalClose;
    modal.setAttribute("aria-hidden", "false");
    modal.classList.add("open");
    document.body.classList.add("settings-modal-open");
    modalClose.focus();
  }

  modal?.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-settings-modal-close]"))
      closeActionModal();
  });
  modalCancel?.addEventListener("click", closeActionModal);
  modalClose?.addEventListener("click", closeActionModal);
  modalConfirm?.addEventListener("click", () => {
    const action = pendingAction;
    if (!action) return;
    action();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal?.classList.contains("open")) closeActionModal();
  });

  document.getElementById("reset-reading-progress-btn").addEventListener("click", () => {
    openConfirmModal(t().confirmProgress, () => {
      remove(["adashima_reading_progress", "adashima_anime_progress", "adashima_last_channel"]);
      showSuccessModal(t().doneProgress);
    });
  });
  document.getElementById("clear-favorites-btn").addEventListener("click", () => {
    openConfirmModal(t().confirmFavorites, () => {
      remove(["adashima_music_favorites_v2"]);
      showSuccessModal(t().doneFavorites);
    });
  });
  document.getElementById("clear-bookmarks-btn").addEventListener("click", () => {
    openConfirmModal(t().confirmBookmarks, () => {
      remove(["adashima_bookmarks"]);
      showSuccessModal(t().doneBookmarks);
    });
  });
  document.getElementById("reset-site-data-btn").addEventListener("click", () => {
    openConfirmModal(t().confirmSite, () => {
      const lang = localStorage.getItem("lang") || "es";
      remove([
        "adashima_bookmarks",
        "adashima_reading_progress",
        "adashima_anime_progress",
        "adashima_last_channel",
        "adashima_music_favorites_v2",
        "adashima_manga_view",
        "adashima_novels_view",
        "adashima_pdf_mode",
        "adashima_music_view",
        "episodeView",
        "adashima_folder_state",
        "adashima_volume",
        "adashima_brightness",
        "adashima_reader_settings",
        "adashima_time_based_appearance",
        "adashima_manual_appearance",
        "adashima_reduced_motion",
        "adashima_autoplay_next",
        "adashima_data_saver",
        "adashima_hide_burger_other_pages",
        "adashima_sidebar_compact",
      ]);
      localStorage.setItem("lang", lang);
      syncUI();
      window.updateTimeTheme?.();
      applyBurgerSetting();
      showSuccessModal(t().doneSite);
    });
  });
}

async function loadMenu() {
  const response = await fetch("/src/components/menu.html?v=" + Math.floor(Date.now() / 86400000), {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to load menu");
  const normalized = (await response.text())
    .replace(/src="\.\/(assets\/)/g, 'src="../../$1')
    .replace(/data-route="\.\.\/\.\.\/index\.html"/g, 'data-route="../../../index.html"');
  const doc = new DOMParser().parseFromString(normalized, "text/html");
  const container = document.getElementById("sidebar-container");
  [...doc.head.childNodes, ...doc.body.childNodes].forEach((node) => {
    if (node.nodeName.toLowerCase() === "script") {
      const script = document.createElement("script");
      if (node.src) script.src = node.src;
      else script.textContent = node.textContent;
      container.appendChild(script);
    } else container.appendChild(node.cloneNode(true));
  });
  window.translateMenu?.(getLang());
  applyBurgerSetting();
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("versionTitle").textContent = `Version ${VERSION}`;
  renderLanguage(getLang());
  try {
    await loadMenu();
  } catch (error) {
    console.error(error);
  }
  syncUI();
  wire();
});
