using { RentalEquipmentTrackingApp as my } from '../../db/schema';

@path: '/inspection'
@requires: ['YardWorker', 'Technician', 'Dispatcher', 'Manager', 'Admin', 'Auditor']
service InspectionService {

    @odata.draft.enabled
    @restrict: [
        { grant: ['READ'], to: ['YardWorker', 'Technician', 'Dispatcher', 'Manager', 'Admin', 'Auditor'] },
        { grant: ['*'], to: ['YardWorker', 'Manager', 'Admin'] }
    ]
    entity ConditionLogs as projection on my.ConditionLogs;

    // @odata.draft.enabled
    @restrict: [
        { grant: ['READ'], to: ['YardWorker', 'Technician', 'Dispatcher', 'Manager', 'Admin', 'Auditor'] },
        { grant: ['*'], to: ['YardWorker', 'Technician', 'Manager', 'Admin'] }
    ]
    entity DamageRecords as projection on my.DamageRecords;


    @restrict: [
        { grant: ['READ'], to: ['YardWorker', 'Technician', 'Dispatcher', 'Manager', 'Admin', 'Auditor'] },
        { grant: ['*'], to: ['YardWorker', 'Technician', 'Manager', 'Admin'] }
    ]
    entity DamagePhotos as projection on my.DamagePhotos;

    @readonly
    @cds.redirection.target
    @restrict: [
        { grant: ['READ'], to: ['YardWorker', 'Technician', 'Dispatcher', 'Manager', 'Admin', 'Auditor'] }
    ]
    entity Equipment as projection on my.Equipment;

    @readonly
    @restrict: [
        { grant: ['READ'], to: ['YardWorker', 'Technician', 'Dispatcher', 'Manager', 'Admin', 'Auditor'] }
    ]
    entity RentedEquipment as projection on my.Equipment {
        key ID,
        equipmentNo,
        serialNumber,
        category,
        equipmentName,
        currentStatus,
        currentGrade
    };

    @readonly
    @restrict: [
        { grant: ['READ'], to: ['YardWorker', 'Technician', 'Dispatcher', 'Manager', 'Admin', 'Auditor'] }
    ]
    entity ContractEquipment {
        key ID           : UUID;
        rental_ID        : UUID;
        equipment_ID     : UUID;
        equipmentNo      : String(50);
        equipmentName    : String(100);
        serialNumber     : String(100);
        currentStatus    : String(50);
        currentGrade     : String(5);
    };

    @readonly
    @restrict: [
        { grant: ['READ'], to: ['YardWorker', 'Technician', 'Dispatcher', 'Manager', 'Admin', 'Auditor'] }
    ]
    entity Rentals as projection on my.Rentals;

    @readonly
    entity InspectionTypes {
        key code : String(15);
        name : String(50);
    }

    @readonly
    entity Inspectors {
        key code : String(100);
        name : String(100);
    }

    // Actions for Yard Worker / Inspector Workflow
    action submitInspection(conditionLogId: UUID) returns ConditionLogs;
    action lockInspection(conditionLogId: UUID) returns ConditionLogs;
    action acknowledgeInspection(conditionLogId: UUID, signatureUrl: String) returns ConditionLogs;
}
