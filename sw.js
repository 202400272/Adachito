const KILL_SWITCH_ID = "20260809-KILL";

self.addEventListener("install", () => {
  self.skipWaiting();
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