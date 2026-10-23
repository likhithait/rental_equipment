import cds from '@sap/cds';
import { uploadEvidencePhoto, isCloudinaryConfigured, cloudinaryCloudName } from '../common/cloudinary.js';

const ROLES = ['Admin', 'Manager', 'Dispatcher', 'YardWorker', 'Technician', 'BillingClerk', 'Auditor'];
const EVIDENCE_TYPES = ['Return', 'Dispatch', 'DamageEvidence', 'PostRepair'];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export default class LaunchpadService extends cds.ApplicationService {
    async init() {
        const db = await cds.connect.to('db');
        const {
            Equipment, Rentals, RepairBills, RepairJobs, MaintenanceRecords, Customers, Locations,
            ConditionLogs, DamageRecords, DamagePhotos
        } = cds.entities('RentalEquipmentTrackingApp');
        const exists = async (entity, ID) => Boolean(await db.run(SELECT.one.from(entity).columns('ID').where({ ID })));

        // XSUAA JWT of the logged-in user (forwarded by the approuter)
        const tokenPayload = (req) =>
            req.user?.authInfo?.token?.payload ?? req.user?.tokenInfo?.getPayload?.() ?? {};

        this.on('whoAmI', (req) => {
            const attr = req.user.attr || {};
            const payload = tokenPayload(req);
            const name = [attr.givenName ?? payload.given_name, attr.familyName ?? payload.family_name].filter(Boolean).join(' ');
            return {
                user: req.user.id,
                name: name || req.user.id,
                email: attr.email ?? payload.email ?? null,
                roles: ROLES.filter((role) => req.user.is(role))
            };
        });

        this.on('kpis', async () => {
            const count = async (entity, where) => {
                const row = await db.run(SELECT.one.from(entity).columns('count(1) as n').where(where));
                return Number(row?.n ?? 0);
            };
            const pending = await db.run(
                SELECT.one.from(RepairBills).columns('count(1) as n', 'sum(totalAmount) as amount')
                    .where({ billingStatus: { in: ['Draft', 'PendingApproval', 'Adjusted', 'Disputed'] } })
            );
            return {
                availableAssets: await count(Equipment, { currentStatus: 'Available' }),
                rentedAssets: await count(Equipment, { currentStatus: 'RentedOut' }),
                damagedAssets: await count(Equipment, {
                    currentStatus: { in: ['Damaged', 'Quarantined', 'InRepair', 'UnderMaintenance', 'ReturnedPendingInspection'] }
                }),
                activeRentals: await count(Rentals, { rentalStatus: { in: ['Booked', 'Active', 'Overdue'] } }),
                pendingBills: Number(pending?.n ?? 0),
                pendingBillAmount: Number(pending?.amount ?? 0),
                openRepairJobs: await count(RepairJobs, { status: { in: ['Open', 'InProgress'] } }),
                plannedMaintenance: await count(MaintenanceRecords, { status: { in: ['Planned', 'InProgress'] } }),
                customers: await count(Customers, {}),
                locations: await count(Locations, {})
            };
        });

        this.on('cloudinaryStatus', () => ({
            configured: isCloudinaryConfigured(),
            cloudName: cloudinaryCloudName()
        }));

        // Photo evidence (FR-009): upload to Cloudinary, fingerprint with SHA-256 and attach the
        // photo to its parent. While the parent is being edited (draft) the photo goes into the
        // draft so it is activated together with the parent; otherwise it is stored directly.
        this.on('uploadEvidence', async (req) => {
            const { imageBase64, fileName, conditionLog_ID, damage_ID, repairBill_ID, latitude, longitude } = req.data;

            if (!conditionLog_ID && !damage_ID && !repairBill_ID) {
                return req.reject(400, 'The photo must belong to an inspection, a damage record or a repair bill.');
            }
            const mime = String(imageBase64).match(/^data:([^;]+);base64,/)?.[1];
            if (mime && !mime.startsWith('image/')) {
                return req.reject(400, `Only images can be uploaded as evidence (received ${mime}).`);
            }
            const base64 = String(imageBase64).replace(/^data:[^;]+;base64,/, '');
            if (Math.floor(base64.length * 3 / 4) > MAX_PHOTO_BYTES) {
                return req.reject(413, 'The photo is larger than 10 MB.');
            }

            // which parent is edited as a draft (repair bill or inspection) - photos of a damage record are always active
            const draftParent = repairBill_ID
                ? { service: 'BillingService', root: 'RepairBills', ID: repairBill_ID, active: RepairBills }
                : conditionLog_ID
                    ? { service: 'InspectionService', root: 'ConditionLogs', ID: conditionLog_ID, active: ConditionLogs }
                    : null;

            if (conditionLog_ID) {
                const log = await db.run(SELECT.one.from(ConditionLogs).columns('locked').where({ ID: conditionLog_ID }));
                if (log?.locked) return req.reject(403, 'This inspection report is locked and cannot be modified.');
            }

            let draftUUID = null;
            if (draftParent) {
                const draftsEntity = cds.entities(draftParent.service)[draftParent.root].drafts;
                const draft = await db.run(SELECT.one.from(draftsEntity).columns('DraftAdministrativeData_DraftUUID').where({ ID: draftParent.ID }));
                if (draft) {
                    const admin = await db.run(
                        SELECT.one.from('DRAFT.DraftAdministrativeData').columns('InProcessByUser').where({ DraftUUID: draft.DraftAdministrativeData_DraftUUID })
                    );
                    if (admin?.InProcessByUser && admin.InProcessByUser !== req.user.id) {
                        return req.reject(423, `This record is currently being edited by ${admin.InProcessByUser}.`);
                    }
                    draftUUID = draft.DraftAdministrativeData_DraftUUID;
                } else if (!await exists(draftParent.active, draftParent.ID)) {
                    return req.reject(404, `${draftParent.root} ${draftParent.ID} not found`);
                }
            }
            if (damage_ID && !draftUUID && !await exists(DamageRecords, damage_ID)) {
                return req.reject(404, `Damage record ${damage_ID} not found`);
            }

            const photoType = EVIDENCE_TYPES.includes(req.data.photoType)
                ? req.data.photoType
                : repairBill_ID || damage_ID ? 'DamageEvidence' : 'Return';
            const name = fileName || `evidence_${Date.now()}.jpg`;

            const upload = await uploadEvidencePhoto({ imageBase64, fileName: name, folder: 'sap_sprint_evidence' });

            const photo = {
                ID: cds.utils.uuid(),
                conditionLog_ID: conditionLog_ID || null,
                damage_ID: damage_ID || null,
                repairBill_ID: repairBill_ID || null,
                fileName: name,
                photoType,
                mediaType: upload.mimeType,
                mediaUrl: upload.mediaUrl,
                publicId: upload.publicId,
                sha256: upload.sha256,
                latitude: latitude ?? null,
                longitude: longitude ?? null,
                uploadedAt: new Date().toISOString(),
                uploadedBy: req.user.id
            };

            if (draftUUID) {
                const draftPhotos = cds.entities(draftParent.service).DamagePhotos.drafts;
                await db.run(INSERT.into(draftPhotos).entries({
                    ...photo,
                    IsActiveEntity: false,
                    HasActiveEntity: false,
                    HasDraftEntity: false,
                    DraftAdministrativeData_DraftUUID: draftUUID
                }));
            } else {
                await db.run(INSERT.into(DamagePhotos).entries(photo));
            }

            return {
                ID: photo.ID,
                fileName: photo.fileName,
                photoType: photo.photoType,
                mediaUrl: photo.mediaUrl,
                sha256: photo.sha256,
                isCloudinary: upload.isCloudinary,
                isDraft: Boolean(draftUUID)
            };
        });

        await super.init();
    }
}
