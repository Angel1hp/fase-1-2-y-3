const CACHE_VERSION = '1.0.0';
const CACHE_NAME = `angelscanner-cache-v${CACHE_VERSION}`;

// Recursos esenciales a cachear en la instalación
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/scanner.js',
    '/styles.css',
    '/manifest.json',
    '/offline.html'
];

// Instalar el Service Worker y almacenar los recursos en caché
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[AngelScanner SW] Precachando recursos esenciales');
                return Promise.all(
                    PRECACHE_ASSETS.map(url => {
                        return cache.add(url).catch(err => {
                            console.warn(`[AngelScanner SW] No se pudo cachear el recurso: ${url}`, err);
                        });
                    })
                );
            })
            .then(() => self.skipWaiting())
    );
});

// Activar y limpiar cachés antiguas
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName.startsWith('angelscanner-cache-') && cacheName !== CACHE_NAME) {
                        console.log('[AngelScanner SW] Limpiando caché antigua:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Estrategia de red/caché: Stale-While-Revalidate para recursos estáticos del sitio
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    const isLocalRequest = url.origin === self.location.origin;

    if (isLocalRequest) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    const fetchPromise = fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch((err) => {
                        console.log('[AngelScanner SW] Error de red, sirviendo desde caché', err);
                        if (event.request.mode === 'navigate') {
                            return caches.match('/offline.html');
                        }
                    });

                    return cachedResponse || fetchPromise;
                });
            })
        );
    } else {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                return fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const cacheCopy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, cacheCopy);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('/offline.html');
                    }
                });
            })
        );
    }
});

// Escuchar mensajes desde el cliente para forzar la actualización
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[AngelScanner SW] skipWaiting activado por el cliente');
        self.skipWaiting();
    }
});
