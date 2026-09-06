/* Global page loader + lightweight navigation transition. */
(() => {
  "use strict";

  const screen = document.getElementById("loadingScreen");
  if (!screen) return;

  const message = document.getElementById("loadingMessage");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const startedAt = performance.now();
  let hidden = false;
  let minimumTimer;
  let fallbackTimer;

  if (message) {
    try {
      const lang = localStorage.getItem("lang") || document.documentElement.lang || "es";
      message.textContent = lang.toLowerCase().startsWith("en")
        ? "Loading archive..."
        : "Cargando archivo...";
    } catch {
      message.textContent = "Loading archive...";
    }
  }

  document.documentElement.classList.add("is-loading");
  document.body.classList.add("is-loading");

  const hide = () => {
    if (hidden) return;
    hidden = true;
    clearTimeout(minimumTimer);
    clearTimeout(fallbackTimer);
    screen.classList.add("hidden");
    document.documentElement.classList.remove("is-loading");
    document.body.classList.remove("is-loading");
  };

  const hideWhenReady = () => {
    const elapsed = performance.now() - startedAt;
    const remaining = Math.max(0, reducedMotion ? 0 : 260 - elapsed);

    minimumTimer = window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(hide));
    }, remaining);
  };

  // Let deferred page scripts finish and give the browser two frames to
  // settle the initial layout before revealing it.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hideWhenReady, { once: true });
  } else {
    hideWhenReady();
  }

  // A fully loaded page gets a slightly earlier reveal; the hard fallback
  // guarantees a broken request can never trap the user behind the loader.
  window.addEventListener("load", hideWhenReady, { once: true });
  fallbackTimer = window.setTimeout(hide, 2200);

  document.addEventListener("visibilitychange", () => {
    document.body.classList.toggle("decor-paused", document.hidden);
  });
  document.body.classList.toggle("decor-paused", document.hidden);

  // Reuse the same loader for internal page-to-page transitions. Ignore
  // modified clicks, downloads, external URLs, hashes and special links.
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest?.("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    if (link.dataset.noPageTransition !== undefined) return;

    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.hash && url.pathname === location.pathname) return;
    if (url.pathname === location.pathname && url.search === location.search) return;

    event.preventDefault();
    hidden = false;
    screen.classList.remove("hidden");
    document.documentElement.classList.add("is-loading");
    document.body.classList.add("is-loading");

    // Give the compositor one frame to display the overlay before navigating.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        location.href = url.href;
      });
    });
  });
})();
