// ----- state -----
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

let isSwitching = false;
let contentData = null;
let miniAnimeData = null;
let CHANNELS = [];
let folderStates = {};
let currentView = localStorage.getItem("episodeView") || "list";

const CDN_BASE_URL = "https://media.adashimaverse.com";

// ----- runtime state -----
const state = {
  powered: false,
  currentChannel: -1,
  switching: false,
  menuOpen: false,
  playing: false,
  volume: 1,
  brightness: 1,
  muted: false,
  cinemaMode: false,
  powerEffectActive: false,
  keyboardHelpOpen: false,
};

// ----- playback progress storage -----
const PROGRESS_KEY = "adashima_anime_progress";
const FOLDER_STATE_KEY = "adashima_folder_state";
const VOLUME_KEY = "adashima_volume";
const BRIGHTNESS_KEY = "adashima_brightness";
let playbackProgress = {};

function loadProgress() {
  try {
    const stored = localStorage.getItem(PROGRESS_KEY);
    if (stored) playbackProgress = JSON.parse(stored);
  } catch (e) {
    playbackProgress = {};
  }
}

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(playbackProgress));
  } catch (e) {}
}

function getEpisodeProgress(index) {
  if (!playbackProgress[index]) {
    playbackProgress[index] = { time: 0, watched: false, duration: 0 };
  }
  return playbackProgress[index];
}

function updateEpisodeProgress(index, time, duration) {
  if (!playbackProgress[index]) {
    playbackProgress[index] = { time: 0, watched: false, duration: 0 };
  }
  playbackProgress[index].time = time;
  playbackProgress[index].duration =
    duration || playbackProgress[index].duration;
  if (duration > 0 && time / duration >= 0.95) {
    playbackProgress[index].watched = true;
  }
  if (!playbackProgress._saveTimer) {
    playbackProgress._saveTimer = setTimeout(() => {
      saveProgress();
      playbackProgress._saveTimer = null;
      updateGuideProgress();
      updateFolderStates();
    }, 3000);
  }
}

function getWatchedCount() {
  let count = 0;
  CHANNELS.forEach((_, i) => {
    if (getEpisodeProgress(i).watched) count++;
  });
  return count;
}

function loadFolderStates() {
  try {
    const stored = localStorage.getItem(FOLDER_STATE_KEY);
    if (stored) folderStates = JSON.parse(stored);
  } catch (e) {
    folderStates = {};
  }
}

function saveFolderStates() {
  try {
    localStorage.setItem(FOLDER_STATE_KEY, JSON.stringify(folderStates));
  } catch (e) {}
}

// ----- DOM refs -----
const crtScreen = document.getElementById("crtScreen");
const crtVideo = document.getElementById("crtVideo");
const crtWrapper = document.getElementById("crtWrapper");
const crtBody = document.getElementById("crtBody");
const noSignal = document.getElementById("noSignal");
const noSignalText = document.getElementById("noSignalText");
const powerPrompt = document.getElementById("powerPrompt");
const powerBtn = document.getElementById("powerBtn");
const menuBtn = document.getElementById("menuBtn");
const playPauseBtn = document.getElementById("playPauseBtn");
const screenGlow = document.getElementById("screenGlow");
const staticOverlay = document.getElementById("staticOverlay");
const interference = document.getElementById("interferenceOverlay");
const powerFlash = document.getElementById("powerFlash");
const powerEffect = document.getElementById("powerEffect");
const loadingInd = document.getElementById("loadingIndicator");
const loadingText = document.getElementById("loadingText");
const downloadBtn = document.getElementById("downloadBtn");
const downloadLabel = document.getElementById("downloadLabel");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const downloadAllLabel = document.getElementById("downloadAllLabel");
const downloadModal = document.getElementById("downloadModal");
const downloadModalText = document.getElementById("downloadModalText");
const downloadModalCancel = document.getElementById("downloadModalCancel");
const downloadModalConfirm = document.getElementById("downloadModalConfirm");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const channelIndicator = document.getElementById("channelIndicator");
const channelTitle = document.getElementById("channelTitle");
const channelDesc = document.getElementById("channelDesc");
const episodeBadge = document.getElementById("episodeBadge");
const actionHint = document.getElementById("actionHint");
const jpTitle = document.getElementById("jpTitle");
const metaDuration = document.getElementById("metaDuration");
const metaRelease = document.getElementById("metaRelease");
const metaAudio = document.getElementById("metaAudio");
const progressFill = document.getElementById("progressFill");
const progressTime = document.getElementById("progressTime");
const progressState = document.getElementById("progressState");
const osdMenu = document.getElementById("osdMenu");
const osdChannelList = document.getElementById("osdChannelList");
const osdTitle = document.getElementById("osdTitle");
const osdSubtitle = document.getElementById("osdSubtitle");
const osdFooter = document.getElementById("osdFooter");
const tvLed = document.getElementById("tvLed");
const statusLed = document.getElementById("statusLed");
const statusText = document.getElementById("statusText");
const footerContent = document.getElementById("footer-content");
const osdOriginalParent = crtScreen;
const guideFolders = document.getElementById("guideFolders");
const guideTitle = document.getElementById("guideTitle");
const guideSub = document.getElementById("guideSub");
const guideProgressText = document.getElementById("guideProgressText");
const guideProgressFill = document.getElementById("guideProgressFill");
const upNextOverlay = document.getElementById("upNextOverlay");
const upNextTitle = document.getElementById("upNextTitle");
const upNextCh = document.getElementById("upNextCh");
const endEpisodeOverlay = document.getElementById("endEpisodeOverlay");
const eolTitle = document.getElementById("eolTitle");
const eolSub = document.getElementById("eolSub");
const eolReplayBtn = document.getElementById("eolReplayBtn");
const eolNextBtn = document.getElementById("eolNextBtn");
const eolLabel = document.getElementById("eolLabel");
const keyboardHelpBtn = document.getElementById("keyboardHelpBtn");
const keyboardHelpOverlay = document.getElementById("keyboardHelpOverlay");
const khClose = document.getElementById("khClose");
const episodeNumber = document.getElementById("episodeNumber");
const nowPlayingSub = document.getElementById("nowPlayingSub");
const nowEpisodeBadge = document.getElementById("nowEpisodeBadge");
const crtStageGlow = document.getElementById("crtStageGlow");
const heroArtworkImg = document.getElementById("heroArtworkImg");

// Language dropdown
const langDropdown = document.getElementById("langDropdown");
const langToggle = document.getElementById("langToggle");
const langMenu = document.getElementById("langMenu");

// Overlay controls
const overlayPlayPause = document.getElementById("overlayPlayPause");
const overlaySeekBack = document.getElementById("overlaySeekBack");
const overlaySeekFwd = document.getElementById("overlaySeekFwd");
const overlayPrev = document.getElementById("overlayPrev");
const overlayNext = document.getElementById("overlayNext");
const overlayFullscreen = document.getElementById("overlayFullscreen");
const overlayTitle = document.getElementById("overlayTitle");
const overlayChannel = document.getElementById("overlayChannel");
const overlayProgressFill = document.getElementById("overlayProgressFill");
const overlayProgressTime = document.getElementById("overlayProgressTime");
const crtOverlay = document.getElementById("crtOverlay");

// Physical buttons
const seekBackBtn = document.getElementById("seekBackBtn");
const seekFwdBtn = document.getElementById("seekFwdBtn");
const prevEpBtn = document.getElementById("prevEpBtn");
const nextEpBtn = document.getElementById("nextEpBtn");

// OSD notification refs
const osdNotif = document.getElementById("osdNotification");
const osdNotifMain = document.getElementById("osdNotifMain");
const osdNotifSub = document.getElementById("osdNotifSub");

// ================================================================
// buildChannels
// ================================================================
function buildChannels(data, miniData) {
  const channels = [];

  if (data && data.channels) {
    data.channels.forEach((ch, index) => {
      const epNum = index + 1;

      const isMini =
        ch.season === "mini" || ch.label?.toLowerCase().includes("mini");

      if (isMini) {
        const fileName = ch.file || `adashima chibi ${epNum} subs.mp4`;
        const videoUrl = `https://media.adashimaverse.com/Mini%20Anime%20sub%20espa/${encodeURIComponent(fileName)}`;
        channels.push({
          ...ch,
          src: videoUrl,
          downloadSrc: videoUrl,
          download: fileName,
          season: "mini",
          thumbnail: ch.thumbnail || null,
        });
      } else {
        let src, download;
        if (currentLang === "es") {
          src = `${CDN_BASE_URL}/Anime/Capitulo%20${epNum}.mp4`;
          download = `Capitulo_${epNum}.mp4`;
        } else {
          src = `${CDN_BASE_URL}/Anime/Ingles/%5BCleo%5DAdachi_to_Shimamura_-_${String(epNum).padStart(2, "0")}_(Dual%20Audio_10bit_1080p_x265).mkv`;
          download = `[Cleo]Adachi_to_Shimamura_-_${String(epNum).padStart(2, "0")}_(Dual Audio_10bit_1080p_x265).mkv`;
        }
        channels.push({
          ...ch,
          src: src,
          downloadSrc: src,
          download: download,
          season: ch.season || "main",
          thumbnail: ch.thumbnail || null,
        });
      }
    });
  }

  if (miniData && miniData.channels && currentLang === "es") {
    miniData.channels.forEach((ch, index) => {
      const exists = channels.some(
        (c) =>
          c.season === "mini" &&
          (c.file === ch.file ||
            (c.label === ch.label && c.title === ch.title)),
      );
      if (!exists) {
        const fileName = ch.file || `adashima chibi ${index + 1} subs.mp4`;
        const videoUrl = `https://media.adashimaverse.com/Mini%20Anime%20sub%20espa/${encodeURIComponent(fileName)}`;
        channels.push({
          ...ch,
          src: videoUrl,
          downloadSrc: videoUrl,
          download: fileName,
          season: ch.season || "mini",
          thumbnail: ch.thumbnail || null,
        });
      }
    });
  }

  return channels;
}

// ================================================================
// loadContent
// ================================================================
async function loadContent(lang) {
  try {
    console.log(`🔄 Loading ${lang}.json...`);
    const response = await fetch(
      `/src/data/anime/${lang}.json?v=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    if (!data.channels || data.channels.length === 0) {
      throw new Error("No channels found in JSON");
    }

    console.log(`✅ Loaded ${lang}.json with ${data.channels.length} channels`);
    return data;
  } catch (e) {
    console.warn(`⚠️ Failed to load ${lang}.json:`, e.message);

    if (lang === "es") {
      try {
        console.warn("🔄 Falling back to English for Spanish");
        const fallbackResponse = await fetch(
          `/src/data/anime/en.json?v=${Date.now()}`,
          { cache: "no-store" },
        );
        if (!fallbackResponse.ok) throw new Error("Fallback failed");
        const fallbackData = await fallbackResponse.json();
        console.log(
          `✅ Loaded fallback en.json with ${fallbackData.channels?.length || 0} channels`,
        );
        return fallbackData;
      } catch (fallbackError) {
        console.error("❌ Fallback also failed:", fallbackError);
        return null;
      }
    }

    console.error(`❌ Failed to load ${lang}.json - no fallback available`);
    return null;
  }
}

// ================================================================
// loadMiniAnime
// ================================================================
async function loadMiniAnime(lang) {
  if (lang === "en") {
    console.log("ℹ️ Skipping Mini Anime for English");
    return null;
  }

  try {
    console.log(`🔄 Loading mini_anime/${lang}.json...`);
    const response = await fetch(
      `/src/data/mini_anime/${lang}.json?v=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    console.log(
      `✅ Loaded mini_anime/${lang}.json with ${data.channels?.length || 0} channels`,
    );
    return data;
  } catch (e) {
    console.warn(`⚠️ Failed to load mini_anime/${lang}.json:`, e.message);
    return null;
  }
}

// ----- helpers -----
function getString(key, ...args) {
  if (!contentData) return key;
  const str = contentData[key];
  if (typeof str === "string" && str.includes("{count}"))
    return str.replace("{count}", args[0]);
  return str || key;
}

function isMobile() {
  return window.innerWidth <= 768;
}

function portOsdToBody() {
  if (osdMenu.parentElement !== document.body) {
    document.body.appendChild(osdMenu);
    osdMenu.classList.add("osd-portado");
  }
}
function portOsdToCrt() {
  if (osdMenu.parentElement !== osdOriginalParent) {
    osdOriginalParent.appendChild(osdMenu);
    osdMenu.classList.remove("osd-portado");
  }
}
function syncOsdPortal() {
  isMobile() ? portOsdToBody() : portOsdToCrt();
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function showChannelIndicator(text) {
  channelIndicator.textContent = text;
  channelIndicator.classList.add("show");
  clearTimeout(channelIndicator._timer);
  channelIndicator._timer = setTimeout(
    () => channelIndicator.classList.remove("show"),
    2200,
  );
}

function setStaticIntensity(level) {
  staticOverlay.style.opacity = level;
}

async function playInterference(duration = 400) {
  interference.style.opacity = "1";
  setStaticIntensity(0.7);
  await wait(duration * 0.25);
  interference.style.opacity = "0";
  await wait(duration * 0.15);
  interference.style.opacity = "0.6";
  setStaticIntensity(1);
  await wait(duration * 0.25);
  interference.style.opacity = "0";
}

// ----- OSD Notification system -----
let osdNotifTimer = null;

function showOSDNotification(mainText, subText = "") {
  osdNotifMain.textContent = mainText;
  osdNotifSub.textContent = subText || "";
  osdNotif.classList.add("show");
  clearTimeout(osdNotifTimer);
  osdNotifTimer = setTimeout(() => {
    osdNotif.classList.remove("show");
  }, 1200);
}

// ----- Update status display -----
function updateStatusDisplay() {
  if (state.powered) {
    statusLed.className = "status-led on";
    if (state.playing) {
      statusText.textContent = "ON AIR";
    } else if (state.currentChannel >= 0) {
      statusText.textContent = "PAUSED";
    } else {
      statusText.textContent = "STANDBY";
    }
  } else {
    statusLed.className = "status-led";
    statusText.textContent = "OFF";
  }
}

// ----- Update play/pause button -----
function updatePlayPauseBtn() {
  const icon = state.playing ? "mdi:pause" : "mdi:play";
  if (state.playing) {
    playPauseBtn.classList.add("playing");
  } else {
    playPauseBtn.classList.remove("playing");
  }
  const overlayIcon = overlayPlayPause.querySelector(".iconify");
  if (overlayIcon) {
    overlayIcon.setAttribute("data-icon", icon);
  }
}

// ----- Update overlay controls -----
function updateOverlayControls() {
  const ch =
    state.currentChannel >= 0 && state.currentChannel < CHANNELS.length
      ? CHANNELS[state.currentChannel]
      : null;
  if (ch && state.powered) {
    overlayTitle.textContent = ch.title;
    overlayChannel.textContent =
      ch.label || "CH " + String(state.currentChannel + 1).padStart(2, "0");
    const prog = getEpisodeProgress(state.currentChannel);
    const duration = prog.duration || 0;
    const current = prog.time || 0;
    const pct = duration > 0 ? (current / duration) * 100 : 0;
    overlayProgressFill.style.width = pct + "%";
    overlayProgressTime.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    crtOverlay.style.display = "flex";
  } else {
    crtOverlay.style.display = "none";
  }
  updatePlayPauseBtn();
}

// ----- Update physical buttons -----
function updateButtons() {
  const powered = state.powered;
  const hasChannel =
    state.currentChannel >= 0 && state.currentChannel < CHANNELS.length;

  menuBtn.disabled = !powered;
  playPauseBtn.disabled = !powered || !hasChannel;
  seekBackBtn.disabled = !powered || !hasChannel;
  seekFwdBtn.disabled = !powered || !hasChannel;
  prevEpBtn.disabled = !powered || state.currentChannel <= 0;
  nextEpBtn.disabled = !powered || state.currentChannel >= CHANNELS.length - 1;

  updatePlayPauseBtn();
  updateStatusDisplay();
  updateOverlayControls();
}

// ===== UPDATE EPISODE INFO PANEL =====
function updateEpisodeInfoPanel(ch) {
  if (!ch) {
    if (episodeNumber) episodeNumber.textContent = "—";
    channelTitle.textContent = getString("selectChannel");
    channelDesc.textContent = getString("selectChannelDesc");
    jpTitle.textContent = "";
    metaDuration.textContent = "—";
    metaRelease.textContent = "—";
    metaAudio.textContent = "JAPANESE";
    progressFill.style.width = "0%";
    progressTime.textContent = "00:00 / 00:00";
    progressState.textContent = "—";
    episodeBadge.textContent = "— / —";
    if (nowPlayingSub) nowPlayingSub.textContent = "—";
    if (nowEpisodeBadge) nowEpisodeBadge.textContent = "— / —";
    return;
  }

  const idx = CHANNELS.indexOf(ch);
  const prog = getEpisodeProgress(idx);

  if (episodeNumber)
    episodeNumber.textContent =
      ch.badge || `CH ${String(idx + 1).padStart(2, "0")}`;
  if (nowPlayingSub)
    nowPlayingSub.textContent =
      ch.badge || `CH ${String(idx + 1).padStart(2, "0")}`;
  if (nowEpisodeBadge)
    nowEpisodeBadge.textContent =
      ch.badge || `CH ${String(idx + 1).padStart(2, "0")}`;

  channelTitle.textContent = ch.title;
  channelDesc.textContent = ch.desc;
  episodeBadge.textContent =
    ch.badge || `CH ${String(idx + 1).padStart(2, "0")}`;

  if (ch.title_jp) {
    jpTitle.textContent = ch.title_jp;
    jpTitle.style.display = "inline-block";
  } else {
    jpTitle.style.display = "none";
  }

  metaDuration.textContent = ch.duration || "24 MIN";
  metaRelease.textContent = ch.release_jp || ch.release_en || "2020";
  metaAudio.textContent = ch.audio || "JAPANESE";

  updateProgress(ch);
  updateOverlayControls();
}

function updateProgress(ch) {
  if (!ch) return;
  const idx = CHANNELS.indexOf(ch);
  const prog = getEpisodeProgress(idx);
  const duration = prog.duration || 0;
  const current = prog.time || 0;
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  progressFill.style.width = pct + "%";
  progressTime.textContent = `${formatTime(current)} / ${formatTime(duration)}`;

  if (prog.watched) {
    progressState.textContent = "WATCHED ✓";
    progressState.style.color = "#8c5a96";
  } else if (current > 5 && pct < 95) {
    progressState.textContent = "CONTINUE";
    progressState.style.color = "#8c5a96";
  } else if (current > 0) {
    progressState.textContent = "NOW";
    progressState.style.color = "#d1a3c6";
  } else {
    progressState.textContent = "—";
    progressState.style.color = "rgba(92,58,107,0.4)";
  }
}

// ----- Guide progress -----
function updateGuideProgress() {
  const total = CHANNELS.length;
  const watched = getWatchedCount();
  guideProgressText.textContent = `${watched} / ${total} WATCHED`;
  const pct = total > 0 ? (watched / total) * 100 : 0;
  guideProgressFill.style.width = pct + "%";
}

// ===== FOLDER SYSTEM =====
function getFolderName(season) {
  if (season === "main" || !season) return getString("season1") || "SEASON 1";
  if (season === "mini") return getString("seasonMini") || "MINI ANIME";
  return season.charAt(0).toUpperCase() + season.slice(1);
}

function getFolderSubtext(season) {
  if (season === "main" || !season) return getString("tvSeries") || "TV SERIES";
  if (season === "mini") return getString("shortForm") || "SHORT-FORM SERIES";
  return "";
}

function getFolderProgress(season) {
  const episodes = CHANNELS.filter((ch) => (ch.season || "main") === season);
  let watched = 0;
  let inProgress = 0;
  let total = episodes.length;

  episodes.forEach((ch) => {
    const idx = CHANNELS.indexOf(ch);
    const prog = getEpisodeProgress(idx);
    const pct = prog.duration > 0 ? (prog.time / prog.duration) * 100 : 0;
    if (prog.watched) watched++;
    else if (prog.time > 5 && pct < 95) inProgress++;
  });

  return { watched, inProgress, total };
}

function getFolderCurrentEpisode(season) {
  if (state.currentChannel < 0 || !state.powered) return null;
  const ch = CHANNELS[state.currentChannel];
  if ((ch.season || "main") === season) {
    return ch;
  }
  return null;
}

function renderFolders() {
  guideFolders.innerHTML = "";

  const seasons = {};
  CHANNELS.forEach((ch) => {
    const season = ch.season || "main";
    if (!seasons[season]) seasons[season] = [];
    seasons[season].push(ch);
  });

  const seasonOrder = ["main", "mini"];
  const otherSeasons = Object.keys(seasons).filter(
    (s) => !seasonOrder.includes(s),
  );
  const orderedSeasons = [
    ...seasonOrder.filter((s) => seasons[s]),
    ...otherSeasons.filter((s) => seasons[s]),
  ];

  orderedSeasons.forEach((season) => {
    const episodes = seasons[season];
    const folderName = getFolderName(season);
    const subtext = getFolderSubtext(season);
    const progress = getFolderProgress(season);
    const currentEp = getFolderCurrentEpisode(season);
    const isOpen = folderStates[season] || false;
    const watchedPct =
      progress.total > 0 ? (progress.watched / progress.total) * 100 : 0;

    const folder = document.createElement("div");
    folder.className = `guide-folder${isOpen ? " open" : ""}`;
    folder.dataset.season = season;

    const tab = document.createElement("div");
    tab.className = "folder-tab";
    tab.textContent = "ARCHIVE";
    folder.appendChild(tab);

    const header = document.createElement("div");
    header.className = "folder-header";
    header.tabIndex = 0;
    header.setAttribute("role", "button");
    header.setAttribute("aria-expanded", isOpen);

    header.innerHTML = `
          <div class="folder-icon-wrap">
            <span class="folder-icon">
              <span class="iconify" data-icon="${isOpen ? "mdi:folder-open" : "mdi:folder"}" data-inline="false"></span>
            </span>
          </div>
          <div class="folder-info">
            <div class="folder-name">${folderName}</div>
            <div class="folder-meta">
              ${subtext ? `<span>${subtext}</span>` : ""}
              ${subtext ? `<span class="fm-dot">·</span>` : ""}
              <span>${progress.total} EPISODES</span>
              ${progress.inProgress > 0 ? `<span class="fm-dot">·</span><span>${progress.inProgress} IN PROGRESS</span>` : ""}
            </div>
          </div>
          <div class="folder-status">
            ${currentEp ? `<span class="folder-now"><span class="dot"></span> NOW ON AIR · ${currentEp.label || "CH " + String(CHANNELS.indexOf(currentEp) + 1).padStart(2, "0")}</span>` : ""}
            ${!currentEp && progress.inProgress > 0 ? `<span class="folder-in-progress">▶ ${progress.inProgress} IN PROGRESS</span>` : ""}
            <div class="folder-progress">
              <span class="fp-text">${progress.watched} / ${progress.total} WATCHED</span>
              <div class="fp-bar"><div class="fp-fill" style="width:${watchedPct}%"></div></div>
            </div>
            <span class="folder-toggle">${isOpen ? "−" : "+"}</span>
          </div>
        `;

    header.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFolder(season);
    });
    header.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleFolder(season);
      }
    });

    folder.appendChild(header);

    const content = document.createElement("div");
    content.className = "folder-content";

    const grid = document.createElement("div");
    grid.className = `episode-grid ${currentView === "grid" ? "grid-view" : ""}`;

    episodes.forEach((ch) => {
      const idx = CHANNELS.indexOf(ch);
      const prog = getEpisodeProgress(idx);
      const isActive = idx === state.currentChannel && state.powered;
      const isPlaying = isActive && state.playing;
      const pct = prog.duration > 0 ? (prog.time / prog.duration) * 100 : 0;

      let stateText = "";
      let stateClass = "";
      if (isPlaying) {
        stateText = "NOW";
        stateClass = "now";
      } else if (prog.watched) {
        stateText = "WATCHED ✓";
        stateClass = "watched";
      } else if (prog.time > 5 && pct < 95) {
        stateText = "CONTINUE";
        stateClass = "continue";
      }

      const card = document.createElement("div");
      card.className = `episode-card${isActive ? " active-ep" : ""}`;
      card.tabIndex = 0;

      if (currentView === "grid") {
        card.innerHTML = `
              <div class="ec-thumb">
                ${
                  ch.thumbnail
                    ? `<img class="ec-thumb-img" src="${ch.thumbnail}" alt="${ch.title}" loading="lazy" onerror="this.style.display='none'" />`
                    : `<div class="thumb-placeholder">${ch.label || "CH " + String(idx + 1).padStart(2, "0")}</div>`
                }
                <div class="ec-progress-bar"><div class="fill" style="width:${Math.min(100, pct)}%"></div></div>
              </div>
              <div class="ec-body">
                <div class="ec-title">${ch.title}</div>
                <div class="ec-meta">
                  <span class="ec-ch">${ch.label || "CH " + String(idx + 1).padStart(2, "0")}</span>
                  ${stateText ? `<span class="ec-state ${stateClass}">${stateText}</span>` : ""}
                </div>
                ${
                  prog.time > 5
                    ? `<div class="ec-progress" style="margin-top:4px;">
                  <div class="ec-bar"><div class="ec-bar-fill" style="width:${Math.min(100, pct)}%"></div></div>
                  <span class="ec-time">${formatTime(prog.time)} / ${formatTime(prog.duration || 0)}</span>
                </div>`
                    : ""
                }
              </div>
            `;
      } else {
        card.innerHTML = `
              <div class="ec-top">
                <span class="ec-ch">${ch.label || "CH " + String(idx + 1).padStart(2, "0")}</span>
                ${stateText ? `<span class="ec-state ${stateClass}">${stateText}</span>` : ""}
              </div>
              <div class="ec-title">${ch.title}</div>
              ${ch.title_jp ? `<div class="ec-jp">${ch.title_jp}</div>` : ""}
              ${
                prog.time > 5
                  ? `
                <div class="ec-progress">
                  <div class="ec-bar"><div class="ec-bar-fill" style="width:${Math.min(100, pct)}%"></div></div>
                  <span class="ec-time">${formatTime(prog.time)} / ${formatTime(prog.duration || 0)}</span>
                </div>
              `
                  : ""
              }
              ${prog.time > 5 && pct < 95 ? `<div class="ec-resume">RESUME →</div>` : ""}
            `;
      }

      card.addEventListener("click", () => {
        if (!state.powered) {
          powerOn().then(() => setTimeout(() => switchChannel(idx), 800));
        } else switchChannel(idx);
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!state.powered) {
            powerOn().then(() => setTimeout(() => switchChannel(idx), 800));
          } else switchChannel(idx);
        }
      });

      grid.appendChild(card);
    });

    content.appendChild(grid);
    folder.appendChild(content);
    guideFolders.appendChild(folder);
  });

  updateGuideProgress();
}

function toggleFolder(season) {
  folderStates[season] = !folderStates[season];
  saveFolderStates();

  const folder = guideFolders.querySelector(
    `.guide-folder[data-season="${season}"]`,
  );
  if (folder) {
    folder.classList.toggle("open", folderStates[season]);
    const header = folder.querySelector(".folder-header");
    const toggle = folder.querySelector(".folder-toggle");
    const iconSpan = folder.querySelector(".folder-icon");
    if (header) header.setAttribute("aria-expanded", folderStates[season]);
    if (toggle) toggle.textContent = folderStates[season] ? "−" : "+";
    if (iconSpan) {
      iconSpan.innerHTML = `<span class="iconify" data-icon="${folderStates[season] ? "mdi:folder-open" : "mdi:folder"}" data-inline="false"></span>`;
    }
  }
}

function updateFolderStates() {
  document.querySelectorAll(".guide-folder").forEach((folder) => {
    const season = folder.dataset.season;
    if (season) {
      const progress = getFolderProgress(season);
      const fpText = folder.querySelector(".fp-text");
      const fpFill = folder.querySelector(".fp-fill");
      const watchedPct =
        progress.total > 0 ? (progress.watched / progress.total) * 100 : 0;
      if (fpText)
        fpText.textContent = `${progress.watched} / ${progress.total} WATCHED`;
      if (fpFill) fpFill.style.width = watchedPct + "%";

      const inProgressSpan = folder.querySelector(".folder-in-progress");
      const currentEp = getFolderCurrentEpisode(season);
      if (inProgressSpan) {
        if (!currentEp && progress.inProgress > 0) {
          inProgressSpan.textContent = `▶ ${progress.inProgress} IN PROGRESS`;
          inProgressSpan.style.display = "inline-block";
        } else {
          inProgressSpan.style.display = "none";
        }
      }

      const nowSpan = folder.querySelector(".folder-now");
      if (nowSpan) {
        if (currentEp) {
          nowSpan.innerHTML = `<span class="dot"></span> NOW ON AIR · ${currentEp.label || "CH " + String(CHANNELS.indexOf(currentEp) + 1).padStart(2, "0")}`;
          nowSpan.style.display = "inline-flex";
        } else {
          nowSpan.style.display = "none";
        }
      }

      const cards = folder.querySelectorAll(".episode-card");
      cards.forEach((card) => {
        const chLabel = card.querySelector(".ec-ch")?.textContent;
        const globalIdx = CHANNELS.findIndex(
          (ch) => ch.label === chLabel || ch.label === chLabel,
        );
        if (globalIdx >= 0) {
          const prog = getEpisodeProgress(globalIdx);
          const pct = prog.duration > 0 ? (prog.time / prog.duration) * 100 : 0;
          const isActive = globalIdx === state.currentChannel && state.powered;

          const stateEl = card.querySelector(".ec-state");
          let stateText = "";
          let stateClass = "";
          if (isActive && state.playing) {
            stateText = "NOW";
            stateClass = "now";
          } else if (prog.watched) {
            stateText = "WATCHED ✓";
            stateClass = "watched";
          } else if (prog.time > 5 && pct < 95) {
            stateText = "CONTINUE";
            stateClass = "continue";
          }
          if (stateEl) {
            stateEl.textContent = stateText;
            stateEl.className = `ec-state ${stateClass}`;
          }

          card.classList.toggle("active-ep", isActive);

          const barFill = card.querySelector(".ec-bar-fill");
          const timeEl = card.querySelector(".ec-time");
          if (barFill) barFill.style.width = Math.min(100, pct) + "%";
          if (timeEl && prog.time > 5) {
            timeEl.textContent = `${formatTime(prog.time)} / ${formatTime(prog.duration || 0)}`;
          }

          const resumeEl = card.querySelector(".ec-resume");
          if (resumeEl) {
            resumeEl.style.display =
              prog.time > 5 && pct < 95 ? "block" : "none";
          }
        }
      });
    }
  });

  updateGuideProgress();
}

// ===== BUILD OSD MENU =====
function buildOsdMenu() {
  osdChannelList.innerHTML = "";
  CHANNELS.forEach((ch, i) => {
    const item = document.createElement("div");
    item.className = "osd-ch-item";
    item.dataset.index = i;

    const prog = getEpisodeProgress(i);
    let stateText = "";
    let stateClass = "";
    if (i === state.currentChannel && state.powered) {
      stateText = "NOW";
      stateClass = "active";
    } else if (prog.watched) {
      stateText = "WATCHED ✓";
      stateClass = "watched";
    } else if (prog.time > 5) {
      stateText = "CONTINUE";
      stateClass = "active";
    }

    const progressPct =
      prog.duration > 0 ? (prog.time / prog.duration) * 100 : 0;

    item.innerHTML = `
          <div class="osd-ch-num">${ch.label || "CH " + (i + 1)}</div>
          <div class="osd-ch-info">
            <div class="osd-ch-name">${ch.title}</div>
            <div class="osd-ch-sub">${ch.sub || ""}</div>
            ${
              prog.time > 5
                ? `
              <div class="osd-ch-progress">
                ${formatTime(prog.time)} / ${formatTime(prog.duration || 0)}
                <div class="mini-bar">
                  <div class="mini-bar-fill" style="width:${Math.min(100, progressPct)}%"></div>
                </div>
              </div>
            `
                : ""
            }
          </div>
          <div class="osd-ch-dot"></div>
          ${stateText ? `<div class="osd-ch-state ${stateClass}">${stateText}</div>` : ""}
        `;
    item.addEventListener("click", () => {
      closeMenu();
      switchChannel(i);
    });
    osdChannelList.appendChild(item);
  });
}

function updateOsdActiveChannel() {
  osdChannelList.querySelectorAll(".osd-ch-item").forEach((el, i) => {
    el.classList.toggle("active-ch", i === state.currentChannel);
    const stateEl = el.querySelector(".osd-ch-state");
    if (stateEl) {
      const prog = getEpisodeProgress(i);
      if (i === state.currentChannel && state.powered) {
        stateEl.textContent = "NOW";
        stateEl.className = "osd-ch-state active";
      } else if (prog.watched) {
        stateEl.textContent = "WATCHED ✓";
        stateEl.className = "osd-ch-state watched";
      } else if (prog.time > 5) {
        stateEl.textContent = "CONTINUE";
        stateEl.className = "osd-ch-state active";
      } else {
        stateEl.textContent = "";
        stateEl.className = "osd-ch-state";
      }
    }
  });
}

// ===== RENDER APP =====
async function renderApp() {
  if (!contentData) {
    console.error("❌ No content data available to render");
    const errorMsg =
      currentLang === "es"
        ? "Error al cargar los datos. Por favor, recarga la página."
        : "Error loading data. Please reload the page.";
    showOSDNotification("ERROR", errorMsg);
    return;
  }

  if (currentLang === "en") {
    miniAnimeData = null;
    console.log("ℹ️ Mini Anime skipped for English");
  } else {
    try {
      miniAnimeData = await loadMiniAnime(currentLang);
    } catch (e) {
      console.warn("Mini anime data not available:", e);
      miniAnimeData = null;
    }
  }

  footerContent.innerHTML = getString("footerText");
  powerBtn.title = getString("powerBtnTitle");
  menuBtn.title = getString("menuBtnTitle");
  playPauseBtn.title = getString("playPauseBtnTitle");
  downloadBtn.title = getString("downloadBtnTitle");
  fullscreenBtn.title = getString("fullscreenBtnTitle");
  document.getElementById("volKnob").title = getString("volKnobTitle");
  document.getElementById("brtKnob").title = getString("brtKnobTitle");
  downloadLabel.textContent = getString("downloadLabel");
  downloadAllLabel.textContent = getString("downloadAllLabel");
  osdTitle.textContent = "YASHONY CHANNELS";
  osdSubtitle.textContent = getString("osdSubtitle");
  osdFooter.textContent = getString("osdFooter");
  downloadModalCancel.textContent = getString("cancelLabel");
  downloadModalConfirm.textContent = getString("continueLabel");
  document.getElementById("downloadModalTitleText").textContent =
    getString("downloadAllTitle");
  loadingText.textContent = getString("loadingText");
  noSignalText.textContent = getString("noSignal");
  powerPrompt.textContent = getString("powerPrompt") || "PRESS PWR TO START";
  actionHint.textContent =
    getString("actionHint") || "Download your favorite episodes";
  guideTitle.textContent = getString("guideTitle") || "Episodes";
  guideSub.textContent = getString("guideSub") || "CHANNEL GUIDE · 12 EPISODES";

  keyboardHelpBtn.title =
    getString("keyboardHelpTitle") || "Keyboard shortcuts";

  const guideSearchInput = document.getElementById("guideSearchInput");
  if (guideSearchInput) {
    guideSearchInput.placeholder =
      getString("guideSearchPlaceholder") || "Search episodes...";
  }
  const expandAllBtn = document.getElementById("guideExpandAll");
  const collapseAllBtn = document.getElementById("guideCollapseAll");
  if (expandAllBtn)
    expandAllBtn.textContent = getString("guideExpandAll") || "Expand";
  if (collapseAllBtn)
    collapseAllBtn.textContent = getString("guideCollapseAll") || "Collapse";

  eolLabel.textContent = getString("eolLabel") || "TRANSMISSION COMPLETE";
  document.getElementById("eolReplayLabel").textContent =
    getString("eolReplay") || "REPLAY";
  document.getElementById("eolNextLabel").textContent =
    getString("eolNext") || "NEXT CHANNEL";
  document.getElementById("heroSynopsis").textContent =
    getString("synopsis") ||
    "High school students Adachi and Shimamura share a bond that goes beyond friendship. A tender story of connection, growth, and the quiet moments that define a relationship.";

  CHANNELS = buildChannels(contentData, miniAnimeData);
  buildOsdMenu();
  if (!state.powered) updateEpisodeInfoPanel(null);

  if (
    state.currentChannel >= 0 &&
    state.currentChannel < CHANNELS.length &&
    state.powered
  ) {
    const ch = CHANNELS[state.currentChannel];
    updateEpisodeInfoPanel(ch);
    if (crtVideo.src !== ch.src) {
      crtVideo.pause();
      crtVideo.removeAttribute("src");
      crtVideo.load();
      crtVideo.src = ch.src;
    }
  }
  document.documentElement.lang = currentLang;
  updateButtons();
  renderFolders();
  updateGuideProgress();

  const searchInput = document.getElementById("guideSearchInput");
  const searchClear = document.getElementById("guideSearchClear");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const val = e.target.value;
      if (searchClear) searchClear.style.display = val ? "block" : "none";
      filterGuide(val);
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        searchInput.value = "";
        filterGuide("");
        if (searchClear) searchClear.style.display = "none";
      }
    });
  }
  if (searchClear) {
    searchClear.addEventListener("click", () => {
      if (searchInput) {
        searchInput.value = "";
        filterGuide("");
        searchClear.style.display = "none";
      }
    });
  }
  document.getElementById("guideExpandAll")?.addEventListener("click", () => {
    document.querySelectorAll(".guide-folder").forEach((f) => {
      const season = f.dataset.season;
      if (season && !folderStates[season]) toggleFolder(season);
    });
  });
  document.getElementById("guideCollapseAll")?.addEventListener("click", () => {
    document.querySelectorAll(".guide-folder").forEach((f) => {
      const season = f.dataset.season;
      if (season && folderStates[season]) toggleFolder(season);
    });
  });

  const viewToggle = document.getElementById("viewToggle");
  if (viewToggle) {
    viewToggle.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", function () {
        const view = this.dataset.view;
        currentView = view;
        localStorage.setItem("episodeView", view);
        viewToggle
          .querySelectorAll("button")
          .forEach((b) => b.classList.remove("active"));
        this.classList.add("active");
        renderFolders();
        updateFolderStates();
      });
    });
    viewToggle.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === currentView);
    });
  }

  if (heroArtworkImg) {
    heroArtworkImg.classList.add("loading");
    heroArtworkImg.onload = function () {
      this.classList.remove("loading");
      this.classList.add("loaded");
    };
    if (heroArtworkImg.complete) {
      heroArtworkImg.classList.remove("loading");
      heroArtworkImg.classList.add("loaded");
    }
    heroArtworkImg.onerror = function () {
      this.style.display = "none";
    };
  }

  console.log(
    `✅ App rendered with ${CHANNELS.length} channels in ${currentLang}`,
  );
}

// ===== SEARCH / FILTER =====
function filterGuide(query) {
  const q = query.toLowerCase().trim();
  const folders = guideFolders.querySelectorAll(".guide-folder");
  folders.forEach((folder) => {
    const cards = folder.querySelectorAll(".episode-card");
    let anyMatch = false;
    cards.forEach((card) => {
      const text = card.textContent.toLowerCase();
      const match = !q || text.includes(q);
      card.style.display = match ? "" : "none";
      if (match) anyMatch = true;
    });
    folder.style.display = anyMatch || !q ? "" : "none";
    if (q && anyMatch) {
      folder.classList.add("open");
      const toggle = folder.querySelector(".folder-toggle");
      const iconSpan = folder.querySelector(".folder-icon");
      if (toggle) toggle.textContent = "−";
      if (iconSpan)
        iconSpan.innerHTML = `<span class="iconify" data-icon="mdi:folder-open" data-inline="false"></span>`;
    }
  });
}

// ===== KEYBOARD SHORTCUTS HELP =====
function toggleKeyboardHelp() {
  state.keyboardHelpOpen = !state.keyboardHelpOpen;
  keyboardHelpOverlay.classList.toggle("visible", state.keyboardHelpOpen);
  document.body.style.overflow = state.keyboardHelpOpen ? "hidden" : "";
}

function closeKeyboardHelp() {
  state.keyboardHelpOpen = false;
  keyboardHelpOverlay.classList.remove("visible");
  document.body.style.overflow = "";
}

// ===== POWER EFFECTS =====
async function playPowerOnEffect() {
  if (state.powerEffectActive) return;
  state.powerEffectActive = true;

  powerFlash.style.transition = "opacity 0.05s";
  powerFlash.style.opacity = "1";
  await wait(60);
  powerFlash.style.transition = "opacity 0.3s";
  powerFlash.style.opacity = "0";

  powerEffect.style.display = "block";
  powerEffect.style.opacity = "1";
  powerEffect.style.clipPath = "inset(50% 0 50% 0)";
  await wait(50);
  powerEffect.style.transition = "clip-path 0.5s ease-out, opacity 0.3s";
  powerEffect.style.clipPath = "inset(0% 0 0% 0)";
  await wait(500);
  powerEffect.style.opacity = "0";
  await wait(200);
  powerEffect.style.display = "none";

  state.powerEffectActive = false;
}

async function playPowerOffEffect() {
  if (state.powerEffectActive) return;
  state.powerEffectActive = true;

  powerEffect.style.display = "block";
  powerEffect.style.opacity = "1";
  powerEffect.style.clipPath = "inset(0% 0 0% 0)";
  powerEffect.style.transition = "none";
  await wait(20);
  powerEffect.style.transition = "clip-path 0.4s ease-in, opacity 0.3s";
  powerEffect.style.clipPath = "inset(50% 0 50% 0)";
  await wait(400);
  powerEffect.style.opacity = "0";
  await wait(200);
  powerEffect.style.display = "none";

  state.powerEffectActive = false;
}

// ================================================================
// CORE TV FUNCTIONS
// ================================================================
async function powerOn() {
  if (state.powered || state.switching) return;
  state.switching = true;

  await playPowerOnEffect();

  noSignal.style.transition = "opacity 0.3s";
  noSignal.style.opacity = "0";
  await wait(250);
  noSignal.classList.remove("off-state");
  noSignalText.textContent = getString("noSignal");
  noSignal.style.opacity = "0";
  setStaticIntensity(0.5);
  await wait(350);
  noSignal.style.display = "flex";
  noSignal.style.transition = "opacity 0.35s";
  noSignal.style.opacity = "1";
  setStaticIntensity(0.2);
  crtScreen.classList.add("powered-on");
  screenGlow.classList.add("active");
  if (crtStageGlow) crtStageGlow.classList.add("active");
  powerBtn.classList.add("on");
  if (tvLed) tvLed.classList.add("on");
  crtWrapper.classList.add("powered-on");
  crtBody.classList.add("powered-on");
  state.powered = true;
  state.switching = false;
  menuBtn.disabled = false;
  playPauseBtn.disabled = true;
  await wait(700);
  crtScreen.classList.remove("powered-on");
  setStaticIntensity(0.06);
  updateButtons();
  showOSDNotification("POWER ON");
  renderFolders();
}

async function powerOff() {
  if (!state.powered || state.switching) return;
  state.switching = true;
  closeMenu();
  crtVideo.pause();
  crtVideo.removeAttribute("src");
  crtVideo.load();
  setStaticIntensity(1);
  await wait(120);
  crtScreen.classList.add("powered-off");
  setStaticIntensity(0);
  await wait(500);
  crtScreen.classList.remove("powered-off");
  crtVideo.style.opacity = "0";
  noSignal.classList.add("off-state");
  noSignalText.textContent = "";
  noSignal.style.display = "flex";
  noSignal.style.opacity = "0";
  await wait(40);
  noSignal.style.transition = "opacity 0.4s";
  noSignal.style.opacity = "1";
  screenGlow.classList.remove("active");
  if (crtStageGlow) crtStageGlow.classList.remove("active");
  powerBtn.classList.remove("on");
  if (tvLed) tvLed.classList.remove("on");
  crtWrapper.classList.remove("powered-on");
  crtBody.classList.remove("powered-on");
  state.currentChannel = -1;
  state.playing = false;
  state.powered = false;
  state.switching = false;
  menuBtn.disabled = true;
  menuBtn.classList.remove("active");
  playPauseBtn.disabled = true;
  updatePlayPauseBtn();

  await playPowerOffEffect();

  setTimeout(() => {
    volKnobCtrl.reset();
    brtKnobCtrl.reset();
    state.volume = 1;
    state.brightness = 1.0;
    crtVideo.volume = 1;
    crtScreen.style.filter = "";
  }, 350);
  updateEpisodeInfoPanel(null);
  updateButtons();
  renderFolders();
  showOSDNotification("POWER OFF");
}

// ================================================================
// switchChannel - NO AUTOPLAY
// ================================================================
async function switchChannel(index, restoreTime = null) {
  if (!state.powered || state.switching) return;
  if (index === state.currentChannel && restoreTime === null) return;
  const ch = CHANNELS[index];
  if (!ch) return;

  endEpisodeOverlay.classList.remove("show");

  state.switching = true;

  const label = ch.label || "CH " + (index + 1);
  showChannelIndicator(label);
  showOSDNotification("CH " + (index + 1), ch.sub || "");

  setStaticIntensity(1);
  await playInterference(350);
  crtVideo.classList.add("channel-switching");

  if (noSignal.style.display !== "none") {
    noSignal.style.transition = "opacity 0.15s";
    noSignal.style.opacity = "0";
    await wait(150);
    noSignal.style.display = "none";
  }

  loadingInd.classList.add("show");
  loadingText.textContent = "TUNING " + label + "...";

  const videoUrl = ch.src;

  if (crtVideo.src !== videoUrl) {
    crtVideo.pause();
    crtVideo.removeAttribute("src");
    crtVideo.load();
    crtVideo.src = videoUrl;
  }
  crtVideo.style.opacity = "1";

  await new Promise((resolve) => {
    if (crtVideo.readyState >= 3) {
      resolve();
      return;
    }
    const onCanPlay = () => {
      crtVideo.removeEventListener("canplay", onCanPlay);
      crtVideo.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      crtVideo.removeEventListener("canplay", onCanPlay);
      crtVideo.removeEventListener("error", onError);
      resolve();
    };
    crtVideo.addEventListener("canplay", onCanPlay);
    crtVideo.addEventListener("error", onError);
    setTimeout(resolve, 5000);
  });

  loadingInd.classList.remove("show");
  await wait(100);
  crtVideo.classList.remove("channel-switching");
  setStaticIntensity(0.06);

  crtVideo.volume = state.muted ? 0 : state.volume;

  if (
    restoreTime !== null &&
    restoreTime > 0 &&
    restoreTime < crtVideo.duration - 2
  ) {
    crtVideo.currentTime = restoreTime;
    showOSDNotification("RESUME", formatTime(restoreTime));
  }

  downloadLabel.textContent = getString("downloadLabel");
  state.currentChannel = index;
  state.switching = false;
  playPauseBtn.disabled = false;

  updateEpisodeInfoPanel(ch);
  updateButtons();
  renderFolders();
  buildOsdMenu();

  localStorage.setItem("adashima_last_channel", index);

  showOSDNotification(ch.title, "CH " + (index + 1));
  updateURL(index);
}

// ===== URL HANDLING =====
function updateURL(index) {
  const url = new URL(window.location);
  if (index >= 0) {
    url.searchParams.set("episode", index + 1);
  } else {
    url.searchParams.delete("episode");
  }
  window.history.replaceState({ episode: index }, "", url);
}

function parseURL() {
  const params = new URLSearchParams(window.location.search);
  const ep = params.get("episode");
  if (ep) {
    const idx = parseInt(ep) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < CHANNELS.length) {
      return idx;
    }
  }
  return -1;
}

// ===== MENU FUNCTIONS =====
function openMenu() {
  if (!state.powered) return;
  state.menuOpen = true;
  buildOsdMenu();
  updateOsdActiveChannel();
  osdMenu.classList.add("visible");
  menuBtn.classList.add("active");
  if (isMobile()) document.body.style.overflow = "hidden";
  if (state.currentChannel >= 0) {
    const activeItem = osdChannelList.children[state.currentChannel];
    if (activeItem)
      activeItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}
function closeMenu() {
  state.menuOpen = false;
  osdMenu.classList.remove("visible");
  menuBtn.classList.remove("active");
  document.body.style.overflow = "";
}
function toggleMenu() {
  state.menuOpen ? closeMenu() : openMenu();
}

// ===== PLAY/PAUSE =====
function togglePlayPause() {
  if (!state.powered || state.currentChannel < 0 || state.switching) return;
  if (crtVideo.paused) {
    crtVideo.play().catch(() => {});
    showOSDNotification("PLAY");
  } else {
    crtVideo.pause();
    showOSDNotification("PAUSE");
  }
}

// ===== SEEK =====
function seekBackward() {
  if (!state.powered || state.currentChannel < 0) return;
  crtVideo.currentTime = Math.max(0, crtVideo.currentTime - 10);
  showOSDNotification("◀◀ -10 SEC", formatTime(crtVideo.currentTime));
}

function seekForward() {
  if (!state.powered || state.currentChannel < 0) return;
  crtVideo.currentTime = Math.min(crtVideo.duration, crtVideo.currentTime + 10);
  showOSDNotification("▶▶ +10 SEC", formatTime(crtVideo.currentTime));
}

// ===== NAVIGATION =====
function prevEpisode() {
  if (state.currentChannel > 0 && state.powered) {
    const prev = state.currentChannel - 1;
    const prog = getEpisodeProgress(prev);
    const restoreTime =
      prog.time > 5 && prog.time / (prog.duration || 1) < 0.95
        ? prog.time
        : null;
    switchChannel(prev, restoreTime);
  }
}

function nextEpisode() {
  if (state.currentChannel < CHANNELS.length - 1 && state.powered) {
    const next = state.currentChannel + 1;
    const prog = getEpisodeProgress(next);
    const restoreTime =
      prog.time > 5 && prog.time / (prog.duration || 1) < 0.95
        ? prog.time
        : null;
    switchChannel(next, restoreTime);
  }
}

// ===== DOWNLOAD =====
async function forceDownload(url, fileName, onProgress) {
  const response = await fetch(url);
  if (!response.ok || !response.body)
    throw new Error("Network response was not ok");
  const total = Number(response.headers.get("Content-Length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress)
      onProgress(total ? Math.round((received / total) * 100) : null);
  }
  const blob = new Blob(chunks);
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(blobUrl);
  document.body.removeChild(a);
}

function showDownloadModal(message) {
  return new Promise((resolve) => {
    if (!downloadModal) {
      resolve(false);
      return;
    }
    downloadModalText.textContent = message;
    downloadModal.classList.add("show");
    downloadModal.setAttribute("aria-hidden", "false");
    const cleanup = (result) => {
      downloadModal.classList.remove("show");
      downloadModal.setAttribute("aria-hidden", "true");
      downloadModalCancel.removeEventListener("click", onCancel);
      downloadModalConfirm.removeEventListener("click", onConfirm);
      downloadModal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeydown);
      resolve(result);
    };
    const onCancel = () => cleanup(false);
    const onConfirm = () => cleanup(true);
    const onBackdrop = (event) => {
      if (event.target === downloadModal) cleanup(false);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") cleanup(false);
    };
    downloadModalCancel.addEventListener("click", onCancel);
    downloadModalConfirm.addEventListener("click", onConfirm);
    downloadModal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeydown);
  });
}

async function downloadAllEpisodes() {
  if (!CHANNELS.length) return;
  const count = CHANNELS.length;
  const confirmed = await showDownloadModal(
    getString("downloadAllText", count),
  );
  if (!confirmed) return;
  const originalHtml = downloadAllBtn.innerHTML;
  downloadAllBtn.disabled = true;
  try {
    for (let i = 0; i < CHANNELS.length; i++) {
      const ch = CHANNELS[i];
      const setLabel = (pct) => {
        const pctText = pct !== null && pct !== undefined ? ` ${pct}%` : "";
        downloadAllBtn.innerHTML = `<span class="iconify" data-icon="mdi:loading" data-inline="false" style="animation:spin 1s linear infinite;"></span><span>${currentLang === "es" ? "Descargando" : "Downloading"} ${i + 1}/${CHANNELS.length}${pctText}</span>`;
      };
      setLabel(null);
      await forceDownload(
        ch.downloadSrc || ch.src,
        ch.download || `${ch.label || "episode"}.mp4`,
        setLabel,
      );
    }
  } finally {
    downloadAllBtn.disabled = false;
    downloadAllBtn.innerHTML = originalHtml;
  }
}

// ===== FULLSCREEN =====
function toggleFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    crtVideo.controls = false;
    crtScreen.style.filter = "none";
    const req =
      crtScreen.requestFullscreen || crtScreen.webkitRequestFullscreen;
    if (req) req.call(crtScreen).catch(() => {});
    fullscreenBtn.innerHTML =
      '<span class="iconify" data-icon="mdi:fullscreen-exit" data-inline="false"></span>';
  } else {
    const ex = document.exitFullscreen || document.webkitExitFullscreen;
    if (ex) ex.call(document).catch(() => {});
  }
}
function onFullscreenChange() {
  const isFs = !!(
    document.fullscreenElement || document.webkitFullscreenElement
  );
  fullscreenBtn.innerHTML = isFs
    ? '<span class="iconify" data-icon="mdi:fullscreen-exit" data-inline="false"></span>'
    : '<span class="iconify" data-icon="mdi:fullscreen" data-inline="false"></span>';
  if (!isFs) {
    crtVideo.controls = false;
    crtScreen.style.filter = `brightness(${state.brightness})`;
  }
}
document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);

// ===== KNOBS =====
const ARC_CX = 27,
  ARC_CY = 27,
  ARC_R = 24;
const ARC_START_DEG = 225,
  ARC_TOTAL_DEG = 270;
function degToRad(d) {
  return (d * Math.PI) / 180;
}
function arcPoint(angleDeg) {
  const rad = degToRad(angleDeg - 90);
  return {
    x: ARC_CX + ARC_R * Math.cos(rad),
    y: ARC_CY + ARC_R * Math.sin(rad),
  };
}
function buildArcPath(startDeg, sweepDeg) {
  if (Math.abs(sweepDeg) < 0.5) return "";
  const large = sweepDeg > 180 ? 1 : 0;
  const p1 = arcPoint(startDeg);
  const p2 = arcPoint(startDeg + sweepDeg);
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${ARC_R} ${ARC_R} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
}

function createKnob({
  knobEl,
  indicatorEl,
  tipEl,
  knobWrapper,
  arcBgEl,
  arcFillEl,
  osdValueEl,
  osdBarEl,
  min,
  max,
  initial,
  step,
  formatTip,
  onChange,
  storageKey,
}) {
  let value = initial;
  const KNOB_ANGLE_MIN = -135,
    KNOB_ANGLE_MAX = 135;

  if (storageKey) {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) value = parseFloat(saved);
    } catch (e) {}
  }

  function valueToKnobAngle(v) {
    const t = (v - min) / (max - min);
    return KNOB_ANGLE_MIN + t * (KNOB_ANGLE_MAX - KNOB_ANGLE_MIN);
  }
  function clamp(v) {
    return Math.max(min, Math.min(max, v));
  }
  function updateArc(v) {
    const t = (v - min) / (max - min);
    const sweepTotal = ARC_TOTAL_DEG;
    arcBgEl.setAttribute("d", buildArcPath(ARC_START_DEG, sweepTotal));
    const sweepFill = t * sweepTotal;
    arcFillEl.setAttribute(
      "d",
      sweepFill > 0.5 ? buildArcPath(ARC_START_DEG, sweepFill) : "",
    );
    const hue = 300 - t * 60;
    arcFillEl.style.stroke = `hsla(${hue},50%,72%,0.55)`;
  }
  function applyValue(v, isDragging) {
    value = clamp(v);
    const angle = valueToKnobAngle(value);
    indicatorEl.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    indicatorEl.style.transformOrigin = "bottom center";
    updateArc(value);
    const txt = formatTip(value);
    tipEl.textContent = txt;
    if (osdValueEl) osdValueEl.textContent = txt;
    if (osdBarEl) {
      const pct = ((value - min) / (max - min)) * 100;
      osdBarEl.style.width = pct + "%";
    }
    const pct = ((value - min) / (max - min)) * 100;
    knobEl.setAttribute("aria-valuenow", Math.round(pct));
    onChange(value, isDragging);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, value);
      } catch (e) {}
    }
  }
  applyValue(value, false);

  let dragStartY = null,
    dragStartVal = null;
  knobEl.addEventListener("mousedown", (e) => {
    dragStartY = e.clientY;
    dragStartVal = value;
    knobWrapper.classList.add("dragging");
    e.preventDefault();
    knobEl.focus();
  });
  document.addEventListener("mousemove", (e) => {
    if (dragStartY === null) return;
    const delta = (dragStartY - e.clientY) * step;
    applyValue(dragStartVal + delta, true);
  });
  document.addEventListener("mouseup", () => {
    if (dragStartY !== null) {
      dragStartY = null;
      knobWrapper.classList.remove("dragging");
    }
  });
  let touchStartY = null,
    touchStartVal = null;
  knobEl.addEventListener(
    "touchstart",
    (e) => {
      touchStartY = e.touches[0].clientY;
      touchStartVal = value;
      knobWrapper.classList.add("dragging");
      e.preventDefault();
    },
    { passive: false },
  );
  knobEl.addEventListener(
    "touchmove",
    (e) => {
      if (touchStartY === null) return;
      const delta = (touchStartY - e.touches[0].clientY) * step;
      applyValue(touchStartVal + delta, true);
      e.preventDefault();
    },
    { passive: false },
  );
  knobEl.addEventListener("touchend", () => {
    touchStartY = null;
    knobWrapper.classList.remove("dragging");
  });
  knobEl.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      applyValue(value + dir * step * 18, true);
      knobWrapper.classList.add("dragging");
      clearTimeout(knobWrapper._scrollTimer);
      knobWrapper._scrollTimer = setTimeout(
        () => knobWrapper.classList.remove("dragging"),
        800,
      );
    },
    { passive: false },
  );

  knobEl.addEventListener("keydown", (e) => {
    let delta = 0;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") delta = step * 20;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") delta = -step * 20;
    else if (e.key === "Home") delta = -1;
    else if (e.key === "End") delta = 1;
    if (delta !== 0) {
      e.preventDefault();
      applyValue(value + delta, true);
      knobWrapper.classList.add("dragging");
      clearTimeout(knobWrapper._keyTimer);
      knobWrapper._keyTimer = setTimeout(
        () => knobWrapper.classList.remove("dragging"),
        800,
      );
    }
  });

  return {
    reset() {
      applyValue(initial, false);
    },
    getValue() {
      return value;
    },
  };
}

const volKnobCtrl = createKnob({
  knobEl: document.getElementById("volKnobCircle"),
  indicatorEl: document.getElementById("volIndicator"),
  tipEl: document.getElementById("volTip"),
  knobWrapper: document.getElementById("volKnob"),
  arcBgEl: document.getElementById("volArcBg"),
  arcFillEl: document.getElementById("volArcFill"),
  osdValueEl: document.getElementById("volOsdValue"),
  osdBarEl: document.getElementById("volOsdBar"),
  min: 0,
  max: 1,
  initial: 1,
  step: 0.008,
  formatTip: (v) => Math.round(v * 100) + "%",
  storageKey: VOLUME_KEY,
  onChange: (v) => {
    state.volume = v;
    crtVideo.volume = state.muted ? 0 : v;
    if (!document.querySelector(".tv-knob.dragging")) {
      showOSDNotification("VOL", Math.round(v * 100) + "%");
    }
  },
});

const brtKnobCtrl = createKnob({
  knobEl: document.getElementById("brtKnobCircle"),
  indicatorEl: document.getElementById("brtIndicator"),
  tipEl: document.getElementById("brtTip"),
  knobWrapper: document.getElementById("brtKnob"),
  arcBgEl: document.getElementById("brtArcBg"),
  arcFillEl: document.getElementById("brtArcFill"),
  osdValueEl: document.getElementById("brtOsdValue"),
  osdBarEl: document.getElementById("brtOsdBar"),
  min: 0.3,
  max: 1.6,
  initial: 1.0,
  step: 0.01,
  formatTip: (v) => Math.round(((v - 0.3) / 1.3) * 100) + "%",
  storageKey: BRIGHTNESS_KEY,
  onChange: (v) => {
    state.brightness = v;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      crtScreen.style.filter = `brightness(${v})`;
    }
    if (!document.querySelector(".tv-knob.dragging")) {
      showOSDNotification("BRT", Math.round(((v - 0.3) / 1.3) * 100) + "%");
    }
  },
});

// ================================================================
// FIXED LANGUAGE SWITCH - Delegates to LanguageSwitch
// ================================================================
async function switchLanguage(lang) {
  if (isSwitching || currentLang === lang) return;

  // Delegate to LanguageSwitch if available
  if (
    window.LanguageSwitch &&
    typeof window.LanguageSwitch.setLanguage === "function"
  ) {
    window.LanguageSwitch.setLanguage(lang);
    return;
  }

  // Fallback: direct handling if LanguageSwitch isn't available
  isSwitching = true;
  closeMenu();

  if (state.powered) {
    await powerOff();
  }

  currentLang = lang;
  localStorage.setItem("lang", lang);
  localStorage.setItem("preferredLanguage", lang);
  localStorage.setItem("language", lang);
  document.documentElement.lang = lang;

  updateLangDropdownLabel();

  if (typeof window.translateMenu === "function") {
    window.translateMenu(lang);
  }

  const data = await loadContent(lang);
  if (data) {
    contentData = data;
    await renderApp();
  } else {
    console.error(`Failed to load content for ${lang}`);
    showOSDNotification("ERROR", `Failed to load ${lang} content`);
  }

  isSwitching = false;
}

function updateLangDropdownLabel() {
  const selectedOption = document.querySelector(
    `.lang-option[data-lang="${currentLang}"]`,
  );
  const labelEl = document.getElementById("langSelectedLabel");
  if (selectedOption && labelEl) {
    labelEl.textContent = selectedOption.getAttribute("data-label");
    document
      .querySelectorAll(".lang-option")
      .forEach((opt) => opt.classList.remove("selected"));
    selectedOption.classList.add("selected");
  }
}

// ===== EVENT LISTENERS =====
powerBtn.addEventListener("click", () => {
  state.powered ? powerOff() : powerOn();
});
menuBtn.addEventListener("click", toggleMenu);
playPauseBtn.addEventListener("click", togglePlayPause);
downloadAllBtn.addEventListener("click", downloadAllEpisodes);
fullscreenBtn.addEventListener("click", toggleFullscreen);

overlayPlayPause.addEventListener("click", togglePlayPause);
overlaySeekBack.addEventListener("click", seekBackward);
overlaySeekFwd.addEventListener("click", seekForward);
overlayPrev.addEventListener("click", prevEpisode);
overlayNext.addEventListener("click", nextEpisode);
overlayFullscreen.addEventListener("click", toggleFullscreen);

seekBackBtn.addEventListener("click", seekBackward);
seekFwdBtn.addEventListener("click", seekForward);
prevEpBtn.addEventListener("click", prevEpisode);
nextEpBtn.addEventListener("click", nextEpisode);

eolReplayBtn.addEventListener("click", () => {
  if (state.currentChannel >= 0) {
    endEpisodeOverlay.classList.remove("show");
    crtVideo.currentTime = 0;
    crtVideo.play().catch(() => {});
    showOSDNotification("REPLAY");
  }
});
eolNextBtn.addEventListener("click", () => {
  if (state.currentChannel < CHANNELS.length - 1) {
    endEpisodeOverlay.classList.remove("show");
    nextEpisode();
  }
});

// Keyboard shortcuts help
keyboardHelpBtn.addEventListener("click", toggleKeyboardHelp);
khClose.addEventListener("click", closeKeyboardHelp);
keyboardHelpOverlay.addEventListener("click", (e) => {
  if (e.target === keyboardHelpOverlay) closeKeyboardHelp();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.keyboardHelpOpen) {
    closeKeyboardHelp();
  }
});

downloadBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (state.currentChannel >= 0 && !downloadBtn.disabled) {
    const ch = CHANNELS[state.currentChannel];
    const icon = downloadBtn.querySelector(".iconify");
    const originalLabel = downloadLabel.textContent;
    downloadBtn.disabled = true;
    downloadBtn.classList.add("downloading");
    icon.setAttribute("data-icon", "mdi:loading");
    icon.style.animation = "spin 1s linear infinite";
    forceDownload(
      ch.downloadSrc || ch.src,
      ch.download || `${ch.label || "episode"}.mp4`,
      (pct) => {
        downloadLabel.textContent =
          pct !== null && pct !== undefined
            ? `${pct}%`
            : currentLang === "es"
              ? "Descargando..."
              : "Downloading...";
      },
    )
      .catch((error) => {
        console.error("Error forzando la descarga:", error);
      })
      .finally(() => {
        icon.setAttribute("data-icon", "mdi:download");
        icon.style.animation = "none";
        downloadLabel.textContent = originalLabel;
        downloadBtn.classList.remove("downloading");
        downloadBtn.disabled = false;
      });
  }
});

// Language dropdown
if (langDropdown && langToggle) {
  langToggle.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (this.disabled) return;

    const isOpen = langDropdown.classList.toggle("open");
    this.setAttribute("aria-expanded", isOpen ? "true" : "false");

    if (langMenu) {
      langMenu.style.display = isOpen ? "block" : "none";
    }
  });

  document.querySelectorAll(".lang-option").forEach((option) => {
    option.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      const lang = this.getAttribute("data-lang");
      console.log("Language selected:", lang);

      langDropdown.classList.remove("open");
      if (langToggle) langToggle.setAttribute("aria-expanded", "false");
      if (langMenu) langMenu.style.display = "none";

      switchLanguage(lang);
    });
  });

  document.addEventListener("click", function (e) {
    if (
      langDropdown.classList.contains("open") &&
      !langDropdown.contains(e.target)
    ) {
      langDropdown.classList.remove("open");
      if (langToggle) langToggle.setAttribute("aria-expanded", "false");
      if (langMenu) langMenu.style.display = "none";
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && langDropdown.classList.contains("open")) {
      langDropdown.classList.remove("open");
      if (langToggle) langToggle.setAttribute("aria-expanded", "false");
      if (langMenu) langMenu.style.display = "none";
    }
  });
}

// ===== VIDEO EVENTS =====
crtVideo.addEventListener("play", () => {
  state.playing = true;
  updatePlayPauseBtn();
  updateButtons();
  updateEpisodeInfoPanel(CHANNELS[state.currentChannel]);
  updateFolderStates();
  updateOverlayControls();
});

crtVideo.addEventListener("pause", () => {
  state.playing = false;
  updatePlayPauseBtn();
  updateButtons();
  updateOverlayControls();
});

crtVideo.addEventListener("waiting", () => {
  if (state.powered) {
    setStaticIntensity(0.25);
    showOSDNotification("BUFFERING", "RECEIVING SIGNAL...");
  }
});

crtVideo.addEventListener("playing", () => {
  if (state.powered) {
    setStaticIntensity(0.04);
  }
});

crtVideo.addEventListener("timeupdate", () => {
  if (state.powered && state.currentChannel >= 0 && crtVideo.duration > 0) {
    const current = crtVideo.currentTime;
    const duration = crtVideo.duration;
    updateEpisodeProgress(state.currentChannel, current, duration);
    updateProgress(CHANNELS[state.currentChannel]);
    updateFolderStates();
    updateOverlayControls();

    const pct = (current / duration) * 100;
    if (pct > 85 && pct < 98 && state.currentChannel < CHANNELS.length - 1) {
      const next = CHANNELS[state.currentChannel + 1];
      upNextTitle.textContent = next.title;
      upNextCh.textContent =
        next.label || "CH " + String(state.currentChannel + 2).padStart(2, "0");
      upNextOverlay.classList.add("show");
    } else {
      upNextOverlay.classList.remove("show");
    }
  }
});

crtVideo.addEventListener("ended", () => {
  state.playing = false;
  updatePlayPauseBtn();
  updateButtons();
  if (state.currentChannel >= 0) {
    const ch = CHANNELS[state.currentChannel];
    const duration = crtVideo.duration || 0;
    updateEpisodeProgress(state.currentChannel, duration, duration);
    buildOsdMenu();
    updateOsdActiveChannel();
    updateEpisodeInfoPanel(ch);
    updateFolderStates();
    updateGuideProgress();

    eolTitle.textContent = ch.title;
    eolSub.textContent =
      ch.label || "CH " + String(state.currentChannel + 1).padStart(2, "0");
    if (state.currentChannel < CHANNELS.length - 1) {
      eolNextBtn.style.display = "inline-flex";
    } else {
      eolNextBtn.style.display = "none";
    }
    endEpisodeOverlay.classList.add("show");
    upNextOverlay.classList.remove("show");
  }
});

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener("keydown", (e) => {
  if (
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA" ||
    e.target.isContentEditable
  )
    return;

  if (e.key === "Escape") {
    if (state.menuOpen) {
      closeMenu();
      return;
    }
    if (state.keyboardHelpOpen) {
      closeKeyboardHelp();
      return;
    }
    if (downloadModal.classList.contains("show")) {
      downloadModal.classList.remove("show");
      return;
    }
    if (endEpisodeOverlay.classList.contains("show")) {
      endEpisodeOverlay.classList.remove("show");
      return;
    }
    return;
  }

  if (state.menuOpen) return;

  if (e.key === "?") {
    e.preventDefault();
    toggleKeyboardHelp();
    return;
  }

  switch (e.key) {
    case " ":
      e.preventDefault();
      togglePlayPause();
      break;
    case "c":
    case "C":
      e.preventDefault();
      toggleMenu();
      break;
    case "x":
    case "X":
      e.preventDefault();
      state.cinemaMode = !state.cinemaMode;
      document.body.classList.toggle("cinema-mode", state.cinemaMode);
      showOSDNotification(state.cinemaMode ? "CINEMA MODE" : "EXIT CINEMA");
      break;
    case "ArrowLeft":
      e.preventDefault();
      seekBackward();
      break;
    case "ArrowRight":
      e.preventDefault();
      seekForward();
      break;
    case "ArrowUp":
      e.preventDefault();
      if (state.powered) {
        const newVol = Math.min(1, state.volume + 0.05);
        state.volume = newVol;
        crtVideo.volume = state.muted ? 0 : newVol;
        showOSDNotification("VOL", Math.round(newVol * 100) + "%");
      }
      break;
    case "ArrowDown":
      e.preventDefault();
      if (state.powered) {
        const newVol = Math.max(0, state.volume - 0.05);
        state.volume = newVol;
        crtVideo.volume = state.muted ? 0 : newVol;
        showOSDNotification("VOL", Math.round(newVol * 100) + "%");
      }
      break;
    case "m":
    case "M":
      if (state.powered) {
        state.muted = !state.muted;
        crtVideo.muted = state.muted;
        showOSDNotification(state.muted ? "MUTE" : "UNMUTE");
        updateButtons();
      }
      break;
    case "f":
    case "F":
      toggleFullscreen();
      break;
  }
});

// ===== LOAD MENU WITH TRANSLATION SUPPORT =====
fetch("/src/components/menu.html?v=" + Date.now(), { cache: "no-store" })
  .then((response) => {
    if (!response.ok)
      throw new Error("HTTP error " + response.status + " loading menu");
    return response.text();
  })
  .then((data) => {
    data = data
      .replace(/src="\.\/(assets\/)/g, 'src="../../$1')
      .replace(
        /data-route="\.\.\/\.\.\/index\.html"/g,
        'data-route="../../../index.html"',
      );
    const container =
      document.getElementById("sidebar-container") ||
      document.getElementById("menu-container");
    if (!container) return;
    container.innerHTML = data;

    container.querySelectorAll("script").forEach((oldScript) => {
      const s = document.createElement("script");
      Array.from(oldScript.attributes).forEach((a) =>
        s.setAttribute(a.name, a.value),
      );
      s.appendChild(document.createTextNode(oldScript.innerHTML));
      oldScript.parentNode.replaceChild(s, oldScript);
    });

    setTimeout(() => {
      document.dispatchEvent(new CustomEvent("menuLoaded"));
    }, 100);
  })
  .catch((e) => console.warn("menu.html not available:", e.message));

document.addEventListener("menuLoaded", function () {
  if (typeof window.translateMenu === "function") {
    window.translateMenu(currentLang);
  }
});

// ===== FORCE MENU LAYOUT (bypasses any stylesheet load-order / cache issue) =====
// menu.html loads its own copy of menu.css asynchronously, which can win the
// CSS cascade over this page's rules regardless of load order or the phone's
// HTTP cache. Setting these properties directly via JS with "important"
// priority always wins over any stylesheet, so the layout is deterministic.
function enforceMenuLayout() {
  const wrapper = document.getElementById("menu-component-wrapper");
  const sidebar = document.getElementById("sideMenu");
  const toggle = document.getElementById("menu-toggle-btn");
  if (!wrapper || !sidebar) return;

  const isDesktop = window.innerWidth >= 901;
  const isActive = sidebar.classList.contains("active");

  const set = (el, prop, val) => {
    if (el) el.style.setProperty(prop, val, "important");
  };

  if (isDesktop) {
    set(sidebar, "position", "fixed");
    set(sidebar, "top", "0");
    set(sidebar, "left", "0");
    set(sidebar, "right", "auto");
    set(sidebar, "height", "100vh");
    set(sidebar, "overflow-y", "auto");
    set(sidebar, "transform", "none");
    set(toggle, "display", "none");
  } else {
    set(sidebar, "position", "fixed");
    set(sidebar, "top", "0");
    set(sidebar, "left", "0");
    set(sidebar, "right", "auto");
    set(sidebar, "height", "100vh");
    set(sidebar, "overflow-y", "auto");
    set(sidebar, "transform", isActive ? "translateX(0)" : "translateX(-110%)");
    set(toggle, "display", "flex");
    set(toggle, "left", "15px");
    set(toggle, "right", "auto");
  }
}

document.addEventListener("menuLoaded", enforceMenuLayout);
window.addEventListener("resize", enforceMenuLayout);
window.addEventListener("orientationchange", enforceMenuLayout);

// ===== PARTICLES =====
const particlesContainer = document.getElementById("particles");
for (let i = 0; i < 18; i++) {
  let star = document.createElement("div");
  star.className = "star";
  star.style.left = Math.random() * 100 + "vw";
  star.style.animationDelay = Math.random() * 12 + "s";
  star.style.animationDuration = 10 + Math.random() * 6 + "s";
  particlesContainer.appendChild(star);
}

// ===== LISTEN FOR LANGUAGE CHANGES FROM LanguageSwitch =====
document.addEventListener("languageChanged", function (e) {
  if (e.detail && e.detail.lang && e.detail.lang !== currentLang) {
    const newLang = e.detail.lang;
    console.log(`[Anime] Language changed to: ${newLang}`);

    // Reload content for the new language
    (async () => {
      isSwitching = true;
      closeMenu();

      if (state.powered) {
        await powerOff();
      }

      currentLang = newLang;
      document.documentElement.lang = newLang;
      updateLangDropdownLabel();

      if (typeof window.translateMenu === "function") {
        window.translateMenu(newLang);
      }

      const data = await loadContent(newLang);
      if (data) {
        contentData = data;
        await renderApp();
      } else {
        console.error(`Failed to load content for ${newLang}`);
        showOSDNotification("ERROR", `Failed to load ${newLang} content`);
      }

      isSwitching = false;
    })();
  }
});

// ===== INIT =====
document.addEventListener("DOMContentLoaded", async function () {
  loadProgress();
  loadFolderStates();
  updateLangDropdownLabel();

  const data = await loadContent(currentLang);
  if (data) {
    contentData = data;
    await renderApp();
  } else {
    console.error("Failed to load initial content");
  }

  const urlEpisode = parseURL();
  if (urlEpisode >= 0 && urlEpisode < CHANNELS.length) {
    const prog = getEpisodeProgress(urlEpisode);
    if (CHANNELS.length > 0) {
      powerOn().then(() => {
        setTimeout(() => {
          if (prog.time > 5 && prog.time / (prog.duration || 1) < 0.95) {
            switchChannel(urlEpisode, prog.time);
          } else {
            switchChannel(urlEpisode, 0);
          }
        }, 1000);
      });
    }
  } else {
    const savedChannel = localStorage.getItem("adashima_last_channel");
    if (
      savedChannel !== null &&
      parseInt(savedChannel) >= 0 &&
      parseInt(savedChannel) < CHANNELS.length
    ) {
      const idx = parseInt(savedChannel);
      const prog = getEpisodeProgress(idx);
      if (CHANNELS.length > 0) {
        powerOn().then(() => {
          setTimeout(() => {
            if (prog.time > 5 && prog.time / (prog.duration || 1) < 0.95) {
              switchChannel(idx, prog.time);
            } else {
              switchChannel(idx, 0);
            }
          }, 1000);
        });
      }
    }
  }

  window.addEventListener("popstate", (e) => {
    const idx = parseURL();
    if (idx >= 0 && idx < CHANNELS.length && idx !== state.currentChannel) {
      if (state.powered) {
        switchChannel(
          idx,
          getEpisodeProgress(idx).time > 5 ? getEpisodeProgress(idx).time : 0,
        );
      }
    }
  });

  syncOsdPortal();
  window.addEventListener("resize", syncOsdPortal);

  const style = document.createElement("style");
  style.textContent = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
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