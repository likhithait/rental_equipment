const FIORI_ROLES_CONFIG = {
    'Admin': {
        name: 'Vikram Mehta',
        title: 'System Administrator',
        avatar: 'VM',
        color: '#0070f2',
        apps: ['customer-management', 'rentals', 'locations', 'fleet-overview', 'inspections', 'damage-charge-approval', 'repair-jobs', 'maintenance-planner']
    },
    'YardWorker': {
        name: 'Ramesh Patel',
        title: 'Yard Inspector',
        avatar: 'RP',
        color: '#107e3e',
        apps: ['inspections', 'damage-charge-approval']
    },
    'BillingClerk': {
        name: 'Ananya Sharma',
        title: 'Billing Clerk',
        avatar: 'AS',
        color: '#8e44ad',
        apps: ['damage-charge-approval']
    },
    'Technician': {
        name: 'Mike D\'souza',
        title: 'Workshop Technician',
        avatar: 'MD',
        color: '#e67e22',
        apps: ['repair-jobs', 'maintenance-planner']
    }
};

const FIORI_USERS = {
    'admin': { role: 'Admin', pass: 'admin123' },
    'inspector': { role: 'YardWorker', pass: 'yard123' },
    'finance': { role: 'BillingClerk', pass: 'finance123' },
    'technician': { role: 'Technician', pass: 'tech123' }
};

// Check current user session
function getFioriSession() {
    try {
        const raw = localStorage.getItem('fiori_user_session');
        if (raw) return JSON.parse(raw);
    } catch (e) {
        console.error('Failed to read fiori_user_session', e);
    }
    return null;
}

function setFioriSession(username) {
    const userCfg = FIORI_USERS[username] || { role: 'Admin' };
    const roleCfg = FIORI_ROLES_CONFIG[userCfg.role] || FIORI_ROLES_CONFIG['Admin'];
    const session = {
        username: username,
        role: userCfg.role,
        name: roleCfg.name,
        title: roleCfg.title,
        avatar: roleCfg.avatar,
        plant: 'PLANT-AHMD (Ahmedabad Yard)',
        loginTime: new Date().toISOString()
    };
    localStorage.setItem('fiori_user_session', JSON.stringify(session));
    return session;
}

function clearFioriSession() {
    localStorage.removeItem('fiori_user_session');
}

// In sub-apps: Guard access and render top Fiori navigation bar
function initSubAppGuard(currentAppId, currentAppTitle) {
    let session = getFioriSession();
    
    // Default to admin if no session exists yet for smooth local testing
    if (!session) {
        session = setFioriSession('admin');
    }

    const roleCfg = FIORI_ROLES_CONFIG[session.role];
    const isAllowed = roleCfg && (roleCfg.apps.includes(currentAppId) || session.role === 'Admin');

    if (!isAllowed) {
        // Render Access Denied Screen
        document.addEventListener('DOMContentLoaded', function () {
            document.body.innerHTML = `
                <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#f5f6f7; font-family:'72', -apple-system, sans-serif; text-align:center; padding:2rem;">
                    <div style="background:#ffffff; border-radius:12px; padding:3rem; max-width:550px; box-shadow:0 10px 30px rgba(0,0,0,0.1); border-top:5px solid #bb0000;">
                        <div style="font-size:3.5rem; margin-bottom:1rem;">🚫</div>
                        <h2 style="color:#1d2d3e; font-size:1.6rem; margin-bottom:0.75rem;">Authorization Required</h2>
                        <p style="color:#556b82; font-size:0.95rem; line-height:1.5; margin-bottom:1.5rem;">
                            You are logged in as <strong>${session.name}</strong> (<span style="color:#0070f2; font-weight:600;">${roleCfg ? roleCfg.title : session.role}</span>).
                            Your current role does not have authorization to access <strong>${currentAppTitle || currentAppId}</strong>.
                        </p>
                        <div style="background:#fff3cd; color:#856404; padding:0.75rem 1rem; border-radius:6px; font-size:0.85rem; margin-bottom:1.75rem; border:1px solid #ffeeba;">
                            Allowed Roles: <strong>${getAllowedRolesForApp(currentAppId).join(', ')}</strong>
                        </div>
                        <a href="/index.html" style="display:inline-block; background:#0070f2; color:#fff; text-decoration:none; padding:0.75rem 1.75rem; border-radius:6px; font-weight:600; font-size:0.95rem; box-shadow:0 2px 6px rgba(0,112,242,0.3);">
                            &larr; Return to SAP Fiori Launchpad
                        </a>
                    </div>
                </div>
            `;
        });
        return false;
    }

    // Insert slim top Fiori Shell bar
    document.addEventListener('DOMContentLoaded', function () {
        const topBar = document.createElement('div');
        topBar.id = 'fiori-subapp-topbar';
        topBar.style.cssText = `
            height: 42px;
            background: linear-gradient(135deg, #1d2d3e 0%, #0d1926 100%);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 1.25rem;
            font-family: '72', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 0.85rem;
            position: relative;
            z-index: 99999;
            box-shadow: 0 1px 4px rgba(0,0,0,0.2);
            flex-shrink: 0;
        `;

        topBar.innerHTML = `
            <div style="display:flex; align-items:center; gap:1rem;">
                <a href="/index.html" style="color:#ffffff; text-decoration:none; display:flex; align-items:center; gap:0.4rem; font-weight:600; font-size:0.85rem; background:rgba(255,255,255,0.12); padding:0.25rem 0.65rem; border-radius:4px; border:1px solid rgba(255,255,255,0.2); transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.22)'" onmouseout="this.style.background='rgba(255,255,255,0.12)'">
                    <span>&larr;</span>
                    <span>Launchpad</span>
                </a>
                <span style="color:#9cb5cf;">|</span>
                <span style="font-weight:700; color:#fff; letter-spacing:0.2px;">${currentAppTitle || 'SAP Fiori Application'}</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.75rem;">
                <span style="background:#0070f2; color:#fff; font-size:0.7rem; font-weight:700; padding:0.15rem 0.5rem; border-radius:10px; text-transform:uppercase;">
                    ${session.role}
                </span>
                <div style="width:26px; height:26px; border-radius:50%; background:${roleCfg ? roleCfg.color : '#0070f2'}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700;">
                    ${session.avatar}
                </div>
                <span style="color:#e1e7ed; font-size:0.8rem; font-weight:500;">${session.name.split(' ')[0]}</span>
                <span style="color:#809fb8; font-size:0.75rem;">(${session.plant.split(' ')[0]})</span>
            </div>
        `;

        document.body.prepend(topBar);

        // Automatic draft discard mechanism for new unsaved records
        const APP_SERVICE_MAP = {
            'customer-management': '/rental/',
            'rentals': '/rental/',
            'locations': '/rental/',
            'fleet-overview': '/rental/',
            'inspections': '/inspection/',
            'damage-charge-approval': '/billing/',
            'repair-jobs': '/maintenance/',
            'maintenance-planner': '/maintenance/'
        };
        const currentServiceRoot = APP_SERVICE_MAP[currentAppId] || '/rental/';

        function getDraftPathFromHash(hash) {
            if (!hash || !hash.includes('IsActiveEntity=false')) return null;
            const cleanHash = hash.replace(/^[#/]+/, '').split('?')[0];
            const match = cleanHash.match(/([a-zA-Z0-9_]+)\(([^)]*IsActiveEntity=false[^)]*)\)/);
            if (match) {
                return `${match[1]}(${match[2]})`;
            }
            return null;
        }

        async function discardDraftUrl(draftPath) {
            if (!draftPath) return;
            try {
                const fullUrl = currentServiceRoot + draftPath;
                await fetch(fullUrl, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (err) {
                console.warn('Draft cleanup notice:', err);
            }
        }

        function refreshUI5List() {
            try {
                if (window.sap && sap.ui && sap.ui.core) {
                    const compId = document.querySelector('[data-sap-ui-component]')?.getAttribute('data-id');
                    const comp = compId && sap.ui.core.Component.get(compId);
                    if (comp && comp.getModel()) {
                        comp.getModel().refresh();
                    }
                }
            } catch (e) {}
        }

        // 1. Discard draft when clicking "<- Launchpad"
        const launchpadLink = topBar.querySelector('a');
        if (launchpadLink) {
            launchpadLink.addEventListener('click', async function (e) {
                e.preventDefault();
                const currentDraft = getDraftPathFromHash(window.location.hash);
                if (currentDraft) {
                    await discardDraftUrl(currentDraft);
                }
                window.location.href = '/index.html';
            });
        }

        // 2. Discard draft if user navigates back to the List Report without saving/activating
        window.addEventListener('hashchange', async function (event) {
            const oldHash = event.oldURL ? event.oldURL.split('#')[1] || '' : '';
            const newHash = event.newURL ? event.newURL.split('#')[1] || '' : '';

            // If user was on a new draft and navigated away WITHOUT activating (active entity URL contains IsActiveEntity=true)
            if (oldHash.includes('IsActiveEntity=false') && !newHash.includes('IsActiveEntity=true')) {
                const draftPath = getDraftPathFromHash(oldHash);
                if (draftPath) {
                    await discardDraftUrl(draftPath);
                    setTimeout(refreshUI5List, 150);
                }
            }
        });

        // 3. Discard draft on browser tab close or refresh
        window.addEventListener('beforeunload', function () {
            const currentDraft = getDraftPathFromHash(window.location.hash);
            if (currentDraft) {
                fetch(currentServiceRoot + currentDraft, {
                    method: 'DELETE',
                    keepalive: true
                }).catch(() => {});
            }
        });

        // Ensure clean viewport layout for sub-app mode
        document.documentElement.style.height = '100%';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.height = '100vh';
        document.body.style.overflow = 'hidden';
    });

    return true;
}

function getAllowedRolesForApp(appId) {
    const allowed = [];
    for (const [role, cfg] of Object.entries(FIORI_ROLES_CONFIG)) {
        if (cfg.apps.includes(appId)) {
            allowed.push(role);
        }
    }
    return allowed;
}

// Export globals
window.FIORI_ROLES_CONFIG = FIORI_ROLES_CONFIG;
window.FIORI_USERS = FIORI_USERS;
window.getFioriSession = getFioriSession;
window.setFioriSession = setFioriSession;
window.clearFioriSession = clearFioriSession;
window.initSubAppGuard = initSubAppGuard;

/* ==========================================================================
   CLOUDINARY EVIDENCE CAPTURE & TAMPER-PROOF SHA-256 INTEGRATION (FR-009)
   ========================================================================== */

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
window.openEvidencePhotoCaptureDialog = function(options = {}) {
    // Remove existing modal if any
    const existingModal = document.getElementById('sap-cloudinary-capture-modal');
    if (existingModal) existingModal.remove();

    // 1. Determine current entity and ID with robust extraction
    let entityId = options.entityId || options.conditionLog_ID || options.damage_ID || options.repairBill_ID || options.repairJob_ID;
    
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
        } catch (e) {}
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
    const isRepairJob = options.entityType === 'RepairJobs' || currentUrl.includes('RepairJobs') || currentUrl.includes('repair-jobs');

    const defaultType = options.defaultPhotoType || (isRepairJob ? 'Repair' : (isRepairBill ? 'Settlement' : 'Return'));
    const entityLabel = isRepairJob ? 'Repair Job' : (isInspection ? 'Inspection' : (isDamage ? 'Damage Incident' : (isRepairBill ? 'Repair Bill' : 'Record')));

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
                        <option value="Repair" ${defaultType === 'Repair' ? 'selected' : ''}>In-Shop Repair / Teardown Proof</option>
                        <option value="Settlement" ${defaultType === 'Settlement' ? 'selected' : ''}>Claim Settlement & Dispute Audit</option>
                        <option value="PreExisting" ${defaultType === 'PreExisting' ? 'selected' : ''}>Pre-Existing Baseline Damage</option>
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
                            try { b.refresh(); } catch (e) {}
                        }
                    }
                });

                // 2. Request side effects for photos navigation on active view
                document.querySelectorAll('.sapUxAPObjectPageLayout').forEach(v => {
                    const viewCtrl = core.byId(v.id);
                    if (viewCtrl && viewCtrl.getBindingContext) {
                        const ctx = viewCtrl.getBindingContext();
                        if (ctx && typeof ctx.requestSideEffects === 'function') {
                            try { ctx.requestSideEffects([{ '$NavigationPropertyPath': 'photos' }]); } catch (e) {}
                        }
                    }
                });

                // 3. Publish refresh events safely
                try {
                    core.getEventBus().publish("sap.fe.core", "refreshTable");
                } catch (e) {}
            } catch (e) {}
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
                sha256: currentSha256,
                conditionLog_ID: isInspection ? entityId : (options.conditionLog_ID || null),
                damage_ID: isDamage ? entityId : (options.damage_ID || null),
                repairBill_ID: isRepairBill ? entityId : (options.repairBill_ID || null),
                repairJob_ID: isRepairJob ? entityId : (options.repairJob_ID || null),
                latitude: currentLat,
                longitude: currentLong,
                uploadedBy: (window.getFioriSession && window.getFioriSession()?.username) || 'Yard Staff'
            };

            const response = await fetch('/api/upload-evidence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Server rejected photo upload');
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
                    try { options.onSuccess(result); } catch (e) {}
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
};

/**
 * Intelligent Observer: Hooks standard Create button on Photographic Evidence tables
 */
function setupPhotoEvidenceTableObserver() {
    setInterval(() => {
        const sectionTitles = document.querySelectorAll('.sapUxAPObjectPageSubSectionHeaderTitle, .sapMTitle, .sapUxAPObjectPageSectionTitle');
        sectionTitles.forEach(titleElem => {
            const text = (titleElem.innerText || '').toLowerCase();
            if (text.includes('photographic evidence') || text.includes('photo evidence') || text.includes('evidence photos') || text.includes('evidence & hashes') || text.includes('post-repair evidence')) {
                const section = titleElem.closest('.sapUxAPObjectPageSubSection, .sapUxAPObjectPageSection, section, [role="region"]');
                if (!section) return;

                const toolbar = section.querySelector('.sapMTB, .sapMToolbar, .sapFDynamicPageTitle, .sapUiTableToolbar');
                if (!toolbar) return;

                // Find the standard Create button on this table and hook it
                const buttons = toolbar.querySelectorAll('button, .sapMBtn');
                buttons.forEach(btn => {
                    const btnText = (btn.innerText || btn.textContent || '').trim();
                    const btnId = (btn.id || '').toLowerCase();
                    const isCreate = btnText === 'Create' || btnId.includes('create') || btnId.includes('standardaction::create');

                    if (isCreate && !btn.dataset.cloudinaryCreateHooked) {
                        btn.dataset.cloudinaryCreateHooked = 'true';
                        // Keep text and visual styling 100% normal standard Fiori Elements

                        // Intercept click in capture phase to launch Cloudinary capture modal
                        btn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();

                            let parentId = null;
                            const table = section.querySelector('.sapMList, .sapMTable, .sapUiTable');
                            if (table && table.id && window.sap && sap.ui && sap.ui.getCore) {
                                const ui5Ctrl = sap.ui.getCore().byId(table.id);
                                if (ui5Ctrl && ui5Ctrl.getBindingContext) {
                                    const ctx = ui5Ctrl.getBindingContext();
                                    if (ctx && ctx.getProperty) {
                                        parentId = ctx.getProperty('ID');
                                    }
                                }
                            }
                            if (!parentId) {
                                const fullUrl = decodeURIComponent(window.location.href || '');
                                const uuidMatch = fullUrl.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
                                if (uuidMatch && uuidMatch[1]) {
                                    parentId = uuidMatch[1];
                                }
                            }

                            // Robust entity type detection
                            const fullUrl = decodeURIComponent(window.location.href);
                            let detectedType = null;
                            if (fullUrl.includes('RepairBills') || fullUrl.includes('damage-charge') || fullUrl.includes('damage charge') || fullUrl.includes('billing')) {
                                detectedType = 'RepairBills';
                            } else if (fullUrl.includes('ConditionLogs') || fullUrl.includes('inspection')) {
                                detectedType = 'ConditionLogs';
                            } else if (fullUrl.includes('DamageRecords')) {
                                detectedType = 'DamageRecords';
                            } else if (fullUrl.includes('RepairJobs') || fullUrl.includes('repair-jobs') || fullUrl.includes('repair')) {
                                detectedType = 'RepairJobs';
                            }

                            window.openEvidencePhotoCaptureDialog({
                                entityId: parentId,
                                entityType: detectedType,
                                repairJob_ID: detectedType === 'RepairJobs' ? parentId : null,
                                repairBill_ID: detectedType === 'RepairBills' ? parentId : null,
                                conditionLog_ID: detectedType === 'ConditionLogs' ? parentId : null,
                                damage_ID: detectedType === 'DamageRecords' ? parentId : null
                            });
                        }, true);
                    }
                });
            }
        });

        // Enhance image thumbnails with click-to-expand Lightbox
        const photoImgs = document.querySelectorAll('.sapMImg, .sapMAvatar, img');
        photoImgs.forEach(img => {
            const src = img.src || img.getAttribute('src') || '';
            if ((src.includes('cloudinary') || src.startsWith('data:image/')) && !img.dataset.lightboxBound) {
                img.dataset.lightboxBound = 'true';
                img.style.cursor = 'zoom-in';
                img.title = 'Click to view full-resolution evidence photo';
                img.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openImageLightbox(src);
                });
            }
        });
    }, 1500);
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

// Start observer
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupPhotoEvidenceTableObserver);
} else {
    setupPhotoEvidenceTableObserver();
}