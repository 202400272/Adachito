const CACHE_NAME = 'adashima-cache-v2';

const SCRIPT_PATH = self.location.pathname;
const BASE_PATH = SCRIPT_PATH.substring(0, SCRIPT_PATH.lastIndexOf('/'));

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
    BASE_PATH + '/PERFIL_SHIMAMURA.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                
                return Promise.all(
                    CACHE_ASSETS.map((url) => {
                        return cache.add(url).catch((err) => {
                            console.warn('No se pudo cachear:', url);
                        });
                    })
                );
            })
            .then(() => {
                return self.skipWaiting();
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => {
            return Promise.all(
                names.map((name) => {
                    if (name !== CACHE_NAME) {
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    const isSameOrigin = url.origin === self.location.origin;
    const EXCLUDED_HOST = 'pub-552c8df9ee0f4e8da0690fb94530494c.r2.dev';

    if (!isSameOrigin) {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, clone);
                    });
                    return response;
                })
                .catch((error) => {
 
                    return caches.match(BASE_PATH + '/offline.html')
                        .then((response) => {
                            return response || new Response('No disponible offline', { status: 503 });
                        });
                })
        );
    }
    else {
        if (url.host === EXCLUDED_HOST) {
            event.respondWith(fetch(request).catch(() => caches.match(request)));
            return;
        }

        event.respondWith(
            caches.match(request)
                .then((response) => {
                    if (response) {
                        return response;
                    }
                    return fetch(request)
                        .then((response) => {
                            try {
                                if (response && response.status === 200 && request.destination !== 'video' && request.destination !== 'audio' && request.destination !== 'document' && request.destination !== 'embed') {
                                    const clone = response.clone();
                                    caches.open(CACHE_NAME).then((cache) => {
                                        cache.put(request, clone);
                                    });
                                }
                            } catch (e) {}
                            return response;
                        })
                        .catch((error) => {
                            return caches.match(request);
                        });
                })
        );
    }
});