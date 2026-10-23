import cds from '@sap/cds';
import { purgeAbandonedDrafts } from '../common/drafts.js';

export default class MaintenanceService extends cds.ApplicationService {
    async init() {
        const { MaintenanceRecords, RepairJobs, Equipment, DamageRecords } = this.entities;
        // status history is not exposed by this service - write it to the database entity
        const { AssetStatusHistory } = cds.entities('RentalEquipmentTrackingApp');

        // Clean up blank or abandoned repair jobs drafts
        this.before('READ', 'RepairJobs', async (req) => {
            if (!req.params?.length && !req.query?.SELECT?.one) {
                await purgeAbandonedDrafts(RepairJobs.drafts, 'equipment_ID is null');
            }
        });

        // Clean up blank or abandoned maintenance records drafts
        this.before('READ', 'MaintenanceRecords', async (req) => {
            if (!req.params?.length && !req.query?.SELECT?.one) {
                await purgeAbandonedDrafts(MaintenanceRecords.drafts, 'equipment_ID is null');
            }
        });

        // Repair finished: damage is repaired and the asset goes back into the rental fleet - unless
        // another repair job on the same asset is still open
        const releaseAfterRepair = async (equipmentId, damageId, jobId) => {
            if (damageId) {
                await cds.db.run(UPDATE(DamageRecords).set({ damageStatus: 'Repaired' }).where({ ID: damageId }));
            }
            if (!equipmentId) return;
            const otherOpenJob = await cds.db.run(
                SELECT.one.from(RepairJobs).columns('ID')
                    .where`equipment_ID = ${equipmentId} and ID != ${jobId} and status in ('Open', 'InProgress')`
            );
            if (otherOpenJob) return;
            const eq = await cds.db.run(SELECT.one.from(Equipment).where({ ID: equipmentId }));
            await cds.db.run(UPDATE(Equipment).set({ currentStatus: 'Available', currentGrade: 'B' }).where({ ID: equipmentId }));
            await cds.db.run(
                INSERT.into(AssetStatusHistory).entries({
                    equipment_ID: equipmentId,
                    oldStatus: eq?.currentStatus || 'InRepair',
                    newStatus: 'Available',
                    reason: 'Workshop Repair Job completed; asset restored to Available'
                })
            );
        };

        // Defaults on new MaintenanceRecords draft
        this.before(['CREATE', 'NEW'], 'MaintenanceRecords.drafts', async (req) => {
            if (!req.data.status) req.data.status = 'Planned';
            if (!req.data.maintenanceType) req.data.maintenanceType = 'Preventive';
            if (!req.data.maintenanceDate) req.data.maintenanceDate = new Date().toISOString().slice(0, 10);
            if (!req.data.serviceProvider) req.data.serviceProvider = 'In-House Fleet Workshop';
        });

        // Defaults on new RepairJobs draft
        this.before(['CREATE', 'NEW'], 'RepairJobs.drafts', async (req) => {
            if (!req.data.status) req.data.status = 'Open';
        });

        // Value help query for DamagedEquipment: ONLY return equipment requiring repair / damaged
        this.on('READ', 'DamagedEquipment', async (req) => {
            // Find any equipment linked to active / unresolved damage records
            let damagedEqIds = new Set();
            try {
                const damageRecs = await cds.db.run(
                    SELECT.from('RentalEquipmentTrackingApp.DamageRecords as D')
                        .join('RentalEquipmentTrackingApp.ConditionLogs as C').on('D.conditionLog_ID = C.ID')
                        .where`D.damageStatus not in ('Repaired', 'Closed') and C.equipment_ID is not null`
                        .columns('C.equipment_ID as eqId')
                );
                for (const d of damageRecs || []) {
                    if (d.eqId) damagedEqIds.add(d.eqId);
                }
            } catch { /* optional lookup - ignore */ }

            const cqn = SELECT.from(Equipment);
            if (req.query.SELECT.columns) cqn.SELECT.columns = req.query.SELECT.columns;
            if (req.query.SELECT.orderBy) cqn.SELECT.orderBy = req.query.SELECT.orderBy;
            if (req.query.SELECT.limit) cqn.SELECT.limit = req.query.SELECT.limit;
            if (req.query.SELECT.count) cqn.SELECT.count = req.query.SELECT.count;
            if (req.query.SELECT.search) cqn.SELECT.search = req.query.SELECT.search;

            const extraIds = Array.from(damagedEqIds);
            if (extraIds.length > 0) {
                if (req.query.SELECT.where) {
                    cqn.where`(currentStatus in ('Damaged', 'InRepair', 'Quarantined') or ID in (${extraIds})) and (${req.query.SELECT.where})`;
                } else {
                    cqn.where`currentStatus in ('Damaged', 'InRepair', 'Quarantined') or ID in (${extraIds})`;
                }
            } else {
                if (req.query.SELECT.where) {
                    cqn.where`currentStatus in ('Damaged', 'InRepair', 'Quarantined') and (${req.query.SELECT.where})`;
                } else {
                    cqn.where({ currentStatus: { in: ['Damaged', 'InRepair', 'Quarantined'] } });
                }
            }

            return await cds.db.run(cqn);
        });

        // When damage record is selected on RepairJobs draft, auto-link its equipment and estimate
        this.before(['UPDATE', 'PATCH'], 'RepairJobs.drafts', async (req) => {
            if (req.data.damage_ID) {
                const damage = await cds.db.run(
                    SELECT.one.from('RentalEquipmentTrackingApp.DamageRecords').where({ ID: req.data.damage_ID })
                );
                if (damage) {
                    if (damage.conditionLog_ID && !req.data.equipment_ID) {
                        const log = await cds.db.run(
                            SELECT.one.from('RentalEquipmentTrackingApp.ConditionLogs').where({ ID: damage.conditionLog_ID })
                        );
                        if (log?.equipment_ID) req.data.equipment_ID = log.equipment_ID;
                    }
                    if (damage.repairEstimate && !req.data.actualCost) {
                        req.data.actualCost = Number(damage.repairEstimate);
                    }
                }
            }
        });

        // remember the status before this save - side effects only run on a status change
        this.before('SAVE', 'RepairJobs', async (req) => {
            if (!req.data.equipment_ID) {
                req.error(400, 'Equipment Asset is mandatory', 'equipment_ID');
            }
            const before = await SELECT.one.from(RepairJobs).columns('status').where({ ID: req.data.ID });
            req._previousStatus = before?.status ?? null;   // null = new repair job
            if (req.data.status === 'Completed' && req._previousStatus !== 'Completed' && !req.data.closedAt) {
                req.data.closedAt = new Date().toISOString();
            }
        });

        // After RepairJobs is saved (from UI or API): update equipment status to InRepair and damageStatus
        this.after('SAVE', 'RepairJobs', async (_, req) => {
            // CAP returns only the keys after CREATE - the activated repair job is in req.data
            const data = req.data;
            const equipmentId = data.equipment_ID;
            const status = data.status || 'Open';
            const wasOpen = ['Open', 'InProgress'].includes(req._previousStatus);

            if (equipmentId) {
                if ((status === 'Open' || status === 'InProgress') && !wasOpen) {
                    const eq = await cds.db.run(SELECT.one.from(Equipment).where({ ID: equipmentId }));
                    await cds.db.run(UPDATE(Equipment).set({ currentStatus: 'InRepair' }).where({ ID: equipmentId }));
                    await cds.db.run(
                        INSERT.into(AssetStatusHistory).entries({
                            equipment_ID: equipmentId,
                            oldStatus: eq?.currentStatus || 'Damaged',
                            newStatus: 'InRepair',
                            reason: `Workshop Repair Job created (${data.technician || 'Technician'})`
                        })
                    );
                    if (data.damage_ID) {
                        await cds.db.run(UPDATE(DamageRecords).set({ damageStatus: 'InRepair' }).where({ ID: data.damage_ID }));
                    }
                } else if (status === 'Completed' && req._previousStatus !== 'Completed') {
                    await releaseAfterRepair(equipmentId, data.damage_ID, data.ID);
                }
            }
        });

        // Action: Create / Dispatch Repair Job from Damage Record
        this.on('createRepairJob', async (req) => {
            const { damageId, technician } = req.data;
            const damage = await SELECT.one.from(DamageRecords).where({ ID: damageId });
            if (!damage) return req.reject(404, `Damage record ${damageId} not found`);
            if (['Repaired', 'Closed'].includes(damage.damageStatus)) {
                return req.reject(409, `Damage is already ${damage.damageStatus}`);
            }
            const openJob = await SELECT.one.from(RepairJobs).columns('ID')
                .where({ damage_ID: damageId, status: { in: ['Open', 'InProgress'] } });
            if (openJob) return req.reject(409, 'There is already an open repair job for this damage');

            // Find equipment from condition log
            const log = await SELECT.one.from('RentalEquipmentTrackingApp.ConditionLogs').where({ ID: damage.conditionLog_ID });
            const equipmentId = log?.equipment_ID;
            if (!equipmentId) return req.reject(400, 'The damage is not linked to an inspected equipment asset');

            const jobId = cds.utils.uuid();
            await INSERT.into(RepairJobs).entries({
                ID: jobId,
                equipment_ID: equipmentId,
                damage_ID: damageId,
                technician: technician || 'Unassigned',
                status: 'InProgress'
            });

            await UPDATE(DamageRecords).set({ damageStatus: 'InRepair' }).where({ ID: damageId });

            if (equipmentId) {
                const eq = await SELECT.one.from(Equipment).where({ ID: equipmentId });
                await UPDATE(Equipment).set({ currentStatus: 'InRepair' }).where({ ID: equipmentId });
                await INSERT.into(AssetStatusHistory).entries({
                    equipment_ID: equipmentId,
                    oldStatus: eq?.currentStatus,
                    newStatus: 'InRepair',
                    reason: `Repair job dispatched to ${technician || 'workshop'}`
                });
            }

            return await SELECT.one.from(RepairJobs).where({ ID: jobId });
        });

        // Action: Complete Repair Job
        this.on('completeRepairJob', async (req) => {
            const { repairJobId, labourHours, actualCost, repairDetails, afterPhotoUrl } = req.data;
            const job = await SELECT.one.from(RepairJobs).where({ ID: repairJobId });
            if (!job) return req.reject(404, `Repair job ${repairJobId} not found`);
            if (job.status === 'Completed') return req.reject(409, 'Repair job is already completed');

            await UPDATE(RepairJobs).set({
                labourHours: labourHours ?? job.labourHours,
                actualCost: actualCost ?? job.actualCost,
                repairDetails: repairDetails ?? job.repairDetails,
                afterPhotoUrl: afterPhotoUrl ?? job.afterPhotoUrl,
                status: 'Completed',
                closedAt: new Date().toISOString()
            }).where({ ID: repairJobId });

            // previously only the damage was set to Repaired - the asset stayed "InRepair" for good
            await releaseAfterRepair(job.equipment_ID, job.damage_ID, job.ID);

            return await SELECT.one.from(RepairJobs).where({ ID: repairJobId });
        });

        // Action: Complete Preventive / Routine Maintenance
        this.on('completeMaintenanceRecord', async (req) => {
            const { recordId, cost, nextServiceDate } = req.data;
            const record = await SELECT.one.from(MaintenanceRecords).where({ ID: recordId });
            if (!record) return req.reject(404, `Maintenance record ${recordId} not found`);
            if (['Completed', 'Cancelled'].includes(record.status)) {
                return req.reject(409, `Maintenance record is already ${record.status}`);
            }

            await UPDATE(MaintenanceRecords).set({
                cost: cost ?? record.cost,
                nextMaintenanceDate: nextServiceDate ?? record.nextMaintenanceDate,
                status: 'Completed'
            }).where({ ID: recordId });

            if (record.equipment_ID && nextServiceDate) {
                await UPDATE(Equipment).set({ nextServiceDate: nextServiceDate }).where({ ID: record.equipment_ID });
            }

            return await SELECT.one.from(MaintenanceRecords).where({ ID: recordId });
        });

        // Action: Release Equipment from Repair/Quarantine back to Available
        this.on('releaseEquipmentToAvailable', async (req) => {
            const { equipmentId, reason } = req.data;
            const eq = await SELECT.one.from(Equipment).where({ ID: equipmentId });
            if (!eq) return req.reject(404, `Equipment ${equipmentId} not found`);
            if (!['Damaged', 'InRepair', 'Quarantined', 'UnderMaintenance', 'ReturnedPendingInspection'].includes(eq.currentStatus)) {
                return req.reject(409, `${eq.equipmentName} is ${eq.currentStatus} - only damaged, quarantined or workshop assets can be released`);
            }
            const openJob = await SELECT.one.from(RepairJobs).columns('ID').where({ equipment_ID: equipmentId, status: { in: ['Open', 'InProgress'] } });
            if (openJob) return req.reject(409, `${eq.equipmentName} still has an open repair job - complete it first`);

            await UPDATE(Equipment).set({
                currentStatus: 'Available',
                currentGrade: 'B' // Reset condition grade after repair
            }).where({ ID: equipmentId });

            await INSERT.into(AssetStatusHistory).entries({
                equipment_ID: equipmentId,
                oldStatus: eq.currentStatus,
                newStatus: 'Available',
                reason: reason || 'Released from workshop after repair and inspection'
            });

            return await SELECT.one.from(Equipment).where({ ID: equipmentId });
        });

        await super.init();
    }
}
