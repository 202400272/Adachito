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

let _lastCard = null;
let isSwitching = false;
let contentData = null;

const YEAR_ICONS = {
  year1: "fa-seedling",
  year2: "fa-bicycle",
  year3: "fa-star",
};

// Fallback content for timeline
const FALLBACK_CONTENT = {
  es: {
    header: {
      title: "Línea del Tiempo",
      subtitle:
        "Adachi to Shimamura — Historia de su tiempo en la preparatoria",
    },
    filters: {
      all: "Toda la historia",
      year1: "1.er Año Escolar",
      year2: "2.do Año Escolar",
      year3: "3.er Año Escolar",
    },
    yearBadges: {
      year1: "Primer Año Escolar",
      year2: "Segundo Año Escolar",
      year3: "Tercer y Último Año Escolar",
    },
    footer:
      "Fan site no oficial de Adachi to Shimamura.<br>Creado por fans, sin fines de lucro.<br>Adachi to Shimamura y todos sus derechos pertenecen a Hitoma Iruma.",
    floatingTitle: "¡Clickea para ir al mini-juego!",
    langLabel: "Español",
    events: [],
  },
  en: {
    header: {
      title: "Timeline",
      subtitle: "Adachi to Shimamura — Their High School Story",
    },
    filters: {
      all: "All Events",
      year1: "1st School Year",
      year2: "2nd School Year",
      year3: "3rd School Year",
    },
    yearBadges: {
      year1: "First School Year",
      year2: "Second School Year",
      year3: "Third and Final School Year",
    },
    footer:
      "Unofficial Adachi to Shimamura fan site.<br>Created by fans, non-profit.<br>Adachi to Shimamura and all rights belong to Hitoma Iruma.",
    floatingTitle: "Click to go to the mini-game!",
    langLabel: "English",
    events: [],
  },
};

async function loadContent(lang) {
  try {
    // Correct path from src/pages/ to src/data/linea/
    const url =
      window.LanguageSwitch && typeof window.LanguageSwitch.getDataUrl === "function"
        ? window.LanguageSwitch.getDataUrl("linea", lang) + "?v=" + Date.now()
        : `../data/linea/${lang}.json?v=${Date.now()}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (e) {
    console.warn(
      "Failed to load language file, using fallback content:",
      e.message,
    );
    return FALLBACK_CONTENT[lang] || FALLBACK_CONTENT.es;
  }
}

function buildTimelineHTML(data) {
  let html = "";
  const years = ["year1", "year2", "year3"];
  let currentYear = null;

  if (!data.events || data.events.length === 0) {
    return '<div style="text-align:center;padding:40px;color:#aaa;">No hay eventos disponibles / No events available</div>';
  }

  data.events.forEach((event) => {
    if (currentYear !== event.year) {
      currentYear = event.year;
      html += `
                        <div class="year-block" data-year="${currentYear}">
                            <div class="year-badge"><i class="fas ${YEAR_ICONS[currentYear]}" style="margin-right:8px;opacity:.8;"></i>${data.yearBadges[currentYear]}</div>
                        </div>
                    `;
    }

    html += `
                    <div class="event-row ${event.side}" data-year="${event.year}">
                        <div class="event-connector"></div>
                        <div class="event-dot"><div class="dot-circle"></div></div>
                        <div class="event-card" onclick="openBubbleModal(this)">
                            <div class="bubble-cover"><img src="${event.img}" alt="${event.title}" loading="lazy" onerror="this.style.display='none'"></div>
                            <div class="bubble-content">
                                ${event.vol ? `<div class="vol-badge">${event.vol}</div>` : ""}
                                <div class="event-season">${event.season}</div>
                                ${event.date ? `<div class="event-date">${event.date}</div>` : ""}
                                <div class="event-title">${event.title}</div>
                                ${event.desc ? `<div class="event-desc">${event.desc}</div>` : ""}
                                ${event.quotes.map((q) => `<div class="event-quote">${q}</div>`).join("")}
                            </div>
                        </div>
                    </div>
                `;
  });

  return html;
}

function buildYearFiltersHTML(data) {
  return `
                <button type="button" class="year-btn active" data-year="all">${data.filters.all}</button>
                <button type="button" class="year-btn" data-year="year1">${data.filters.year1}</button>
                <button type="button" class="year-btn" data-year="year2">${data.filters.year2}</button>
                <button type="button" class="year-btn" data-year="year3">${data.filters.year3}</button>
            `;
}

function initYearFilterControls() {
  const yearFilters = document.getElementById("year-filters");
  if (!yearFilters || yearFilters.dataset.bound === "true") return;

  yearFilters.dataset.bound = "true";
  yearFilters.addEventListener("click", (e) => {
    const btn = e.target.closest(".year-btn");
    if (!btn || !yearFilters.contains(btn)) return;
    filterYear(btn.dataset.year || "all", btn);
  });
}

function renderApp(data) {
  if (!data) {
    data = FALLBACK_CONTENT[currentLang] || FALLBACK_CONTENT.es;
  }

  const headerTitle = document.getElementById("header-title");
  const headerSubtitle = document.getElementById("header-subtitle");
  const yearFilters = document.getElementById("year-filters");
  const timelineContent = document.getElementById("timeline-content");
  const footer = document.getElementById("footer");

  if (headerTitle) headerTitle.textContent = data.header.title;
  if (headerSubtitle) headerSubtitle.textContent = data.header.subtitle;
  if (yearFilters) yearFilters.innerHTML = buildYearFiltersHTML(data);
  if (timelineContent) timelineContent.innerHTML = buildTimelineHTML(data);
  if (footer) footer.innerHTML = data.footer;

  initYearFilterControls();

  document.documentElement.lang = currentLang;

  checkVisibility();
  updateTimelineProgress();
}

function openBubbleModal(card) {
  const contentEl = card.querySelector(".bubble-content");
  const coverImg = card.querySelector(".bubble-cover img");
  const modal = document.getElementById("bubbleModal");
  const overlay = document.getElementById("bubbleOverlay");
  const modalContent = document.getElementById("modalContent");
  const modalCircle = document.getElementById("modalImgCircle");

  if (
    coverImg &&
    coverImg.src &&
    coverImg.complete &&
    coverImg.naturalWidth > 0
  ) {
    modalCircle.innerHTML = `<img src="${coverImg.src}" alt="preview">`;
    modalCircle.style.display = "block";
  } else {
    modalCircle.style.display = "none";
  }

  modalContent.innerHTML = contentEl ? contentEl.innerHTML : "";

  modal.style.visibility = "hidden";
  modal.classList.add("active");
  overlay.classList.add("active");
  document.getElementById("timeline").classList.add("has-expanded");

  requestAnimationFrame(() => {
    _positionModal(modal, card);
    modal.style.visibility = "";
  });

  _lastCard = card;
}

function _positionModal(modal, trigger) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const modalW = modal.offsetWidth || Math.min(500, vw * 0.9);
  const modalH = modal.offsetHeight || Math.min(680, vh * 0.85);
  const rect = trigger.getBoundingClientRect();
  const margin = 16;

  let left = (rect.left + rect.right) / 2 - modalW / 2;
  left = Math.max(margin, Math.min(left, vw - modalW - margin));

  let top = rect.bottom + margin;
  if (top + modalH > vh - margin) {
    top = rect.top - modalH - margin;
  }
  if (top < margin) {
    top = Math.max(margin, (vh - modalH) / 2);
  }

  modal.style.left = left + "px";
  modal.style.top = top + "px";
}

function closeBubbleModal() {
  document.getElementById("bubbleModal").classList.remove("active");
  document.getElementById("bubbleOverlay").classList.remove("active");
  document.getElementById("timeline").classList.remove("has-expanded");
  _lastCard = null;
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeBubbleModal();
});
window.addEventListener("resize", () => {
  const modal = document.getElementById("bubbleModal");
  if (modal.classList.contains("active") && _lastCard)
    _positionModal(modal, _lastCard);
});

function filterYear(year, btn) {
  document
    .querySelectorAll(".year-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  closeBubbleModal();

  const isMobile = window.matchMedia("(max-width: 700px)").matches;
  document.querySelectorAll(".event-row").forEach((row) => {
    const show = year === "all" || row.dataset.year === year;
    row.style.setProperty(
      "display",
      show ? (isMobile ? "flex" : "grid") : "none",
      "important",
    );
  });
  document.querySelectorAll(".year-block").forEach((block) => {
    const show = year === "all" || block.dataset.year === year;
    block.style.setProperty("display", show ? "flex" : "none", "important");
  });

  setTimeout(() => {
    document.querySelectorAll(".event-row").forEach((r) => {
      if (r.style.display !== "none") r.classList.remove("visible");
    });
    checkVisibility();
    updateTimelineProgress();
  }, 10);
}

function checkVisibility() {
  document.querySelectorAll(".event-row").forEach((row, i) => {
    if (row.style.display === "none") return;
    if (row.getBoundingClientRect().top < window.innerHeight - 80) {
      setTimeout(() => row.classList.add("visible"), i * 20);
    }
  });
}

function updateTimelineProgress() {
  const timeline = document.getElementById("timeline");
  if (!timeline) return;
  const rect = timeline.getBoundingClientRect();
  const windowHeight = window.innerHeight;
  let progress = 0;

  if (rect.top > windowHeight / 2) {
    progress = 0;
  } else if (rect.bottom < windowHeight / 2) {
    progress = 1;
  } else {
    const totalScroll = rect.height;
    const currentScroll = windowHeight / 2 - rect.top;
    progress = currentScroll / totalScroll;
  }

  const progressEl = document.getElementById("timelineProgress");
  if (progressEl) {
    progressEl.style.transform = `translateX(-50%) scaleY(${Math.max(0, Math.min(1, progress))})`;
  }
}

window.addEventListener(
  "scroll",
  () => {
    checkVisibility();
    updateTimelineProgress();
  },
  { passive: true },
);

window.addEventListener("load", () => {
  setTimeout(() => {
    checkVisibility();
    updateTimelineProgress();
  }, 150);
});

function initSakuraRain() {
  const env = document.getElementById("sakura-env");
  if (!env) return;
  env.innerHTML = "";

  const isMobile = window.matchMedia("(max-width: 700px)").matches;
  const total = isMobile ? 120 : 180;
  const frag = document.createDocumentFragment();

  const layers = [
    {
      cls: "petal--far",
      size: [10, 16],
      dur: [18, 30],
      op: [0.55, 0.75],
      drift: [-8, 8],
      blur: [0.2, 0.6],
      sway: [1, 2.2],
    },
    {
      cls: "petal--mid",
      size: [16, 26],
      dur: [14, 24],
      op: [0.7, 0.9],
      drift: [-12, 12],
      blur: [0.4, 1],
      sway: [1.8, 3.2],
    },
    {
      cls: "petal--near",
      size: [22, 34],
      dur: [10, 18],
      op: [0.85, 1],
      drift: [-16, 16],
      blur: [0.6, 1.4],
      sway: [2.5, 4.5],
    },
  ];
  const rnd = (a, b) => Math.random() * (b - a) + a;
  const pick = (i) =>
    i % 5 === 0 ? layers[2] : i % 2 === 0 ? layers[1] : layers[0];

  for (let i = 0; i < total; i++) {
    const l = pick(i);
    const p = document.createElement("div");
    p.classList.add("petal", l.cls);
    const sz = rnd(l.size[0], l.size[1]);
    const dur = rnd(l.dur[0], l.dur[1]);
    p.style.left = rnd(-5, 105) + "vw";
    p.style.top = rnd(-140, -10) + "vh";
    p.style.width = sz + "px";
    p.style.height = sz * 1.2 + "px";
    p.style.animationDelay = rnd(-dur, 0) + "s";
    p.style.setProperty("--fall-duration", dur + "s");
    p.style.setProperty("--petal-opacity", rnd(l.op[0], l.op[1]).toFixed(2));
    p.style.setProperty(
      "--x-drift",
      rnd(l.drift[0], l.drift[1]).toFixed(2) + "vw",
    );
    p.style.setProperty(
      "--x-sway",
      rnd(l.sway[0], l.sway[1]).toFixed(2) + "vw",
    );
    p.style.setProperty(
      "--petal-blur",
      rnd(l.blur[0], l.blur[1]).toFixed(2) + "px",
    );
    p.style.setProperty(
      "--spin",
      (rnd(420, 900) * (Math.random() > 0.5 ? 1 : -1)).toFixed(0) + "deg",
    );
    frag.appendChild(p);
  }
  env.appendChild(frag);
}

function initStarCanvas() {
  try {
    if (document.getElementById("starCanvas")) return;

    const canvas = document.createElement("canvas");
    canvas.id = "starCanvas";
    canvas.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;";
    document.body.prepend(canvas);

    const ctx = canvas.getContext("2d");
    let stars = [];
    const numStars = 150;

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function initStars() {
      stars = [];
      for (let i = 0; i < numStars; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.8 + 0.2,
          speed: Math.random() * 0.01 + 0.005,
        });
      }
    }

    function drawStars() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      stars.forEach((star) => {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        ctx.fill();

        star.alpha += (Math.random() - 0.5) * 0.02;
        star.alpha = Math.max(0.1, Math.min(1, star.alpha));
      });
    }

    let animationId = null;

    function animate() {
      if (!canvas || !canvas.parentNode) {
        if (animationId) cancelAnimationFrame(animationId);
        return;
      }
      drawStars();
      animationId = requestAnimationFrame(animate);
    }

    resizeCanvas();
    initStars();

    window.addEventListener("resize", () => {
      resizeCanvas();
      initStars();
    });

    animate();

    window.addEventListener("beforeunload", () => {
      if (animationId) cancelAnimationFrame(animationId);
    });

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  } catch (e) {
    console.warn("Star canvas initialization failed:", e);
  }
}

initSakuraRain();

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(initStarCanvas, 100);
});

window.addEventListener("resize", () => {
  clearTimeout(window.__sakuraResize);
  window.__sakuraResize = setTimeout(initSakuraRain, 200);
});

// ===== LOAD MENU WITH TRANSLATION SUPPORT =====
const menuVer = Math.floor(Date.now() / 86400000);
fetch("../components/menu.html?v=" + menuVer)
  .then((response) => {
    if (!response.ok)
      throw new Error("Error HTTP " + response.status + " al cargar el menú");
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

    // Extract and execute scripts
    container.querySelectorAll("script").forEach((oldScript) => {
      const s = document.createElement("script");
      Array.from(oldScript.attributes).forEach((a) =>
        s.setAttribute(a.name, a.value),
      );
      s.appendChild(document.createTextNode(oldScript.innerHTML));
      oldScript.parentNode.replaceChild(s, oldScript);
    });

    // Dispatch event that menu is loaded
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent("menuLoaded"));
    }, 100);
  })
  .catch((e) => console.warn("menu.html no disponible:", e.message));

// ===== MENU LOADED LISTENER =====
document.addEventListener("menuLoaded", function () {
  // Translate menu to current language when it loads
  if (typeof window.translateMenu === "function") {
    window.translateMenu(currentLang);
    console.log("Menu auto-translated to:", currentLang);
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  const data = await loadContent(currentLang);
  contentData = data;
  renderApp(data);
});
