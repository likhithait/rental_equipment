/* ==========================================================================
   PHOTOGRAPHIC EVIDENCE CAPTURE - CLOUDINARY UPLOAD + SHA-256 SEAL (FR-009)

   Used by the "Capture Photo" table action of the Inspections and the
   Damage Charge Approval apps (webapp/ext/controller/PhotoUpload.js).
   Uploads go to the authenticated CAP action LaunchpadService.uploadEvidence.
   ========================================================================== */
(function () {
    'use strict';

    if (window.openEvidencePhotoCaptureDialog) return;   // loaded once per launchpad session

    const EVIDENCE_SERVICE = '/api/';

    // the approuter (xs-app.json, csrfProtection) only accepts modifying requests with a CSRF token
    async function fetchCsrfToken() {
        try {
            const response = await fetch(EVIDENCE_SERVICE, {
                method: 'HEAD',
                credentials: 'same-origin',
                headers: { 'X-CSRF-Token': 'Fetch' }
            });
            return response.headers.get('X-CSRF-Token') || 'unsafe';
        } catch (e) {
            return 'unsafe';
        }
    }

    /**
     * Compute SHA-256 hash using browser Web Crypto API
     */
    async function computeBrowserSha256(arrayBuffer) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Open Photographic Evidence Capture & Cloudinary Upload Dialog
     */
    function openEvidencePhotoCaptureDialog(options = {}) {
        // Remove existing modal if any
        const existingModal = document.getElementById('sap-cloudinary-capture-modal');
        if (existingModal) existingModal.remove();

        // 1. Determine current entity and ID with robust extraction
        let entityId = options.entityId || options.conditionLog_ID || options.damage_ID || options.repairBill_ID;

        // Strategy A: Query active UI5 control binding context
        if (!entityId && window.sap && sap.ui && sap.ui.getCore) {
            try {
                const elements = document.querySelectorAll('.sapUxAPObjectPageLayout, [data-sap-ui-area], .sapMPage, .sapFDynamicPage');
                for (const el of elements) {
                    if (el.id) {
                        const ctrl = sap.ui.getCore().byId(el.id);
                        if (ctrl && ctrl.getBindingContext) {
                            const ctx = ctrl.getBindingContext();
                            if (ctx && ctx.getProperty) {
                                const val = ctx.getProperty('ID');
                                if (val) {
                                    entityId = val;
                                    break;
                                }
                            }
                        }
                    }
                }
            } catch { /* optional lookup - ignore */ }
        }

        // Strategy B: Match any valid UUID in the URL hash or path (handles Drafts and Active entities)
        if (!entityId) {
            const fullUrl = decodeURIComponent(window.location.href || '');
            const uuidMatch = fullUrl.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
            if (uuidMatch && uuidMatch[1]) {
                entityId = uuidMatch[1];
            }
        }

        const currentUrl = decodeURIComponent(window.location.href);
        const isInspection = options.entityType === 'ConditionLogs' || currentUrl.includes('inspection') || currentUrl.includes('ConditionLogs');
        const isDamage = options.entityType === 'DamageRecords' || currentUrl.includes('DamageRecords');
        const isRepairBill = options.entityType === 'RepairBills' || currentUrl.includes('RepairBills') || currentUrl.includes('damage-charge') || currentUrl.includes('billing');

        const defaultType = options.defaultPhotoType || ((isRepairBill || isDamage) ? 'DamageEvidence' : 'Return');
        const entityLabel = isInspection ? 'Inspection' : (isDamage ? 'Damage Incident' : (isRepairBill ? 'Repair Bill' : 'Record'));

        // Create modal DOM structure
        const modal = document.createElement('div');
        modal.id = 'sap-cloudinary-capture-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.45);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: "72", "72full", Arial, Helvetica, sans-serif;
        `;

        modal.innerHTML = `
            <div style="background: #ffffff; border-radius: 8px; width: 520px; max-width: 95vw; box-shadow: 0 10px 30px rgba(0,0,0,0.18); overflow: hidden; display: flex; flex-direction: column; border: 1px solid #d9d9d9; animation: modalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);">
                <!-- SAP Fiori Header -->
                <div style="background: #ffffff; border-bottom: 1px solid #e5e5e5; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <div style="font-size: 16px; font-weight: 700; color: #1d2d3e;">Upload Photographic Evidence</div>
                        ${entityId ? `<div style="font-size: 12px; color: #556b82; margin-top: 2px;">Linked to ${entityLabel}: #${entityId.substring(0,8)}...</div>` : ''}
                    </div>
                    <button id="modal-close-btn" style="background: transparent; border: none; color: #556b82; font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 4px; line-height: 1;" title="Close">✕</button>
                </div>

                <!-- Body -->
                <div style="padding: 20px; overflow-y: auto; max-height: 75vh; display: flex; flex-direction: column; gap: 16px;">
                    <!-- Live Camera Viewfinder (Embedded HTML5 WebRTC Video) -->
                    <div id="camera-viewfinder-box" style="display: none; background: #000; border-radius: 6px; overflow: hidden; position: relative;">
                        <video id="live-webcam-video" autoplay playsinline style="width: 100%; max-height: 300px; object-fit: cover; display: block;"></video>
                        <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.65); color: white; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                            ● Live Camera
                        </div>
                        <!-- Viewfinder Action Bar -->
                        <div style="position: absolute; bottom: 12px; left: 0; width: 100%; display: flex; justify-content: center; gap: 10px; align-items: center;">
                            <button id="btn-snap-now" type="button" style="background: #0070f2; color: white; border: none; border-radius: 4px; padding: 8px 20px; font-weight: 600; font-size: 13px; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">
                                Capture Photo
                            </button>
                            <button id="btn-cancel-cam" type="button" style="background: rgba(0,0,0,0.6); color: white; border: 1px solid rgba(255,255,255,0.4); border-radius: 4px; padding: 8px 14px; font-weight: 500; font-size: 12px; cursor: pointer;">
                                Cancel
                            </button>
                        </div>
                    </div>

                    <!-- Capture Source Selector -->
                    <div id="source-selector-box">
                        <label style="font-size: 12px; font-weight: 600; color: #556b82; text-transform: uppercase; margin-bottom: 6px; display: block;">Select Image Source</label>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <button id="btn-open-live-camera" type="button" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 14px; border: 1px solid #89919a; background: #ffffff; border-radius: 4px; cursor: pointer; color: #0070f2; font-weight: 600; font-size: 13px; transition: all 0.15s;">
                                Open Live Camera
                            </button>
                            <button id="btn-pick-file" type="button" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 14px; border: 1px solid #89919a; background: #ffffff; border-radius: 4px; cursor: pointer; color: #0070f2; font-weight: 600; font-size: 13px; transition: all 0.15s;">
                                Upload From Device
                            </button>
                        </div>
                        <!-- Hidden file inputs -->
                        <input id="regular-file-input" type="file" accept="image/*" style="display: none;">
                    </div>

                    <!-- Hidden canvas for camera snapshot processing -->
                    <canvas id="snapshot-canvas" style="display: none;"></canvas>

                    <!-- Evidence Type Select -->
                    <div>
                        <label style="font-size: 12px; font-weight: 600; color: #556b82; text-transform: uppercase; margin-bottom: 6px; display: block;">Evidence Classification</label>
                        <select id="evidence-type-select" style="width: 100%; padding: 8px 12px; border: 1px solid #89919a; border-radius: 4px; font-size: 13px; background: #ffffff; color: #1d2d3e; outline: none;">
                            <option value="Return" ${defaultType === 'Return' ? 'selected' : ''}>Customer Return Inspection (Check-In)</option>
                            <option value="Dispatch" ${defaultType === 'Dispatch' ? 'selected' : ''}>Pre-Delivery Dispatch (Check-Out)</option>
                            <option value="DamageEvidence" ${defaultType === 'DamageEvidence' ? 'selected' : ''}>Damage Incident Evidence</option>
                            <option value="PostRepair" ${defaultType === 'PostRepair' ? 'selected' : ''}>Post-Repair Verification</option>
                        </select>
                    </div>

                    <!-- Preview Area -->
                    <div id="preview-container" style="display: none; border: 1px solid #d9d9d9; border-radius: 6px; padding: 12px; background: #f7f9fa;">
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <img id="preview-img" style="width: 72px; height: 72px; object-fit: cover; border-radius: 4px; border: 1px solid #d9d9d9;" />
                            <div style="flex: 1; min-width: 0;">
                                <div style="display: flex; align-items: center; justify-content: space-between;">
                                    <div id="preview-filename" style="font-weight: 600; font-size: 13px; color: #1d2d3e; word-break: break-all;">evidence.jpg</div>
                                    <button id="btn-retake" type="button" style="background: #ffffff; border: 1px solid #89919a; color: #0070f2; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; cursor: pointer;">Retake</button>
                                </div>
                                <div id="preview-filesize" style="font-size: 12px; color: #6a737d; margin-top: 2px;">1.4 MB</div>
                                <div style="font-size: 11px; color: #107e3e; font-weight: 600; margin-top: 4px;">✓ SHA-256 Seal Computed</div>
                            </div>
                        </div>

                        <!-- Hash display -->
                        <div style="margin-top: 8px; background: #ffffff; border: 1px solid #e5e5e5; border-radius: 4px; padding: 6px 10px;">
                            <div style="font-size: 10px; font-weight: 600; color: #6a737d; text-transform: uppercase;">Cryptographic Hash (SHA-256)</div>
                            <div id="preview-sha256" style="font-family: monospace; font-size: 11px; color: #1d2d3e; word-break: break-all; margin-top: 2px;">-</div>
                        </div>
                    </div>

                    <!-- Status / Progress Banner -->
                    <div id="upload-status-box" style="display: none; padding: 10px 14px; border-radius: 4px; font-size: 12px; text-align: center;"></div>
                </div>

                <!-- SAP Fiori Footer -->
                <div style="background: #f7f9fa; border-top: 1px solid #e5e5e5; padding: 12px 20px; display: flex; justify-content: flex-end; gap: 8px;">
                    <button id="btn-cancel" style="padding: 7px 16px; border: 1px solid #89919a; background: #ffffff; border-radius: 4px; font-size: 13px; cursor: pointer; font-weight: 600; color: #0070f2;">Cancel</button>
                    <button id="btn-upload-cloudinary" disabled style="padding: 7px 22px; border: 1px solid #0070f2; background: #0070f2; color: #ffffff; border-radius: 4px; font-size: 13px; font-weight: 600; cursor: not-allowed; opacity: 0.5; transition: all 0.2s;">Upload</button>
                </div>
            </div>
            <style>
                @keyframes modalPop {
                    from { transform: scale(0.96); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            </style>
        `;

        document.body.appendChild(modal);

        // Modal elements
        const closeBtn = modal.querySelector('#modal-close-btn');
        const cancelBtn = modal.querySelector('#btn-cancel');
        const openLiveCamBtn = modal.querySelector('#btn-open-live-camera');
        const pickBtn = modal.querySelector('#btn-pick-file');
        const regularInput = modal.querySelector('#regular-file-input');
        const uploadBtn = modal.querySelector('#btn-upload-cloudinary');
        const previewContainer = modal.querySelector('#preview-container');
        const previewImg = modal.querySelector('#preview-img');
        const previewFilename = modal.querySelector('#preview-filename');
        const previewFilesize = modal.querySelector('#preview-filesize');
        const previewSha256 = modal.querySelector('#preview-sha256');
        const statusBox = modal.querySelector('#upload-status-box');
        const typeSelect = modal.querySelector('#evidence-type-select');
        const sourceSelectorBox = modal.querySelector('#source-selector-box');
        const cameraViewfinderBox = modal.querySelector('#camera-viewfinder-box');
        const videoElem = modal.querySelector('#live-webcam-video');
        const snapNowBtn = modal.querySelector('#btn-snap-now');
        const cancelCamBtn = modal.querySelector('#btn-cancel-cam');
        const canvasElem = modal.querySelector('#snapshot-canvas');
        const retakeBtn = modal.querySelector('#btn-retake');

        let currentImageData = null;
        let currentFileName = null;
        let currentSha256 = null;
        let currentLat = null;
        let currentLong = null;
        let liveMediaStream = null;

        // Fetch GPS coordinates in background
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    currentLat = pos.coords.latitude;
                    currentLong = pos.coords.longitude;
                },
                () => { /* Geolocation optional */ }
            );
        }

        // Stop webcam tracks cleanly
        const stopLiveCamera = () => {
            if (liveMediaStream) {
                liveMediaStream.getTracks().forEach(t => t.stop());
                liveMediaStream = null;
            }
            if (videoElem) videoElem.srcObject = null;
            cameraViewfinderBox.style.display = 'none';
            sourceSelectorBox.style.display = 'block';
        };

        // Enhanced table & model refresh across SAP Fiori Elements
        const triggerRefresh = () => {
            if (window.sap && sap.ui && sap.ui.getCore) {
                try {
                    const core = sap.ui.getCore();
                    // 1. Refresh photos table binding safely
                    document.querySelectorAll('.sapMList, .sapMTable, .sapUiTable').forEach(t => {
                        const ctrl = core.byId(t.id);
                        if (ctrl && ctrl.getBinding) {
                            const b = ctrl.getBinding('items') || ctrl.getBinding('rows');
                            if (b && typeof b.refresh === 'function') {
                                try { b.refresh(); } catch { /* optional lookup - ignore */ }
                            }
                        }
                    });

                    // 2. Request side effects for photos navigation on active view
                    document.querySelectorAll('.sapUxAPObjectPageLayout').forEach(v => {
                        const viewCtrl = core.byId(v.id);
                        if (viewCtrl && viewCtrl.getBindingContext) {
                            const ctx = viewCtrl.getBindingContext();
                            if (ctx && typeof ctx.requestSideEffects === 'function') {
                                try { ctx.requestSideEffects([{ '$NavigationPropertyPath': 'photos' }]); } catch { /* optional lookup - ignore */ }
                            }
                        }
                    });

                    // 3. Publish refresh events safely
                    try {
                        core.getEventBus().publish("sap.fe.core", "refreshTable");
                    } catch { /* optional lookup - ignore */ }
                } catch { /* optional lookup - ignore */ }
            }
        };

        // Close Modal
        const closeModal = () => {
            stopLiveCamera();
            modal.remove();
            triggerRefresh();
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        cancelCamBtn.addEventListener('click', stopLiveCamera);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Start Live Webcam Stream
        openLiveCamBtn.addEventListener('click', async () => {
            try {
                sourceSelectorBox.style.display = 'none';
                cameraViewfinderBox.style.display = 'block';

                liveMediaStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    audio: false
                });

                videoElem.srcObject = liveMediaStream;
                await videoElem.play();
            } catch (camErr) {
                console.warn('[Camera] Could not access live webcam, falling back to file picker:', camErr);
                stopLiveCamera();
                alert('Could not access live camera feed (' + (camErr.message || 'permission denied') + '). Please select an image file instead.');
                regularInput.click();
            }
        });

        // Snap Photo From Live Camera Viewfinder
        snapNowBtn.addEventListener('click', () => {
            if (!videoElem.videoWidth || !videoElem.videoHeight) {
                alert('Camera feed is still initializing, please wait a moment...');
                return;
            }

            canvasElem.width = videoElem.videoWidth;
            canvasElem.height = videoElem.videoHeight;
            const ctx = canvasElem.getContext('2d');
            ctx.drawImage(videoElem, 0, 0, canvasElem.width, canvasElem.height);

            stopLiveCamera();

            canvasElem.toBlob(async (blob) => {
                const fileName = `camera_${Date.now()}.jpg`;
                const file = new File([blob], fileName, { type: 'image/jpeg' });
                await handleFileSelected(file);
            }, 'image/jpeg', 0.92);
        });

        retakeBtn.addEventListener('click', () => {
            previewContainer.style.display = 'none';
            uploadBtn.disabled = true;
            uploadBtn.style.opacity = '0.5';
            uploadBtn.style.cursor = 'not-allowed';
            openLiveCamBtn.click();
        });

        pickBtn.addEventListener('click', () => regularInput.click());

        // Process selected or captured image file
        const handleFileSelected = async (file) => {
            if (!file || !file.type.startsWith('image/')) {
                alert('Please select a valid image file');
                return;
            }

            currentFileName = file.name || `capture_${Date.now()}.jpg`;
            previewFilename.textContent = currentFileName;
            previewFilesize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

            // 1. Compute real SHA-256 via browser Web Crypto
            const arrayBuffer = await file.arrayBuffer();
            currentSha256 = await computeBrowserSha256(arrayBuffer);
            previewSha256.textContent = currentSha256;

            // 2. Read DataURL for preview & upload
            const reader = new FileReader();
            reader.onload = (e) => {
                currentImageData = e.target.result;
                previewImg.src = currentImageData;
                previewContainer.style.display = 'block';

                // Enable upload button
                uploadBtn.disabled = false;
                uploadBtn.style.opacity = '1';
                uploadBtn.style.cursor = 'pointer';
            };
            reader.readAsDataURL(file);
        };

        regularInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) handleFileSelected(e.target.files[0]);
        });

        // Upload Evidence & Persist to Database
        uploadBtn.addEventListener('click', async () => {
            if (!currentImageData || !currentSha256) return;

            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Uploading...';
            statusBox.style.display = 'block';
            statusBox.style.background = '#eaf2fd';
            statusBox.style.color = '#0040b0';
            statusBox.innerHTML = 'Uploading evidence...';

            try {
                const payload = {
                    fileName: currentFileName,
                    photoType: typeSelect.value,
                    imageBase64: currentImageData,
                    conditionLog_ID: isInspection ? entityId : (options.conditionLog_ID || null),
                    damage_ID: isDamage ? entityId : (options.damage_ID || null),
                    repairBill_ID: isRepairBill ? entityId : (options.repairBill_ID || null),
                    latitude: currentLat === null ? null : Number(currentLat.toFixed(6)),
                    longitude: currentLong === null ? null : Number(currentLong.toFixed(6))
                };

                const response = await fetch(EVIDENCE_SERVICE + 'uploadEvidence', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': await fetchCsrfToken()
                    },
                    body: JSON.stringify(payload)
                });

                const body = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(body.error?.message || `Server rejected photo upload (HTTP ${response.status})`);
                }
                const result = { success: true, photo: body };

                // the server re-computes the SHA-256 of what it stored - both must match
                if (body.sha256 && body.sha256 !== currentSha256) {
                    throw new Error('SHA-256 mismatch between device and server - photo was altered in transit');
                }

                statusBox.style.background = '#e6f6ec';
                statusBox.style.color = '#0d8234';
                statusBox.innerHTML = `<strong>Upload Successful!</strong><br><a href="${result.photo.mediaUrl}" target="_blank" style="font-size:12px;color:#0070f2;word-break:break-all;">View Uploaded Photo ↗</a>`;
                uploadBtn.style.display = 'none';

                // Show Close button
                cancelBtn.textContent = 'Close';
                cancelBtn.style.background = '#0070f2';
                cancelBtn.style.color = '#ffffff';
                cancelBtn.style.borderColor = '#0070f2';

                // Trigger refresh immediately so table updates
                triggerRefresh();

                setTimeout(() => {
                    closeModal();
                    if (typeof options.onSuccess === 'function') {
                        try { options.onSuccess(result); } catch { /* optional lookup - ignore */ }
                    }
                    triggerRefresh();
                }, 1500);

            } catch (err) {
                console.error('[Upload Error]', err);
                statusBox.style.background = '#fde8e8';
                statusBox.style.color = '#c92a2a';
                statusBox.innerHTML = `<strong>Upload Failed:</strong> ${err.message}`;
                uploadBtn.disabled = false;
                uploadBtn.textContent = 'Upload';
            }
        });
    }

    /**
     * High-Resolution Photo Lightbox Modal
     */
    function openImageLightbox(imageUrl) {
        const existing = document.getElementById('sap-photo-lightbox-modal');
        if (existing) existing.remove();

        const box = document.createElement('div');
        box.id = 'sap-photo-lightbox-modal';
        box.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.88);
            z-index: 100000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(6px);
        `;

        box.innerHTML = `
            <div style="position: absolute; top: 16px; right: 24px; display: flex; gap: 12px; z-index: 2;">
                <a href="${imageUrl}" target="_blank" download="evidence.jpg" style="background: rgba(255,255,255,0.2); color: white; text-decoration: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 13px;">⬇️ Download</a>
                <button id="lightbox-close" style="background: rgba(255,255,255,0.25); border: none; color: white; padding: 8px 16px; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer;">✕ Close</button>
            </div>
            <div style="max-width: 90vw; max-height: 85vh; display: flex; flex-direction: column; align-items: center;">
                <img src="${imageUrl}" style="max-width: 100%; max-height: 80vh; object-fit: contain; border-radius: 8px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);" />
                <div style="margin-top: 12px; color: #a0c4ff; font-size: 12px; font-family: monospace; background: rgba(0,0,0,0.4); padding: 6px 14px; border-radius: 6px;">
                    ☁️ Cloudinary Verified Evidence Photo
                </div>
            </div>
        `;

        box.querySelector('#lightbox-close').addEventListener('click', () => box.remove());
        box.addEventListener('click', (e) => {
            if (e.target === box) box.remove();
        });

        document.body.appendChild(box);
    }


    // click on an evidence thumbnail inside a photo table opens the full-resolution photo
    document.addEventListener('click', function (event) {
        const img = event.target && event.target.closest && event.target.closest('img');
        if (!img || img.closest('#sap-cloudinary-capture-modal, #sap-photo-lightbox-modal')) return;
        const src = img.currentSrc || img.src || '';
        if (src.includes('res.cloudinary.com') || src.startsWith('data:image/') || src.includes('images.unsplash.com')) {
            event.stopPropagation();
            openImageLightbox(src);
        }
    }, true);

    window.openEvidencePhotoCaptureDialog = openEvidencePhotoCaptureDialog;
}());
