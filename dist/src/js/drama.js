let currentLang = (() => {
  const storedLang =
    localStorage.getItem("lang") ||
    localStorage.getItem("preferredLanguage") ||
    localStorage.getItem("language") ||
    localStorage.getItem("adashima_manga_lang") ||
    "en";
  
  // Normalize the language code - support 'tg' and fallback to 'en' if invalid
  const normalized = storedLang.toLowerCase().trim();
  const supported = ["es", "en", "tg"];
  
  if (supported.includes(normalized)) return normalized;
  
  // Handle partial matches (e.g., 'en-US' -> 'en')
  for (const lang of supported) {
    if (normalized.startsWith(lang + "-") || normalized === lang) {
      return lang;
    }
  }
  
  return "en"; 
})();

let isSwitching = false;
let contentData = null;
let CHANNELS = [];

// ----- STATE -----
const state = {
  powered: false,
  currentChannel: -1,
  switching: false,
  menuOpen: false,
  playing: false,
  volume: 1,
  brightness: 1,
};

// ----- DOM REFS -----
const crtScreen = document.getElementById("crtScreen");
const crtVideo = document.getElementById("crtVideo");
const noSignal = document.getElementById("noSignal");
const noSignalText = document.getElementById("noSignalText");
const powerBtn = document.getElementById("powerBtn");
const menuBtn = document.getElementById("menuBtn");
const playPauseBtn = document.getElementById("playPauseBtn");
const screenGlow = document.getElementById("screenGlow");
const staticOverlay = document.getElementById("staticOverlay");
const interference = document.getElementById("interferenceOverlay");
const powerFlash = document.getElementById("powerFlash");
const loadingInd = document.getElementById("loadingIndicator");
const loadingText = document.getElementById("loadingText");
const downloadBtn = document.getElementById("downloadBtn");
const downloadLabel = document.getElementById("downloadLabel");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const channelIndicator = document.getElementById("channelIndicator");
const channelTitle = document.getElementById("channelTitle");
const channelDesc = document.getElementById("channelDesc");
const channelBadge = document.getElementById("channelBadge");
const osdMenu = document.getElementById("osdMenu");
const osdChannelList = document.getElementById("osdChannelList");
const osdTitle = document.getElementById("osdTitle");
const osdSubtitle = document.getElementById("osdSubtitle");
const osdFooter = document.getElementById("osdFooter");
const tvLed = document.getElementById("tvLed");
const pageTitle = document.getElementById("page-title");
const footerContent = document.getElementById("footer-content");
const floatingLink = document.getElementById("floating-link");

// ----- load content from JSON -----
async function loadContent(lang) {
  try {
    const response = await fetch(`../data/drama/${lang}.json?v=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (e) {
    console.warn("Failed to load language file, using fallback:", e.message);
    // Fallback: try the other language
    try {
      const fallbackLang = lang === "es" ? "en" : "es";
      const response = await fetch(
        `../data/drama/${fallbackLang}.json?v=${Date.now()}`,
      );
      if (!response.ok) throw new Error("Fallback failed");
      return await response.json();
    } catch (fallbackError) {
      console.error("Fallback also failed:", fallbackError);
      return null;
    }
  }
}

// ----- build channels -----
function buildChannels(data) {
  if (!data || !data.channels) return [];
  return data.channels.map((ch) => ({
    ...ch,
    src: ch.src,
    download: ch.download,
  }));
}

// ----- helpers -----
function getString(key) {
  if (!contentData) return key;
  return contentData[key] || key;
}

function renderApp() {
  if (!contentData) return;

  pageTitle.textContent = getString("pageTitle");
  footerContent.innerHTML = getString("footerText");
  floatingLink.title = getString("floatingLinkTitle");
  powerBtn.title = getString("powerBtnTitle");
  menuBtn.title = getString("menuBtnTitle");
  if (!state.playing) {
    playPauseBtn.title = getString("playBtnTitle");
  } else {
    playPauseBtn.title = getString("pauseBtnTitle");
  }
  downloadBtn.title = getString("downloadBtnTitle");
  fullscreenBtn.title = getString("fullscreenBtnTitle");
  document.getElementById("volKnob").title = getString("volKnobTitle");
  document.getElementById("brtKnob").title = getString("brtKnobTitle");
  downloadLabel.textContent = getString("downloadLabel");
  osdTitle.innerHTML = `YASHONY CHANNELS <span id="osdSubtitle">${getString("osdSubtitle")}</span>`;
  osdFooter.textContent = getString("osdFooter");
  loadingText.textContent = getString("loadingText");
  noSignalText.textContent = getString("noSignal");

  // Rebuild channels with current data
  CHANNELS = buildChannels(contentData);
  buildOsdMenu();

  // Update current channel info if any
  if (state.currentChannel >= 0 && state.currentChannel < CHANNELS.length) {
    const ch = CHANNELS[state.currentChannel];
    updateInfoCard(ch);
    updateOsdActiveChannel();
  } else {
    updateInfoCard(null);
  }

  document.documentElement.lang = currentLang;
}

// ----- OSD BUILD -----
function buildOsdMenu() {
  osdChannelList.innerHTML = "";
  CHANNELS.forEach((ch, i) => {
    const item = document.createElement("div");
    item.className = "osd-ch-item";
    item.dataset.index = i;
    item.innerHTML = `
                    <div class="osd-ch-num">${ch.label}</div>
                    <div class="osd-ch-info">
                        <div class="osd-ch-name">${ch.title}</div>
                        <div class="osd-ch-sub">${ch.sub}</div>
                    </div>
                    <div class="osd-ch-dot"></div>
                `;
    item.addEventListener("click", () => {
      closeMenu();
      switchChannel(i);
    });
    osdChannelList.appendChild(item);
  });
  updateOsdActiveChannel();
}

function updateOsdActiveChannel() {
  osdChannelList.querySelectorAll(".osd-ch-item").forEach((el, i) => {
    el.classList.toggle("active-ch", i === state.currentChannel);
  });
}

// ----- HELPERS -----
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

function showChannelIndicator(text) {
  channelIndicator.textContent = text;
  channelIndicator.classList.add("show");
  clearTimeout(channelIndicator._timer);
  channelIndicator._timer = setTimeout(() => {
    channelIndicator.classList.remove("show");
  }, 2200);
}

function setStaticIntensity(level) {
  staticOverlay.style.opacity = level;
}

async function playInterference(duration = 500) {
  interference.style.opacity = "1";
  setStaticIntensity(0.8);
  await wait(duration * 0.3);
  interference.style.opacity = "0";
  await wait(duration * 0.2);
  interference.style.opacity = "0.7";
  setStaticIntensity(1);
  await wait(duration * 0.3);
  interference.style.opacity = "0";
}

function updatePlayPauseBtn() {
  if (state.playing) {
    playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    playPauseBtn.classList.add("playing");
    playPauseBtn.title = getString("pauseBtnTitle");
  } else {
    playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    playPauseBtn.classList.remove("playing");
    playPauseBtn.title = getString("playBtnTitle");
  }
}

function togglePlayPause() {
  if (!state.powered || state.currentChannel < 0 || state.switching) return;
  if (crtVideo.paused) {
    crtVideo.play().catch(() => {});
  } else {
    crtVideo.pause();
  }
}

crtVideo.addEventListener("play", () => {
  state.playing = true;
  updatePlayPauseBtn();
});
crtVideo.addEventListener("pause", () => {
  state.playing = false;
  updatePlayPauseBtn();
});

// ----- MENU -----
function openMenu() {
  if (!state.powered) return;
  state.menuOpen = true;
  updateOsdActiveChannel();
  osdMenu.classList.add("visible");
  menuBtn.classList.add("active");
}

function closeMenu() {
  state.menuOpen = false;
  osdMenu.classList.remove("visible");
  menuBtn.classList.remove("active");
}

function toggleMenu() {
  state.menuOpen ? closeMenu() : openMenu();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.menuOpen) closeMenu();
});

// ----- POWER -----
async function powerOn() {
  if (state.powered || state.switching) return;
  state.switching = true;

  powerFlash.style.transition = "opacity 0.05s";
  powerFlash.style.opacity = "1";
  await wait(60);
  powerFlash.style.transition = "opacity 0.3s";
  powerFlash.style.opacity = "0";

  noSignal.style.transition = "opacity 0.3s";
  noSignal.style.opacity = "0";
  await wait(300);
  noSignal.classList.remove("off-state");
  noSignalText.textContent = getString("noSignal");
  noSignal.style.opacity = "0";

  setStaticIntensity(0.6);
  await wait(400);

  noSignal.style.display = "flex";
  noSignal.style.transition = "opacity 0.4s";
  noSignal.style.opacity = "1";
  setStaticIntensity(0.25);

  crtScreen.classList.add("powered-on");
  screenGlow.classList.add("active");

  powerBtn.classList.add("on");
  if (tvLed) tvLed.classList.add("on");
  state.powered = true;
  state.switching = false;

  menuBtn.disabled = false;
  playPauseBtn.disabled = true;

  await wait(800);
  crtScreen.classList.remove("powered-on");
  setStaticIntensity(0.08);
}

async function powerOff() {
  if (!state.powered || state.switching) return;
  state.switching = true;

  closeMenu();
  crtVideo.pause();

  setStaticIntensity(1);
  await wait(150);

  crtScreen.classList.add("powered-off");
  setStaticIntensity(0);

  await wait(600);
  crtScreen.classList.remove("powered-off");

  crtVideo.style.opacity = "0";
  crtVideo.src = "";

  noSignal.classList.add("off-state");
  noSignalText.textContent = "";
  noSignal.style.display = "flex";
  noSignal.style.opacity = "0";
  await wait(50);
  noSignal.style.transition = "opacity 0.5s";
  noSignal.style.opacity = "1";

  screenGlow.classList.remove("active");
  powerBtn.classList.remove("on");
  if (tvLed) tvLed.classList.remove("on");

  state.currentChannel = -1;
  state.playing = false;
  state.powered = false;
  state.switching = false;

  menuBtn.disabled = true;
  menuBtn.classList.remove("active");
  playPauseBtn.disabled = true;
  updatePlayPauseBtn();

  setTimeout(() => {
    volKnobCtrl.reset();
    brtKnobCtrl.reset();
    state.volume = 1;
    state.brightness = 1.0;
    crtVideo.volume = 1;
    crtScreen.style.filter = "";
  }, 400);

  updateInfoCard(null);
}

// ----- SWITCH CHANNEL -----
async function switchChannel(index) {
  if (!state.powered || state.switching) return;
  if (index === state.currentChannel) return;

  const ch = CHANNELS[index];
  if (!ch) return;

  state.switching = true;

  showChannelIndicator(ch.label);
  setStaticIntensity(1);
  await playInterference(450);

  crtVideo.classList.add("channel-switching");

  if (noSignal.style.display !== "none") {
    noSignal.style.transition = "opacity 0.2s";
    noSignal.style.opacity = "0";
    await wait(200);
    noSignal.style.display = "none";
  }

  loadingInd.classList.add("show");

  if (crtVideo.src !== new URL(ch.src, location.href).href) {
    crtVideo.pause();
    crtVideo.src = ch.src;
    crtVideo.load();
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

  downloadBtn.onclick = (e) => {
    e.preventDefault();
    if (downloadBtn.disabled) return;
    const originalLabel = downloadLabel.textContent;
    downloadBtn.disabled = true;
    downloadBtn.classList.add("downloading");

    forceDownload(ch.src, ch.download || "", (pct) => {
      downloadLabel.textContent =
        pct !== null && pct !== undefined
          ? `${pct}%`
          : getString("downloadingLabel");
    })
      .catch((error) => {
        console.error("Error forzando la descarga:", error);
      })
      .finally(() => {
        downloadLabel.textContent = originalLabel;
        downloadBtn.classList.remove("downloading");
        downloadBtn.disabled = false;
      });
  };

  updateInfoCard(ch);
  updateOsdActiveChannel();

  state.currentChannel = index;
  state.switching = false;

  playPauseBtn.disabled = false;
  crtVideo.play().catch(() => {});
}

function updateInfoCard(ch) {
  const icon = document.querySelector(".channel-info-icon i");
  if (!ch) {
    channelTitle.textContent = getString("selectChannel");
    channelDesc.textContent = getString("selectChannelDesc");
    channelBadge.textContent = "— / —";
    icon.className = "fas fa-tv";
    return;
  }
  channelTitle.textContent = ch.title;
  channelDesc.textContent = ch.desc;
  channelBadge.textContent = ch.badge;
  icon.className = "fas fa-headphones";
}

// ----- FULLSCREEN -----
function toggleFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    enterFullscreen();
  } else {
    exitFullscreen();
  }
}

function enterFullscreen() {
  crtVideo.controls = true;
  crtScreen.style.filter = "none";
  const req = crtScreen.requestFullscreen || crtScreen.webkitRequestFullscreen;
  if (req) req.call(crtScreen).catch(() => {});
  fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
}

function exitFullscreen() {
  const ex = document.exitFullscreen || document.webkitExitFullscreen;
  if (ex) ex.call(document).catch(() => {});
}

function onFullscreenChange() {
  const isFs = !!(
    document.fullscreenElement || document.webkitFullscreenElement
  );
  if (isFs) {
    fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
  } else {
    crtVideo.controls = false;
    crtScreen.style.filter = `brightness(${state.brightness})`;
    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
  }
}

document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);

// ----- KNOBS (Volume / Brightness) -----
const ARC_CX = 27,
  ARC_CY = 27,
  ARC_R = 24;
const ARC_START_DEG = 225;
const ARC_TOTAL_DEG = 270;

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
}) {
  let value = initial;
  const KNOB_ANGLE_MIN = -135;
  const KNOB_ANGLE_MAX = 135;

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
    arcFillEl.style.stroke = `hsla(${hue},50%,72%,0.65)`;
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
    onChange(value, isDragging);
  }

  applyValue(initial, false);

  let dragStartY = null,
    dragStartVal = null;
  knobEl.addEventListener("mousedown", (e) => {
    dragStartY = e.clientY;
    dragStartVal = value;
    knobWrapper.classList.add("dragging");
    e.preventDefault();
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
      knobWrapper._scrollTimer = setTimeout(() => {
        knobWrapper.classList.remove("dragging");
      }, 900);
    },
    { passive: false },
  );

  return {
    reset() {
      applyValue(initial, false);
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
  onChange: (v) => {
    state.volume = v;
    crtVideo.volume = v;
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
  onChange: (v) => {
    state.brightness = v;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      crtScreen.style.filter = `brightness(${v})`;
    }
  },
});

// ----- EVENT LISTENERS -----
powerBtn.addEventListener("click", () => {
  state.powered ? powerOff() : powerOn();
});

menuBtn.addEventListener("click", toggleMenu);

playPauseBtn.addEventListener("click", togglePlayPause);

fullscreenBtn.addEventListener("click", toggleFullscreen);

crtVideo.addEventListener("waiting", () => {
  if (state.powered) setStaticIntensity(0.3);
});
crtVideo.addEventListener("playing", () => {
  if (state.powered) setStaticIntensity(0.06);
});

// ----- PARTICLES -----
const particlesContainer = document.getElementById("particles");
for (let i = 0; i < 22; i++) {
  let star = document.createElement("div");
  star.className = "star";
  star.style.left = Math.random() * 100 + "vw";
  star.style.animationDelay = Math.random() * 10 + "s";
  star.style.animationDuration = 8 + Math.random() * 5 + "s";
  particlesContainer.appendChild(star);
}

// ----- LANGUAGE SWITCH -----
// ----- LANGUAGE DROPDOWN -----
// ----- LOAD SIDEBAR MENU -----
async function loadMenu() {
  const menuVer = Math.floor(Date.now() / 86400000);
  try {
    const response = await fetch(`../components/menu.html?v=${menuVer}`);
    if (!response.ok) throw new Error("HTTP " + response.status);
    let data = await response.text();
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
  } catch (error) {
    console.warn("menu.html no disponible:", error.message);
  }
}

// Menu loaded listener
document.addEventListener("menuLoaded", function () {
  if (typeof window.translateMenu === "function") {
    window.translateMenu(currentLang);
    console.log("Menu auto-translated to:", currentLang);
  }
});

// ----- INIT -----
document.addEventListener("DOMContentLoaded", async function () {
  const data = await loadContent(currentLang);
  if (data) {
    contentData = data;
    CHANNELS = buildChannels(data);
    renderApp();
  }

  loadMenu();
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
