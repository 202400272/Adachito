// sw.js - Service Worker para Adashima
const CACHE_NAME = 'adashima-cache-v1';

// Construir la ruta base dinámicamente según donde esté desplegado el SW
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

// Instalar el Service Worker y cachear assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                // Cachear cada asset individualmente para evitar fallos
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

// Activar y limpiar caches antiguas
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

// Estrategia: Intentar red primero, fallback a cache
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    const isSameOrigin = url.origin === self.location.origin;

    // Solo interceptar requests del mismo origen
    if (!isSameOrigin) {
        return;
    }

    // Para navegación (páginas HTML)
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Guardar en cache para offline
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, clone);
                    });
                    return response;
                })
                .catch((error) => {
                    // Si falla la red, servir offline.html
                    return caches.match(BASE_PATH + '/offline.html')
                        .then((response) => {
                            return response || new Response('No disponible offline', { status: 503 });
                        });
                })
        );
    }
    // Para otros recursos
    else {
        event.respondWith(
            caches.match(request)
                .then((response) => {
                    if (response) {
                        return response;
                    }
                    return fetch(request)
                        .then((response) => {
                            // Cachear si es una respuesta válida
                            if (response && response.status === 200) {
                                const clone = response.clone();
                                caches.open(CACHE_NAME).then((cache) => {
                                    cache.put(request, clone);
                                });
                            }
                            return response;
                        })
                        .catch((error) => {
                            return caches.match(request);
                        });
                })
        );
    }
});