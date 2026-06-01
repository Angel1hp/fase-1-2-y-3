const CACHE_NAME = 'mipdf-v1';

// Archivos que se guardan en caché al instalar (para uso offline)
const ARCHIVOS_CACHE = [
    'index.html',
    'style.css',
    'script.js',
    'manifest.json',
    'icono-192.png',
    'icono-512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    'https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600&display=swap'
];

// ── Instalar: guardar archivos en caché ───────────────────────────────
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ARCHIVOS_CACHE))
    );
});

// ── Activar: limpiar cachés viejas ────────────────────────────────────
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((claves) =>
            Promise.all(
                claves
                    .filter((clave) => clave !== CACHE_NAME && clave !== 'pdf-compartido-cache')
                    .map((clave) => caches.delete(clave))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: cache-first con fallback a red ─────────────────────────────
self.addEventListener('fetch', (e) => {

    // Share Target: recibir PDF compartido desde otra app (POST)
    if (e.request.method === 'POST' && e.request.url.includes('index.html')) {
        e.respondWith(
            (async () => {
                try {
                    const formData = await e.request.formData();
                    const file     = formData.get('pdf_compartido');

                    if (file) {
                        // Guardamos el PDF en caché temporal para que script.js lo lea
                        const cache = await caches.open('pdf-compartido-cache');
                        await cache.put('archivo.pdf', new Response(file));
                    }
                } catch (err) {
                    console.warn('Error al procesar PDF compartido:', err);
                }

                // Redirigir a la app indicando que hay un archivo listo
                return Response.redirect('index.html?shared=true', 303);
            })()
        );
        return;
    }

    // Peticiones GET: estrategia cache-first
    if (e.request.method === 'GET') {
        e.respondWith(
            caches.match(e.request).then((cached) => {
                if (cached) return cached;

                // No está en caché: ir a la red
                return fetch(e.request).then((response) => {
                    // Solo cacheamos respuestas válidas de nuestros propios archivos
                    if (
                        response &&
                        response.status === 200 &&
                        response.type !== 'opaque'
                    ) {
                        const clon = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clon));
                    }
                    return response;
                }).catch(() => {
                    // Sin red y sin caché: devolver página offline si existe
                    return caches.match('index.html');
                });
            })
        );
    }
});

// ── Message: skipWaiting a petición del usuario ───────────────────────
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
