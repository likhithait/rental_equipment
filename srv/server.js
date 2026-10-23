import cds from '@sap/cds';
import express from 'express';
import path from 'path';
import { uploadEvidencePhoto } from './common/cloudinary.js';
import fs from 'fs';

cds.on('bootstrap', (app) => {

    // Verify deployed UI files
    console.log('index.html exists:', fs.existsSync(path.resolve('public/index.html')));
    console.log('fiori-auth.js exists:', fs.existsSync(path.resolve('public/fiori-auth.js')));
    console.log('Component.js exists:', fs.existsSync(path.resolve('public/Component.js')));
    
    const staticFolder =
        fs.existsSync(path.resolve('public'))
            ? 'public'
            : 'app';

    app.use(express.static(staticFolder));

    app.get('/', (req, res) => {
        res.sendFile(path.resolve(staticFolder, 'index.html'));
    });

    // Current logged-in SAP user
    app.get('/api/user', (req, res) => {
        res.json({
            user: req.user?.id || 'anonymous',
            roles: req.user?.roles || [],
            attributes: req.user?.attr || {}
        });
    });

    // Route any app Component.js request to the single shared app/Component.js
    app.get(['/:app/webapp/Component.js', '/:app/Component.js', '/Component.js'], (req, res, next) => {
        const sharedCompPath = path.resolve('app/Component.js');
        res.sendFile(sharedCompPath);
    });

    // Route legacy /:app/webapp/index.html requests to the single shared /index.html?app=:app
    app.get(['/:app/webapp/index.html', '/:app/webapp', '/:app/webapp/'], (req, res, next) => {
        const appId = req.params.app;
        const knownApps = [
            'customer-management',
            'damage-charge-approval',
            'fleet-overview',
            'inspections',
            'locations',
            'maintenance-planner',
            'rentals',
            'repair-jobs'
        ];
        if (knownApps.includes(appId)) {
            const queryParams = req.url.includes('?') ? '&' + req.url.split('?')[1] : '';
            return res.redirect(`/index.html?app=${appId}${queryParams}`);
        }
        next();
    });

    // Support large photo uploads up to 50MB
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Cloudinary & SHA-256 Photo Evidence Upload REST Endpoint
    app.post('/api/upload-evidence', async (req, res) => {
        try {
            const {
                fileName,
                photoType,
                imageBase64,
                conditionLog_ID,
                damage_ID,
                repairBill_ID,
                latitude,
                longitude,
                uploadedBy
            } = req.body;

            if (!imageBase64) {
                return res.status(400).json({ error: 'Missing imageBase64 data in upload payload' });
            }

            console.log(`[API /api/upload-evidence] Received evidence photo upload for: conditionLog=${conditionLog_ID}, damage=${damage_ID}, repairBill=${repairBill_ID}`);

            // 1. Process image: upload to Cloudinary & generate tamper-proof SHA-256
            const uploadResult = await uploadEvidencePhoto({
                imageBase64,
                fileName: fileName || `evidence_${Date.now()}.jpg`,
                folder: 'sap_sprint_evidence'
            });

            // 2. Determine if parent entity is an active Draft or an Active entity
            const db = await cds.connect.to('db');
            const photoId = cds.utils.uuid();
            const formatHanaTimestamp = (d) => (d ? new Date(d) : new Date()).toISOString().slice(0, 19).replace('T', ' ');

            const photoRecord = {
                ID: photoId,
                conditionLog_ID: conditionLog_ID || null,
                damage_ID: damage_ID || null,
                repairBill_ID: repairBill_ID || null,
                fileName: fileName || `evidence_${Date.now()}.jpg`,
                photoType: photoType || 'Return',
                mediaType: 'image/jpeg',
                mediaUrl: uploadResult.mediaUrl,
                publicId: uploadResult.publicId,
                sha256: uploadResult.sha256,
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                uploadedAt: new Date(),
                uploadedBy: uploadedBy || (req.user && req.user.id !== 'anonymous' ? req.user.id : 'Yard Staff')
            };

            let isDraft = false;

            try {
                if (repairBill_ID) {
                    const billDraft = await db.run(SELECT.one.from('BillingService.RepairBills_drafts').where({ ID: repairBill_ID }));
                    const draftUUID = billDraft ? (billDraft.DraftAdministrativeData_DraftUUID || billDraft.DRAFTADMINISTRATIVEDATA_DRAFTUUID) : null;
                    if (billDraft && draftUUID) {
                        isDraft = true;
                        const draftEntry = {
                            ID: photoId,
                            repairBill_ID: repairBill_ID,
                            conditionLog_ID: null,
                            damage_ID: null,
                            fileName: photoRecord.fileName,
                            photoType: photoRecord.photoType,
                            mediaType: photoRecord.mediaType,
                            mediaUrl: photoRecord.mediaUrl,
                            publicId: photoRecord.publicId,
                            sha256: photoRecord.sha256,
                            latitude: photoRecord.latitude,
                            longitude: photoRecord.longitude,
                            uploadedAt: formatHanaTimestamp(photoRecord.uploadedAt),
                            uploadedBy: photoRecord.uploadedBy,
                            IsActiveEntity: false,
                            HasActiveEntity: false,
                            HasDraftEntity: false,
                            DraftAdministrativeData_DraftUUID: draftUUID
                        };
                        await db.run(INSERT.into('BillingService.DamagePhotos_drafts').entries(draftEntry))
                            .catch(e => console.warn('[Draft Sync Warning RepairBills]', e.message));

                        console.log(`[API /api/upload-evidence] ✅ Successfully synced photo ${photoId} to BillingService.DamagePhotos_drafts`);
                    }
                }
                if (conditionLog_ID) {
                    const logDraft = await db.run(SELECT.one.from('InspectionService.ConditionLogs_drafts').where({ ID: conditionLog_ID }));
                    const logUUID = logDraft ? (logDraft.DraftAdministrativeData_DraftUUID || logDraft.DRAFTADMINISTRATIVEDATA_DRAFTUUID) : null;
                    if (logDraft && logUUID) {
                        isDraft = true;
                        await db.run(INSERT.into('InspectionService.DamagePhotos_drafts').entries({
                            ID: photoId,
                            conditionLog_ID: conditionLog_ID,
                            repairBill_ID: null,
                            damage_ID: null,
                            fileName: photoRecord.fileName,
                            photoType: photoRecord.photoType,
                            mediaType: photoRecord.mediaType,
                            mediaUrl: photoRecord.mediaUrl,
                            publicId: photoRecord.publicId,
                            sha256: photoRecord.sha256,
                            latitude: photoRecord.latitude,
                            longitude: photoRecord.longitude,
                            uploadedAt: formatHanaTimestamp(photoRecord.uploadedAt),
                            uploadedBy: photoRecord.uploadedBy,
                            IsActiveEntity: false,
                            HasActiveEntity: false,
                            HasDraftEntity: false,
                            DraftAdministrativeData_DraftUUID: logUUID
                        })).catch(e => console.warn('[Draft Sync Warning ConditionLogs]', e.message));

                        console.log(`[API /api/upload-evidence] ✅ Successfully synced photo ${photoId} to InspectionService.DamagePhotos_drafts`);
                    }
                }
                if (damage_ID) {
                    const damageDraft = await db.run(SELECT.one.from('InspectionService.DamageRecords_drafts').where({ ID: damage_ID }));
                    const damageUUID = damageDraft ? (damageDraft.DraftAdministrativeData_DraftUUID || damageDraft.DRAFTADMINISTRATIVEDATA_DRAFTUUID) : null;
                    if (damageDraft && damageUUID) {
                        isDraft = true;
                        await db.run(INSERT.into('InspectionService.DamagePhotos_drafts').entries({
                            ID: photoId,
                            damage_ID: damage_ID,
                            conditionLog_ID: null,
                            repairBill_ID: null,
                            fileName: photoRecord.fileName,
                            photoType: photoRecord.photoType,
                            mediaType: photoRecord.mediaType,
                            mediaUrl: photoRecord.mediaUrl,
                            publicId: photoRecord.publicId,
                            sha256: photoRecord.sha256,
                            latitude: photoRecord.latitude,
                            longitude: photoRecord.longitude,
                            uploadedAt: formatHanaTimestamp(photoRecord.uploadedAt),
                            uploadedBy: photoRecord.uploadedBy,
                            IsActiveEntity: false,
                            HasActiveEntity: false,
                            HasDraftEntity: false,
                            DraftAdministrativeData_DraftUUID: damageUUID
                        })).catch(e => console.warn('[Draft Sync Warning DamageRecords]', e.message));

                        console.log(`[API /api/upload-evidence] ✅ Successfully synced photo ${photoId} to InspectionService.DamagePhotos_drafts`);
                    }
                }

                // If parent is not a draft (i.e. already active), persist directly to active entity
                if (!isDraft) {
                    await db.run(INSERT.into('RentalEquipmentTrackingApp.DamagePhotos').entries(photoRecord));
                }
            } catch (draftErr) {
                console.warn('[API /api/upload-evidence] Draft synchronization notice:', draftErr.message);
                if (!isDraft) {
                    await db.run(INSERT.into('RentalEquipmentTrackingApp.DamagePhotos').entries(photoRecord)).catch(() => { });
                }
            }

            console.log(`[API /api/upload-evidence] ✅ Successfully stored photo ${photoId} in Cloudinary! SHA-256: ${uploadResult.sha256.substring(0, 16)}...`);

            return res.json({
                success: true,
                photo: photoRecord,
                isCloudinary: uploadResult.isCloudinary,
                message: 'Evidence photo successfully uploaded to Cloudinary'
            });
        } catch (err) {
            console.error('[API /api/upload-evidence] Error uploading evidence:', err);
            return res.status(500).json({ error: err.message });
        }
    });

    // Cloudinary configuration status check endpoint
    app.get('/api/cloudinary-status', (req, res) => {
        const isConfigured = Boolean(
            process.env.CLOUDINARY_URL ||
            (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY)
        );
        res.json({
            configured: isConfigured,
            cloudName: process.env.CLOUDINARY_CLOUD_NAME || (process.env.CLOUDINARY_URL ? 'Configured via CLOUDINARY_URL' : null)
        });
    });
});

cds.on('served', async () => {
    try {
        const db = await cds.connect.to('db');
        // Clean up any premature active photos whose parent RepairBill is not yet active (still in draft)
        const photosWithBill = await db.run(
            SELECT.from('RentalEquipmentTrackingApp.DamagePhotos').where`repairBill_ID is not null`
        ) || [];
        for (const p of photosWithBill) {
            const activeBill = await db.run(
                SELECT.one.from('RentalEquipmentTrackingApp.RepairBills').where({ ID: p.repairBill_ID })
            );
            if (!activeBill) {
                await db.run(
                    DELETE.from('RentalEquipmentTrackingApp.DamagePhotos').where({ ID: p.ID })
                );
                console.log(`[Startup Cleanup] Cleaned up premature active photo ${p.ID} for draft repair bill ${p.repairBill_ID}`);
            }
        }
        // Ensure equipment with active Repair Bills are marked Damaged
        const activeBills = await db.run(
            SELECT.from('RentalEquipmentTrackingApp.RepairBills').where`billingStatus in ('Draft', 'PendingApproval', 'Approved', 'Adjusted', 'Disputed')`
        ) || [];
        for (const b of activeBills) {
            if (b.equipment_ID) {
                await db.run(
                    UPDATE('RentalEquipmentTrackingApp.Equipment').set({
                        currentStatus: 'Damaged'
                    }).where({ ID: b.equipment_ID })
                );
                console.log(`[Startup Sync] Marked Equipment ${b.equipment_ID} as Damaged for active Repair Bill ${b.invoiceNo || b.ID}`);
            }
        }
    } catch (e) {
        console.warn('[Startup Cleanup Notice]', e.message);
    }
});

export default cds.server;
