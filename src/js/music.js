const R2_CONFIG = {
  baseUrl: "https://pub-669d8b8b8b7c4f8d92985f2a8392663d.r2.dev",
  musicPath: "music",
};

// Supported languages
const SUPPORTED_LANGUAGES = ["es", "en", "tg"];

// Normalize language with Spanish fallback
function normalizeLanguage(lang, fallback) {
  fallback = fallback || "es";
  if (!lang) return fallback;
  const normalized = lang.toLowerCase().trim();
  if (SUPPORTED_LANGUAGES.includes(normalized)) return normalized;
  // Handle partial matches (e.g., 'en-US' -> 'en', 'tg-PH' -> 'tg')
  for (const supported of SUPPORTED_LANGUAGES) {
    if (normalized.startsWith(supported + "-") || normalized === supported) {
      return supported;
    }
  }
  return fallback;
}

// Expose for other scripts
window.normalizeLanguage = normalizeLanguage;
window.SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;

// Detect active language
let currentLang = (() => {
  const storedLang =
    window.LanguageSwitch?.getCurrentLanguage?.() ||
    localStorage.getItem("lang") ||
    localStorage.getItem("preferredLanguage") ||
    localStorage.getItem("language") ||
    localStorage.getItem("adashima_manga_lang") ||
    "es";

  return normalizeLanguage(storedLang, "es");
})();

let musicData = null;
let currentAlbumId = null;
let albumScrollPosition = 0;

function getTrackUrl(albumFolder, filename) {
  const encodedFilename = encodeURIComponent(filename).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${R2_CONFIG.baseUrl}/${R2_CONFIG.musicPath}/${albumFolder}/${encodedFilename}`;
}

function showDownloadNotice(message) {
  const notification = document.createElement("div");
  notification.className = "playback-error";
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.classList.add("fade-out");
    setTimeout(() => notification.remove(), 500);
  }, 5000);
}

async function triggerDirectDownload(url, filename) {
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error("Download request failed");
    const reader = response.body.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const blob = new Blob(chunks);
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(blobUrl);
    link.remove();
  } catch {
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = url;
    link.download = filename;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    showDownloadNotice(
      currentLang === "en"
        ? "⚠️ Your browser or ad blocker prevented the direct download. The file was opened in a new tab; save it from there."
        : currentLang === "tg"
          ? "⚠️ Hindi pinahintulutan ng iyong browser o ad blocker ang direktang pag-download. Binuksan ang file sa isang bagong tab; i-save ito mula doon."
          : "⚠️ Tu navegador o bloqueador de anuncios impidió la descarga directa. Se abrió el archivo en una nueva pestaña; guárdalo desde ahí.",
    );
  }
}

async function downloadSingleTrack(url, filename, btnElement) {
  const icon = btnElement ? btnElement.querySelector(".iconify") : null;
  try {
    if (btnElement) btnElement.disabled = true;
    if (icon) {
      icon.classList.remove("dl-success", "dl-error");
      icon.setAttribute("data-icon", "mdi:loading");
      icon.classList.add("spin-anim");
    }
    await triggerDirectDownload(url, filename);
    if (icon) {
      icon.classList.remove("spin-anim");
      icon.setAttribute("data-icon", "mdi:check-circle");
      icon.classList.add("dl-success", "dl-pop");
    }
  } catch {
    if (icon) {
      icon.classList.remove("spin-anim");
      icon.setAttribute("data-icon", "mdi:alert-circle");
      icon.classList.add("dl-error", "dl-pop");
    }
  } finally {
    setTimeout(() => {
      if (btnElement) btnElement.disabled = false;
      if (icon) {
        icon.classList.remove("dl-success", "dl-error", "dl-pop");
        icon.setAttribute("data-icon", "mdi:download");
      }
    }, 1400);
  }
}

function updateLangLabel() {
  const sel = document.querySelector(`.lang-option[data-lang="${currentLang}"]`);
  const label = document.getElementById("langSelectedLabel");
  if (sel && label) {
    label.textContent = sel.getAttribute("data-label");
    document.querySelectorAll(".lang-option").forEach((o) => o.classList.remove("selected"));
    sel.classList.add("selected");
  }
}

function updateFavoritesBackLabel() {
  const label = document.getElementById("backFromFavoritesLabel");
  if (!label) return;
  label.textContent =
    currentLang === "en"
      ? "Back to Music"
      : currentLang === "tg"
        ? "Bumalik sa Musika"
        : "Volver a la Música";
}

// Footer is now the shared component (src/components/js/footer.js), which
// handles its own translation.

function getFavoriteKey(albumId, trackId) {
  return `${albumId}:${trackId}`;
}

function matchesTrackId(itemId, candidateId) {
  return String(itemId) === String(candidateId);
}

function getLocalizedTrackTitle(track) {
  if (!track) return "Untitled";
  if (currentLang === "en") return track.title || track.title_en || track.title_jp || "Untitled";
  if (currentLang === "es")
    return track.title || track.title_es || track.title_en || track.title_jp || "Sin título";
  return track.title || track.title_tg || track.title_en || track.title_jp || "Untitled";
}

updateLangLabel();
updateFavoritesBackLabel();

function refreshIconify() {
  if (typeof Iconify !== "undefined") {
    Iconify.scan(document.body);
  }
}

window.addEventListener("DOMContentLoaded", refreshIconify);
window.addEventListener("load", refreshIconify);

(function () {
  let albums = [];
  let currentAlbum = null;
  let currentTrackId = null;
  let isPlaying = false;
  let duration = 0;
  let volume = 0.8;
  let isMuted = false;
  let shuffle = false;
  let repeatMode = 0;
  let queue = [];
  let favorites = new Set();
  let isQueueOpen = false;
  let viewMode = "library";
  let currentView = "standard";
  let trackIndex = new Map();
  let lastFilteredTracks = [];
  let renderedAlbumId = null;
  let searchDebounceTimer = null;

  function normalizeFavoriteEntry(entry) {
    if (typeof entry === "string") {
      const parts = entry.split(":");
      if (parts.length >= 2) {
        const albumId = parts[0];
        const trackId = parts.slice(1).join(":");
        if (albumId && trackId) {
          return { id: `${albumId}:${trackId}`, albumId, trackId };
        }
      }
      return null;
    }

    if (entry && typeof entry === "object") {
      const albumId = entry.albumId || entry.album_id || entry.album || "";
      const trackId = entry.trackId || entry.track_id || entry.track || "";
      if (albumId && trackId) {
        return { id: `${albumId}:${trackId}`, albumId, trackId };
      }
    }

    return null;
  }

  function hydrateFavorites() {
    favorites.clear();
    try {
      const saved = localStorage.getItem("adashima_music_favorites_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          parsed.forEach((entry) => {
            const normalized = normalizeFavoriteEntry(entry);
            if (normalized) favorites.add(normalized.id);
          });
        }
      }
    } catch {
      // Ignore persistence failures when storage is unavailable.
    }

    try {
      const savedView = localStorage.getItem("adashima_music_view");
      if (savedView === "compact" || savedView === "standard") {
        currentView = savedView;
      }
    } catch {
      // Ignore persistence failures when storage is unavailable.
    }
  }

  hydrateFavorites();

  const audio = new Audio();
  const musicLibraryView = document.getElementById("musicLibraryView");
  const albumDetailView = document.getElementById("albumDetailView");
  const albumGrid = document.getElementById("albumGrid");
  const albumTrackTable = document.getElementById("albumTrackTable");
  const compactTrackTable = document.getElementById("compactTrackTable");
  const _compactViewContainer = document.getElementById("compactViewContainer");
  const _trackTableWrapper = document.getElementById("trackTableWrapper");
  const albumEmptyState = document.getElementById("albumEmptyState");
  const albumSearchInput = document.getElementById("albumSearchInput");
  const albumResultCount = document.getElementById("albumResultCount");
  const viewToggleBtns = document.querySelectorAll(".view-toggle-btn");
  const mainContent = document.getElementById("mainContent");
  const playerBar = document.getElementById("playerBar");

  const playBtn = document.getElementById("playBtn");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const shuffleBtn = document.getElementById("shuffleBtn");
  const repeatBtn = document.getElementById("repeatBtn");
  const progressSlider = document.getElementById("progressSlider");
  const currentTimeLabel = document.getElementById("currentTimeLabel");
  const totalTimeLabel = document.getElementById("totalTimeLabel");
  const volumeSlider = document.getElementById("volumeSlider");
  const muteBtn = document.getElementById("muteBtn");
  const playerTitle = document.getElementById("playerTitle");
  const playerArtist = document.getElementById("playerArtist");
  const playerThumb = document.getElementById("playerThumb");
  const favBtn = document.getElementById("favBtn");
  const queueToggle = document.getElementById("queueToggle");
  const queueClose = document.getElementById("queueClose");
  const queueOverlay = document.getElementById("queueOverlay");
  const queueDrawer = document.getElementById("queueDrawer");
  const queueList = document.getElementById("queueList");
  const queueCurrentTrack = document.getElementById("queueCurrentTrack");
  const playAllBtn = document.getElementById("playAlbumBtn");
  const shuffleAlbumBtn = document.getElementById("shuffleAlbumBtn");
  const backToLibraryBtn = document.getElementById("backToLibraryBtn");
  const expandPlayerBtn = document.getElementById("expandPlayerBtn");
  const expandedPlayerOverlay = document.getElementById("expandedPlayerOverlay");
  const expandedPlayerClose = document.getElementById("expandedPlayerClose");
  const expandedPlayerBg = document.getElementById("expandedPlayerBg");
  const expandedArtwork = document.getElementById("expandedArtwork");
  const expandedTitle = document.getElementById("expandedTitle");
  const expandedArtist = document.getElementById("expandedArtist");
  const expandedAlbum = document.getElementById("expandedAlbum");
  const expandedPlay = document.getElementById("expandedPlay");
  const expandedPrev = document.getElementById("expandedPrev");
  const expandedNext = document.getElementById("expandedNext");
  const expandedShuffle = document.getElementById("expandedShuffle");
  const expandedRepeat = document.getElementById("expandedRepeat");
  const expandedProgressSlider = document.getElementById("expandedProgressSlider");
  const expandedCurrentTime = document.getElementById("expandedCurrentTime");
  const expandedTotalTime = document.getElementById("expandedTotalTime");
  const expandedQueueList = document.getElementById("expandedQueueList");
  const expandedQueueCount = document.getElementById("expandedQueueCount");

  const albumDetailCover = document.getElementById("albumDetailCover");
  const albumDetailCoverFallback = document.getElementById("albumDetailCoverFallback");
  const albumDetailBadge = document.getElementById("albumDetailBadge");
  const albumDetailTitle = document.getElementById("albumDetailTitle");
  const albumDetailTitleJp = document.getElementById("albumDetailTitleJp");
  const albumDetailArtist = document.getElementById("albumDetailArtist");
  const albumDetailYear = document.getElementById("albumDetailYear");
  const albumDetailTrackCount = document.getElementById("albumDetailTrackCount");
  const albumDetailDuration = document.getElementById("albumDetailDuration");
  const albumTracksHeading = document.getElementById("albumTracksHeading");
  const albumEmptyTitle = document.getElementById("albumEmptyTitle");
  const albumEmptyDesc = document.getElementById("albumEmptyDesc");

  const acfReleaseDate = document.getElementById("acfReleaseDate");
  const acfCopyright = document.getElementById("acfCopyright");
  const acfLabel = document.getElementById("acfLabel");

  const musicPageSubtitle = document.getElementById("musicPageSubtitle");
  const backToLibraryLabel = document.getElementById("backToLibraryLabel");
  const playAlbumLabel = document.getElementById("playAlbumLabel");
  const favoritesView = document.getElementById("favoritesView");
  const favoritesList = document.getElementById("favoritesList");
  const favoritesEmpty = document.getElementById("favoritesEmpty");
  const backFromFavoritesBtn = document.getElementById("backFromFavoritesBtn");
  const _backFromFavoritesLabel = document.getElementById("backFromFavoritesLabel");
  const favoritesResultCount = document.getElementById("favoritesResultCount");

  let playerVisible = false;

  function showPlayer() {
    if (!playerVisible) {
      playerVisible = true;
      playerBar.classList.add("visible");
      mainContent.classList.add("has-player");
    }
  }

  // eslint-disable-next-line no-unused-vars -- may be invoked from an inline onclick handler in HTML
  function hidePlayer() {
    if (playerVisible) {
      playerVisible = false;
      playerBar.classList.remove("visible");
      mainContent.classList.remove("has-player");
    }
  }

  async function loadMusicData() {
    try {
      const jsonPath = (() => {
        const path = window.location.pathname;
        if (path.includes("/src/pages/")) {
          return `../../data/music/${currentLang}.json?v=${Date.now()}`;
        } else if (path.includes("/src/")) {
          return `../data/music/${currentLang}.json?v=${Date.now()}`;
        }
        return `/src/data/music/${currentLang}.json?v=${Date.now()}`;
      })();

      const response = await fetch(jsonPath);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      musicData = data;
      albums = data.albums || [];

      // A language change/reload can happen while the previous page state is
      // still being torn down. Always establish a clean library view before
      // rendering the new manifest so the album cards remain actionable.
      viewMode = "library";
      currentAlbum = null;
      musicLibraryView.style.display = "block";
      albumDetailView.style.display = "none";
      favoritesView.style.display = "none";

      if (albums.length === 0) {
        throw new Error("No albums found in data");
      }

      buildTrackIndex();

      musicPageSubtitle.textContent = data.page?.subtitle || "Original Soundtracks";
      backToLibraryLabel.textContent = data.page?.backToLibrary || "Back to Music";
      playAlbumLabel.textContent = data.player?.playAlbum || "Play Album";
      albumTracksHeading.textContent = data.ost?.tracksHeading || "Tracks";
      albumEmptyTitle.textContent = data.ost?.noTracksFound || "No tracks found";
      albumEmptyDesc.textContent = data.ost?.noTracksDesc || "Try adjusting your search.";

      renderAlbumGrid();

      const favCountEl = document.getElementById("favoritesCount");
      if (favCountEl) {
        favCountEl.style.display = "none";
      }
      const favLabelEl = document.getElementById("favoritesLabel");
      const favHeadingEl = document.getElementById("favoritesHeading");
      const favEmptyTitle = document.getElementById("favoritesEmptyTitle");
      const favEmptyDesc = document.getElementById("favoritesEmptyDesc");
      const favResultCount = document.getElementById("favoritesResultCount");
      if (favLabelEl)
        favLabelEl.textContent =
          data.page?.favoritesButtonLabel ||
          (currentLang === "en"
            ? "Favorites"
            : currentLang === "tg"
              ? "Mga Paborito"
              : "Favoritos");
      if (favHeadingEl)
        favHeadingEl.textContent =
          data.page?.favoritesHeading ||
          (currentLang === "en"
            ? "Favorites"
            : currentLang === "tg"
              ? "Mga Paborito"
              : "Favoritos");
      if (favEmptyTitle)
        favEmptyTitle.textContent =
          data.page?.favoritesEmptyTitle ||
          (currentLang === "en"
            ? "No favorites yet"
            : currentLang === "tg"
              ? "Wala pang mga paborito"
              : "Aún no hay favoritos");
      if (favEmptyDesc)
        favEmptyDesc.textContent =
          data.page?.favoritesEmptyDesc ||
          (currentLang === "en"
            ? 'Mark tracks with "Like" to see them here.'
            : currentLang === "tg"
              ? 'Markahan ang mga track ng "Like" para makita sila dito.'
              : 'Marca pistas con "Me encanta" para verlas aquí.');
      if (favResultCount) favResultCount.textContent = "0";
      updateFavoritesHeaderCount();

      const queueDrawerTitle = document.getElementById("queueDrawerTitle");
      const queueNowPlayingLabel = document.getElementById("queueNowPlayingLabel");
      const queueNextUpLabel = document.getElementById("queueNextUpLabel");
      const expandedQueueTitle = document.getElementById("expandedQueueTitle");

      if (queueDrawerTitle) queueDrawerTitle.textContent = data.player?.queueTitle || "Queue";
      if (queueNowPlayingLabel)
        queueNowPlayingLabel.textContent = data.player?.nowPlaying || "Now Playing";
      if (queueNextUpLabel) queueNextUpLabel.textContent = data.player?.nextUp || "Next Up";
      if (expandedQueueTitle) expandedQueueTitle.textContent = data.player?.nextUp || "Up Next";

      updateFavoritesBackLabel();

      if (favoritesView && favoritesView.style.display === "block") {
        renderFavoritesView();
      }
    } catch (error) {
      console.error("Error loading music data:", error);
      albumGrid.innerHTML = `
            <div class="error-state">
              <span class="iconify" data-icon="mdi:alert-circle" data-inline="false"></span>
              <p>${currentLang === "en" ? "Could not load music data. Please try again later." : currentLang === "tg" ? "Hindi ma-load ang data ng musika. Pakisubukan muli mamaya." : "No se pudo cargar la música. Por favor, intenta de nuevo más tarde."}</p>
            </div>
          `;
    }
  }

  function renderAlbumGrid() {
    albumGrid.innerHTML = "";

    const favCard = document.createElement("div");
    favCard.className = "album-card favorites-card";
    favCard.tabIndex = 0;
    favCard.setAttribute("role", "button");
    favCard.setAttribute("aria-label", "Open favorites");

    favCard.innerHTML = `
          <div class="album-card-artwork favorites-card-artwork">
            <div class="favorites-card-icon">
              <span class="iconify" data-icon="mdi:heart" data-inline="false"></span>
            </div>
            <span class="fav-count-badge" id="favoritesCount" style="display:none">0</span>
          </div>
          <div class="album-card-info">
            <div class="album-card-title" id="favoritesLabel">${musicData?.page?.favoritesButtonLabel || (currentLang === "en" ? "Favorites" : currentLang === "tg" ? "Mga Paborito" : "Favoritos")}</div>
          </div>
        `;

    favCard.addEventListener("click", () => {
      openFavorites();
    });

    favCard.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openFavorites();
      }
    });

    albumGrid.appendChild(favCard);

    albums.forEach((album) => {
      const card = document.createElement("div");
      card.className = "album-card";
      card.dataset.albumId = album.id;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Open album: ${album.title}`);

      const trackCount = album.tracks ? album.tracks.length : 0;
      const coverImage = album.coverImage || "../../assets/Imagenes/Adashima ost3.webp";

      card.innerHTML = `
            <div class="album-card-artwork">
              <img src="${coverImage}" alt="${album.title}" loading="lazy" onerror="this.style.display='none'; this.parentElement.querySelector('.album-card-fallback').style.display='flex';" />
              <div class="album-card-fallback">
                <span class="fallback-emoji">🌸</span>
              </div>
              <div class="album-card-overlay">
                <span class="album-card-play">
                  <span class="iconify" data-icon="mdi:play-circle" data-inline="false"></span>
                </span>
              </div>
              <span class="album-card-playing-badge">
                <span class="equalizer"><span></span><span></span><span></span><span></span></span>
              </span>
            </div>
            <div class="album-card-info">
              <div class="album-card-title">${album.title}</div>
              ${album.title_jp ? `<div class="album-card-title-jp">${album.title_jp}</div>` : ""}
              <div class="album-card-meta">${trackCount} ${trackCount === 1 ? musicData?.trackList?.track || "track" : musicData?.trackList?.tracks || "tracks"}</div>
            </div>
          `;

      card.addEventListener("click", () => {
        openAlbum(album.id);
      });

      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openAlbum(album.id);
        }
      });

      card.addEventListener("touchend", (e) => {
        if (!e.target.closest(".album-card-overlay")) {
          openAlbum(album.id);
        }
      });

      albumGrid.appendChild(card);
    });

    if (typeof Iconify !== "undefined") {
      Iconify.scan(albumGrid);
    }

    updateAlbumGridPlayingState();
  }

  function updateAlbumGridPlayingState() {
    if (!albumGrid) return;
    const cards = albumGrid.querySelectorAll(".album-card[data-album-id]");
    cards.forEach((card) => {
      const isActiveAlbum = !!currentTrackId && card.dataset.albumId === currentAlbumId;
      card.classList.toggle("playing", isActiveAlbum && isPlaying);
      card.classList.toggle("playing-paused", isActiveAlbum && !isPlaying);
    });
  }

  function openAlbum(albumId) {
    albumScrollPosition = window.scrollY;

    const album = albums.find((a) => a.id === albumId);
    if (!album) return;

    currentAlbum = album;
    currentAlbumId = albumId;
    viewMode = "album";

    albumDetailCover.src = album.coverImage || "../../assets/Imagenes/Adashima ost3.webp";
    albumDetailCover.onerror = function () {
      this.style.display = "none";
      albumDetailCoverFallback.style.display = "flex";
    };
    albumDetailCoverFallback.style.display = "none";
    albumDetailCover.style.display = "block";

    albumDetailBadge.textContent = album.badge || "ORIGINAL SOUNDTRACK";
    albumDetailTitle.textContent = album.title;
    albumDetailTitleJp.textContent = album.title_jp || "";
    albumDetailTitleJp.style.display = album.title_jp ? "block" : "none";
    albumDetailArtist.textContent = album.artist || "Various Artists";
    albumDetailYear.textContent = album.year || "2020";

    const trackCount = album.tracks ? album.tracks.length : 0;
    albumDetailTrackCount.textContent = `${trackCount} ${trackCount === 1 ? musicData?.trackList?.track || "track" : musicData?.trackList?.tracks || "tracks"}`;

    let totalSec = 0;
    if (album.tracks) {
      album.tracks.forEach((t) => {
        const parts = t.duration.split(":").map(Number);
        totalSec += parts[0] * 60 + (parts[1] || 0);
      });
    }
    albumDetailDuration.textContent = formatTime(totalSec);

    if (album.releaseDate) {
      acfReleaseDate.textContent = album.releaseDate;
      acfReleaseDate.style.display = "block";
    } else {
      acfReleaseDate.style.display = "none";
    }

    if (album.phonographicCopyright) {
      acfCopyright.textContent = album.phonographicCopyright;
      acfCopyright.style.display = "block";
    } else {
      acfCopyright.style.display = "none";
    }

    if (album.label) {
      acfLabel.textContent = album.label;
      acfLabel.style.display = "block";
    } else {
      acfLabel.style.display = "none";
    }

    queue = album.tracks ? album.tracks.map((t) => t.id) : [];

    musicLibraryView.style.display = "none";
    albumDetailView.style.display = "block";

    renderAlbumTracks("");

    const url = new URL(window.location);
    url.searchParams.set("album", albumId);
    window.history.pushState({ album: albumId, view: "album" }, "", url);

    document.querySelector(".music-page-container").scrollIntoView({ behavior: "smooth" });

    albumSearchInput.value = "";

    applyViewMode();
  }

  function applyViewMode() {
    const standardWrapper = document.getElementById("trackTableWrapper");
    const compactContainer = document.getElementById("compactViewContainer");

    if (currentView === "compact") {
      standardWrapper.style.display = "none";
      compactContainer.style.display = "block";
      viewToggleBtns.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.view === "compact");
      });
    } else {
      standardWrapper.style.display = "block";
      compactContainer.style.display = "none";
      viewToggleBtns.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.view === "standard");
      });
    }

    renderAlbumTracks(albumSearchInput.value);
  }

  function toggleView(view) {
    if (currentView === view) return;
    currentView = view;
    try {
      localStorage.setItem("adashima_music_view", view);
    } catch {
      // Ignore persistence failures when storage is unavailable.
    }
    applyViewMode();
  }

  function buildTrackRow(t, index) {
    const row = document.createElement("div");
    const isActive = currentTrackId === t.id;
    const favoriteKey = getFavoriteKey(currentAlbum?.id || currentAlbumId, t.id);
    const isFav = favorites.has(favoriteKey);
    const isPaused = isActive && !isPlaying;

    row.className = `track-row${isActive ? " active" : ""}`;
    row.dataset.id = t.id;
    row.dataset.index = String(index + 1);
    row.setAttribute("role", "row");

    let stateContent = "";
    if (isActive && isPlaying) {
      stateContent = `<span class="equalizer"><span></span><span></span><span></span><span></span></span>`;
    } else if (isActive && isPaused) {
      stateContent = `<span class="col-state-paused">
            <span class="iconify" data-icon="mdi:pause" data-inline="false"></span>
          </span>`;
    } else {
      stateContent = `<span class="col-number">${index + 1}</span>`;
    }

    const primaryTitle = t.title_jp || t.title || t.title_es || "Untitled";
    const secondaryTitle = t.title || t.title_es || "";

    row.innerHTML = `
          <div class="col-state-col">
            ${stateContent}
            <button class="col-play-btn" aria-label="Play track ${primaryTitle}">
              <span class="iconify" data-icon="mdi:play" data-inline="false"></span>
            </button>
          </div>
          <div class="col-info-col">
            <div class="track-title-jp">${primaryTitle}</div>
            ${secondaryTitle ? `<div class="track-title-en">${secondaryTitle}</div>` : ""}
          </div>
          <div class="col-duration-col">
            <span class="track-duration">${t.duration}</span>
          </div>
          <div class="col-dl-col">
            <button class="track-dl-btn" data-filename="${t.filename}" aria-label="Download ${primaryTitle}">
              <span class="iconify" data-icon="mdi:download" data-inline="false"></span>
            </button>
          </div>
          <div class="col-fav-col">
            <button class="track-fav-btn ${isFav ? "faved" : ""}" data-id="${t.id}" data-album-id="${currentAlbum?.id || currentAlbumId || ""}" aria-label="${isFav ? "Remove from favorites" : "Add to favorites"}">
              <span class="iconify" data-icon="${isFav ? "mdi:heart" : "mdi:heart-outline"}" data-inline="false"></span>
            </button>
          </div>
        `;

    row.addEventListener("click", (e) => {
      if (e.target.closest(".col-play-btn")) return;
      if (e.target.closest(".track-fav-btn")) return;
      if (e.target.closest(".track-dl-btn")) return;
      playTrack(t.id);
    });

    row.querySelector(".col-play-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      playTrack(t.id);
    });

    row.querySelector(".track-dl-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const albumFolder = currentAlbum?.folder || currentAlbum?.id;
      const trackUrl = getTrackUrl(albumFolder, t.filename);
      downloadSingleTrack(trackUrl, t.filename, e.currentTarget);
    });

    row.querySelector(".track-fav-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(t.id, currentAlbum?.id || currentAlbumId);
    });

    return row;
  }

  function buildCompactRow(t, index) {
    const row = document.createElement("div");
    const isActive = currentTrackId === t.id;

    row.className = `compact-track-row${isActive ? " active" : ""}`;
    row.dataset.id = t.id;
    row.dataset.index = String(index + 1);
    row.setAttribute("role", "row");

    const primaryTitle = t.title_jp || t.title || t.title_es || "Untitled";
    const secondaryTitle = t.title || t.title_es || "";

    row.innerHTML = `
          <span class="cr-number">${index + 1}</span>
          <span class="cr-title">
            <span class="cr-title-jp">${primaryTitle}</span>
            ${secondaryTitle ? `<span class="cr-title-en">${secondaryTitle}</span>` : ""}
          </span>
          <span class="cr-artist">${t.artist}</span>
          <span class="cr-album">${currentAlbum.title}</span>
          <span class="cr-duration">${t.duration}</span>
          <span class="cr-dl">
            <button class="track-dl-btn compact-dl-btn" data-filename="${t.filename}" aria-label="Download ${primaryTitle}">
              <span class="iconify" data-icon="mdi:download" data-inline="false"></span>
            </button>
          </span>
        `;

    row.addEventListener("click", (e) => {
      if (e.target.closest(".track-dl-btn")) return;
      playTrack(t.id);
    });

    row.querySelector(".track-dl-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const albumFolder = currentAlbum?.folder || currentAlbum?.id;
      const trackUrl = getTrackUrl(albumFolder, t.filename);
      downloadSingleTrack(trackUrl, t.filename, e.currentTarget);
    });

    return row;
  }

  // Full rebuild: used when the album opens, the search query changes, or
  // the view toggles. Only builds the table that's actually visible, and
  // batches all rows into a DocumentFragment before touching the live DOM.
  function renderAlbumTracks(query = "") {
    if (!currentAlbum || !currentAlbum.tracks) {
      albumTrackTable.innerHTML = "";
      compactTrackTable.innerHTML = "";
      albumResultCount.textContent = "0 tracks";
      lastFilteredTracks = [];
      renderedAlbumId = null;
      return;
    }

    let filtered = currentAlbum.tracks;

    if (query.trim()) {
      const q = query.toLowerCase().trim();
      filtered = filtered.filter((t) => {
        const jpMatch = t.title_jp && t.title_jp.toLowerCase().includes(q);
        const enMatch = t.title && t.title.toLowerCase().includes(q);
        const esMatch = t.title_es && t.title_es.toLowerCase().includes(q);
        const artistMatch = t.artist && t.artist.toLowerCase().includes(q);
        return jpMatch || enMatch || esMatch || artistMatch;
      });
    }

    lastFilteredTracks = filtered;
    renderedAlbumId = currentAlbum?.id || currentAlbumId;

    albumResultCount.textContent = `${filtered.length} ${filtered.length === 1 ? musicData?.trackList?.track || "track" : musicData?.trackList?.tracks || "tracks"}`;

    if (filtered.length === 0) {
      albumTrackTable.innerHTML = "";
      compactTrackTable.innerHTML = "";
      albumEmptyState.style.display = "block";
      return;
    }

    albumEmptyState.style.display = "none";

    if (currentView === "compact") {
      const frag = document.createDocumentFragment();
      filtered.forEach((t, index) => frag.appendChild(buildCompactRow(t, index)));
      compactTrackTable.innerHTML = "";
      compactTrackTable.appendChild(frag);
      albumTrackTable.innerHTML = "";
      if (typeof Iconify !== "undefined") Iconify.scan(compactTrackTable);
    } else {
      const frag = document.createDocumentFragment();
      filtered.forEach((t, index) => frag.appendChild(buildTrackRow(t, index)));
      albumTrackTable.innerHTML = "";
      albumTrackTable.appendChild(frag);
      compactTrackTable.innerHTML = "";
      if (typeof Iconify !== "undefined") Iconify.scan(albumTrackTable);
    }
  }

  // Targeted update: rebuilds a single row in place (e.g. after a play/pause
  // or favorite toggle) instead of tearing down and re-creating the whole
  // list. Falls back to a full render if the table shown doesn't match the
  // currently playing album (e.g. it hasn't been rendered yet).
  function updateTrackRow(trackId) {
    if (viewMode !== "album") return;
    if (renderedAlbumId !== (currentAlbum?.id || currentAlbumId)) return;
    const index = lastFilteredTracks.findIndex((t) => t.id === trackId);
    if (index === -1) return;
    const track = lastFilteredTracks[index];

    if (currentView === "compact") {
      const oldRow = compactTrackTable.querySelector(`[data-id="${CSS.escape(String(trackId))}"]`);
      if (!oldRow) return;
      oldRow.replaceWith(buildCompactRow(track, index));
    } else {
      const oldRow = albumTrackTable.querySelector(`[data-id="${CSS.escape(String(trackId))}"]`);
      if (!oldRow) return;
      const newRow = buildTrackRow(track, index);
      oldRow.replaceWith(newRow);
      if (typeof Iconify !== "undefined") Iconify.scan(newRow);
    }
  }

  // Swaps just the previous/current active rows instead of the whole list;
  // falls back to a full render when the underlying album has changed.
  function refreshActiveTrackRows(previousTrackId, albumChanged) {
    if (albumChanged) {
      renderAlbumTracks(albumSearchInput.value);
      return;
    }
    if (previousTrackId && previousTrackId !== currentTrackId) {
      updateTrackRow(previousTrackId);
    }
    updateTrackRow(currentTrackId);
  }

  function formatTime(sec) {
    if (!sec || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function buildTrackIndex() {
    trackIndex.clear();
    albums.forEach((album) => {
      (album.tracks || []).forEach((track) => {
        trackIndex.set(String(track.id), { album, track });
      });
    });
  }

  function getTrack(id) {
    if (id === null || id === undefined) return null;
    const entry = trackIndex.get(String(id));
    return entry ? entry.track : null;
  }

  function getTrackContext(trackId, albumId = currentAlbum?.id || currentAlbumId) {
    if (albumId) {
      const album = albums.find((candidate) => candidate.id === albumId);
      if (album) {
        const track = (album.tracks || []).find((item) => matchesTrackId(item.id, trackId));
        if (track) return { album, track };
      }
    }
    return trackIndex.get(String(trackId)) || null;
  }

  function saveFavorites() {
    try {
      const serialized = [...favorites].map((id) => {
        const [albumId, ...trackParts] = id.split(":");
        return {
          id,
          albumId,
          trackId: trackParts.join(":"),
        };
      });
      localStorage.setItem("adashima_music_favorites_v2", JSON.stringify(serialized));
    } catch {
      // Ignore persistence failures when storage is unavailable.
    }
    updateFavoritesHeaderCount();
  }

  function updateFavoritesHeaderCount() {
    const favoritesCount = document.getElementById("favoritesCount");
    if (!favoritesCount) return;
    const n = favorites.size || 0;
    if (n > 0) {
      favoritesCount.style.display = "inline-block";
      favoritesCount.textContent = String(n);
    } else {
      favoritesCount.style.display = "none";
    }
  }

  function collectFavoriteTracks() {
    const out = [];
    favorites.forEach((key) => {
      const separator = key.indexOf(":");
      if (separator <= 0) return;
      const aid = key.slice(0, separator);
      const tid = key.slice(separator + 1);
      const alb = albums.find((a) => a.id === aid);
      if (!alb || !alb.tracks) return;
      const tr = alb.tracks.find((t) => matchesTrackId(t.id, tid));
      if (!tr) return;
      out.push({ album: alb, track: tr });
    });
    return out;
  }

  function renderFavoritesView() {
    if (!favoritesList || !favoritesView) return;
    const favoritesCount = document.getElementById("favoritesCount");
    const items = collectFavoriteTracks();
    favoritesList.innerHTML = "";
    if (!items.length) {
      favoritesEmpty.style.display = "block";
      if (favoritesResultCount) favoritesResultCount.textContent = "0";
      if (favoritesCount) favoritesCount.style.display = "none";
      return;
    }
    favoritesEmpty.style.display = "none";
    if (favoritesResultCount) favoritesResultCount.textContent = String(items.length);
    if (favoritesCount) {
      favoritesCount.style.display = "inline-block";
      favoritesCount.textContent = String(items.length);
    }

    items.forEach((it) => {
      const div = document.createElement("div");
      const title = it.track.title_jp || it.track.title || it.track.title_es || "Untitled";
      const albumTitle = it.album.title || "Album";
      const artwork = it.album.coverImage || "../../assets/Imagenes/Adashima ost1.webp";
      const meta = it.track.artist || it.album.artist || "";
      div.className = "favorite-card";
      div.dataset.id = it.track.id;
      div.innerHTML = `
            <div class="favorite-card-artwork">
              <img src="${artwork}" alt="${title}" />
              <div class="favorite-card-overlay">
                <button class="favorite-card-play-btn" aria-label="Play ${title}">
                  <span class="iconify" data-icon="mdi:play" data-inline="false"></span>
                </button>
              </div>
            </div>
            <div class="favorite-card-info">
              <div class="favorite-card-title">${title}</div>
              <div class="favorite-card-album">${albumTitle}</div>
              <div class="favorite-card-meta">${meta}</div>
            </div>
            <div class="favorite-card-actions">
              <span class="favorite-card-duration">${it.track.duration}</span>
              <button class="favorite-card-toggle faved" data-id="${it.track.id}" data-album-id="${it.album.id}" aria-label="Remove from favorites">
                <span class="iconify" data-icon="mdi:heart" data-inline="false"></span>
              </button>
            </div>
          `;
      div.addEventListener("click", (e) => {
        if (e.target.closest(".favorite-card-toggle")) return;
        playTrack(it.track.id, it.album.id);
      });
      const playBtnEl = div.querySelector(".favorite-card-play-btn");
      playBtnEl.addEventListener("click", (e) => {
        e.stopPropagation();
        playTrack(it.track.id, it.album.id);
      });
      const toggleBtn = div.querySelector(".favorite-card-toggle");
      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavorite(it.track.id, it.album.id);
      });
      favoritesList.appendChild(div);
    });

    if (typeof Iconify !== "undefined") {
      Iconify.scan(favoritesList);
    }
  }

  function openFavorites() {
    musicLibraryView.style.display = "none";
    albumDetailView.style.display = "none";
    favoritesView.style.display = "block";
    renderFavoritesView();
  }

  function closeFavorites() {
    favoritesView.style.display = "none";
    musicLibraryView.style.display = "block";
  }

  function playTrack(id, albumId = currentAlbum?.id || currentAlbumId) {
    const context = getTrackContext(id, albumId);
    if (!context) return;

    const { album, track } = context;
    const previousTrackId = currentTrackId;
    const albumChanged = (currentAlbum?.id || currentAlbumId) !== album.id;
    currentAlbum = album;
    currentAlbumId = album.id;

    showPlayer();

    if (currentTrackId === id) {
      togglePlay();
      return;
    }

    const albumFolder = album.folder || album.id;
    audio.src = getTrackUrl(albumFolder, track.filename);
    currentTrackId = id;
    audio.load();
    audio
      .play()
      .then(() => {
        isPlaying = true;
        updateUI();
        refreshActiveTrackRows(previousTrackId, albumChanged);
        updateExpandedQueue();
      })
      .catch(() => {
        isPlaying = false;
        updateUI();
        showPlaybackError(track.title_jp || track.title);
      });
    updateUI();
    updateQueue(id);
    refreshActiveTrackRows(previousTrackId, albumChanged);
  }

  function togglePlay() {
    if (!currentTrackId) {
      if (currentAlbum && currentAlbum.tracks && currentAlbum.tracks.length) {
        playTrack(currentAlbum.tracks[0].id);
      }
      return;
    }
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
    } else {
      audio
        .play()
        .then(() => {
          isPlaying = true;
          updateUI();
          updateTrackRow(currentTrackId);
        })
        .catch(() => {
          isPlaying = false;
          updateUI();
        });
    }
    updateUI();
    updateTrackRow(currentTrackId);
  }

  function prevTrack() {
    if (!currentTrackId || !currentAlbum || !currentAlbum.tracks) return;
    const idx = queue.indexOf(currentTrackId);
    if (idx > 0) {
      playTrack(queue[idx - 1]);
    } else if (repeatMode === 1) {
      playTrack(queue[queue.length - 1]);
    }
  }

  function nextTrack() {
    if (!currentTrackId || !currentAlbum || !currentAlbum.tracks) return;
    const idx = queue.indexOf(currentTrackId);
    if (idx < queue.length - 1) {
      playTrack(queue[idx + 1]);
    } else if (repeatMode === 1) {
      playTrack(queue[0]);
    } else if (repeatMode === 2) {
      audio.currentTime = 0;
      audio.play();
    }
  }

  function toggleFavorite(trackId, albumId = currentAlbum?.id || currentAlbumId) {
    if (!albumId) return;
    const key = getFavoriteKey(albumId, trackId);
    if (favorites.has(key)) favorites.delete(key);
    else favorites.add(key);
    saveFavorites();
    updateFavUI();
    if (currentAlbum && currentAlbum.id === albumId) {
      updateTrackRow(trackId);
    }
    if (favoritesView && favoritesView.style.display === "block") {
      renderFavoritesView();
    }
  }

  function updateQueue(id) {
    if (!queue.includes(id)) queue.push(id);
    renderQueue();
    updateExpandedQueue();
  }

  function renderQueue() {
    queueList.innerHTML = "";
    queue.forEach((qid, index) => {
      const t = getTrack(qid);
      if (!t) return;
      const div = document.createElement("div");
      const isCurrent = qid === currentTrackId;
      div.className = `queue-item${isCurrent ? " current" : ""}`;
      const displayTitle = t.title_jp || t.title || t.title_es || "Untitled";
      div.innerHTML = `
            <span class="qi-index">${isCurrent ? "▶" : index + 1}</span>
            <span class="qi-title">${displayTitle}</span>
            <span class="qi-artist">${t.artist}</span>
          `;
      div.addEventListener("click", () => playTrack(t.id));
      queueList.appendChild(div);
    });
    updateQueueCurrent();
  }

  function updateExpandedQueue() {
    if (!expandedQueueList) return;
    expandedQueueList.innerHTML = "";
    let _currentIndex = -1;

    queue.forEach((qid, index) => {
      const t = getTrack(qid);
      if (!t) return;
      if (qid === currentTrackId) _currentIndex = index;

      const div = document.createElement("div");
      const isCurrent = qid === currentTrackId;
      div.className = `expanded-queue-item${isCurrent ? " current" : ""}`;
      const displayTitle = t.title_jp || t.title || t.title_es || "Untitled";
      div.innerHTML = `
            <span class="eqi-number">${index + 1}</span>
            <span class="eqi-info">
              <span class="eqi-title">${displayTitle}</span>
              <span class="eqi-artist">${t.artist}</span>
            </span>
            <span class="eqi-duration">${t.duration}</span>
          `;
      div.addEventListener("click", () => playTrack(t.id));
      expandedQueueList.appendChild(div);
    });

    if (expandedQueueCount) {
      expandedQueueCount.textContent = `${queue.length} ${queue.length === 1 ? musicData?.trackList?.track || "song" : musicData?.trackList?.tracks || "songs"}`;
    }

    // Always (re)open the queue scrolled to the top so the first
    // upcoming track is the first thing visible, instead of centering
    // on the current track (which could land mid-list).
    expandedQueueList.scrollTop = 0;
  }

  function updateQueueCurrent() {
    if (currentTrackId) {
      const t = getTrack(currentTrackId);
      if (t) {
        const displayTitle = t.title_jp || t.title || t.title_es || "Untitled";
        queueCurrentTrack.innerHTML = `
              <span class="qct-title">${displayTitle}</span>
              <span class="qct-artist">${t.artist}</span>
            `;
      }
    } else {
      queueCurrentTrack.innerHTML = `<span class="qct-empty">${musicData?.player?.noTrackPlaying || "No track playing"}</span>`;
    }
  }

  function updateQueueUI() {
    if (isQueueOpen) {
      queueDrawer.classList.add("open");
      queueOverlay.classList.add("show");
    } else {
      queueDrawer.classList.remove("open");
      queueOverlay.classList.remove("show");
    }
  }

  function toggleQueue() {
    isQueueOpen = !isQueueOpen;
    updateQueueUI();
    if (isQueueOpen) renderQueue();
  }

  function closeQueue() {
    isQueueOpen = false;
    updateQueueUI();
  }

  let isExpandedPlayerOpen = false;

  function toggleExpandedPlayer() {
    isExpandedPlayerOpen = !isExpandedPlayerOpen;
    if (isExpandedPlayerOpen) {
      expandedPlayerOverlay.classList.add("open");
      document.body.style.overflow = "hidden";
      updateExpandedPlayer();
      updateExpandedQueue();
    } else {
      expandedPlayerOverlay.classList.remove("open");
      document.body.style.overflow = "";
    }
  }

  function updateExpandedPlayer() {
    const track = getTrack(currentTrackId);
    if (track) {
      const displayTitle = getLocalizedTrackTitle(track);
      expandedTitle.textContent = displayTitle;
      expandedArtist.textContent = track.artist;
      expandedAlbum.textContent = currentAlbum?.title || "";
      expandedArtwork.src = currentAlbum?.coverImage || "../../assets/Imagenes/Adashima ost2.webp";

      if (currentAlbum?.coverImage) {
        expandedPlayerBg.style.background = `
              radial-gradient(ellipse at 30% 40%, rgba(140, 90, 150, 0.15) 0%, transparent 70%),
              radial-gradient(ellipse at 70% 60%, rgba(201, 184, 232, 0.10) 0%, transparent 60%),
              linear-gradient(180deg, rgba(30, 20, 35, 0.95) 0%, rgba(20, 15, 25, 0.98) 100%)
            `;
      }
    } else {
      expandedTitle.textContent = "Select a track";
      expandedArtist.textContent = "—";
      expandedAlbum.textContent = "—";
    }
    const icon = isPlaying ? "mdi:pause" : "mdi:play";
    expandedPlay.querySelector(".iconify")?.setAttribute("data-icon", icon);
  }

  function updateUI() {
    const track = getTrack(currentTrackId);
    if (track) {
      const displayTitle = getLocalizedTrackTitle(track);
      playerTitle.textContent = displayTitle;
      playerArtist.textContent = track.artist;
      const thumbImg = playerThumb.querySelector("img");
      if (thumbImg && currentAlbum) {
        thumbImg.src = currentAlbum.coverImage || "../../assets/Imagenes/Adashima ost1.webp";
        thumbImg.onerror = function () {
          this.style.display = "none";
          this.parentElement.textContent = "🌸";
        };
      }
    } else {
      playerTitle.textContent = "Select a track";
      playerArtist.textContent = "—";
      const thumbImg = playerThumb.querySelector("img");
      if (thumbImg) {
        thumbImg.style.display = "block";
        thumbImg.src = currentAlbum?.coverImage || "../../assets/Imagenes/Adashima ost1.webp";
      }
    }
    const icon = isPlaying ? "mdi:pause" : "mdi:play";
    playBtn.querySelector(".iconify")?.setAttribute("data-icon", icon);
    updateFavUI();
    updateQueueUI();
    updateQueueCurrent();
    updateExpandedPlayer();
    updateAlbumGridPlayingState();
  }

  function updateFavUI() {
    const key = currentTrackId
      ? getFavoriteKey(currentAlbum?.id || currentAlbumId, currentTrackId)
      : null;
    const isFav = key ? favorites.has(key) : false;
    const icon = isFav ? "mdi:heart" : "mdi:heart-outline";
    favBtn.querySelector(".iconify")?.setAttribute("data-icon", icon);
    favBtn.setAttribute("aria-label", isFav ? "Remove from favorites" : "Add to favorites");
    if (isFav) {
      favBtn.classList.add("faved");
    } else {
      favBtn.classList.remove("faved");
    }
  }

  function showPlaybackError(title) {
    const notification = document.createElement("div");
    notification.className = "playback-error";
    notification.textContent = `⚠️ Unable to play "${title}". Please try again.`;
    document.body.appendChild(notification);
    setTimeout(() => {
      notification.classList.add("fade-out");
      setTimeout(() => notification.remove(), 500);
    }, 4000);
  }

  function goBackToLibrary() {
    viewMode = "library";
    currentAlbum = null;
    if (!currentTrackId) {
      currentAlbumId = null;
    }

    albumDetailView.style.display = "none";
    musicLibraryView.style.display = "block";

    setTimeout(() => {
      window.scrollTo({ top: albumScrollPosition, behavior: "auto" });
    }, 50);

    const url = new URL(window.location);
    url.searchParams.delete("album");
    window.history.pushState({ view: "library" }, "", url);

    updateAlbumGridPlayingState();
  }

  audio.addEventListener("loadedmetadata", () => {
    duration = Number(audio.duration) || 0;
    totalTimeLabel.textContent = formatTime(duration);
    progressSlider.max = duration > 0 ? 1000 : 1000;
    expandedProgressSlider.max = duration > 0 ? 1000 : 1000;
    expandedTotalTime.textContent = formatTime(duration);
    if (duration > 0 && currentTrackId) {
      const currentTime = Number(audio.currentTime) || 0;
      const pct = (currentTime / duration) * 1000;
      progressSlider.value = pct;
      expandedProgressSlider.value = pct;
    }
  });

  audio.addEventListener("timeupdate", () => {
    const currentTime = Number(audio.currentTime) || 0;
    const trackDuration = Number(audio.duration) || 0;
    currentTimeLabel.textContent = formatTime(currentTime);
    expandedCurrentTime.textContent = formatTime(currentTime);
    if (trackDuration > 0) {
      const pct = (currentTime / trackDuration) * 1000;
      progressSlider.value = pct;
      expandedProgressSlider.value = pct;
    }
  });

  audio.addEventListener("ended", () => {
    if (repeatMode === 2) {
      audio.currentTime = 0;
      audio.play().catch(() => {
        isPlaying = false;
        updateUI();
      });
    } else {
      const autoplayNext =
        window.AdashimaSettings?.getAutoplayNext?.() ??
        (() => {
          try {
            return localStorage.getItem("adashima_autoplay_next") !== "false";
          } catch {
            return true;
          }
        })();
      if (autoplayNext) nextTrack();
      else {
        isPlaying = false;
        updateUI();
      }
    }
  });

  audio.addEventListener("play", () => {
    isPlaying = true;
    updateUI();
  });
  audio.addEventListener("pause", () => {
    isPlaying = false;
    updateUI();
  });
  audio.addEventListener("error", () => {
    if (currentTrackId) {
      const track = getTrack(currentTrackId);
      if (track) showPlaybackError(track.title_jp || track.title);
    }
  });

  playBtn.addEventListener("click", togglePlay);
  prevBtn.addEventListener("click", prevTrack);
  nextBtn.addEventListener("click", nextTrack);

  shuffleBtn.addEventListener("click", () => {
    shuffle = !shuffle;
    shuffleBtn.classList.toggle("active", shuffle);
    expandedShuffle.classList.toggle("active", shuffle);
    if (!currentAlbum || !currentAlbum.tracks || !currentAlbum.tracks.length) return;
    if (shuffle) {
      queue = [...currentAlbum.tracks].sort(() => Math.random() - 0.5).map((t) => t.id);
      if (currentTrackId) {
        const others = queue.filter((id) => id !== currentTrackId);
        if (others.length) {
          const randomId = others[Math.floor(Math.random() * others.length)];
          playTrack(randomId);
        }
      }
    } else {
      queue = currentAlbum.tracks.map((t) => t.id);
    }
    renderQueue();
    updateExpandedQueue();
  });

  repeatBtn.addEventListener("click", () => {
    repeatMode = (repeatMode + 1) % 3;
    const icons = ["mdi:repeat", "mdi:repeat", "mdi:repeat-once"];
    repeatBtn.querySelector(".iconify")?.setAttribute("data-icon", icons[repeatMode]);
    repeatBtn.classList.toggle("active", repeatMode > 0);
    repeatBtn.setAttribute(
      "aria-label",
      repeatMode === 0 ? "Repeat off" : repeatMode === 1 ? "Repeat all" : "Repeat one",
    );
  });

  progressSlider.addEventListener("input", (e) => {
    if (duration > 0) {
      const seekTime = (Number(e.target.value) / 1000) * duration;
      audio.currentTime = seekTime;
      currentTimeLabel.textContent = formatTime(seekTime);
      expandedCurrentTime.textContent = formatTime(seekTime);
    }
  });

  expandedProgressSlider.addEventListener("input", (e) => {
    if (duration > 0) {
      const seekTime = (Number(e.target.value) / 1000) * duration;
      audio.currentTime = seekTime;
      currentTimeLabel.textContent = formatTime(seekTime);
      expandedCurrentTime.textContent = formatTime(seekTime);
    }
  });

  volumeSlider.addEventListener("input", (e) => {
    volume = Math.max(0, Math.min(1, parseFloat(e.target.value) / 100));
    audio.volume = isMuted ? 0 : volume;
    updateVolumeIcon();
  });

  muteBtn.addEventListener("click", () => {
    isMuted = !isMuted;
    audio.muted = isMuted;
    updateVolumeIcon();
  });

  function updateVolumeIcon() {
    const icon = isMuted
      ? "mdi:volume-off"
      : volume > 0.5
        ? "mdi:volume-high"
        : "mdi:volume-medium";
    muteBtn.querySelector(".iconify")?.setAttribute("data-icon", icon);
    muteBtn.setAttribute("aria-label", isMuted ? "Unmute" : "Mute");
  }

  favBtn.addEventListener("click", () => {
    if (currentTrackId) {
      toggleFavorite(currentTrackId, currentAlbum?.id || currentAlbumId);
      updateFavUI();
    }
  });

  queueToggle.addEventListener("click", toggleQueue);
  queueClose.addEventListener("click", closeQueue);
  queueOverlay.addEventListener("click", closeQueue);

  expandPlayerBtn.addEventListener("click", toggleExpandedPlayer);
  expandedPlayerClose.addEventListener("click", toggleExpandedPlayer);
  expandedPlay.addEventListener("click", togglePlay);
  expandedPrev.addEventListener("click", prevTrack);
  expandedNext.addEventListener("click", nextTrack);
  expandedShuffle.addEventListener("click", () => {
    shuffleBtn.click();
  });
  expandedRepeat.addEventListener("click", () => {
    repeatBtn.click();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isQueueOpen) closeQueue();
    if (e.key === "Escape" && isExpandedPlayerOpen) toggleExpandedPlayer();
    if (e.key === "Escape" && viewMode === "album") {
      goBackToLibrary();
    }
  });

  albumSearchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      renderAlbumTracks(albumSearchInput.value);
    }, 150);
  });

  viewToggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      toggleView(view);
    });
  });

  backToLibraryBtn.addEventListener("click", goBackToLibrary);

  playAllBtn.addEventListener("click", () => {
    if (currentAlbum && currentAlbum.tracks && currentAlbum.tracks.length) {
      playTrack(currentAlbum.tracks[0].id);
    }
  });

  shuffleAlbumBtn.addEventListener("click", () => {
    if (!currentAlbum || !currentAlbum.tracks || !currentAlbum.tracks.length) return;
    shuffle = true;
    shuffleBtn.classList.add("active");
    queue = [...currentAlbum.tracks].sort(() => Math.random() - 0.5).map((t) => t.id);
    renderQueue();
    updateExpandedQueue();
    playTrack(queue[0]);
  });

  if (backFromFavoritesBtn) {
    backFromFavoritesBtn.addEventListener("click", () => {
      closeFavorites();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === " " && !isQueueOpen && !isExpandedPlayerOpen) {
      e.preventDefault();
      togglePlay();
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      audio.currentTime = Math.max(0, audio.currentTime - 5);
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
    }
    if (e.key === "m" || e.key === "M") {
      muteBtn.click();
    }
  });

  window.addEventListener("popstate", (e) => {
    if (e.state && e.state.view === "album") {
      /* handled by popstate view restoration elsewhere */
    } else if (viewMode === "album") {
      goBackToLibrary();
    }
  });

  const initializeMusicPage = () => {
    loadMusicData();
    volumeSlider.value = String(Math.round(volume * 100));
    audio.volume = volume;
    updateVolumeIcon();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeMusicPage, { once: true });
  } else {
    initializeMusicPage();
  }

  window.loadMusicData = loadMusicData;
  window.toggleView = toggleView;
})();

const menuVer = Math.floor(Date.now() / 86400000);
fetch("/src/components/menu.html?v=" + menuVer)
  .then((response) => {
    if (!response.ok) throw new Error("Error HTTP " + response.status + " al cargar el menú");
    return response.text();
  })
  .then((data) => {
    data = data
      .replace(/src="\.\/(assets\/)/g, 'src="../../$1')
      .replace(/data-route="\.\.\/\.\.\/index\.html"/g, 'data-route="../../../index.html"');
    const container =
      document.getElementById("menu-container") || document.getElementById("sidebar-container");
    if (!container) return;
    container.innerHTML = data;

    container.querySelectorAll("script").forEach((oldScript) => {
      const s = document.createElement("script");
      Array.from(oldScript.attributes).forEach((a) => s.setAttribute(a.name, a.value));
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
  }
});
