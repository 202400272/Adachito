const DEPLOY_ID = '20250608-0001'; 

const CACHE_SHELL  = `adashima-cache-${DEPLOY_ID}`;
const CACHE_IMAGES = `adashima-manga-pages-v5-${DEPLOY_ID}`;

const SCRIPT_PATH = self.location.pathname;
const BASE_PATH   = SCRIPT_PATH.substring(0, SCRIPT_PATH.lastIndexOf('/'));

const CACHE_ASSETS = [
    BASE_PATH + '/',
    BASE_PATH + '/index.html',
    BASE_PATH + '/adashima.html',
    BASE_PATH + '/Adashima_Novelas.html',
    BASE_PATH + '/offline.html',
    BASE_PATH + '/menu.html',
    BASE_PATH + '/sw.js',
    BASE_PATH + '/AdaShima_flotante-Photoroom.png',
    BASE_PATH + '/AdaShima_flotante-Photoroom-Photoroom.png',
    BASE_PATH + '/Adashima_flotante2-Photoroom.png',
    BASE_PATH + '/Yashiro_flotante-Photoroom.png',
    BASE_PATH + '/Yashiro_flotante_pixel-Photoroom.png',
    BASE_PATH + '/meteoro-Photoroom.png',
    BASE_PATH + '/Estrella-Photoroom.png',
    BASE_PATH + '/Estrella_Azul-Photoroom.png',
    BASE_PATH + '/Fondo_pixel.png',
    BASE_PATH + '/Fondo_seccion_novela.png',
    BASE_PATH + '/boomerang-Photoroom.png',
    BASE_PATH + '/dona_pixel-Photoroom.png',
    BASE_PATH + '/Adachi_perfil.png',
    BASE_PATH + '/PERFIL_SHIMAMURA.png',
];

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_SHELL)
            .then((cache) => {
                return Promise.all(
                    CACHE_ASSETS.map((url) => {
                        return cache.add(url).catch(() => {
                            console.warn('[SW] No se pudo pre-cachear:', url);
                        });
                    })
                );
            })
            .then(() => self.skipWaiting()) 
    );
});


self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => {
            return Promise.all(
                names.map((name) => {
                    if (name !== CACHE_SHELL && name !== CACHE_IMAGES) {
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim()) 
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    const isSameOrigin = url.origin === self.location.origin;

    if (url.pathname.endsWith('.json')) {
        event.respondWith(
            fetch(request, { cache: 'no-store' }).catch(() => {
                return new Response('{}', {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    if (url.host === 'media.adashimaverse.com') {
        event.respondWith(cacheFirstImages(request));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request, { cache: 'no-store' })
                .then((response) => {
                    if (response && response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_SHELL).then((cache) => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(request)
                        .then(cached => cached || caches.match(BASE_PATH + '/offline.html'))
                        .then(res => res || new Response('No disponible offline', { status: 503 }));
                })
        );
        return;
    }

    if (isSameOrigin) {

        if (url.pathname.endsWith('/sw.js')) {
            event.respondWith(
                fetch(request, { cache: 'no-store' }).catch(() => caches.match(request))
            );
            return;
        }

        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;

                return fetch(request)
                    .then((response) => {
                        try {
                            if (
                                response && response.status === 200 &&
                                request.destination !== 'video'    &&
                                request.destination !== 'audio'    &&
                                request.destination !== 'document' &&
                                request.destination !== 'embed'
                            ) {
                                const clone = response.clone();
                                caches.open(CACHE_SHELL).then((cache) => cache.put(request, clone));
                            }
                        } catch (e) {}
                        return response;
                    })
                    .catch(() => caches.match(request));
            })
        );
        return;
    }

});

async function cacheFirstImages(request) {
    const cache  = await caches.open(CACHE_IMAGES);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response && response.ok) {
            cache.put(request, response.clone()).catch(() => {});
        }
        return response;
    } catch {
        return new Response('Imagen no disponible sin conexión', { status: 503 });
    }
}