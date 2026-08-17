const KILL_SWITCH_ID = "20260816-CLEAR-CACHES";
const isLocalHost =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname === "[::1]";

if (isLocalHost) {
  self.addEventListener("install", (event) => {
    event.waitUntil(
      (async () => {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map((name) => caches.delete(name)));
        } catch (e) {}

        self.skipWaiting();
      })(),
    );
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map((name) => caches.delete(name)));
        } catch (e) {}

        try {
          await self.registration.unregister();
        } catch (e) {}

        await self.clients.claim();
      })(),
    );
  });

  self.addEventListener("fetch", (event) => {
    const { request } = event;

    if (request.method !== "GET") return;

    event.respondWith(fetch(request, { cache: "no-store" }));
  });
} else {
  self.addEventListener("install", (event) => {
    event.waitUntil(
      (async () => {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map((name) => caches.delete(name)));
        } catch (e) {}

        self.skipWaiting();
      })(),
    );
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map((name) => caches.delete(name)));
        } catch (e) {}

        await self.clients.claim();

        try {
          await self.registration.unregister();
        } catch (e) {}

        const allClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        allClients.forEach((client) => {
          if ("navigate" in client) {
            client.navigate(client.url).catch(() => {});
          }
        });
      })(),
    );
  });

  self.addEventListener("fetch", (event) => {
    const { request } = event;

    if (request.method !== "GET") return;

    if (request.mode === "navigate" || request.destination === "document") {
      event.respondWith(
        fetch(request, { cache: "no-store" }).catch(() => caches.match(request)),
      );
    }
  });
}