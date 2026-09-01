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
let isInitialized = false;
let contentData = null;
let rewardsData = null;
let constellationsData = null;
let REWARDS = [];
let CONSTELLATIONS = [];

const STORAGE_KEY = "adashima_constellation_v2";
const TOTAL_CONSTELLATIONS = 10;

let canvas, ctx;
let stars = [];
let completedCount = 0;
let completedConsts = new Set();
let soundEnabled = false;
let dragging = null;
let dragOffX = 0,
  dragOffY = 0;
let _mouseX = 0,
  _mouseY = 0;
let audioCtx = null;

function getEstrellaDataFolderUrl(folder, lang) {
  if (window.LanguageSwitch && typeof window.LanguageSwitch.getDataFolderUrl === "function") {
    return window.LanguageSwitch.getDataFolderUrl(folder);
  }

  if (window.LanguageSwitch && typeof window.LanguageSwitch.getDataUrl === "function") {
    const url = new URL(window.LanguageSwitch.getDataUrl(folder, lang), window.location.href);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/[^/]*$/, "");
    return url.href.endsWith("/") ? url.href : url.href + "/";
  }

  return `/src/data/${folder}/`;
}

async function loadContent(lang) {
  try {
    const url =
      window.LanguageSwitch && typeof window.LanguageSwitch.getDataUrl === "function"
        ? window.LanguageSwitch.getDataUrl("estrella", lang)
        : `/src/data/estrella/${lang}.json?v=${APP_VERSION}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
      throw new Error("Empty language payload");
    }
    return data;
  } catch (e) {
    if (lang !== "es") {
      try {
        const folderUrl = getEstrellaDataFolderUrl("estrella", lang);
        const fallback = await fetch(folderUrl + "es.json?v=" + APP_VERSION, {
          cache: "no-store",
        });
        if (fallback.ok) {
          const fallbackData = await fallback.json();
          if (
            fallbackData &&
            typeof fallbackData === "object" &&
            Object.keys(fallbackData).length > 0
          ) {
            return fallbackData;
          }
        }
      } catch {
        // Ignore persistence or optional browser API failures.
      }
    }
    if (lang === "es") {
      try {
        const folderUrl = getEstrellaDataFolderUrl("estrella", lang);
        const fallback = await fetch(folderUrl + "en.json?v=" + APP_VERSION, {
          cache: "no-store",
        });
        if (fallback.ok) {
          const fallbackData = await fallback.json();
          if (
            fallbackData &&
            typeof fallbackData === "object" &&
            Object.keys(fallbackData).length > 0
          ) {
            return fallbackData;
          }
        }
      } catch {
        // Ignore persistence or optional browser API failures.
      }
    }
    console.warn("Failed to load language file:", e.message);
    return null;
  }
}

async function loadRewards(lang) {
  try {
    const folderUrl = getEstrellaDataFolderUrl("estrella", lang);
    const response = await fetch(`${folderUrl}rewards-${lang}.json?v=${APP_VERSION}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (e) {
    if (lang !== "es") {
      try {
        const folderUrl = getEstrellaDataFolderUrl("estrella", lang);
        const fallback = await fetch(`${folderUrl}rewards-es.json?v=${APP_VERSION}`, {
          cache: "no-store",
        });
        if (fallback.ok) return await fallback.json();
      } catch {
        // Ignore persistence or optional browser API failures.
      }
    }
    console.warn("Failed to load rewards file:", e.message);
    return null;
  }
}

async function loadConstellations(lang) {
  try {
    const folderUrl = getEstrellaDataFolderUrl("estrella", lang);
    const response = await fetch(`${folderUrl}constellations-${lang}.json?v=${APP_VERSION}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (e) {
    if (lang !== "es") {
      try {
        const folderUrl = getEstrellaDataFolderUrl("estrella", lang);
        const fallback = await fetch(`${folderUrl}constellations-es.json?v=${APP_VERSION}`, {
          cache: "no-store",
        });
        if (fallback.ok) return await fallback.json();
      } catch {
        // Ignore persistence or optional browser API failures.
      }
    }
    console.warn("Failed to load constellations file:", e.message);
    return null;
  }
}

async function loadAllData(lang) {
  const [langDataResult, rewardsDataResult, constellationsDataResult] = await Promise.allSettled([
    loadContent(lang),
    loadRewards(lang),
    loadConstellations(lang),
  ]);

  contentData = langDataResult.status === "fulfilled" ? langDataResult.value : null;
  rewardsData = rewardsDataResult.status === "fulfilled" ? rewardsDataResult.value : null;
  constellationsData =
    constellationsDataResult.status === "fulfilled" ? constellationsDataResult.value : null;

  if (constellationsData) {
    CONSTELLATIONS = constellationsData.constellations || [];
  } else {
    CONSTELLATIONS = [];
  }

  if (rewardsData) {
    REWARDS = rewardsData.rewards || [];
  } else {
    REWARDS = [];
  }

  return { langData: contentData, rewardsData, constellationsData };
}

function getString(key) {
  if (!contentData) return key;
  const val = contentData[key];
  if (typeof val === "string") return val;
  return val || key;
}

function renderUI() {
  if (!contentData) return;

  document.getElementById("page-title").textContent = getString("pageTitle");
  document.getElementById("page-subtitle").textContent = getString("pageSubtitle");

  const logoSubEl = document.getElementById("sidebar-logo-sub");
  if (contentData.sidebarLogo) {
    logoSubEl.textContent = contentData.sidebarLogo;
    logoSubEl.style.display = "";
  } else {
    logoSubEl.textContent = "";
    logoSubEl.style.display = "none";
  }
  document.getElementById("sidebar-fb-text").textContent = getString("sidebarFacebook");
  document.getElementById("sidebar-constellations-label").textContent =
    getString("sidebarConstellations");
  document.getElementById("sidebar-unlocks-label").textContent = getString("sidebarUnlocks");
  document.getElementById("sidebar-profiles-label").textContent = getString("sidebarProfiles");
  document.getElementById("sidebar-novel-status").textContent = getString("sidebarNovelStatus");
  document.getElementById("sidebar-novel-badge").textContent = getString("sidebarNovelBadge");
  document.getElementById("sidebar-support-label").textContent = getString("sidebarSupport");
  document.getElementById("sidebar-link-novel").textContent = getString("sidebarLinkNovel");
  document.getElementById("sidebar-link-manga").textContent = getString("sidebarLinkManga");
  document.getElementById("sidebar-link-blog").textContent = getString("sidebarLinkBlog");
  document.getElementById("sidebar-back-text").textContent = getString("sidebarBackHome");
  document.getElementById("sidebar-unlocks-empty").textContent = getString("sidebarUnlocksEmpty");
  document.getElementById("reset-message").textContent = getString("resetConfirm");
  document.getElementById("reset-cancel").textContent = getString("resetCancel");
  document.getElementById("reset-confirm-btn").textContent = getString("resetConfirmBtn");

  document.getElementById("hud-help").textContent = getString("hudHelp");
  document.getElementById("hud-reset").textContent = getString("hudReset");
  document.getElementById("sound-btn").title = getString("soundTitle");

  updateDownloadSummaryText();
  document.getElementById("final-download-btn").textContent = getString("downloadAllStories");
  document.getElementById("final-title").innerHTML = getString("finalTitle");
  document.getElementById("final-close-btn").textContent = getString("finalClose");

  document.getElementById("reward-title").textContent = getString("rewardTitle");
  document.getElementById("reward-continue-btn").textContent = getString("continueButton");
  document.getElementById("reward-pdf-label").textContent = getString("downloadStoryPdf");

  document.getElementById("instructions-title").textContent = getString("helpTitle");
  document.getElementById("instructions-body").innerHTML = getString("helpText");
  document.getElementById("instructions-btn").textContent = getString("helpButton");

  document.getElementById("profile-adachi-title").textContent = getString("profileAdachiTitle");
  document.getElementById("profile-adachi-name").innerHTML = getString("profileAdachiName");
  document.getElementById("profile-adachi-food").textContent = getString("profileAdachiFood");
  document.getElementById("profile-adachi-color").textContent = getString("profileAdachiColor");
  document.getElementById("profile-adachi-genre").textContent = getString("profileAdachiGenre");
  document.getElementById("profile-adachi-person").textContent = getString("profileAdachiPerson");
  document.getElementById("profile-adachi-reborn").textContent = getString("profileAdachiReborn");
  document.getElementById("profile-adachi-vacation").textContent =
    getString("profileAdachiVacation");
  document.getElementById("profile-adachi-type").textContent = getString("profileAdachiLike");
  document.getElementById("profile-adachi-call").textContent = getString("profileAdachiCall");
  document.getElementById("profile-adachi-heart").textContent = getString("profileAdachiHeart");
  document.getElementById("profile-adachi-date").textContent = getString("profileAdachiDate");

  document.getElementById("profile-shimamura-title").textContent =
    getString("profileShimamuraTitle");
  document.getElementById("profile-shimamura-name").innerHTML = getString("profileShimamuraName");
  document.getElementById("profile-shimamura-food").textContent = getString("profileShimamuraFood");
  document.getElementById("profile-shimamura-color").textContent =
    getString("profileShimamuraColor");
  document.getElementById("profile-shimamura-genre").textContent =
    getString("profileShimamuraGenre");
  document.getElementById("profile-shimamura-person").textContent =
    getString("profileShimamuraPerson");
  document.getElementById("profile-shimamura-reborn").textContent =
    getString("profileShimamuraReborn");
  document.getElementById("profile-shimamura-vacation").textContent = getString(
    "profileShimamuraVacation",
  );
  document.getElementById("profile-shimamura-type").textContent = getString("profileShimamuraLike");
  document.getElementById("profile-shimamura-call").textContent = getString("profileShimamuraCall");
  document.getElementById("profile-shimamura-heart").textContent =
    getString("profileShimamuraHeart");
  document.getElementById("profile-shimamura-date").textContent = getString("profileShimamuraDate");

  document.getElementById("profile-favorite-label").textContent = getString("profileFavorite");
  document.getElementById("profile-favorite-label2").textContent = getString("profileFavorite");
  document.getElementById("profile-whatif-label").textContent = getString("profileWhatIf");
  document.getElementById("profile-whatif-label2").textContent = getString("profileWhatIf");
  document.getElementById("profile-love-label").textContent = getString("profileLove");
  document.getElementById("profile-love-label2").textContent = getString("profileLove");

  document.getElementById("profile-label-food").textContent = getString("profileLabelFood");
  document.getElementById("profile-label-food2").textContent = getString("profileLabelFood");
  document.getElementById("profile-label-color").textContent = getString("profileLabelColor");
  document.getElementById("profile-label-color2").textContent = getString("profileLabelColor");
  document.getElementById("profile-label-genre").textContent = getString("profileLabelGenre");
  document.getElementById("profile-label-genre2").textContent = getString("profileLabelGenre");
  document.getElementById("profile-label-person").textContent = getString("profileLabelPerson");
  document.getElementById("profile-label-person2").textContent = getString("profileLabelPerson");
  document.getElementById("profile-label-reborn").textContent = getString("profileLabelReborn");
  document.getElementById("profile-label-reborn2").textContent = getString("profileLabelReborn");
  document.getElementById("profile-label-vacation").textContent = getString("profileLabelVacation");
  document.getElementById("profile-label-vacation2").textContent =
    getString("profileLabelVacation");
  document.getElementById("profile-label-like").textContent = getString("profileLabelLike");
  document.getElementById("profile-label-like2").textContent = getString("profileLabelLike");
  document.getElementById("profile-label-confessed").textContent =
    getString("profileLabelConfessed");
  document.getElementById("profile-label-confessed2").textContent =
    getString("profileLabelConfessed");
  document.getElementById("profile-label-type").textContent = getString("profileLabelType");
  document.getElementById("profile-label-type2").textContent = getString("profileLabelType");
  document.getElementById("profile-label-call").textContent = getString("profileLabelCall");
  document.getElementById("profile-label-call2").textContent = getString("profileLabelCall");
  document.getElementById("profile-label-heart").textContent = getString("profileLabelHeart");
  document.getElementById("profile-label-heart2").textContent = getString("profileLabelHeart");
  document.getElementById("profile-label-date").textContent = getString("profileLabelDate");
  document.getElementById("profile-label-date2").textContent = getString("profileLabelDate");

  document.querySelectorAll("#yes-label, #yes-label2, #yes-label3, #yes-label4").forEach((el) => {
    el.textContent = getString("yes");
  });
  document.querySelectorAll("#no-label, #no-label2, #no-label3, #no-label4").forEach((el) => {
    el.textContent = getString("no");
  });

  document.querySelectorAll("#profile-download-label, #profile-download-label2").forEach((el) => {
    el.textContent = getString("downloadProfile");
  });
  document.querySelectorAll("#profile-close-label, #profile-close-label2").forEach((el) => {
    el.textContent = getString("closeButton");
  });

  document.documentElement.lang = currentLang;
}

function updateDownloadSummaryText() {
  const summaryText = document.getElementById("final-download-text");
  if (summaryText) {
    summaryText.textContent = getString("downloadAllText");
  }
}

function updateProfileContent() {
  if (!contentData) return;

  document.getElementById("profile-adachi-title").textContent = getString("profileAdachiTitle");
  document.getElementById("profile-adachi-name").innerHTML = getString("profileAdachiName");
  document.getElementById("profile-adachi-food").textContent = getString("profileAdachiFood");
  document.getElementById("profile-adachi-color").textContent = getString("profileAdachiColor");
  document.getElementById("profile-adachi-genre").textContent = getString("profileAdachiGenre");
  document.getElementById("profile-adachi-person").textContent = getString("profileAdachiPerson");
  document.getElementById("profile-adachi-reborn").textContent = getString("profileAdachiReborn");
  document.getElementById("profile-adachi-vacation").textContent =
    getString("profileAdachiVacation");
  document.getElementById("profile-adachi-type").textContent = getString("profileAdachiLike");
  document.getElementById("profile-adachi-call").textContent = getString("profileAdachiCall");
  document.getElementById("profile-adachi-heart").textContent = getString("profileAdachiHeart");
  document.getElementById("profile-adachi-date").textContent = getString("profileAdachiDate");

  document.getElementById("profile-shimamura-title").textContent =
    getString("profileShimamuraTitle");
  document.getElementById("profile-shimamura-name").innerHTML = getString("profileShimamuraName");
  document.getElementById("profile-shimamura-food").textContent = getString("profileShimamuraFood");
  document.getElementById("profile-shimamura-color").textContent =
    getString("profileShimamuraColor");
  document.getElementById("profile-shimamura-genre").textContent =
    getString("profileShimamuraGenre");
  document.getElementById("profile-shimamura-person").textContent =
    getString("profileShimamuraPerson");
  document.getElementById("profile-shimamura-reborn").textContent =
    getString("profileShimamuraReborn");
  document.getElementById("profile-shimamura-vacation").textContent = getString(
    "profileShimamuraVacation",
  );
  document.getElementById("profile-shimamura-type").textContent = getString("profileShimamuraLike");
  document.getElementById("profile-shimamura-call").textContent = getString("profileShimamuraCall");
  document.getElementById("profile-shimamura-heart").textContent =
    getString("profileShimamuraHeart");
  document.getElementById("profile-shimamura-date").textContent = getString("profileShimamuraDate");

  document.getElementById("profile-favorite-label").textContent = getString("profileFavorite");
  document.getElementById("profile-favorite-label2").textContent = getString("profileFavorite");
  document.getElementById("profile-whatif-label").textContent = getString("profileWhatIf");
  document.getElementById("profile-whatif-label2").textContent = getString("profileWhatIf");
  document.getElementById("profile-love-label").textContent = getString("profileLove");
  document.getElementById("profile-love-label2").textContent = getString("profileLove");

  document.getElementById("profile-label-food").textContent = getString("profileLabelFood");
  document.getElementById("profile-label-food2").textContent = getString("profileLabelFood");
  document.getElementById("profile-label-color").textContent = getString("profileLabelColor");
  document.getElementById("profile-label-color2").textContent = getString("profileLabelColor");
  document.getElementById("profile-label-genre").textContent = getString("profileLabelGenre");
  document.getElementById("profile-label-genre2").textContent = getString("profileLabelGenre");
  document.getElementById("profile-label-person").textContent = getString("profileLabelPerson");
  document.getElementById("profile-label-person2").textContent = getString("profileLabelPerson");
  document.getElementById("profile-label-reborn").textContent = getString("profileLabelReborn");
  document.getElementById("profile-label-reborn2").textContent = getString("profileLabelReborn");
  document.getElementById("profile-label-vacation").textContent = getString("profileLabelVacation");
  document.getElementById("profile-label-vacation2").textContent =
    getString("profileLabelVacation");
  document.getElementById("profile-label-like").textContent = getString("profileLabelLike");
  document.getElementById("profile-label-like2").textContent = getString("profileLabelLike");
  document.getElementById("profile-label-confessed").textContent =
    getString("profileLabelConfessed");
  document.getElementById("profile-label-confessed2").textContent =
    getString("profileLabelConfessed");
  document.getElementById("profile-label-type").textContent = getString("profileLabelType");
  document.getElementById("profile-label-type2").textContent = getString("profileLabelType");
  document.getElementById("profile-label-call").textContent = getString("profileLabelCall");
  document.getElementById("profile-label-call2").textContent = getString("profileLabelCall");
  document.getElementById("profile-label-heart").textContent = getString("profileLabelHeart");
  document.getElementById("profile-label-heart2").textContent = getString("profileLabelHeart");
  document.getElementById("profile-label-date").textContent = getString("profileLabelDate");
  document.getElementById("profile-label-date2").textContent = getString("profileLabelDate");

  document.querySelectorAll("#yes-label, #yes-label2, #yes-label3, #yes-label4").forEach((el) => {
    el.textContent = getString("yes");
  });
  document.querySelectorAll("#no-label, #no-label2, #no-label3, #no-label4").forEach((el) => {
    el.textContent = getString("no");
  });

  document.querySelectorAll("#profile-download-label, #profile-download-label2").forEach((el) => {
    el.textContent = getString("downloadProfile");
  });
  document.querySelectorAll("#profile-close-label, #profile-close-label2").forEach((el) => {
    el.textContent = getString("closeButton");
  });
}

function refreshUnlockedLocalizedContent() {
  updateDownloadSummaryText();
  updateProfileContent();
}

async function translateMenuContent(lang) {
  if (typeof window.translateMenu === "function") {
    try {
      await window.translateMenu(lang);
      return true;
    } catch (e) {
      console.warn("Menu translation failed:", e);
    }
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 1500);
    const check = () => {
      if (typeof window.translateMenu === "function") {
        Promise.resolve(window.translateMenu(lang))
          .catch(() => {})
          .finally(() => {
            clearTimeout(timeout);
            resolve(true);
          });
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

function getConstellationName(ci) {
  if (CONSTELLATIONS && CONSTELLATIONS[ci]) {
    return CONSTELLATIONS[ci].name;
  }
  return "Constellation " + (ci + 1);
}

function saveProgress() {
  try {
    const data = {
      completedConsts: [...completedConsts],
      completedCount,
      starSnaps: stars.map((s) => ({
        x: s.x / canvas.width,
        y: s.y / canvas.height,
        snapped: s.snapped,
        snappedConstId: s.snappedConstId,
        snappedPointIdx: s.snappedPointIdx,
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore persistence or optional browser API failures.
  }
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function init() {
  canvas = document.getElementById("sky-canvas");
  ctx = canvas.getContext("2d");
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  generateStars();
  restoreProgress();
  buildConstellationPanel();
  createParticles();
  setupEventListeners();
  drawLoop();
}

function restoreProgress() {
  const saved = loadProgress();
  if (!saved) return;

  completedConsts = new Set(saved.completedConsts || []);
  completedCount = saved.completedCount || 0;

  if (saved.starSnaps && saved.starSnaps.length === stars.length) {
    saved.starSnaps.forEach((snap, i) => {
      stars[i].x = snap.x * canvas.width;
      stars[i].y = snap.y * canvas.height;
      stars[i].snapped = snap.snapped;
      stars[i].snappedConstId = snap.snappedConstId;
      stars[i].snappedPointIdx = snap.snappedPointIdx;
    });
  }

  completedConsts.forEach((ci) => {
    updateConstellationChip(ci);
  });

  const sortedRewards = REWARDS.filter((r) => r.at <= completedCount).sort((a, b) => a.at - b.at);
  if (sortedRewards.length > 0) {
    document.getElementById("unlocks-list").innerHTML = "";
    sortedRewards.forEach((r) => addUnlockToSidebar(r, true));
  }

  if (completedCount >= 3) unlockProfile("shimamura");
  if (completedCount >= 10) unlockProfile("adachi");
  if (completedCount >= 10) unlockAllStoriesButton();

  refreshUnlockedLocalizedContent();

  updateProgress();

  if (completedCount === TOTAL_CONSTELLATIONS) {
    document.querySelector(".sky-overlay").style.background =
      "radial-gradient(ellipse at center, rgba(100,50,120,0.2) 0%, rgba(30,10,60,0.5) 100%)";
    finalizeSkyCompletion();
    return;
  }

  completedConsts.forEach((ci) => {
    const c = CONSTELLATIONS[ci];
    if (!c) return;
    const { cx, cy, size } = getConstellationCenter(c);
    stars.forEach((s) => {
      if (s.snapped && s.snappedConstId === ci && s.snappedPointIdx !== null) {
        const [rx, ry] = c.stars[s.snappedPointIdx];
        s.x = cx + (rx - 0.5) * size;
        s.y = cy + (ry - 0.5) * size;
      }
    });
  });
}

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width || window.innerWidth;
  canvas.height = rect.height || window.innerHeight;
  if (stars.length) repositionStars();
}

function repositionStars() {
  stars.forEach((s) => {
    if (s.snapped && s.snappedConstId !== null && s.snappedPointIdx !== null) {
      const c = CONSTELLATIONS[s.snappedConstId];
      if (c) {
        const { cx, cy, size } = getConstellationCenter(c);
        const [rx, ry] = c.stars[s.snappedPointIdx];
        s.x = cx + (rx - 0.5) * size;
        s.y = cy + (ry - 0.5) * size;
      }
    } else {
      s.x = Math.min(Math.max(s.x, 20), canvas.width - 20);
      s.y = Math.min(Math.max(s.y, 80), canvas.height - 60);
    }
  });
}

function generateStars() {
  stars = [];
  const W = canvas.width;
  const H = canvas.height;
  const margin = 80;
  const usableW = W - margin * 2;
  const usableH = H - margin * 2 - 80;

  let totalPoints = 0;
  CONSTELLATIONS.forEach((c) => (totalPoints += c.stars.length));

  const totalStars = totalPoints + 10;

  for (let i = 0; i < totalStars; i++) {
    const x = margin + Math.random() * usableW;
    const y = margin + 80 + Math.random() * (usableH - 80);
    const r = 8;
    stars.push({
      x,
      y,
      r,
      baseR: r,
      glow: 0.5 + Math.random() * 0.5,
      twinkleOffset: Math.random() * Math.PI * 2,
      snapped: false,
      snappedConstId: null,
      snappedPointIdx: null,
    });
  }
}

function drawLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const t = Date.now() / 1000;

  CONSTELLATIONS.forEach((c, ci) => {
    if (completedConsts.has(ci)) return;
    drawConstellationGuide(c, ci, t);
  });

  CONSTELLATIONS.forEach((c, ci) => {
    if (!completedConsts.has(ci)) return;
    drawConstellationLines(c, ci, t);
  });

  drawActiveConnections(t);

  stars.forEach((s) => {
    const twinkle = 0.6 + 0.4 * Math.sin(t * 1.5 + s.twinkleOffset);
    const completed =
      s.snapped && s.snappedConstId !== null && completedConsts.has(s.snappedConstId);
    drawStar(s, twinkle, completed, t);
  });

  requestAnimationFrame(drawLoop);
}

function drawStarShape(cx, cy, outerR, innerR, points, color, alpha, glowSize, twinkle) {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize * twinkle);
  grad.addColorStop(0, `rgba(255,240,255,${alpha * 0.8})`);
  grad.addColorStop(0.5, `rgba(255,220,240,${alpha * 0.4})`);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, glowSize * twinkle, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR * twinkle : innerR * twinkle;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawStar(s, twinkle, completed, t) {
  const isSnapping = s.snapped && !completedConsts.has(s.snappedConstId);
  const glowSize = completed ? 32 : isSnapping ? 24 : 18;
  const alpha = completed ? 1 : 0.65 + 0.35 * twinkle;
  const color = completed
    ? `hsl(${(t * 20 + s.snappedConstId * 36) % 360}, 85%, 82%)`
    : isSnapping
      ? "#ffffff"
      : "#fffaff";

  drawStarShape(s.x, s.y, s.baseR, s.baseR * 0.42, 5, color, alpha, glowSize, twinkle);

  if (completed) {
    ctx.save();
    ctx.globalAlpha = 0.35 * twinkle;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x - 14, s.y);
    ctx.lineTo(s.x + 14, s.y);
    ctx.moveTo(s.x, s.y - 14);
    ctx.lineTo(s.x, s.y + 14);
    ctx.stroke();
    ctx.restore();
  }
}

function getConstellationCenter(c) {
  const cols = 2,
    rows = 5;
  const ci = CONSTELLATIONS.indexOf(c);
  const col = ci % cols;
  const row = Math.floor(ci / cols);
  const W = canvas.width,
    H = canvas.height;
  const cellW = W / cols;
  const cellH = (H - 120) / rows;
  const cx = col * cellW + cellW * 0.5;
  const cy = 100 + row * cellH + cellH * 0.5;
  const size = Math.min(cellW, cellH) * 0.65;
  return { cx, cy, size };
}

function drawConstellationGuide(c, _ci, _t) {
  const { cx, cy, size } = getConstellationCenter(c);
  const pts = c.stars.map(([rx, ry]) => ({
    x: cx + (rx - 0.5) * size,
    y: cy + (ry - 0.5) * size,
  }));

  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = "rgba(200,150,255,0.35)";
  ctx.lineWidth = 1.4;
  c.edges.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  pts.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(200,150,255,0.45)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,180,255,0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  const snapR = Math.min(70, ((Math.min(canvas.width, canvas.height) * 0.65) / 2) * 0.38);
  pts.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, snapR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(200,150,255,0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  });
  ctx.restore();
}

function drawConstellationLines(c, ci, t) {
  const { cx, cy, size } = getConstellationCenter(c);
  const pts = c.stars.map(([rx, ry]) => ({
    x: cx + (rx - 0.5) * size,
    y: cy + (ry - 0.5) * size,
  }));

  const hue = (ci * 36 + t * 10) % 360;
  const glowAlpha = 0.6 + 0.3 * Math.sin(t * 2 + ci);

  ctx.save();
  ctx.shadowBlur = 20;
  ctx.shadowColor = `hsla(${hue}, 80%, 70%, 0.8)`;
  ctx.strokeStyle = `hsla(${hue}, 80%, 75%, ${glowAlpha})`;
  ctx.lineWidth = 2;
  c.edges.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
    ctx.stroke();
  });
  ctx.shadowBlur = 0;

  const labelAlpha = 0.55 + 0.35 * Math.sin(t * 1.2 + ci * 0.7);
  ctx.font = "bold 11px Quicksand, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = `hsla(${hue}, 90%, 85%, ${labelAlpha})`;
  const labelY = cy + size * 0.5 + 18;
  ctx.fillText(getConstellationName(ci), cx, labelY);
  ctx.font = "9px Quicksand, sans-serif";
  ctx.fillStyle = `rgba(255,200,230,${labelAlpha * 0.7})`;
  ctx.fillText(getString("tapReward"), cx, labelY + 14);

  ctx.restore();
}

function drawActiveConnections(_t) {
  CONSTELLATIONS.forEach((c, ci) => {
    if (completedConsts.has(ci)) return;
    const snappedStars = stars.filter((s) => s.snapped && s.snappedConstId === ci);
    if (snappedStars.length < 2) return;

    const positions = new Array(c.stars.length).fill(null);
    snappedStars.forEach((s) => {
      const { cx, cy, size } = getConstellationCenter(c);
      const [rx, ry] = c.stars[s.snappedPointIdx];
      positions[s.snappedPointIdx] = {
        x: cx + (rx - 0.5) * size,
        y: cy + (ry - 0.5) * size,
      };
    });

    ctx.save();
    ctx.strokeStyle = "rgba(255, 180, 240, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    c.edges.forEach(([a, b]) => {
      if (positions[a] && positions[b]) {
        ctx.beginPath();
        ctx.moveTo(positions[a].x, positions[a].y);
        ctx.lineTo(positions[b].x, positions[b].y);
        ctx.stroke();
      }
    });
    ctx.setLineDash([]);
    ctx.restore();
  });
}

function checkSnap(star) {
  let bestDist = Infinity;
  let bestConstId = null;
  let bestPointIdx = null;

  CONSTELLATIONS.forEach((c, ci) => {
    if (completedConsts.has(ci)) return;
    const { cx, cy, size } = getConstellationCenter(c);
    const SNAP_R = Math.min(70, size * 0.38);

    c.stars.forEach(([rx, ry], pi) => {
      const slotTaken = stars.some(
        (s) => s !== star && s.snapped && s.snappedConstId === ci && s.snappedPointIdx === pi,
      );
      if (slotTaken) return;

      const tx = cx + (rx - 0.5) * size;
      const ty = cy + (ry - 0.5) * size;
      const dist = Math.hypot(star.x - tx, star.y - ty);
      if (dist < SNAP_R && dist < bestDist) {
        bestDist = dist;
        bestConstId = ci;
        bestPointIdx = pi;
      }
    });
  });

  if (bestConstId !== null) {
    const c = CONSTELLATIONS[bestConstId];
    const { cx, cy, size } = getConstellationCenter(c);
    const [rx, ry] = c.stars[bestPointIdx];
    star.x = cx + (rx - 0.5) * size;
    star.y = cy + (ry - 0.5) * size;
    star.snapped = true;
    star.snappedConstId = bestConstId;
    star.snappedPointIdx = bestPointIdx;
    checkConstellationComplete(bestConstId);
  } else {
    star.snapped = false;
    star.snappedConstId = null;
    star.snappedPointIdx = null;
  }
}

function finalizeSkyCompletion() {
  stars = [];
  dragging = null;
  const resetBtn = document.getElementById("hud-reset-btn");
  if (resetBtn) {
    resetBtn.disabled = true;
    resetBtn.classList.add("disabled");
    resetBtn.style.opacity = "0.4";
    resetBtn.style.cursor = "not-allowed";
    resetBtn.style.pointerEvents = "none";
  }
}

function checkConstellationComplete(ci) {
  if (completedConsts.has(ci)) return;
  const c = CONSTELLATIONS[ci];
  const needed = c.stars.length;
  const snappedStars = stars.filter((s) => s.snapped && s.snappedConstId === ci);
  if (snappedStars.length < needed) return;

  const { cx, cy, size } = getConstellationCenter(c);
  snappedStars.forEach((s) => {
    const [rx, ry] = c.stars[s.snappedPointIdx];
    s.x = cx + (rx - 0.5) * size;
    s.y = cy + (ry - 0.5) * size;
    s.snapped = true;
    s.snappedConstId = ci;
  });

  completedConsts.add(ci);
  completedCount++;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const t = Date.now() / 1000;
  CONSTELLATIONS.forEach((c2, ci2) => {
    if (completedConsts.has(ci2)) return;
    drawConstellationGuide(c2, ci2, t);
  });
  CONSTELLATIONS.forEach((c2, ci2) => {
    if (!completedConsts.has(ci2)) return;
    drawConstellationLines(c2, ci2, t);
  });
  drawActiveConnections(t);
  stars.forEach((s) => {
    const twinkle = 0.8 + 0.2 * Math.sin(t * 1.5 + s.twinkleOffset);
    const completed =
      s.snapped && s.snappedConstId !== null && completedConsts.has(s.snappedConstId);
    drawStar(s, twinkle, completed, t);
  });

  playCompletionSound();
  updateProgress();
  updateConstellationChip(ci);
  triggerReward(completedCount);
  saveProgress();

  if (completedCount === TOTAL_CONSTELLATIONS) {
    unlockAllStoriesButton();
    finalizeSkyCompletion();
    setTimeout(triggerFinalEvent, 1800);
  }
}

function triggerReward(count) {
  const reward = REWARDS.find((r) => r.at === count);
  if (!reward) return;

  if (reward.modalId === "shimamuraModal") unlockProfile("shimamura");
  if (reward.modalId === "adachiModal") unlockProfile("adachi");

  setTimeout(() => showRewardModal(reward), 600);
  addUnlockToSidebar(reward, false);
}

function unlockProfile(which) {
  const btn = document.getElementById("btn-" + which);
  if (btn) {
    btn.removeAttribute("disabled");
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
    document.getElementById("profiles-lock-icon").className = "fas fa-unlock";
  }
  updateProfileContent();
}

function showRewardModal(reward) {
  document.getElementById("reward-icon").textContent = "";
  document.getElementById("reward-title").textContent = reward.title;
  document.getElementById("reward-body").textContent = reward.body;

  const pdfBtn = document.getElementById("reward-pdf-btn");
  if (pdfBtn) {
    pdfBtn.style.display = reward.type === "mini_historia" ? "block" : "none";
  }

  window._currentReward = reward;
  spawnRewardStars();
  openModal("rewardModal");
}

function spawnRewardStars() {
  const container = document.getElementById("reward-stars");
  container.innerHTML = "";
  for (let i = 0; i < 20; i++) {
    const s = document.createElement("div");
    s.className = "reward-star-particle";
    s.style.cssText = `
            left:${Math.random() * 100}%;
            top:${Math.random() * 100}%;
            --tx:${(Math.random() - 0.5) * 200}px;
            --ty:${(Math.random() - 0.5) * 200}px;
            animation-delay:${Math.random() * 0.5}s;
            background:hsl(${Math.random() * 60 + 300},80%,85%);
        `;
    container.appendChild(s);
  }
}

// eslint-disable-next-line no-unused-vars -- may be invoked from an inline onclick handler in HTML
function closeRewardModal() {
  closeModal("rewardModal");
}

function addUnlockToSidebar(reward, silent) {
  const list = document.getElementById("unlocks-list");
  if (!silent && completedCount === 1) list.innerHTML = "";
  if (document.getElementById("unlock-reward-" + reward.at)) return;

  const item = document.createElement("div");
  item.className = "unlock-item";
  item.id = "unlock-reward-" + reward.at;
  if (!silent) item.style.animation = "fadeIn 0.5s ease";

  const header = document.createElement("div");
  header.className = "unlock-header";
  const shortLabel = reward.title;
  header.innerHTML = `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${shortLabel}</span><i class="fas fa-eye unlock-arrow" style="transform:none;" title="Ver recompensa"></i>`;

  header.addEventListener("click", () => {
    showRewardModal(reward);
  });

  item.appendChild(header);
  list.appendChild(item);
}

function updateProgress() {
  const pct = (completedCount / TOTAL_CONSTELLATIONS) * 100;
  document.getElementById("prog-bar").style.width = pct + "%";
  document.getElementById("prog-text").textContent =
    `${completedCount} / ${TOTAL_CONSTELLATIONS} completadas`;
}

function buildConstellationPanel() {
  const panel = document.getElementById("const-panel");
  panel.innerHTML = "";
  CONSTELLATIONS.forEach((c, ci) => {
    const chip = document.createElement("div");
    chip.className = "const-chip";
    chip.id = `chip-${ci}`;
    chip.innerHTML = `<i class="fas fa-circle-notch fa-spin" style="opacity:0.4;font-size:0.6rem"></i>${getConstellationName(ci)}`;
    chip.title = `Constelación: ${getConstellationName(ci)}`;
    chip.addEventListener("click", () => {
      if (!completedConsts.has(ci)) return;
      const completedArr = [...completedConsts];
      const orderIdx = completedArr.indexOf(ci);
      if (orderIdx !== -1) {
        const rewardAtStep = REWARDS.find((r) => r.at === orderIdx + 1);
        if (rewardAtStep) showRewardModal(rewardAtStep);
      }
    });
    panel.appendChild(chip);
  });
}

function updateConstellationChip(ci) {
  const chip = document.getElementById(`chip-${ci}`);
  if (chip) {
    chip.classList.add("done");
    chip.innerHTML = `<i class="fas fa-check-circle" style="color:#ffd166;font-size:0.7rem"></i>${getConstellationName(ci)}`;
    chip.title = `${getConstellationName(ci)} — Clic para ver recompensa`;
    chip.style.cursor = "pointer";
  }
}

function triggerFinalEvent() {
  const overlay = document.getElementById("final-event-overlay");
  overlay.style.display = "block";
  overlay.classList.add("show");
  overlay.style.pointerEvents = "all";
  document.querySelector(".sky-overlay").style.background =
    "radial-gradient(ellipse at center, rgba(100,50,120,0.2) 0%, rgba(30,10,60,0.5) 100%)";
  playFinalSound();
}

function unlockAllStoriesButton() {
  const finalContainer = document.getElementById("final-download-container");
  if (finalContainer) {
    finalContainer.style.display = "flex";
  }
  updateDownloadSummaryText();
}

// eslint-disable-next-line no-unused-vars -- may be invoked from an inline onclick handler in HTML
function closeFinalEvent() {
  const overlay = document.getElementById("final-event-overlay");
  overlay.classList.remove("show");
  setTimeout(() => {
    overlay.style.display = "none";
    overlay.style.pointerEvents = "none";
  }, 500);
}

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playCompletionSound() {
  if (!soundEnabled) return;
  try {
    const ac = getAudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, ac.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.12, ac.currentTime + i * 0.12 + 0.05);
      gain.gain.linearRampToValueAtTime(0, ac.currentTime + i * 0.12 + 0.3);
      osc.start(ac.currentTime + i * 0.12);
      osc.stop(ac.currentTime + i * 0.12 + 0.4);
    });
  } catch {
    // Ignore persistence or optional browser API failures.
  }
}

function playFinalSound() {
  if (!soundEnabled) return;
  try {
    const ac = getAudioCtx();
    const chord = [261.63, 329.63, 392, 523.25, 659.25];
    chord.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, ac.currentTime + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.08, ac.currentTime + i * 0.08 + 0.1);
      gain.gain.linearRampToValueAtTime(0, ac.currentTime + i * 0.08 + 2);
      osc.start(ac.currentTime + i * 0.08);
      osc.stop(ac.currentTime + i * 0.08 + 2.5);
    });
  } catch {
    // Ignore persistence or optional browser API failures.
  }
}

// eslint-disable-next-line no-unused-vars -- may be invoked from an inline onclick handler in HTML
function toggleSound() {
  soundEnabled = !soundEnabled;
  const icon = document.getElementById("sound-icon");
  icon.className = soundEnabled ? "fas fa-volume-up" : "fas fa-volume-mute";
  if (soundEnabled) {
    try {
      getAudioCtx().resume();
    } catch {
      // Ignore persistence or optional browser API failures.
    }
    playCompletionSound();
  }
}

function createParticles() {
  const container = document.getElementById("particles");
  for (let i = 0; i < 35; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const size = 1 + Math.random() * 3;
    const hue = 280 + Math.random() * 80;
    p.style.cssText = `
            width:${size}px; height:${size}px;
            left:${Math.random() * 100}%;
            background:hsla(${hue},60%,80%,0.7);
            box-shadow:0 0 ${size * 3}px hsla(${hue},80%,80%,0.5);
            animation-duration:${12 + Math.random() * 15}s;
            animation-delay:${Math.random() * 15}s;
        `;
    container.appendChild(p);
  }
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches && e.touches.length > 0) {
    return {
      x: e.touches[0].clientX - rect.left,
      y: e.touches[0].clientY - rect.top,
    };
  }
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function findStarAt(x, y) {
  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i];
    if (s.snapped && s.snappedConstId !== null && completedConsts.has(s.snappedConstId)) continue;
    if (Math.hypot(x - s.x, y - s.y) < Math.max(s.baseR + 10, 18)) return s;
  }
  return null;
}

function findCompletedConstAt(x, y) {
  for (let ci of completedConsts) {
    const c = CONSTELLATIONS[ci];
    const { cx, cy, size } = getConstellationCenter(c);
    const dist = Math.hypot(x - cx, y - cy);
    if (dist < size * 0.6) return ci;
  }
  return null;
}

function onPointerDown(e) {
  const pos = getPos(e);
  const s = findStarAt(pos.x, pos.y);
  if (s) {
    dragging = s;
    dragOffX = pos.x - s.x;
    dragOffY = pos.y - s.y;
    s.snapped = false;
    e.preventDefault();
    return;
  }
  const ci = findCompletedConstAt(pos.x, pos.y);
  if (ci !== null) {
    const completedArr = [...completedConsts];
    const orderIdx = completedArr.indexOf(ci);
    if (orderIdx !== -1) {
      const rewardAtStep = REWARDS.find((r) => r.at === orderIdx + 1);
      if (rewardAtStep) {
        e.preventDefault();
        showRewardModal(rewardAtStep);
      }
    }
  }
}

function onPointerMove(e) {
  const pos = getPos(e);
  _mouseX = pos.x;
  _mouseY = pos.y;

  if (!dragging) return;
  e.preventDefault();
  dragging.x = pos.x - dragOffX;
  dragging.y = pos.y - dragOffY;
  dragging.x = Math.max(10, Math.min(canvas.width - 10, dragging.x));
  dragging.y = Math.max(70, Math.min(canvas.height - 40, dragging.y));
}

function onPointerUp(_e) {
  if (dragging) {
    checkSnap(dragging);
    dragging = null;
    saveProgress();
  }
}

function setupEventListeners() {
  canvas.addEventListener("mousedown", onPointerDown);
  canvas.addEventListener("mousemove", onPointerMove);
  canvas.addEventListener("mouseup", onPointerUp);
  canvas.addEventListener("mouseleave", onPointerUp);
  canvas.addEventListener("touchstart", onPointerDown, { passive: false });
  canvas.addEventListener("touchmove", onPointerMove, { passive: false });
  canvas.addEventListener("touchend", onPointerUp);
}

// eslint-disable-next-line no-unused-vars -- may be invoked from an inline onclick handler in HTML
function resetStars() {
  if (completedCount >= TOTAL_CONSTELLATIONS) return;
  showResetConfirmation().then((confirmed) => {
    if (!confirmed) return;
    stars.forEach((s) => {
      const W = canvas.width,
        H = canvas.height;
      s.x = 80 + Math.random() * (W - 160);
      s.y = 120 + Math.random() * (H - 200);
      s.snapped = false;
      s.snappedConstId = null;
      s.snappedPointIdx = null;
    });
    saveProgress();
    flashToast(getString("toastReset"), 2200);
  });
}

function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.style.display = "flex";
  requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add("show")));
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove("show");
  setTimeout(() => {
    m.style.display = "none";
    document.body.style.overflow = "";
  }, 400);
}

// eslint-disable-next-line no-unused-vars -- may be invoked from an inline onclick handler in HTML
function openProfileModal(id) {
  const btn = document.getElementById("btn-" + id.replace("Modal", "").toLowerCase());
  if (btn && btn.disabled) return;
  updateProfileContent();
  openModal(id);
}

// eslint-disable-next-line no-unused-vars -- may be invoked from an inline onclick handler in HTML
function showInstructions() {
  openModal("instructionsModal");
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    ["adachiModal", "shimamuraModal", "rewardModal", "instructionsModal"].forEach((id) =>
      closeModal(id),
    );
  }
});

["rewardModal", "instructionsModal"].forEach((id) => {
  const el = document.getElementById(id);
  if (el)
    el.addEventListener("click", (e) => {
      if (e.target === el) closeModal(id);
    });
});

(function setupProfileModalOutsideClose() {
  const PROFILE_MODAL_IDS = ["adachiModal", "shimamuraModal"];

  function getOpenProfileModal() {
    for (const id of PROFILE_MODAL_IDS) {
      const el = document.getElementById(id);
      if (el && el.classList.contains("show")) return el;
    }
    return null;
  }

  function isInsideDialog(modalEl, x, y) {
    const dialog = modalEl.querySelector(".modal-dialog");
    if (!dialog) return false;
    const r = dialog.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  document.addEventListener(
    "click",
    (e) => {
      const modalEl = getOpenProfileModal();
      if (!modalEl) return;
      if (e.target === modalEl) closeModal(modalEl.id);
    },
    true,
  );

  let touchStartPoint = null;
  document.addEventListener(
    "touchstart",
    (e) => {
      const modalEl = getOpenProfileModal();
      if (!modalEl || !e.touches[0]) {
        touchStartPoint = null;
        return;
      }
      touchStartPoint = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    { passive: true },
  );

  document.addEventListener(
    "touchend",
    (e) => {
      const modalEl = getOpenProfileModal();
      if (!modalEl || !touchStartPoint || !e.changedTouches[0]) {
        touchStartPoint = null;
        return;
      }
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = Math.abs(endX - touchStartPoint.x);
      const dy = Math.abs(endY - touchStartPoint.y);
      const wasTap = dx < 12 && dy < 12;
      if (
        wasTap &&
        !isInsideDialog(modalEl, touchStartPoint.x, touchStartPoint.y) &&
        !isInsideDialog(modalEl, endX, endY)
      ) {
        closeModal(modalEl.id);
      }
      touchStartPoint = null;
    },
    { passive: true },
  );

  if (window.PointerEvent) {
    let pointerDownWasOutside = false;
    document.addEventListener("pointerdown", (e) => {
      const modalEl = getOpenProfileModal();
      pointerDownWasOutside = !!modalEl && !isInsideDialog(modalEl, e.clientX, e.clientY);
    });
    document.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return;
      const modalEl = getOpenProfileModal();
      if (!modalEl || !pointerDownWasOutside) return;
      if (!isInsideDialog(modalEl, e.clientX, e.clientY)) closeModal(modalEl.id);
      pointerDownWasOutside = false;
    });
  }
})();

function updateMenuButtonState(isOpen) {
  var btn = document.getElementById("menu-button");
  var overlay = document.getElementById("menu-overlay");
  if (btn) btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  if (overlay) overlay.setAttribute("aria-hidden", isOpen ? "false" : "true");
}

function openMenu() {
  document.body.classList.add("menu-open");
  updateMenuButtonState(true);
}

function closeMenu() {
  document.body.classList.remove("menu-open");
  updateMenuButtonState(false);
}

window.menuToggle = window.toggleMenu = function () {
  if (document.body.classList.contains("menu-open")) closeMenu();
  else openMenu();
};

function setMenuHandlers() {
  var overlay = document.getElementById("menu-overlay");
  var closeBtn = document.getElementById("menu-close-btn");
  var menuButton = document.getElementById("menu-button");
  if (overlay) overlay.addEventListener("click", closeMenu);
  if (closeBtn) closeBtn.addEventListener("click", closeMenu);
  if (menuButton) menuButton.addEventListener("click", window.toggleMenu);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && document.body.classList.contains("menu-open")) {
      closeMenu();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setMenuHandlers);
} else {
  setMenuHandlers();
}

// eslint-disable-next-line no-unused-vars -- may be invoked from an inline onclick handler in HTML
function downloadProfile(modalId) {
  const profileDownloads = {
    adachiModal: {
      es: {
        imageUrl: "../../assets/Imagenes/Adachi_perfil.webp",
        fileName: "Adachi_perfil.jpg",
      },
      en: {
        imageUrl: "../../assets/Imagenes/Adachi profile.webp",
        fileName: "Adachi profile.jpg",
      },
    },
    shimamuraModal: {
      es: {
        imageUrl: "../../assets/Imagenes/Shimamura_Perfil.webp",
        fileName: "Shimamura_Perfil.jpg",
      },
      en: {
        imageUrl: "../../assets/Imagenes/Shimamura profile.webp",
        fileName: "Shimamura profile.jpg",
      },
    },
  };

  const selectedProfile = profileDownloads[modalId];
  if (!selectedProfile) {
    return;
  }

  const downloadConfig = selectedProfile[currentLang] || selectedProfile.es;
  const { imageUrl, fileName } = downloadConfig;

  const link = document.createElement("a");
  link.href = imageUrl + "?v=" + APP_VERSION;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function forceDownload(url, fileName) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Network response was not ok");

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.style.display = "none";
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();

    window.URL.revokeObjectURL(blobUrl);
    document.body.removeChild(link);
  } catch (error) {
    console.error("Error forzando la descarga:", error);
    const backupLink = document.createElement("a");
    backupLink.href = url;
    backupLink.download = fileName;
    backupLink.target = "_blank";
    document.body.appendChild(backupLink);
    backupLink.click();
    document.body.removeChild(backupLink);
  }
}

// eslint-disable-next-line no-unused-vars -- may be invoked from an inline onclick handler in HTML
async function downloadStoryPDF() {
  const reward = window._currentReward;
  if (!reward || !reward.pdf) return;

  await forceDownload(reward.pdf, reward.pdf.split("/").pop());
}

const MINI_HISTORIAS_DEPLOY_ID = "20250608-0001";

const MINI_STORIES_DOWNLOADS = {
  es: {
    archiveUrl:
      "https://media.adashimaverse.com/Mini%20historias/Mini%20historias%20completas.pdf?v=" +
      MINI_HISTORIAS_DEPLOY_ID,
    archiveFileName: "Mini historias completas.pdf",
  },
  en: {
    archiveUrl:
      "https://media.adashimaverse.com/Mini%20historias/ingles/Web%20stories.pdf?v=" +
      MINI_HISTORIAS_DEPLOY_ID,
    archiveFileName: "Mini Stories Archive.pdf",
  },
};

// eslint-disable-next-line no-unused-vars -- may be invoked from an inline onclick handler in HTML
async function downloadAllMiniStories() {
  const downloadConfig = MINI_STORIES_DOWNLOADS[currentLang] || MINI_STORIES_DOWNLOADS.es;
  const bustUrl = downloadConfig.archiveUrl;
  const downloadName = downloadConfig.archiveFileName;
  try {
    const response = await fetch(bustUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("Network response was not ok");
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = blobUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(blobUrl);
    document.body.removeChild(link);
  } catch (error) {
    console.error("Error forzando la descarga:", error);
    const backupLink = document.createElement("a");
    backupLink.href = bustUrl;
    backupLink.download = downloadName;
    backupLink.target = "_blank";
    document.body.appendChild(backupLink);
    backupLink.click();
    document.body.removeChild(backupLink);
  }
}

function initBgAudio() {
  const audio = document.getElementById("bg-audio");
  if (!audio) return;
  audio.volume = 0.35;

  const tryPlay = () => {
    audio.play().catch(() => {
      const unlock = () => {
        audio.play().catch(() => {});
        document.removeEventListener("click", unlock);
        document.removeEventListener("touchstart", unlock);
        document.removeEventListener("keydown", unlock);
      };
      document.addEventListener("click", unlock, { once: true });
      document.addEventListener("touchstart", unlock, { once: true });
      document.addEventListener("keydown", unlock, { once: true });
    });
  };
  tryPlay();

  const origToggle = window.toggleSound;
  window.toggleSound = function () {
    origToggle();
    audio.muted = !soundEnabled;
    if (soundEnabled) audio.play().catch(() => {});
  };
}

function showResetConfirmation() {
  return new Promise((resolve) => {
    const el = document.getElementById("reset-confirm");
    const btnConfirm = document.getElementById("reset-confirm-btn");
    const btnCancel = document.getElementById("reset-cancel");
    if (!el || !btnConfirm || !btnCancel) {
      resolve(false);
      return;
    }

    const message = document.getElementById("reset-message");
    if (message) {
      message.textContent = getString("resetConfirm");
    }

    let _finished = false;
    function cleanup() {
      el.classList.remove("show");
      el.setAttribute("aria-hidden", "true");
      btnConfirm.removeEventListener("click", onConfirm);
      btnCancel.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKey);
      _finished = true;
    }
    function onConfirm() {
      cleanup();
      resolve(true);
    }
    function onCancel() {
      cleanup();
      resolve(false);
    }
    function onKey(e) {
      if (e.key === "Escape") onCancel();
    }

    btnConfirm.addEventListener("click", onConfirm);
    btnCancel.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKey);

    el.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => setTimeout(() => el.classList.add("show"), 10));
  });
}

function flashToast(text, dur = 1800) {
  const t = document.getElementById("toast-msg");
  if (!t) return;
  t.textContent = text;
  t.classList.add("show");
  t.setAttribute("aria-hidden", "false");
  clearTimeout(t._to);
  t._to = setTimeout(() => {
    t.classList.remove("show");
    t.setAttribute("aria-hidden", "true");
  }, dur);
}

document.addEventListener("DOMContentLoaded", function () {
  fetch("/src/components/menu.html?v=" + APP_VERSION)
    .then((response) => {
      if (!response.ok) throw new Error("Error HTTP " + response.status + " al cargar el menú");
      return response.text();
    })
    .then((data) => {
      data = data
        .replace(/src="\.\/(assets\/)/g, 'src="../$1')
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

      setTimeout(() => {
        document.dispatchEvent(new CustomEvent("menuLoaded"));
      }, 100);
    })
    .catch((error) => console.error("Error cargando menu.html:", error.message));
});

document.addEventListener("menuLoaded", function () {
  if (typeof window.translateMenu === "function") {
    translateMenuContent(currentLang);
  }
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

document.addEventListener("DOMContentLoaded", async function () {
  await loadAllData(currentLang);
  renderUI();
  if (!isInitialized) {
    init();
    initBgAudio();
    isInitialized = true;
  }
  await translateMenuContent(currentLang);
});
