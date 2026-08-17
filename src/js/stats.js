let volumes = [];
let statsSummary = {};
let achievements = [];
let funFacts = [];
let publicationGaps = [];
let gapStats = {};
let activeSection = "overview";
let expandedVolume = null;
let sortDelay = "default";
let searchQuery = "";
let filterType = "all";
let compareVolume1 = null;
let compareVolume2 = null;
let isLoading = true;
let isScrolling = false;
let scrollTimeout = null;
let navListenersAttached = false;

function createParticles() {
  const container = document.getElementById("particles");
  if (!container) return;
  for (let i = 0; i < 40; i++) {
    const star = document.createElement("div");
    star.className = "star";
    star.style.left = Math.random() * 100 + "%";
    star.style.animationDelay = Math.random() * 10 + "s";
    star.style.animationDuration = 8 + Math.random() * 8 + "s";
    star.style.width = 2 + Math.random() * 3 + "px";
    star.style.height = star.style.width;
    container.appendChild(star);
  }
}

function showToast(message) {
  const toast = document.getElementById("toastMessage");
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = "block";
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = "none";
  }, 2500);
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getVolumeType(volume) {
  if (volume.is_upcoming) return "upcoming";
  if (volume.is_special) return "special";
  if (volume.is_short_story) return "short";
  return "main";
}

function getVolumeColor(volume) {
  const type = getVolumeType(volume);
  const colors = {
    main: "#6366f1",
    short: "#8b5cf6",
    special: "#f9b55d",
    upcoming: "#7fc4e0",
  };
  return colors[type] || "#6366f1";
}

function getRank(volume, metric) {
  const activeVols = volumes.filter((v) => !v.is_upcoming && v.page_count > 0);
  if (metric === "pages") {
    const sorted = [...activeVols].sort((a, b) => b.page_count - a.page_count);
    const rank = sorted.findIndex((v) => v.id === volume.id) + 1;
    if (rank === 1) return "#1 Longest";
    if (rank === 2) return "#2 Longest";
    if (rank === 3) return "#3 Longest";
    if (rank === sorted.length) return "Shortest";
    return `#${rank}`;
  } else if (metric === "chapters") {
    const sorted = [...activeVols].sort((a, b) => b.chapters - a.chapters);
    const rank = sorted.findIndex((v) => v.id === volume.id) + 1;
    if (rank === 1) return "#1 Most Chapters";
    if (rank === 2) return "#2 Most Chapters";
    if (rank === 3) return "#3 Most Chapters";
    return `#${rank}`;
  } else if (metric === "delay") {
    const translated = activeVols.filter((v) => v.jp_en_gap_days > 0);
    const sorted = [...translated].sort(
      (a, b) => a.jp_en_gap_days - b.jp_en_gap_days,
    );
    const rank = sorted.findIndex((v) => v.id === volume.id) + 1;
    if (rank === 1) return "Fastest";
    if (rank === sorted.length) return "Slowest";
    return `#${rank}`;
  }
  return "";
}

function getPercentile(volume, metric) {
  const activeVols = volumes.filter((v) => !v.is_upcoming && v.page_count > 0);
  const values = activeVols.map((v) =>
    metric === "pages" ? v.page_count : v.chapters,
  );
  const sorted = [...values].sort((a, b) => a - b);
  const value = metric === "pages" ? volume.page_count : volume.chapters;
  const index = sorted.indexOf(value);
  return Math.round(((index + 1) / sorted.length) * 100);
}

function getMaxValue(metric) {
  const filtered = volumes.filter((v) => v.page_count > 0);
  if (metric === "pages") return Math.max(...filtered.map((v) => v.page_count));
  if (metric === "chapters")
    return Math.max(...filtered.map((v) => v.chapters));
  if (metric === "delay")
    return Math.max(
      ...filtered
        .filter((v) => v.jp_en_gap_days > 0)
        .map((v) => v.jp_en_gap_days),
    );
  return 1;
}

function getCategoryBreakdown() {
  const main = volumes.filter(
    (v) => !v.is_short_story && !v.is_special && !v.is_upcoming,
  ).length;
  const short = volumes.filter((v) => v.is_short_story).length;
  const special = volumes.filter((v) => v.is_special).length;
  const upcoming = volumes.filter((v) => v.is_upcoming).length;
  return { main, short, special, upcoming };
}

function getCumulativePages() {
  const sorted = [...volumes]
    .filter((v) => !v.is_upcoming && v.page_count > 0)
    .sort(
      (a, b) =>
        new Date(a.jp_release).getTime() - new Date(b.jp_release).getTime(),
    );
  let runningTotal = 0;
  return sorted.map((v) => {
    runningTotal += v.page_count;
    return { volume: v.volume_number, pages: runningTotal };
  });
}

function getDelayTrendData() {
  return [...volumes]
    .filter((v) => !v.is_upcoming && v.jp_en_gap_days > 0)
    .sort(
      (a, b) =>
        new Date(a.jp_release).getTime() - new Date(b.jp_release).getTime(),
    )
    .map((v) => ({
      volume: v.volume_number,
      delay: v.jp_en_gap_days,
      title: v.title,
    }));
}

function getScatterData() {
  return volumes
    .filter((v) => !v.is_upcoming && v.page_count > 0 && v.jp_en_gap_days > 0)
    .map((v) => ({
      pages: v.page_count,
      delay: v.jp_en_gap_days,
      title: v.title,
      volume: v.volume_number,
    }));
}

function calculateStats(data) {
  const activeVolumes = data.filter((v) => !v.is_upcoming && v.page_count > 0);
  const totalVolumes = data.length;
  const releasedVolumes = activeVolumes.length;
  const upcomingVolumes = data.filter((v) => v.is_upcoming).length;
  const totalChapters = activeVolumes.reduce((sum, v) => sum + v.chapters, 0);
  const totalPages = activeVolumes.reduce((sum, v) => sum + v.page_count, 0);
  const avgPagesPerVolume = Math.round(totalPages / activeVolumes.length);
  const avgChaptersPerVolume = Math.round(totalChapters / activeVolumes.length);

  let mostPages = activeVolumes.reduce(
    (max, v) => (v.page_count > max.page_count ? v : max),
    activeVolumes[0] || { page_count: 0, title: "" },
  );
  let leastPages = activeVolumes.reduce(
    (min, v) => (v.page_count < min.page_count ? v : min),
    activeVolumes[0] || { page_count: Infinity, title: "" },
  );

  const translated = activeVolumes.filter((v) => v.jp_en_gap_days > 0);
  let fastest = translated.reduce(
    (min, v) => (v.jp_en_gap_days < min.jp_en_gap_days ? v : min),
    translated[0] || { jp_en_gap_days: Infinity, title: "" },
  );
  let slowest = translated.reduce(
    (max, v) => (v.jp_en_gap_days > max.jp_en_gap_days ? v : max),
    translated[0] || { jp_en_gap_days: 0, title: "" },
  );
  const avgTranslationDays = Math.round(
    translated.reduce((sum, v) => sum + v.jp_en_gap_days, 0) /
      translated.length,
  );

  const volumesAboveAvgLength = activeVolumes.filter(
    (v) => v.page_count > avgPagesPerVolume,
  ).length;
  const volumesBelowAvgLength = activeVolumes.filter(
    (v) => v.page_count < avgPagesPerVolume,
  ).length;

  const dates = activeVolumes.map((v) => new Date(v.jp_release));
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

  const sortedByDate = [...activeVolumes].sort(
    (a, b) =>
      new Date(a.jp_release).getTime() - new Date(b.jp_release).getTime(),
  );
  const gaps = [];
  for (let i = 1; i < sortedByDate.length; i++) {
    const prev = new Date(sortedByDate[i - 1].jp_release);
    const curr = new Date(sortedByDate[i].jp_release);
    const days = Math.floor(
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24),
    );
    gaps.push({
      from: sortedByDate[i - 1].volume_number,
      to: sortedByDate[i].volume_number,
      days,
    });
  }

  const avgGap =
    gaps.length > 0
      ? Math.round(gaps.reduce((sum, g) => sum + g.days, 0) / gaps.length)
      : 0;
  const longestGap = gaps.length > 0 ? Math.max(...gaps.map((g) => g.days)) : 0;
  const shortestGap =
    gaps.length > 0 ? Math.min(...gaps.map((g) => g.days)) : 0;
  const longestGapEntry = gaps.find((g) => g.days === longestGap);
  const shortestGapEntry = gaps.find((g) => g.days === shortestGap);

  gapStats = {
    avg: avgGap,
    longest: longestGap,
    shortest: shortestGap,
    longestVolume: longestGapEntry
      ? `${longestGapEntry.from} → ${longestGapEntry.to}`
      : "",
    shortestVolume: shortestGapEntry
      ? `${shortestGapEntry.from} → ${shortestGapEntry.to}`
      : "",
  };
  publicationGaps = gaps;

  statsSummary = {
    totalVolumes,
    releasedVolumes,
    upcomingVolumes,
    totalChapters,
    totalPages,
    avgPagesPerVolume,
    avgChaptersPerVolume,
    mostPagesVolume: mostPages.title || "",
    mostPagesCount: mostPages.page_count || 0,
    leastPagesVolume: leastPages.title || "",
    leastPagesCount: leastPages.page_count || 0,
    fastestTranslationDays: fastest.jp_en_gap_days || 0,
    fastestTranslationVolume: fastest.title || "",
    slowestTranslationDays: slowest.jp_en_gap_days || 0,
    slowestTranslationVolume: slowest.title || "",
    avgTranslationDays,
    volumesAboveAvgLength,
    volumesBelowAvgLength,
    publicationStart: minDate.getFullYear().toString(),
    publicationEnd: maxDate.getFullYear().toString(),
  };

  const sortedByChapters = [...activeVolumes].sort(
    (a, b) => b.chapters - a.chapters,
  );

  achievements = [
    {
      icon: "fa6-solid:book-open",
      title: "Largest Volume",
      value: `${mostPages.page_count} pages`,
      volume: mostPages.title,
      description: "The largest volume in the series",
      color: "#f9b55d",
    },
    {
      icon: "fa6-solid:book-open",
      title: "Smallest Volume",
      value: `${leastPages.page_count} pages`,
      volume: leastPages.title,
      description: "The smallest volume in the series",
      color: "#7fc4e0",
    },
    {
      icon: "fa6-solid:rocket",
      title: "Fastest Translation",
      value: `${fastest.jp_en_gap_days} days`,
      volume: fastest.title,
      description: "Quickest English translation",
      color: "#7eb870",
    },
    {
      icon: "fa6-solid:turtle",
      title: "Slowest Translation",
      value: `${slowest.jp_en_gap_days} days`,
      volume: slowest.title,
      description: "Longest English translation wait",
      color: "#e06040",
    },
    {
      icon: "fa6-solid:list-ol",
      title: "Most Chapters",
      value: `${sortedByChapters[0]?.chapters || 0} chapters`,
      volume: sortedByChapters[0]?.title || "",
      description: "Highest chapter count",
      color: "#6366f1",
    },
    {
      icon: "fa6-solid:calendar-range",
      title: "Longest Publication Gap",
      value: `${longestGap} days`,
      volume: longestGapEntry
        ? `${longestGapEntry.from} → ${longestGapEntry.to}`
        : "",
      description: "Longest wait between volumes",
      color: "#e06040",
    },
    {
      icon: "fa6-solid:calendar-clock",
      title: "Shortest Publication Gap",
      value: `${shortestGap} days`,
      volume: shortestGapEntry
        ? `${shortestGapEntry.from} → ${shortestGapEntry.to}`
        : "",
      description: "Shortest wait between volumes",
      color: "#7eb870",
    },
  ];

  funFacts = [
    {
      icon: "fa6-solid:percent",
      label: "Collection Progress",
      value: `${Math.round((activeVolumes.length / data.length) * 100)}%`,
      description: `${activeVolumes.length} of ${data.length} volumes released`,
    },
    {
      icon: "fa6-solid:clock",
      label: "Average Translation Delay",
      value: `${avgTranslationDays} days`,
      description: `Across ${translated.length} volumes`,
    },
    {
      icon: "fa6-solid:calendar-range",
      label: "Total Publication Span",
      value: `${minDate.getFullYear()} — ${maxDate.getFullYear()}`,
      description: `${maxDate.getFullYear() - minDate.getFullYear() + 1} years`,
    },
    {
      icon: "fa6-solid:chart-pie",
      label: "Average Release Interval",
      value: `${avgGap} days`,
      description: "Between Japanese releases",
    },
    {
      icon: "fa6-solid:arrow-up",
      label: "Largest Page Increase",
      value: (() => {
        let maxIncrease = 0;
        let maxIncreaseVol = "";
        for (let i = 1; i < sortedByDate.length; i++) {
          const diff =
            sortedByDate[i].page_count - sortedByDate[i - 1].page_count;
          if (diff > maxIncrease) {
            maxIncrease = diff;
            maxIncreaseVol = sortedByDate[i].title;
          }
        }
        return `${maxIncrease} pages (${maxIncreaseVol})`;
      })(),
      description: "Biggest jump in page count",
    },
    {
      icon: "fa6-solid:list-ol",
      label: "Volumes Above Average",
      value: `${volumesAboveAvgLength} volumes`,
      description: `Out of ${activeVolumes.length} released volumes`,
    },
  ];
}

async function fetchStats() {
  try {
    const url =
      window.LanguageSwitch && typeof window.LanguageSwitch.getDataUrl === "function"
        ? window.LanguageSwitch.getDataUrl("stats", "en")
        : "../data/stats/en.json";
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to load stats data");
    const data = await response.json();
    volumes = data;
    calculateStats(volumes);
    renderAll();
    isLoading = false;
    document.getElementById("statsLoading").style.display = "none";
    document.getElementById("statsContent").style.display = "block";
    initIntersectionObserver();
    initNavScroll();
    initScrollSpy();
  } catch (error) {
    console.error("Error loading stats:", error);
    document.getElementById("statsLoading").innerHTML = `
                <p style="color: #e06040;">Error loading statistics. Please try again later.</p>
            `;
  }
}

function renderAll() {
  const container = document.getElementById("statsContent");
  container.innerHTML = `
            ${renderOverview()}
            ${renderDashboard()}
            ${renderTimeline()}
            ${renderTranslation()}
            ${renderCharts()}
            ${renderCompare()}
            ${renderVolumes()}
            ${renderAchievements()}
            ${renderFunFacts()}
        `;
  attachVolumeClickListeners();
  attachFilterListeners();
}

function renderOverview() {
  const released = statsSummary.releasedVolumes || 0;
  const upcoming = statsSummary.upcomingVolumes || 0;
  const total = statsSummary.totalVolumes || 0;
  const completion = total ? Math.round((released / total) * 100) : 0;
  const avgPages = statsSummary.avgPagesPerVolume || 0;
  const avgChapters = statsSummary.avgChaptersPerVolume || 0;
  const years = parseInt(statsSummary.publicationEnd) - parseInt(statsSummary.publicationStart) + 1;

  return `
    <section class="section-reveal visible stats-overview-pro" data-section="overview" id="section-overview">
      <div class="stats-overview-head">
        <div>
          <p class="stats-eyebrow">SERIES STATISTICS · ARCHIVE SNAPSHOT</p>
          <h2>Adachi &amp; Shimamura by the numbers</h2>
          <p>Publication, volume, chapter, page, and translation data recorded across the archive.</p>
        </div>
        <div class="archive-status">
          <span class="status-pulse"></span>
          <span>Archive active</span>
          <small>Updated from recorded data</small>
        </div>
      </div>

      <div class="kpi-grid">
        <article class="kpi-card kpi-primary">
          <div class="kpi-top"><span class="kpi-icon"><iconify-icon icon="fa6-solid:book"></iconify-icon></span><span class="kpi-tag">COLLECTION</span></div>
          <strong>${released}</strong>
          <h3>Released volumes</h3>
          <div class="kpi-meter"><span style="width:${completion}%"></span></div>
          <p>${completion}% of ${total} tracked entries released${upcoming ? ` · ${upcoming} upcoming` : ""}</p>
        </article>

        <article class="kpi-card">
          <div class="kpi-top"><span class="kpi-icon"><iconify-icon icon="fa6-solid:list-ol"></iconify-icon></span><span class="kpi-tag">STRUCTURE</span></div>
          <strong>${statsSummary.totalChapters.toLocaleString()}</strong>
          <h3>Recorded chapters</h3>
          <p>${avgChapters} chapters per released volume on average</p>
        </article>

        <article class="kpi-card">
          <div class="kpi-top"><span class="kpi-icon"><iconify-icon icon="fa6-solid:file-lines"></iconify-icon></span><span class="kpi-tag">LENGTH</span></div>
          <strong>${statsSummary.totalPages.toLocaleString()}</strong>
          <h3>Recorded pages</h3>
          <p>${avgPages.toLocaleString()} pages per released volume on average</p>
        </article>

        <article class="kpi-card">
          <div class="kpi-top"><span class="kpi-icon"><iconify-icon icon="fa6-solid:calendar"></iconify-icon></span><span class="kpi-tag">TIMESPAN</span></div>
          <strong>${years}</strong>
          <h3>Publication years</h3>
          <p>${statsSummary.publicationStart} — ${statsSummary.publicationEnd}</p>
        </article>
      </div>

      <div class="stats-split-row">
        <article class="stat-panel stat-profile">
          <div class="panel-heading">
            <div><span class="panel-kicker">SERIES PROFILE</span><h3>What the archive contains</h3></div>
            <iconify-icon icon="fa6-solid:chart-simple"></iconify-icon>
          </div>
          <div class="profile-rows">
            <div><span>Released</span><b>${released}</b><em>${completion}%</em></div>
            <div><span>Upcoming</span><b>${upcoming}</b><em>${total ? Math.round((upcoming / total) * 100) : 0}%</em></div>
            <div><span>Avg. volume length</span><b>${avgPages.toLocaleString()}</b><em>pages</em></div>
            <div><span>Avg. chapter count</span><b>${avgChapters}</b><em>chapters</em></div>
          </div>
        </article>

        <article class="stat-panel stat-record">
          <span class="panel-kicker">RECORDS</span>
          <div class="record-line"><span>Longest volume</span><strong>${statsSummary.mostPagesCount.toLocaleString()} pages</strong></div>
          <div class="record-volume">${statsSummary.mostPagesVolume}</div>
          <div class="record-divider"></div>
          <div class="record-line"><span>Shortest volume</span><strong>${statsSummary.leastPagesCount.toLocaleString()} pages</strong></div>
          <div class="record-volume">${statsSummary.leastPagesVolume}</div>
        </article>

        <article class="stat-panel stat-translation">
          <span class="panel-kicker">TRANSLATION</span>
          <div class="translation-number">${statsSummary.avgTranslationDays}<small>days</small></div>
          <h3>Average JP → EN delay</h3>
          <p>${statsSummary.translatedVolumes || 0} released volumes with recorded translation timing.</p>
          <div class="translation-range">
            <span>Fastest <b>${statsSummary.fastestTranslationDays}d</b></span>
            <span>Slowest <b>${statsSummary.slowestTranslationDays}d</b></span>
          </div>
        </article>
      </div>

      <div class="overview-note">
        <iconify-icon icon="fa6-regular:circle-info"></iconify-icon>
        <span>Upcoming entries are tracked separately. Page, chapter, and translation metrics are calculated from released entries with the relevant data recorded.</span>
      </div>
    </section>
  `;
}

function renderDashboard() {
  const released = volumes.filter(v => !v.is_upcoming && v.page_count > 0);
  const medianPages = released.length ? [...released].sort((a,b) => a.page_count-b.page_count)[Math.floor(released.length/2)].page_count : 0;
  const longestGap = gapStats.longest || 0;
  const avgGap = gapStats.avg || 0;
  const metrics = [
    ["Average volume", `${statsSummary.avgPagesPerVolume.toLocaleString()} pages`, "Typical recorded length", "fa6-solid:file-lines"],
    ["Average chapters", `${statsSummary.avgChaptersPerVolume}`, "Per released volume", "fa6-solid:list-ol"],
    ["Median volume", `${medianPages.toLocaleString()} pages`, "Middle value by page count", "fa6-solid:chart-column"],
    ["Publication rhythm", `${avgGap} days`, "Average gap between releases", "fa6-solid:calendar-days"],
    ["Fastest translation", `${statsSummary.fastestTranslationDays} days`, statsSummary.fastestTranslationVolume, "fa6-solid:bolt"],
    ["Longest translation", `${statsSummary.slowestTranslationDays} days`, statsSummary.slowestTranslationVolume, "fa6-solid:hourglass-end"],
    ["Longest release gap", `${longestGap} days`, gapStats.longestVolume || "—", "fa6-solid:arrows-left-right"],
    ["Above average length", `${statsSummary.volumesAboveAvgLength}`, `of ${released.length} released volumes`, "fa6-solid:arrow-trend-up"]
  ];
  return `
    <section class="section-reveal stats-dashboard-pro" data-section="dashboard" id="section-dashboard">
      <div class="section-header">
        <div><p class="stats-eyebrow">METRICS</p><h2 class="section-title">The series, measured</h2></div>
        <p class="section-subtitle">Derived statistics from the archive dataset. Select Charts for visual trends and Volumes for the underlying entries.</p>
      </div>
      <div class="metric-board">
        ${metrics.map((m,i) => `
          <article class="metric-tile">
            <div class="metric-tile-head"><span>${m[0]}</span><iconify-icon icon="${m[3]}"></iconify-icon></div>
            <strong>${m[1]}</strong><p>${m[2]}</p><span class="metric-index">${String(i+1).padStart(2,"0")}</span>
          </article>`).join("")}
      </div>
    </section>`;
}

function renderTimeline() {
  const filtered = volumes.filter((v) => !v.is_upcoming);
  let timelineHtml = "";

  filtered.forEach((volume, index, arr) => {
    const isFirst = index === 0;
    const isLast = index === arr.length - 1;
    const gap =
      index > 0
        ? Math.floor(
            (new Date(volume.jp_release).getTime() -
              new Date(arr[index - 1].jp_release).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 0;

    const color = getVolumeColor(volume);
    const type = getVolumeType(volume);

    timelineHtml += `
                <div class="timeline-item stagger-card">
                    <div class="timeline-item-connector">
                        <div class="timeline-item-dot ${isFirst ? "first" : ""} ${isLast ? "last" : ""}" 
                             style="--dot-color: ${color};"></div>
                        ${index < arr.length - 1 ? '<div class="timeline-item-line" style="--dot-color: ${color};"></div>' : ""}
                    </div>
                    <div class="timeline-item-content">
                        <div class="timeline-item-header">
                            <div class="timeline-item-title">
                                <h3>${volume.title}</h3>
                                ${type === "special" ? '<span class="timeline-item-badge special">Special</span>' : ""}
                                ${type === "short" ? '<span class="timeline-item-badge short">Short Story</span>' : ""}
                                ${isFirst ? '<span class="timeline-item-badge milestone">First</span>' : ""}
                                ${isLast ? '<span class="timeline-item-badge milestone">Latest</span>' : ""}
                            </div>
                            <span class="timeline-item-number">#${volume.volume_number}</span>
                        </div>
                        <div class="timeline-item-details">
                            <div class="timeline-item-detail">
                                <iconify-icon icon="fa6-regular:calendar"></iconify-icon>
                                <span>JP: ${formatDate(volume.jp_release)}</span>
                            </div>
                            ${
                              volume.en_completion
                                ? `
                                <div class="timeline-item-detail">
                                    <iconify-icon icon="fa6-regular:calendar-check"></iconify-icon>
                                    <span>EN: ${formatDate(volume.en_completion)}</span>
                                </div>
                            `
                                : ""
                            }
                            <div class="timeline-item-detail">
                                <iconify-icon icon="fa6-regular:file-lines"></iconify-icon>
                                <span>${volume.page_count} pages</span>
                            </div>
                            <div class="timeline-item-detail">
                                <iconify-icon icon="fa6-solid:list-ol"></iconify-icon>
                                <span>${volume.chapters} chapters</span>
                            </div>
                            ${
                              volume.jp_en_gap_days > 0
                                ? `
                                <div class="timeline-item-detail">
                                    <iconify-icon icon="fa6-regular:clock"></iconify-icon>
                                    <span>${volume.jp_en_gap_days} days delay</span>
                                </div>
                            `
                                : ""
                            }
                            ${
                              gap > 0
                                ? `
                                <div class="timeline-item-detail gap">
                                    <iconify-icon icon="fa6-solid:arrow-right"></iconify-icon>
                                    <span>${gap} days since previous</span>
                                </div>
                            `
                                : ""
                            }
                        </div>
                    </div>
                </div>
            `;
  });

  return `
            <section class="section-reveal" data-section="timeline" id="section-timeline">
                <div class="section-header">
                    <h2 class="section-title"><iconify-icon icon="fa6-regular:clock"></iconify-icon> Release Timeline</h2>
                    <p class="section-subtitle">Every volume as a milestone</p>
                </div>
                <div class="timeline-container">
                    ${timelineHtml}
                </div>
                <div class="gap-summary">
                    <div class="gap-stat">
                        <span class="gap-stat-value">${gapStats.avg} days</span>
                        <span class="gap-stat-label">Average Release Interval</span>
                    </div>
                    <div class="gap-stat">
                        <span class="gap-stat-value">${gapStats.longest} days</span>
                        <span class="gap-stat-label">Longest Gap</span>
                        <span class="gap-stat-desc">${gapStats.longestVolume}</span>
                    </div>
                    <div class="gap-stat">
                        <span class="gap-stat-value">${gapStats.shortest} days</span>
                        <span class="gap-stat-label">Shortest Gap</span>
                        <span class="gap-stat-desc">${gapStats.shortestVolume}</span>
                    </div>
                </div>
            </section>
        `;
}

function renderTranslation() {
  const activeVolumes = volumes.filter((v) => v.jp_en_gap_days > 0);
  const maxDelayValue = getMaxValue("delay");

  let sorted = [...activeVolumes];
  if (sortDelay === "longest")
    sorted.sort((a, b) => b.jp_en_gap_days - a.jp_en_gap_days);
  else if (sortDelay === "shortest")
    sorted.sort((a, b) => a.jp_en_gap_days - b.jp_en_gap_days);
  else sorted.sort((a, b) => a.id - b.id);

  let listHtml = "";
  sorted.forEach((volume) => {
    const percentage = (volume.jp_en_gap_days / maxDelayValue) * 100;
    const isFast = volume.jp_en_gap_days < 100;
    const isSlow = volume.jp_en_gap_days > 1000;
    const rank = getRank(volume, "delay");

    listHtml += `
                <div class="translation-item stagger-card">
                    <div class="translation-item-info">
                        <span class="translation-item-title">
                            ${volume.title}
                            ${volume.is_special ? '<span class="badge-special">Special</span>' : ""}
                            ${volume.is_short_story ? '<span class="badge-short">Short Story</span>' : ""}
                            ${rank ? `<span class="badge-rank">${rank}</span>` : ""}
                        </span>
                        <span class="translation-item-days">
                            ${volume.jp_en_gap_days} days
                            ${isFast ? '<span class="badge-fast">Fast</span>' : ""}
                            ${isSlow ? '<span class="badge-slow">Slow</span>' : ""}
                        </span>
                    </div>
                    <div class="translation-item-bar">
                        <div class="translation-item-progress" style="
                            width: ${percentage}%;
                            background: ${
                              isFast
                                ? "linear-gradient(90deg, #7eb870, #8b5cf6)"
                                : isSlow
                                  ? "linear-gradient(90deg, #e06040, #f9b55d)"
                                  : "linear-gradient(90deg, #6366f1, #8b5cf6)"
                            };
                        "></div>
                    </div>
                    <div class="translation-item-dates">
                        <span>JP: ${formatDate(volume.jp_release)}</span>
                        <span>→ ${volume.en_completion ? formatDate(volume.en_completion) : "Pending"}</span>
                    </div>
                </div>
            `;
  });

  return `
            <section class="section-reveal" data-section="translation" id="section-translation">
                <div class="section-header">
                    <h2 class="section-title"><iconify-icon icon="fa6-regular:language"></iconify-icon> Translation Delay</h2>
                    <p class="section-subtitle">Time between JP release and EN completion</p>
                </div>
                <div class="translation-controls">
                    <div class="translation-sort">
                        <span class="translation-sort-label">Sort by:</span>
                        <button class="translation-sort-btn ${sortDelay === "default" ? "active" : ""}" 
                                data-sort="default">Release Order</button>
                        <button class="translation-sort-btn ${sortDelay === "longest" ? "active" : ""}" 
                                data-sort="longest">Longest Delay</button>
                        <button class="translation-sort-btn ${sortDelay === "shortest" ? "active" : ""}" 
                                data-sort="shortest">Shortest Delay</button>
                    </div>
                </div>
                <div class="translation-list">
                    ${listHtml}
                </div>
            </section>
        `;
}

function renderCharts() {
  const maxPages = getMaxValue("pages");
  const maxChapters = getMaxValue("chapters");
  const maxDelay = getMaxValue("delay");
  const cumulative = getCumulativePages();
  const maxCumulative =
    cumulative.length > 0 ? cumulative[cumulative.length - 1].pages : 1;
  const trendData = getDelayTrendData();
  const maxTrendDelay =
    trendData.length > 0 ? Math.max(...trendData.map((d) => d.delay)) : 1;
  const scatter = getScatterData();
  const maxScatterPages =
    scatter.length > 0 ? Math.max(...scatter.map((d) => d.pages)) : 1;
  const maxScatterDelay =
    scatter.length > 0 ? Math.max(...scatter.map((d) => d.delay)) : 1;
  const category = getCategoryBreakdown();
  const total = volumes.length;

  let pagesBars = "";
  volumes
    .filter((v) => v.page_count > 0)
    .forEach((volume) => {
      const percentage = (volume.page_count / maxPages) * 100;
      const rank = getRank(volume, "pages");
      const color = getVolumeColor(volume);
      pagesBars += `
                <div class="chart-bar-group" title="${volume.title}: ${volume.page_count} pages">
                    <div class="chart-bar-wrapper">
                        <div class="chart-bar" style="height: ${percentage}%; background: ${color};"></div>
                    </div>
                    <span class="chart-bar-label">${volume.volume_number}</span>
                    ${rank && rank.startsWith("#1") ? '<span class="chart-bar-rank">Top</span>' : ""}
                </div>
            `;
    });

  let chaptersBars = "";
  volumes
    .filter((v) => v.page_count > 0)
    .forEach((volume) => {
      const percentage = (volume.chapters / maxChapters) * 100;
      const color = getVolumeColor(volume);
      chaptersBars += `
                <div class="chart-bar-group" title="${volume.title}: ${volume.chapters} chapters">
                    <div class="chart-bar-wrapper">
                        <div class="chart-bar" style="height: ${percentage}%; background: ${color};"></div>
                    </div>
                    <span class="chart-bar-label">${volume.volume_number}</span>
                </div>
            `;
    });

  let cumulativeBars = "";
  cumulative.forEach((item) => {
    const percentage = (item.pages / maxCumulative) * 100;
    cumulativeBars += `
                <div class="chart-bar-group" title="Volume ${item.volume}: ${item.pages} total pages">
                    <div class="chart-bar-wrapper">
                        <div class="chart-bar chart-bar-cumulative" style="height: ${percentage}%; background: linear-gradient(180deg, #818cf8, #4f46e5);"></div>
                    </div>
                    <span class="chart-bar-label">${item.volume}</span>
                </div>
            `;
  });

  let trendBars = "";
  trendData.forEach((item) => {
    const percentage = (item.delay / maxTrendDelay) * 100;
    const isFast = item.delay < 100;
    const isSlow = item.delay > 1000;
    const color = isFast
      ? "linear-gradient(90deg, #7eb870, #8b5cf6)"
      : isSlow
        ? "linear-gradient(90deg, #e06040, #f9b55d)"
        : "linear-gradient(90deg, #6366f1, #8b5cf6)";
    trendBars += `
                <div class="chart-bar-group chart-bar-group-horizontal" title="${item.title}: ${item.delay} days">
                    <span class="chart-bar-label chart-bar-label-horizontal">${item.volume}</span>
                    <div class="chart-bar-wrapper chart-bar-wrapper-horizontal">
                        <div class="chart-bar chart-bar-horizontal" style="width: ${percentage}%; background: ${color};"></div>
                    </div>
                    <span class="chart-bar-value">${item.delay}d</span>
                </div>
            `;
  });

  let scatterPoints = "";
  scatter.forEach((item) => {
    const xPercent = (item.pages / maxScatterPages) * 100;
    const yPercent = (item.delay / maxScatterDelay) * 100;
    const color =
      item.delay < 100 ? "#7eb870" : item.delay > 1000 ? "#e06040" : "#6366f1";
    scatterPoints += `
                <div class="scatter-point" style="left: ${xPercent}%; bottom: ${yPercent}%; background-color: ${color};" 
                     title="${item.title}: ${item.pages} pages, ${item.delay} days delay"></div>
            `;
  });

  let categoryItems = "";
  const categoryConfigs = [
    { key: "main", label: "Main Volumes", color: "#6366f1" },
    { key: "short", label: "Short Stories", color: "#8b5cf6" },
    { key: "special", label: "Specials", color: "#f9b55d" },
    { key: "upcoming", label: "Upcoming", color: "#7fc4e0" },
  ];
  categoryConfigs.forEach((cfg) => {
    const count = category[cfg.key] || 0;
    const pct = total > 0 ? (count / total) * 100 : 0;
    categoryItems += `
                <div class="category-item">
                    <div class="category-label">
                        <span class="category-dot" style="background-color: ${cfg.color};"></span>
                        <span>${cfg.label}</span>
                    </div>
                    <div class="category-bar">
                        <div class="category-bar-fill" style="width: ${pct}%; background-color: ${cfg.color};"></div>
                    </div>
                    <span class="category-count">${count}</span>
                </div>
            `;
  });

  let gapItems = "";
  publicationGaps.forEach((gap) => {
    const maxGap = Math.max(...publicationGaps.map((g) => g.days));
    const percentage = (gap.days / maxGap) * 100;
    const isLong = gap.days > gapStats.avg * 1.5;
    const isShort = gap.days < gapStats.avg * 0.5;
    const color = isLong ? "#e06040" : isShort ? "#7eb870" : "#6366f1";
    gapItems += `
                <div class="gap-item" title="${gap.from} → ${gap.to}: ${gap.days} days">
                    <span class="gap-label">${gap.from} → ${gap.to}</span>
                    <div class="gap-bar-wrapper">
                        <div class="gap-bar ${isLong ? "long" : ""} ${isShort ? "short" : ""}" 
                             style="width: ${Math.max(percentage, 2)}%; background-color: ${color};"></div>
                    </div>
                    <span class="gap-days">${gap.days}d</span>
                </div>
            `;
  });

  return `
            <section class="section-reveal" data-section="charts" id="section-charts">
                <div class="section-header">
                    <h2 class="section-title"><iconify-icon icon="fa6-regular:chart-bar"></iconify-icon> Charts</h2>
                    <p class="section-subtitle">Visualizing the series structure</p>
                </div>
                <div class="charts-grid">
                    <div class="chart-card stagger-card">
                        <h3 class="chart-title"><iconify-icon icon="fa6-regular:file-lines"></iconify-icon> Pages per Volume</h3>
                        <div class="chart-bars">${pagesBars}</div>
                        <div class="chart-tooltip-hint">Hover bars for details</div>
                    </div>

                    <div class="chart-card stagger-card">
                        <h3 class="chart-title"><iconify-icon icon="fa6-regular:list-ol"></iconify-icon> Chapters per Volume</h3>
                        <div class="chart-bars">${chaptersBars}</div>
                        <div class="chart-tooltip-hint">Hover bars for details</div>
                    </div>

                    <div class="chart-card stagger-card">
                        <h3 class="chart-title"><iconify-icon icon="fa6-regular:chart-line"></iconify-icon> Cumulative Pages</h3>
                        <div class="chart-bars chart-bars-cumulative">${cumulativeBars}</div>
                        <div class="chart-tooltip-hint">Running total of pages</div>
                    </div>

                    <div class="chart-card stagger-card">
                        <h3 class="chart-title"><iconify-icon icon="fa6-regular:clock"></iconify-icon> Translation Delay Trend</h3>
                        <div class="chart-bars chart-bars-horizontal">${trendBars}</div>
                        <div class="chart-tooltip-hint">Translation delay over time</div>
                    </div>

                    <div class="chart-card chart-card-full stagger-card">
                        <h3 class="chart-title"><iconify-icon icon="fa6-regular:circle-dot"></iconify-icon> Pages vs Translation Delay</h3>
                        <div class="scatter-plot">
                            ${scatterPoints}
                            <div class="scatter-labels">
                                <span>Fewer Pages</span>
                                <span>More Pages</span>
                            </div>
                        </div>
                        <div class="chart-tooltip-hint">Hover points for details</div>
                    </div>

                    <div class="chart-card stagger-card">
                        <h3 class="chart-title"><iconify-icon icon="fa6-regular:pie-chart"></iconify-icon> Category Breakdown</h3>
                        <div class="category-breakdown">${categoryItems}</div>
                    </div>

                    <div class="chart-card chart-card-full stagger-card">
                        <h3 class="chart-title"><iconify-icon icon="fa6-regular:calendar-range"></iconify-icon> Publication Gap Analysis</h3>
                        <div class="gap-visualization">${gapItems}</div>
                        <div class="gap-summary-mini">
                            <span>Average: ${gapStats.avg}d</span>
                            <span>Longest: ${gapStats.longest}d</span>
                            <span>Shortest: ${gapStats.shortest}d</span>
                        </div>
                    </div>
                </div>
            </section>
        `;
}

function renderCompare() {
  const compareVol1 = volumes.find((v) => v.id === compareVolume1);
  const compareVol2 = volumes.find((v) => v.id === compareVolume2);

  let compareHtml = "";
  if (compareVol1 && compareVol2) {
    compareHtml = `
                <div class="compare-results">
                    <div class="compare-card">
                        <h3>${compareVol1.title}</h3>
                        <div class="compare-stats">
                            ${renderCompareStats(compareVol1, compareVol2)}
                        </div>
                    </div>
                    <div class="compare-vs">VS</div>
                    <div class="compare-card">
                        <h3>${compareVol2.title}</h3>
                        <div class="compare-stats">
                            ${renderCompareStats(compareVol2, compareVol1)}
                        </div>
                    </div>
                </div>
            `;
  } else {
    compareHtml = `
                <div class="compare-placeholder">
                    <iconify-icon icon="fa6-solid:arrows-left-right"></iconify-icon>
                    <p>Select two volumes to compare</p>
                </div>
            `;
  }

  const vol1Options = volumes
    .filter((v) => v.id !== compareVolume2)
    .map(
      (v) => `
            <option value="${v.id}" ${v.id === compareVolume1 ? "selected" : ""}>#${v.volume_number} - ${v.title}</option>
        `,
    )
    .join("");

  const vol2Options = volumes
    .filter((v) => v.id !== compareVolume1)
    .map(
      (v) => `
            <option value="${v.id}" ${v.id === compareVolume2 ? "selected" : ""}>#${v.volume_number} - ${v.title}</option>
        `,
    )
    .join("");

  return `
            <section class="section-reveal" data-section="compare" id="section-compare">
                <div class="section-header">
                    <h2 class="section-title"><iconify-icon icon="fa6-regular:arrows-left-right"></iconify-icon> Compare Volumes</h2>
                    <p class="section-subtitle">Side-by-side comparison of any two volumes</p>
                </div>
                <div class="compare-controls">
                    <div class="compare-select">
                        <label>Volume 1</label>
                        <select id="compareSelect1" onchange="setCompareVolume1(parseInt(this.value))">
                            <option value="">Select Volume</option>
                            ${vol1Options}
                        </select>
                    </div>
                    <div class="compare-select">
                        <label>Volume 2</label>
                        <select id="compareSelect2" onchange="setCompareVolume2(parseInt(this.value))">
                            <option value="">Select Volume</option>
                            ${vol2Options}
                        </select>
                    </div>
                </div>
                ${compareHtml}
            </section>
        `;
}

function renderCompareStats(vol, other) {
  const stats = [
    {
      label: "Pages",
      value: vol.page_count,
      winner: vol.page_count > other.page_count,
      loser: vol.page_count < other.page_count,
    },
    {
      label: "Chapters",
      value: vol.chapters,
      winner: vol.chapters > other.chapters,
      loser: vol.chapters < other.chapters,
    },
    { label: "JP Release", value: formatDate(vol.jp_release) },
    {
      label: "EN Completion",
      value: vol.en_completion ? formatDate(vol.en_completion) : "—",
    },
    {
      label: "Translation Delay",
      value: `${vol.jp_en_gap_days} days`,
      winner: vol.jp_en_gap_days < other.jp_en_gap_days,
      loser: vol.jp_en_gap_days > other.jp_en_gap_days,
    },
    { label: "Volume Weight", value: `${vol.volume_weight}%` },
  ];

  return stats
    .map(
      (stat) => `
            <div class="compare-stat">
                <span class="compare-stat-label">${stat.label}</span>
                <span class="compare-stat-value ${stat.winner ? "winner" : ""} ${stat.loser ? "loser" : ""}">${stat.value}</span>
            </div>
        `,
    )
    .join("");
}

function renderVolumes() {
  const maxPages = getMaxValue("pages");
  const maxDelay = getMaxValue("delay");

  let filtered = [...volumes];
  if (filterType === "main")
    filtered = filtered.filter(
      (v) => !v.is_short_story && !v.is_special && !v.is_upcoming,
    );
  else if (filterType === "short")
    filtered = filtered.filter((v) => v.is_short_story);
  else if (filterType === "special")
    filtered = filtered.filter((v) => v.is_special);
  else if (filterType === "upcoming")
    filtered = filtered.filter((v) => v.is_upcoming);

  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(
      (v) =>
        v.title.toLowerCase().includes(query) ||
        v.volume_number.toLowerCase().includes(query),
    );
  }

  let cardsHtml = "";
  filtered.forEach((volume) => {
    const isExpanded = expandedVolume === volume.id;
    const color = getVolumeColor(volume);
    const type = getVolumeType(volume);
    const pagePercentile = getPercentile(volume, "pages");
    const pageRank = getRank(volume, "pages");
    const chapterRank = getRank(volume, "chapters");
    const delayRank = getRank(volume, "delay");

    cardsHtml += `
                <div class="volume-card ${isExpanded ? "expanded" : ""} stagger-card" style="--card-accent: ${color};" data-volume-id="${volume.id}">
                    <div class="volume-card-header">
                        <div class="volume-card-title">
                            <span class="volume-card-number">#${volume.volume_number}</span>
                            <h3>${volume.title}</h3>
                        </div>
                        <div class="volume-card-meta">
                            ${type === "special" ? '<span class="volume-badge special">Special</span>' : ""}
                            ${type === "short" ? '<span class="volume-badge short">Short Story</span>' : ""}
                            ${type === "upcoming" ? '<span class="volume-badge upcoming">Upcoming</span>' : ""}
                            ${
                              pageRank &&
                              (pageRank === "#1 Longest" ||
                                pageRank === "#2 Longest" ||
                                pageRank === "#3 Longest")
                                ? `<span class="volume-badge rank">${pageRank}</span>`
                                : ""
                            }
                            ${delayRank === "Fastest" ? '<span class="volume-badge rank">Fastest TL</span>' : ""}
                            ${delayRank === "Slowest" ? '<span class="volume-badge rank">Slowest TL</span>' : ""}
                            <span class="volume-card-pages">${volume.page_count} pages</span>
                            <iconify-icon icon="fa6-solid:chevron-${isExpanded ? "up" : "down"}" class="volume-card-chevron"></iconify-icon>
                        </div>
                    </div>
                    <div class="volume-card-body ${isExpanded ? "expanded" : ""}">
                        <div class="volume-card-progress">
                            <div class="volume-progress-item">
                                <span class="volume-progress-label">Page Count</span>
                                <div class="volume-progress-bar">
                                    <div class="volume-progress-fill" style="width: ${(volume.page_count / maxPages) * 100}%; background-color: ${color};"></div>
                                </div>
                                <span class="volume-progress-value">${volume.page_count} / ${maxPages}</span>
                            </div>
                            ${
                              volume.jp_en_gap_days > 0
                                ? `
                                <div class="volume-progress-item">
                                    <span class="volume-progress-label">Translation Delay</span>
                                    <div class="volume-progress-bar">
                                        <div class="volume-progress-fill" style="width: ${(volume.jp_en_gap_days / maxDelay) * 100}%; background-color: ${volume.jp_en_gap_days < 100 ? "#7eb870" : volume.jp_en_gap_days > 1000 ? "#e06040" : "#6366f1"};"></div>
                                    </div>
                                    <span class="volume-progress-value">${volume.jp_en_gap_days}d</span>
                                </div>
                            `
                                : ""
                            }
                            <div class="volume-progress-item">
                                <span class="volume-progress-label">Percentile</span>
                                <div class="volume-progress-bar">
                                    <div class="volume-progress-fill" style="width: ${pagePercentile}%; background-color: #8b5cf6;"></div>
                                </div>
                                <span class="volume-progress-value">${pagePercentile}%</span>
                            </div>
                        </div>
                        <div class="volume-card-details">
                            <div class="volume-card-detail">
                                <span class="volume-card-detail-label">Chapters</span>
                                <span class="volume-card-detail-value">${volume.chapters} ${chapterRank ? `<span class="volume-card-rank">${chapterRank}</span>` : ""}</span>
                            </div>
                            <div class="volume-card-detail">
                                <span class="volume-card-detail-label">Page Range</span>
                                <span class="volume-card-detail-value">${volume.page_range || "—"}</span>
                            </div>
                            <div class="volume-card-detail">
                                <span class="volume-card-detail-label">JP Release</span>
                                <span class="volume-card-detail-value">${formatDate(volume.jp_release)}</span>
                            </div>
                            ${
                              volume.en_completion
                                ? `
                                <div class="volume-card-detail">
                                    <span class="volume-card-detail-label">EN Release</span>
                                    <span class="volume-card-detail-value">${formatDate(volume.en_completion)}</span>
                                </div>
                            `
                                : ""
                            }
                            ${
                              volume.jp_en_gap_days > 0
                                ? `
                                <div class="volume-card-detail">
                                    <span class="volume-card-detail-label">Translation Delay</span>
                                    <span class="volume-card-detail-value">${volume.jp_en_gap_days} days ${delayRank ? `<span class="volume-card-rank">${delayRank}</span>` : ""}</span>
                                </div>
                            `
                                : ""
                            }
                            <div class="volume-card-detail">
                                <span class="volume-card-detail-label">Volume Weight</span>
                                <span class="volume-card-detail-value">${volume.volume_weight}%</span>
                            </div>
                            <div class="volume-card-detail">
                                <span class="volume-card-detail-label">Page Contribution</span>
                                <span class="volume-card-detail-value">${statsSummary.totalPages > 0 ? ((volume.page_count / statsSummary.totalPages) * 100).toFixed(1) : 0}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
  });

  return `
            <section class="section-reveal" data-section="volumes" id="section-volumes">
                <div class="section-header">
                    <h2 class="section-title"><iconify-icon icon="fa6-regular:book"></iconify-icon> Volume Explorer</h2>
                    <p class="section-subtitle">Explore each volume in detail</p>
                </div>
                <div class="volume-controls">
                    <div class="volume-search">
                        <iconify-icon icon="fa6-solid:magnifying-glass" class="volume-search-icon"></iconify-icon>
                        <input type="text" id="volumeSearchInput" placeholder="Search by title or volume number..." 
                               value="${searchQuery}" class="volume-search-input">
                        ${searchQuery ? `<button class="volume-search-clear" id="volumeSearchClear"><iconify-icon icon="fa6-solid:xmark"></iconify-icon></button>` : ""}
                    </div>
                    <div class="volume-filters">
                        <button class="volume-filter-btn ${filterType === "all" ? "active" : ""}" data-filter="all">All</button>
                        <button class="volume-filter-btn ${filterType === "main" ? "active" : ""}" data-filter="main">Main</button>
                        <button class="volume-filter-btn ${filterType === "short" ? "active" : ""}" data-filter="short">Short Stories</button>
                        <button class="volume-filter-btn ${filterType === "special" ? "active" : ""}" data-filter="special">Specials</button>
                        <button class="volume-filter-btn ${filterType === "upcoming" ? "active" : ""}" data-filter="upcoming">Upcoming</button>
                    </div>
                    <div class="volume-count">${filtered.length} volume${filtered.length !== 1 ? "s" : ""} found</div>
                </div>
                <div class="volumes-grid" id="volumesGrid">
                    ${cardsHtml || '<p style="color: rgba(92,58,107,0.5); text-align: center; padding: 40px;">No volumes found matching your criteria.</p>'}
                </div>
            </section>
        `;
}

function renderAchievements() {
  return `
            <section class="section-reveal" data-section="achievements" id="section-achievements">
                <div class="section-header">
                    <h2 class="section-title"><iconify-icon icon="fa6-regular:trophy"></iconify-icon> Series Achievements</h2>
                    <p class="section-subtitle">Notable records and milestones</p>
                </div>
                <div class="achievements-grid">
                    ${achievements
                      .map(
                        (achievement, i) => `
                        <div class="achievement-card stagger-card" style="--achievement-color: ${achievement.color};" data-delay="${i * 60}">
                            <div class="achievement-card-icon"><iconify-icon icon="${achievement.icon}"></iconify-icon></div>
                            <div class="achievement-card-content">
                                <span class="achievement-card-title">${achievement.title}</span>
                                <span class="achievement-card-value">${achievement.value}</span>
                                <span class="achievement-card-volume">${achievement.volume}</span>
                                <span class="achievement-card-description">${achievement.description}</span>
                            </div>
                            <div class="achievement-card-glow"></div>
                        </div>
                    `,
                      )
                      .join("")}
                </div>
            </section>
        `;
}

function renderFunFacts() {
  const staticFacts = [
    {
      icon: "fa6-solid:book-open",
      title: "Largest Volume",
      value: `${statsSummary.mostPagesCount} pages`,
      description: statsSummary.mostPagesVolume,
      color: "#f9b55d",
    },
    {
      icon: "fa6-solid:book-open",
      title: "Smallest Volume",
      value: `${statsSummary.leastPagesCount} pages`,
      description: statsSummary.leastPagesVolume,
      color: "#7fc4e0",
    },
    {
      icon: "fa6-solid:rocket",
      title: "Fastest Translation",
      value: `${statsSummary.fastestTranslationDays} days`,
      description: statsSummary.fastestTranslationVolume,
      color: "#7eb870",
    },
    {
      icon: "fa6-solid:turtle",
      title: "Slowest Translation",
      value: `${statsSummary.slowestTranslationDays} days`,
      description: statsSummary.slowestTranslationVolume,
      color: "#e06040",
    },
    {
      icon: "fa6-solid:list-ol",
      title: "Average Chapters",
      value: `${statsSummary.avgChaptersPerVolume} chapters`,
      description: "Per volume",
      color: "#6366f1",
    },
    {
      icon: "fa6-solid:calendar-range",
      title: "Publication Span",
      value: `${statsSummary.publicationStart} — ${statsSummary.publicationEnd}`,
      description: `${parseInt(statsSummary.publicationEnd) - parseInt(statsSummary.publicationStart) + 1} years`,
      color: "#8b5cf6",
    },
  ];

  return `
            <section class="section-reveal" data-section="funfacts" id="section-funfacts">
                <div class="section-header">
                    <h2 class="section-title"><iconify-icon icon="fa6-regular:star"></iconify-icon> Fun Facts</h2>
                    <p class="section-subtitle">Interesting insights about the series</p>
                </div>
                <div class="funfacts-grid">
                    ${staticFacts
                      .map(
                        (fact, i) => `
                        <div class="funfact-card stagger-card" style="--fact-color: ${fact.color};" data-delay="${i * 50}">
                            <div class="funfact-card-icon"><iconify-icon icon="${fact.icon}"></iconify-icon></div>
                            <div class="funfact-card-content">
                                <span class="funfact-card-value">${fact.value}</span>
                                <span class="funfact-card-title">${fact.title}</span>
                                <span class="funfact-card-description">${fact.description}</span>
                            </div>
                            <div class="funfact-card-glow"></div>
                        </div>
                    `,
                      )
                      .join("")}
                </div>
                <div class="funfacts-dynamic">
                    <h3 class="funfacts-dynamic-title"><iconify-icon icon="fa6-regular:lightbulb"></iconify-icon> Dynamic Insights</h3>
                    <div class="funfacts-dynamic-grid">
                        ${funFacts
                          .map(
                            (fact, i) => `
                            <div class="funfact-dynamic stagger-card" data-delay="${i * 40 + 200}">
                                <iconify-icon icon="${fact.icon}"></iconify-icon>
                                <div>
                                    <span class="funfact-dynamic-value">${fact.value}</span>
                                    <span class="funfact-dynamic-label">${fact.label}</span>
                                    ${fact.description ? `<span class="funfact-dynamic-desc">${fact.description}</span>` : ""}
                                </div>
                            </div>
                        `,
                          )
                          .join("")}
                    </div>
                </div>
            </section>
        `;
}

function attachVolumeClickListeners() {
  document.querySelectorAll(".volume-card").forEach((card) => {
    card.removeEventListener("click", handleVolumeClick);
    card.addEventListener("click", handleVolumeClick);
  });
}

function handleVolumeClick(e) {
  if (
    e.target.closest("button") ||
    e.target.closest("a") ||
    e.target.closest("select")
  )
    return;
  const card = e.currentTarget;
  const id = parseInt(card.dataset.volumeId);
  if (id) toggleVolume(id);
}

function attachFilterListeners() {
  document.querySelectorAll(".volume-filter-btn").forEach((btn) => {
    btn.removeEventListener("click", handleFilterClick);
    btn.addEventListener("click", handleFilterClick);
  });

  const searchInput = document.getElementById("volumeSearchInput");
  if (searchInput) {
    searchInput.removeEventListener("input", handleSearchInput);
    searchInput.addEventListener("input", handleSearchInput);
  }

  const clearBtn = document.getElementById("volumeSearchClear");
  if (clearBtn) {
    clearBtn.removeEventListener("click", handleSearchClear);
    clearBtn.addEventListener("click", handleSearchClear);
  }

  document.querySelectorAll(".translation-sort-btn").forEach((btn) => {
    btn.removeEventListener("click", handleSortClick);
    btn.addEventListener("click", handleSortClick);
  });
}

function handleFilterClick(e) {
  const btn = e.currentTarget;
  const filter = btn.dataset.filter;
  if (filter) setFilterType(filter);
}

function handleSearchInput(e) {
  const value = e.currentTarget.value;
  setSearchQuery(value);
  const clearBtn = document.getElementById("volumeSearchClear");
  if (clearBtn) {
    clearBtn.style.display = value.length > 0 ? "block" : "none";
  }
}

function handleSearchClear(e) {
  const searchInput = document.getElementById("volumeSearchInput");
  if (searchInput) {
    searchInput.value = "";
    setSearchQuery("");
    const clearBtn = document.getElementById("volumeSearchClear");
    if (clearBtn) clearBtn.style.display = "none";
    searchInput.focus();
  }
}

function handleSortClick(e) {
  const btn = e.currentTarget;
  const sort = btn.dataset.sort;
  if (sort) setSortDelay(sort);
}

function setSortDelay(value) {
  sortDelay = value;
  renderAll();
  setTimeout(() => initIntersectionObserver(), 100);
}

function setSearchQuery(value) {
  searchQuery = value;
  renderAll();
  setTimeout(() => initIntersectionObserver(), 100);
}

function setFilterType(value) {
  filterType = value;
  renderAll();
  setTimeout(() => initIntersectionObserver(), 100);
}

function setCompareVolume1(id) {
  compareVolume1 = id;
  renderAll();
  setTimeout(() => initIntersectionObserver(), 100);
}

function setCompareVolume2(id) {
  compareVolume2 = id;
  renderAll();
  setTimeout(() => initIntersectionObserver(), 100);
}

function toggleVolume(id) {
  expandedVolume = expandedVolume === id ? null : id;
  renderAll();
  setTimeout(() => initIntersectionObserver(), 100);
}

function scrollToSection(sectionId) {
  const element = document.getElementById(`section-${sectionId}`);
  if (!element) return;

  const navHeight = document.querySelector(".stats-nav")?.offsetHeight || 0;
  const offset = navHeight + 80;
  const elementPosition = element.getBoundingClientRect().top;
  const offsetPosition = elementPosition + window.pageYOffset - offset;

  window.scrollTo({
    top: offsetPosition,
    behavior: "smooth",
  });

  setActiveSection(sectionId);
}

function setActiveSection(sectionId) {
  activeSection = sectionId;
  document.querySelectorAll(".stats-nav-item").forEach((btn) => {
    const isActive = btn.dataset.section === sectionId;
    btn.classList.toggle("active", isActive);
  });
}

function initScrollSpy() {
  const sections = document.querySelectorAll(".section-reveal");

  function updateActiveSection() {
    let currentSection = null;
    const navHeight = document.querySelector(".stats-nav")?.offsetHeight || 0;
    const offset = navHeight + 60;

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      if (rect.top <= offset && rect.bottom >= offset) {
        currentSection = section.dataset.section;
      }
    });

    if (currentSection && currentSection !== activeSection) {
      setActiveSection(currentSection);
    }
  }

  let ticking = false;
  window.addEventListener("scroll", function () {
    if (!ticking) {
      window.requestAnimationFrame(function () {
        updateActiveSection();
        ticking = false;
      });
      ticking = true;
    }
  });

  window.addEventListener("resize", updateActiveSection);
}

let sectionObserver = null;
let cardObserver = null;

function initIntersectionObserver() {
  if (sectionObserver) sectionObserver.disconnect();
  if (cardObserver) cardObserver.disconnect();

  sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        }
      });
    },
    { threshold: 0.1 },
  );

  document.querySelectorAll(".section-reveal").forEach((el) => {
    sectionObserver.observe(el);
  });

  cardObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const delay = parseInt(entry.target.dataset.delay) || 0;
          setTimeout(() => {
            entry.target.classList.add("visible");
          }, delay);
        }
      });
    },
    { threshold: 0.05 },
  );

  document.querySelectorAll(".stagger-card").forEach((el) => {
    cardObserver.observe(el);
  });
}

function initNavScroll() {
  if (navListenersAttached) return;
  navListenersAttached = true;

  document.querySelectorAll(".stats-nav-item").forEach((btn) => {
    btn.addEventListener("click", function (e) {
      const sectionId = this.dataset.section;
      scrollToSection(sectionId);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  createParticles();
  fetchStats();
});

window.setSortDelay = setSortDelay;
window.setSearchQuery = setSearchQuery;
window.setFilterType = setFilterType;
window.setCompareVolume1 = setCompareVolume1;
window.setCompareVolume2 = setCompareVolume2;
window.toggleVolume = toggleVolume;
window.scrollToSection = scrollToSection;

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

const menuVer = Math.floor(Date.now() / 86400000);
fetch("/src/components/menu.html?v=" + menuVer)
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
  .catch((e) => console.warn("menu.html no disponible:", e.message));

document.addEventListener("menuLoaded", function () {
  if (typeof window.translateMenu === "function") {
    window.translateMenu(currentLang);
    console.log("Menu auto-translated to:", currentLang);
  }
});