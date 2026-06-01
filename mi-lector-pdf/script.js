// Configurar worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc         = null;
let pageNum        = 1;
let pageRendering  = false;
let pageNumPending = null;

// Variables de estado para Zoom y Maximizado
let zoomFactor   = 1.0;
let esMaximizado = false;

const canvas        = document.getElementById('canvas-pdf');
const ctx           = canvas.getContext('2d');
const infoPage      = document.getElementById('info-pagina');
const btnAnterior   = document.getElementById('btn-anterior');
const btnSiguiente  = document.getElementById('btn-siguiente');
const placeholder   = document.getElementById('placeholder');
const msgEstado     = document.getElementById('mensaje-estado');

// Selectores para Controles Flotantes
const floatingControls  = document.getElementById('floating-controls');
const btnAnteriorFloat  = document.getElementById('btn-anterior-float');
const btnSiguienteFloat = document.getElementById('btn-siguiente-float');
const infoPageFloat     = document.getElementById('info-pagina-float');
const btnZoomIn         = document.getElementById('btn-zoom-in');
const btnZoomOut        = document.getElementById('btn-zoom-out');
const zoomPorcentaje    = document.getElementById('zoom-porcentaje');
const btnMaximizar      = document.getElementById('btn-maximizar');
const btnSalir            = document.getElementById('btn-salir');
const pantallaDespedida   = document.getElementById('pantalla-despedida');
const btnVolverDespedida  = document.getElementById('btn-volver-despedida');

// ── Mostrar mensaje de estado ──────────────────────────────────────────
function mostrarMensaje(texto, esError = false) {
    msgEstado.textContent = texto;
    msgEstado.classList.remove('oculto', 'error');
    if (esError) msgEstado.classList.add('error');
}

function ocultarMensaje() {
    msgEstado.classList.add('oculto');
}

// ── Actualizar botones de navegación ──────────────────────────────────
function actualizarBotones() {
    const disableAnt = (pageNum <= 1);
    const disableSig = (pdfDoc === null || pageNum >= pdfDoc.numPages);

    btnAnterior.disabled  = disableAnt;
    btnSiguiente.disabled = disableSig;

    if (btnAnteriorFloat)  btnAnteriorFloat.disabled = disableAnt;
    if (btnSiguienteFloat) btnSiguienteFloat.disabled = disableSig;
}

// ── Actualizar Interfaz de Zoom ───────────────────────────────────────
function actualizarZoomUI() {
    if (zoomPorcentaje) {
        zoomPorcentaje.textContent = `${Math.round(zoomFactor * 100)}%`;
    }
    
    const visor = document.querySelector('.visor-pdf');
    if (zoomFactor > 1.01 || zoomFactor < 0.99) {
        visor.classList.add('zoom-activo');
    } else {
        visor.classList.remove('zoom-activo');
    }
}

// ── Renderizar página ─────────────────────────────────────────────────
function renderPage(num) {
    pageRendering = true;

    pdfDoc.getPage(num).then((page) => {
        const contenedor = document.querySelector('.visor-pdf');
        // Reducimos el padding en el cálculo del ancho útil
        const paddingOffset = esMaximizado ? 40 : 30;
        const anchoMax      = Math.max(280, contenedor.clientWidth - paddingOffset);
        
        const vpBase     = page.getViewport({ scale: 1 });
        // Escala inicial adaptada al ancho disponible, luego se multiplica por zoomFactor
        const escalaBase = anchoMax / vpBase.width;
        
        // Cargar zoom optimizado (límite en modo normal para evitar imágenes gigantes, en maximizado es libre)
        const escalaMax  = esMaximizado ? 3.0 : 1.5;
        const escala     = Math.min(escalaMax, escalaBase) * zoomFactor;
        
        const viewport   = page.getViewport({ scale: escala });

        canvas.height = viewport.height;
        canvas.width  = viewport.width;

        const renderContext = { canvasContext: ctx, viewport };
        const renderTask    = page.render(renderContext);

        renderTask.promise.then(() => {
            pageRendering = false;
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
        }).catch(() => {
            pageRendering = false;
        });
    }).catch(() => {
        mostrarMensaje('Error al renderizar la página.', true);
        pageRendering = false;
    });

    // Sincronizar textos de paginación
    infoPage.textContent = `Página: ${num} / ${pdfDoc.numPages}`;
    if (infoPageFloat) {
        infoPageFloat.textContent = `${num} / ${pdfDoc.numPages}`;
    }
    actualizarBotones();
}

// ── Cola de renderizado ───────────────────────────────────────────────
function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

// ── Lógica de Zoom ────────────────────────────────────────────────────
function zoomIn() {
    if (!pdfDoc || zoomFactor >= 3.00) return;
    zoomFactor = Math.min(3.00, zoomFactor + 0.25);
    actualizarZoomUI();
    queueRenderPage(pageNum);
}

function zoomOut() {
    if (!pdfDoc || zoomFactor <= 0.50) return;
    zoomFactor = Math.max(0.50, zoomFactor - 0.25);
    actualizarZoomUI();
    queueRenderPage(pageNum);
}

function resetZoom() {
    if (!pdfDoc || zoomFactor === 1.0) return;
    zoomFactor = 1.0;
    actualizarZoomUI();
    queueRenderPage(pageNum);
}

// ── Lógica de Maximizar / Pantalla Completa ───────────────────────────
function toggleMaximizar() {
    if (!pdfDoc) return;
    esMaximizado = !esMaximizado;
    const visor = document.querySelector('.visor-pdf');
    const iconoMax = btnMaximizar.querySelector('.icono-max');
    
    if (esMaximizado) {
        visor.classList.add('maximizada');
        document.body.classList.add('visor-maximizada-body');
        btnMaximizar.title = "Restaurar tamaño";
        if (iconoMax) iconoMax.textContent = "✕";
        
        // Centrar scrollbars al abrir maximizado
        setTimeout(() => {
            visor.scrollLeft = (visor.scrollWidth - visor.clientWidth) / 2;
            visor.scrollTop = 0;
        }, 50);
    } else {
        visor.classList.remove('maximizada');
        document.body.classList.remove('visor-maximizada-body');
        btnMaximizar.title = "Maximizar / Pantalla Completa";
        if (iconoMax) iconoMax.textContent = "⛶";
    }
    
    // Forzar re-renderizado para adaptar el canvas al nuevo contenedor
    renderPage(pageNum);
}

// ── Cargar PDF desde ArrayBuffer ──────────────────────────────────────
function cargarPDF(arrayBuffer) {
    mostrarMensaje('Cargando PDF...');
    placeholder.classList.add('oculto');
    canvas.classList.add('oculto');
    if (floatingControls) floatingControls.classList.add('oculto');

    pdfjsLib.getDocument(new Uint8Array(arrayBuffer)).promise
        .then((pdf) => {
            pdfDoc  = pdf;
            pageNum = 1;
            zoomFactor = 1.0;
            actualizarZoomUI();
            
            canvas.classList.remove('oculto');
            if (floatingControls) floatingControls.classList.remove('oculto');
            ocultarMensaje();
            renderPage(pageNum);
        })
        .catch(() => {
            mostrarMensaje('No se pudo abrir el PDF. Asegúrate de que el archivo es válido.', true);
            placeholder.classList.remove('oculto');
            canvas.classList.add('oculto');
            if (floatingControls) floatingControls.classList.add('oculto');
            actualizarBotones();
        });
}

// ── Eventos de los Botones Estándar ──────────────────────────────────
btnAnterior.addEventListener('click', () => {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
});

btnSiguiente.addEventListener('click', () => {
    if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
});

// ── Eventos de los Botones Flotantes ─────────────────────────────────
if (btnAnteriorFloat) {
    btnAnteriorFloat.addEventListener('click', () => {
        if (pageNum <= 1) return;
        pageNum--;
        queueRenderPage(pageNum);
    });
}

if (btnSiguienteFloat) {
    btnSiguienteFloat.addEventListener('click', () => {
        if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
        pageNum++;
        queueRenderPage(pageNum);
    });
}

if (btnZoomIn)      btnZoomIn.addEventListener('click', zoomIn);
if (btnZoomOut)     btnZoomOut.addEventListener('click', zoomOut);
if (zoomPorcentaje) zoomPorcentaje.addEventListener('click', resetZoom);
if (btnMaximizar)   btnMaximizar.addEventListener('click', toggleMaximizar);

// ── Lógica de Salida y Cierre de Aplicación ───────────────────────────
function cerrarAplicacion() {
    if (esMaximizado) {
        toggleMaximizar();
    }
    
    // Intentar cerrar la ventana/pestaña
    window.close();
    
    // Si window.close() es bloqueado por el navegador (por seguridad),
    // mostramos la hermosa pantalla de despedida animada.
    setTimeout(() => {
        if (pantallaDespedida) {
            pantallaDespedida.classList.remove('oculto');
        }
    }, 100);
}

function volverALaApp() {
    if (pantallaDespedida) {
        pantallaDespedida.classList.add('oculto');
    }
}

if (btnSalir)           btnSalir.addEventListener('click', cerrarAplicacion);
if (btnVolverDespedida) btnVolverDespedida.addEventListener('click', volverALaApp);

// ── Selección de archivo desde el input ───────────────────────────────
document.getElementById('subir-pdf').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        mostrarMensaje('Por favor, selecciona un archivo PDF válido.', true);
        return;
    }

    const reader = new FileReader();
    reader.onload = function () {
        cargarPDF(this.result);
    };
    reader.onerror = function () {
        mostrarMensaje('Error al leer el archivo.', true);
    };
    reader.readAsArrayBuffer(file);
});

// ── Soporte para Share Target (PDF compartido) ────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.get('shared') === 'true') {
        try {
            mostrarMensaje('Cargando PDF compartido...');
            const cache    = await caches.open('pdf-compartido-cache');
            const response = await cache.match('archivo.pdf');

            if (response) {
                const arrayBuffer = await response.arrayBuffer();
                await cache.delete('archivo.pdf');
                cargarPDF(arrayBuffer);
            } else {
                mostrarMensaje('No se encontró el archivo compartido.', true);
            }
        } catch (err) {
            mostrarMensaje('Error al cargar el PDF compartido.', true);
        }
    } else if (urlParams.get('test') === 'true') {
        try {
            mostrarMensaje('Cargando PDF de prueba...');
            const response = await fetch('sample.pdf');
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                cargarPDF(arrayBuffer);
            } else {
                mostrarMensaje('No se encontró el archivo sample.pdf en el servidor.', true);
            }
        } catch (err) {
            mostrarMensaje('Error al cargar el PDF de prueba.', true);
        }
    }
});

// ── Atajos de Teclado (UX Pro) ────────────────────────────────────────
window.addEventListener('keydown', (e) => {
    // Si presionan Alt+Q, cerrar de inmediato (incluso sin PDF abierto)
    if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        cerrarAplicacion();
        return;
    }

    if (e.key === 'Escape') {
        if (esMaximizado) {
            toggleMaximizar();
            return;
        } else if (pantallaDespedida && !pantallaDespedida.classList.contains('oculto')) {
            volverALaApp();
            return;
        }
    }

    if (!pdfDoc) return;
    
    if (e.key === 'ArrowLeft') {
        if (pageNum > 1) {
            pageNum--;
            queueRenderPage(pageNum);
        }
    } else if (e.key === 'ArrowRight') {
        if (pageNum < pdfDoc.numPages) {
            pageNum++;
            queueRenderPage(pageNum);
        }
    }
});

// ── Zoom con CTRL + Rueda del Ratón ──────────────────────────────────
document.querySelector('.visor-pdf').addEventListener('wheel', (e) => {
    if (!pdfDoc) return;
    if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
            zoomIn();
        } else {
            zoomOut();
        }
    }
}, { passive: false });

// ── Redimensionamiento Dinámico Debounce (resize) ───────────────────────
let resizeTimeout;
window.addEventListener('resize', () => {
    if (!pdfDoc) return;
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        renderPage(pageNum);
    }, 150);
});

// ── Registro de Service Worker y Gestión de Actualizaciones ───────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        let esActualizando = false;

        navigator.serviceWorker.register('sw.js').then((reg) => {
            console.log('Service Worker registrado con éxito.');

            // Función para mostrar la notificación
            function notificarNuevaVersion(worker) {
                const notifUpdate = document.getElementById('notificacion-update');
                const btnActualizar = document.getElementById('btn-update-actualizar');
                const btnIgnorar = document.getElementById('btn-update-ignorar');

                if (!notifUpdate) return;

                // Mostrar notificación quitando la clase oculto
                notifUpdate.classList.remove('oculto');

                if (btnActualizar) {
                    btnActualizar.onclick = () => {
                        // Enviar mensaje skipWaiting al nuevo service worker
                        worker.postMessage({ type: 'SKIP_WAITING' });
                        notifUpdate.classList.add('oculto');
                    };
                }

                if (btnIgnorar) {
                    btnIgnorar.onclick = () => {
                        notifUpdate.classList.add('oculto');
                    };
                }
            }

            // 1. Si ya hay un service worker esperando activo en background
            if (reg.waiting) {
                notificarNuevaVersion(reg.waiting);
            }

            // 2. Si se detecta un nuevo service worker instalándose
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker) return;

                newWorker.addEventListener('statechange', () => {
                    // Si se instaló completamente pero está esperando activación
                    if (newWorker.state === 'installed') {
                        if (navigator.serviceWorker.controller) {
                            notificarNuevaVersion(newWorker);
                        }
                    }
                });
            });

            // 3. Comprobación periódica automática de actualizaciones cada 15 segundos
            // (La aplicación busca cambios activamente en el servidor en tiempo real)
            setInterval(() => {
                reg.update().catch(err => console.debug('Error al buscar actualizaciones:', err));
            }, 15000);

        }).catch((err) => {
            console.warn('Error al registrar Service Worker:', err);
        });

        // Escuchar el cambio de controlador para recargar la página inmediatamente
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (esActualizando) return;
            esActualizando = true;
            window.location.reload();
        });
    });
}

