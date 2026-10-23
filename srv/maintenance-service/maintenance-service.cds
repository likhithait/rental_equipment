using { RentalEquipmentTrackingApp as my } from '../../db/schema';

@path: '/maintenance'
@requires: ['Technician', 'Dispatcher', 'Manager', 'Admin', 'Auditor']
service MaintenanceService {

    @odata.draft.enabled
    @restrict: [
        { grant: ['READ'], to: ['Technician', 'Dispatcher', 'Manager', 'Admin', 'Auditor'] },
        { grant: ['*'], to: ['Technician', 'Manager', 'Admin'] }
    ]
    entity MaintenanceRecords as projection on my.MaintenanceRecords;

    @odata.draft.enabled
    @restrict: [
        { grant: ['READ'], to: ['Technician', 'Dispatcher', 'Manager', 'Admin', 'Auditor'] },
        { grant: ['*'], to: ['Technician', 'Manager', 'Admin'] }
    ]
    entity RepairJobs as projection on my.RepairJobs;

    @readonly
    @cds.redirection.target
    @restrict: [
        { grant: ['READ'], to: ['Technician', 'Dispatcher', 'Manager', 'Admin', 'Auditor'] }
    ]
    entity Equipment as projection on my.Equipment;

    @readonly
    @restrict: [
        { grant: ['READ'], to: ['Technician', 'Dispatcher', 'Manager', 'Admin', 'Auditor'] }
    ]
    entity DamagedEquipment as projection on my.Equipment {
        key ID,
        equipmentNo,
        serialNumber,
        category,
        equipmentName,
        currentStatus,
        currentGrade
    } where currentStatus in ('Damaged', 'InRepair', 'Quarantined');

    @readonly
    @restrict: [
        { grant: ['READ'], to: ['Technician', 'Dispatcher', 'Manager', 'Admin', 'Auditor'] }
    ]
    entity DamageRecords as projection on my.DamageRecords;

    // Actions for Workshop & Technician Operations
    @requires: ['Technician', 'Manager', 'Admin']
    action createRepairJob(damageId: UUID not null, technician: String) returns RepairJobs;
    @requires: ['Technician', 'Manager', 'Admin']
    action completeRepairJob(repairJobId: UUID not null, labourHours: Decimal(5,2), actualCost: Decimal(12,2), repairDetails: String, afterPhotoUrl: String) returns RepairJobs;
    @requires: ['Technician', 'Manager', 'Admin']
    action completeMaintenanceRecord(recordId: UUID not null, cost: Decimal(12,2), nextServiceDate: Date) returns MaintenanceRecords;
    @requires: ['Technician', 'Manager', 'Admin']
    action releaseEquipmentToAvailable(equipmentId: UUID not null, reason: String) returns Equipment;
}
