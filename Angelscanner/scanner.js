class AngelScanner {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.captureBtn = document.getElementById('captureBtn');
        this.switchCameraBtn = document.getElementById('switchCameraBtn');
        this.documentsList = document.getElementById('documentsList');
        this.editModal = document.getElementById('editModal');
        this.editCanvas = document.getElementById('editCanvas');
        this.pdfModal = document.getElementById('pdfModal');
        
        this.stream = null;
        this.currentCamera = 'environment';
        this.scannedDocs = this.loadDocuments();
        this.currentDocIndex = null;
        this.editCtx = this.editCanvas.getContext('2d');
        this.selectMode = false;
        this.selectedDocs = new Set();
        this.rotationAngle = 0;
        
        this.init();
    }
    
    init() {
        this.startCamera();
        this.setupEventListeners();
        this.renderDocuments();
        
        this.registerServiceWorker();
    }
    
    async startCamera() {
        try {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
            
            const constraints = {
                video: {
                    facingMode: { exact: this.currentCamera },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            };
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            try {
                const constraints = {
                    video: {
                        facingMode: this.currentCamera
                    }
                };
                this.stream = await navigator.mediaDevices.getUserMedia(constraints);
                this.video.srcObject = this.stream;
            } catch (fallbackError) {
                alert('No se pudo acceder a la cámara. Por favor, verifica los permisos.');
            }
        }
    }
    
    switchCamera() {
        this.currentCamera = this.currentCamera === 'environment' ? 'user' : 'environment';
        this.startCamera();
    }
    
    capturePhoto() {
        const context = this.canvas.getContext('2d');
        
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        
        context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        const imageData = this.canvas.toDataURL('image/jpeg', 0.9);
        
        const document = {
            id: Date.now(),
            image: imageData,
            date: new Date().toLocaleString(),
            edited: false,
            rotation: 0
        };
        
        this.scannedDocs.unshift(document);
        this.saveDocuments();
        this.renderDocuments();
        
        this.showNotification('¡Documento escaneado exitosamente!');
    }
    
    attachFromGallery() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        
        input.onchange = (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const document = {
                        id: Date.now() + Math.random(),
                        image: event.target.result,
                        date: new Date().toLocaleString(),
                        edited: false,
                        rotation: 0
                    };
                    this.scannedDocs.unshift(document);
                    this.saveDocuments();
                    this.renderDocuments();
                };
                reader.readAsDataURL(file);
            });
            this.showNotification(`${files.length} imagen(es) adjuntada(s)`);
        };
        
        input.click();
    }
    
    toggleSelectMode() {
        this.selectMode = !this.selectMode;
        const multiSelectBtn = document.getElementById('multiSelectBtn');
        const clearSelectionBtn = document.getElementById('clearSelectionBtn');
        const selectionInfo = document.getElementById('selectionInfo');
        
        if (this.selectMode) {
            multiSelectBtn.style.background = '#2196F3';
            multiSelectBtn.style.color = 'white';
            clearSelectionBtn.style.display = 'block';
            selectionInfo.style.display = 'flex';
        } else {
            multiSelectBtn.style.background = '';
            multiSelectBtn.style.color = '';
            clearSelectionBtn.style.display = 'none';
            selectionInfo.style.display = 'none';
            this.clearSelection();
        }
        
        this.renderDocuments();
    }
    
    toggleDocumentSelection(docId) {
        if (this.selectedDocs.has(docId)) {
            this.selectedDocs.delete(docId);
        } else {
            this.selectedDocs.add(docId);
        }
        this.updateSelectionInfo();
        this.renderDocuments();
    }
    
    clearSelection() {
        this.selectedDocs.clear();
        this.updateSelectionInfo();
        this.renderDocuments();
    }
    
    updateSelectionInfo() {
        const selectedCount = document.getElementById('selectedCount');
        if (selectedCount) {
            selectedCount.textContent = this.selectedDocs.size;
        }
    }
    
    getSelectedDocuments() {
        return this.scannedDocs.filter(doc => this.selectedDocs.has(doc.id));
    }
    
    async generatePDF(documents = null, fileName = null) {
        const docsToExport = documents || this.getSelectedDocuments();
        
        if (docsToExport.length === 0) {
            this.showNotification('No hay documentos seleccionados para generar PDF');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const quality = document.getElementById('pdfQuality')?.value || 'medium';
        const orientation = document.getElementById('pdfOrientation')?.value || 'portrait';
        const pdfFileName = fileName || document.getElementById('pdfFileName')?.value || 'angelscanner_documento';
        
        let qualityValue;
        switch(quality) {
            case 'low': qualityValue = 0.5; break;
            case 'medium': qualityValue = 0.7; break;
            case 'high': qualityValue = 0.9; break;
            default: qualityValue = 0.7;
        }
        
        this.showNotification('Generando PDF, por favor espera...');
        
        try {
            const pdf = new jsPDF({
                orientation: orientation,
                unit: 'mm',
                format: 'a4'
            });
            
            for (let i = 0; i < docsToExport.length; i++) {
                const doc = docsToExport[i];
                
                const imgData = await this.loadImage(doc.image);
                
                const imgWidth = 210;
                const imgHeight = (imgData.height * imgWidth) / imgData.width;
                
                if (i !== 0) {
                    pdf.addPage();
                }
                
                pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
            }
            
            pdf.save(`${pdfFileName}.pdf`);
            this.showNotification('¡PDF generado exitosamente!');
            this.pdfModal.style.display = 'none';
            this.toggleSelectMode();
            
        } catch (error) {
            console.error('Error generating PDF:', error);
            this.showNotification('Error al generar el PDF');
        }
    }
    
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }
    
    showNotification(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #4CAF50;
            color: white;
            padding: 12px 24px;
            border-radius: 50px;
            z-index: 1000;
            animation: fadeInOut 2s ease;
            white-space: nowrap;
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 2000);
    }
    
    openEditor(docIndex) {
        this.currentDocIndex = docIndex;
        const doc = this.scannedDocs[docIndex];
        this.rotationAngle = doc.rotation || 0;
        
        const img = new Image();
        img.onload = () => {
            this.drawRotatedImage(img);
            this.editModal.style.display = 'block';
        };
        img.src = doc.image;
    }
    
    drawRotatedImage(img) {
        const angle = this.rotationAngle * Math.PI / 180;
        const cos = Math.abs(Math.cos(angle));
        const sin = Math.abs(Math.sin(angle));
        
        const width = img.width;
        const height = img.height;
        
        const rotWidth = width * cos + height * sin;
        const rotHeight = height * cos + width * sin;
        
        this.editCanvas.width = rotWidth;
        this.editCanvas.height = rotHeight;
        
        this.editCtx.clearRect(0, 0, rotWidth, rotHeight);
        this.editCtx.save();
        this.editCtx.translate(rotWidth / 2, rotHeight / 2);
        this.editCtx.rotate(angle);
        this.editCtx.drawImage(img, -width / 2, -height / 2, width, height);
        this.editCtx.restore();
    }
    
    rotateLeft() {
        this.rotationAngle -= 90;
        const img = new Image();
        img.onload = () => this.drawRotatedImage(img);
        img.src = this.scannedDocs[this.currentDocIndex].image;
    }
    
    rotateRight() {
        this.rotationAngle += 90;
        const img = new Image();
        img.onload = () => this.drawRotatedImage(img);
        img.src = this.scannedDocs[this.currentDocIndex].image;
    }
    
    applyFilter(filterType) {
        const img = new Image();
        img.onload = () => {
            this.drawRotatedImage(img);
            
            const imageData = this.editCtx.getImageData(0, 0, this.editCanvas.width, this.editCanvas.height);
            const data = imageData.data;
            
            switch(filterType) {
                case 'grayscale':
                    for (let i = 0; i < data.length; i += 4) {
                        const gray = data[i] * 0.3 + data[i+1] * 0.59 + data[i+2] * 0.11;
                        data[i] = gray;
                        data[i+1] = gray;
                        data[i+2] = gray;
                    }
                    break;
                    
                case 'brightness':
                    for (let i = 0; i < data.length; i += 4) {
                        data[i] = Math.min(255, data[i] * 1.2);
                        data[i+1] = Math.min(255, data[i+1] * 1.2);
                        data[i+2] = Math.min(255, data[i+2] * 1.2);
                    }
                    break;
                    
                case 'enhance':
                    for (let i = 0; i < data.length; i += 4) {
                        data[i] = Math.min(255, data[i] * 1.3);
                        data[i+1] = Math.min(255, data[i+1] * 1.3);
                        data[i+2] = Math.min(255, data[i+2] * 1.3);
                    }
                    break;
            }
            
            this.editCtx.putImageData(imageData, 0, 0);
        };
        img.src = this.scannedDocs[this.currentDocIndex].image;
    }
    
    saveEditedDocument() {
        const editedImage = this.editCanvas.toDataURL('image/jpeg', 0.9);
        this.scannedDocs[this.currentDocIndex].image = editedImage;
        this.scannedDocs[this.currentDocIndex].edited = true;
        this.scannedDocs[this.currentDocIndex].rotation = this.rotationAngle;
        this.saveDocuments();
        this.renderDocuments();
        this.editModal.style.display = 'none';
        this.showNotification('¡Documento guardado exitosamente!');
    }
    
    deleteDocument(index) {
        if (confirm('¿Estás seguro de que quieres eliminar este documento?')) {
            const docId = this.scannedDocs[index].id;
            if (this.selectedDocs.has(docId)) {
                this.selectedDocs.delete(docId);
                this.updateSelectionInfo();
            }
            this.scannedDocs.splice(index, 1);
            this.saveDocuments();
            this.renderDocuments();
            this.showNotification('Documento eliminado');
        }
    }
    
    renderDocuments() {
        if (this.scannedDocs.length === 0) {
            this.documentsList.innerHTML = '<p style="text-align: center; grid-column: 1/-1; color: var(--text-muted);">No hay documentos escaneados aún. ¡Toma tu primera foto!</p>';
            return;
        }
        
        this.documentsList.innerHTML = '';
        this.scannedDocs.forEach((doc, index) => {
            const card = document.createElement('div');
            card.className = 'doc-card';
            if (this.selectMode && this.selectedDocs.has(doc.id)) {
                card.classList.add('selected');
            }
            if (this.selectMode) {
                card.classList.add('select-mode');
            }
            
            card.innerHTML = `
                <img src="${doc.image}" alt="Documento ${index + 1}">
                ${this.selectMode ? `<input type="checkbox" class="select-checkbox" ${this.selectedDocs.has(doc.id) ? 'checked' : ''}>` : ''}
                <button class="delete-btn" data-index="${index}">✖</button>
                <div class="doc-info">
                    <small>${doc.date}</small>
                    ${doc.edited ? '<small style="color: #4CAF50;"> ✨ Editado</small>' : ''}
                </div>
            `;
            
            if (!this.selectMode) {
                card.querySelector('img').addEventListener('click', () => this.openEditor(index));
            } else {
                const checkbox = card.querySelector('.select-checkbox');
                checkbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    this.toggleDocumentSelection(doc.id);
                });
                card.addEventListener('click', (e) => {
                    if (e.target !== checkbox) {
                        checkbox.checked = !checkbox.checked;
                        this.toggleDocumentSelection(doc.id);
                    }
                });
            }
            
            card.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteDocument(index);
            });
            
            this.documentsList.appendChild(card);
        });
    }
    
    saveDocuments() {
        localStorage.setItem('angelscanner_documents', JSON.stringify(this.scannedDocs));
    }
    
    loadDocuments() {
        const saved = localStorage.getItem('angelscanner_documents');
        return saved ? JSON.parse(saved) : [];
    }
    
    showPdfModal() {
        const selectedDocs = this.getSelectedDocuments();
        if (selectedDocs.length === 0) {
            this.showNotification('Por favor, selecciona al menos un documento para generar el PDF');
            return;
        }
        
        const previewContainer = document.getElementById('pdfPreview');
        previewContainer.innerHTML = '<h4>Vista previa de páginas:</h4>';
        
        selectedDocs.forEach((doc, index) => {
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            previewItem.innerHTML = `
                <img src="${doc.image}" alt="Página ${index + 1}">
                <small>Página ${index + 1}</small>
            `;
            previewContainer.appendChild(previewItem);
        });
        
        this.pdfModal.style.display = 'block';
    }
    
    setupEventListeners() {
        this.captureBtn.addEventListener('click', () => this.capturePhoto());
        this.switchCameraBtn.addEventListener('click', () => this.switchCamera());
        
        document.getElementById('attachFromGalleryBtn').addEventListener('click', () => this.attachFromGallery());
        document.getElementById('multiSelectBtn').addEventListener('click', () => this.toggleSelectMode());
        document.getElementById('clearSelectionBtn').addEventListener('click', () => this.clearSelection());
        document.getElementById('generatePdfBtn').addEventListener('click', () => this.showPdfModal());
        document.getElementById('generateSelectedPdfBtn').addEventListener('click', () => this.showPdfModal());
        document.getElementById('confirmGeneratePdfBtn').addEventListener('click', () => this.generatePDF());
        
        const closeBtns = document.querySelectorAll('.close, .close-pdf');
        closeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.editModal.style.display = 'none';
                this.pdfModal.style.display = 'none';
            });
        });
        
        window.addEventListener('click', (e) => {
            if (e.target === this.editModal || e.target === this.pdfModal) {
                this.editModal.style.display = 'none';
                this.pdfModal.style.display = 'none';
            }
        });
        
        document.getElementById('rotateLeftBtn').addEventListener('click', () => this.rotateLeft());
        document.getElementById('rotateRightBtn').addEventListener('click', () => this.rotateRight());
        document.getElementById('enhanceBtn').addEventListener('click', () => this.applyFilter('enhance'));
        document.getElementById('grayscaleBtn').addEventListener('click', () => this.applyFilter('grayscale'));
        document.getElementById('brightnessBtn').addEventListener('click', () => this.applyFilter('brightness'));
        document.getElementById('saveEditBtn').addEventListener('click', () => this.saveEditedDocument());
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').then(registration => {
                console.log('[AngelScanner] Service Worker registrado con éxito:', registration.scope);
                
                // 1. Si hay un SW esperando activo en segundo plano, mostrar el Toast de inmediato
                if (registration.waiting) {
                    this.showUpdateToast(registration.waiting);
                }

                // 2. Si se encuentra una actualización en curso, monitorear su estado
                registration.addEventListener('updatefound', () => {
                    const installingWorker = registration.installing;
                    if (!installingWorker) return;

                    installingWorker.addEventListener('statechange', () => {
                        if (installingWorker.state === 'installed') {
                            // Solo mostrar si ya hay un controlador (evita mostrar el Toast en la primera instalación)
                            if (navigator.serviceWorker.controller) {
                                this.showUpdateToast(installingWorker);
                            }
                        }
                    });
                });

                // 3. Chequeo proactivo cada 5 minutos
                setInterval(() => {
                    console.log('[AngelScanner] Verificando nuevas versiones en el servidor...');
                    registration.update().catch(err => console.log('Error al verificar actualización:', err));
                }, 5 * 60 * 1000);

                // 4. Chequeo proactivo cuando el usuario vuelve a enfocar la app (regresa de segundo plano)
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') {
                        console.log('[AngelScanner] Regreso al primer plano, comprobando actualizaciones...');
                        registration.update().catch(err => console.log('Error al verificar actualización:', err));
                    }
                });

            }).catch(err => {
                console.log('[AngelScanner] Error al registrar el Service Worker:', err);
            });

            // 5. Detectar cambio de controlador (cuando se ejecuta skipWaiting y se activa el nuevo SW)
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    refreshing = true;
                    console.log('[AngelScanner] Nueva versión activa. Recargando aplicación...');
                    window.location.reload();
                }
            });
        }
    }

    showUpdateToast(waitingWorker) {
        if (document.getElementById('pwa-update-toast')) return;

        // Crear la estructura de la notificación Glassmorphic dinámicamente
        const toast = document.createElement('div');
        toast.id = 'pwa-update-toast';
        toast.className = 'update-toast';
        
        toast.innerHTML = `
            <div class="update-toast-content">
                <div class="update-toast-icon">👼</div>
                <div class="update-toast-text">
                    <h4>¡Actualización de AngelScanner!</h4>
                    <p>Una versión mejorada y más rápida de AngelScanner está lista.</p>
                </div>
            </div>
            <div class="update-toast-actions">
                <button id="pwa-update-btn" class="update-btn-action accept">Actualizar ahora</button>
                <button id="pwa-dismiss-btn" class="update-btn-action dismiss">Mantener versión</button>
            </div>
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        // Configurar botones
        const updateBtn = toast.querySelector('#pwa-update-btn');
        const dismissBtn = toast.querySelector('#pwa-dismiss-btn');

        updateBtn.addEventListener('click', () => {
            console.log('[AngelScanner] Enviando señal de skipWaiting al Service Worker...');
            waitingWorker.postMessage({ type: 'SKIP_WAITING' });
            this.hideUpdateToast(toast);
        });

        dismissBtn.addEventListener('click', () => {
            console.log('[AngelScanner] El usuario omitió la versión de momento');
            this.hideUpdateToast(toast);
        });
    }

    hideUpdateToast(toast) {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 600);
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new AngelScanner();
});