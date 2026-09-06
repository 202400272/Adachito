(() => {
  if (
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "[::1]"
  )
    return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    },
    { once: true },
  );
})();
