using { RentalEquipmentTrackingApp as my } from '../../db/schema';

@path: '/rental'
@requires: ['Dispatcher', 'YardWorker', 'Manager', 'Admin', 'Auditor']
service RentalService {

    @odata.draft.enabled
    @restrict: [
        { grant: ['READ'], to: ['Dispatcher', 'YardWorker', 'Manager', 'Admin', 'Auditor'] },
        { grant: ['*'], to: ['Dispatcher', 'Manager', 'Admin'] }
    ]
    entity Customers as projection on my.Customers;

    @odata.draft.enabled
    @restrict: [
        { grant: ['READ'], to: ['Dispatcher', 'YardWorker', 'Manager', 'Admin', 'Auditor'] },
        { grant: ['*'], to: ['Dispatcher', 'Manager', 'Admin'] }
    ]
    entity Locations as projection on my.Locations {
        *,
        @readonly equipment
    } actions {
        @Common.SideEffects: {
            TargetEntities: [ equipment ]
        }
        action assignEquipment(
            @mandatory
            @title: 'Select Equipment'
            @Common.Label: 'Select Equipment'
            @(Common.ValueList: {
                CollectionPath: 'Equipment',
                Parameters: [
                    { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: equipmentId, ValueListProperty: 'ID' },
                    { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'equipmentNo' },
                    { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'equipmentName' },
                    { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'serialNumber' },
                    { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'currentStatus' }
                ]
            })
            equipmentId: UUID,

            @title: 'Assignment Reason / Notes'
            @Common.Label: 'Assignment Reason / Notes'
            reason: String
        ) returns Locations;
    };

    @odata.draft.enabled
    @cds.redirection.target
    @restrict: [
        { grant: ['READ'], to: ['Dispatcher', 'YardWorker', 'Manager', 'Admin', 'Auditor'] },
        { grant: ['*'], to: ['Dispatcher', 'Manager', 'Admin'] }
    ]
    entity Equipment as projection on my.Equipment;

    @readonly
    @restrict: [
        { grant: ['READ'], to: ['Dispatcher', 'YardWorker', 'Manager', 'Admin', 'Auditor'] }
    ]
    entity AvailableEquipment as projection on my.Equipment {
        ID,
        equipmentNo,
        serialNumber,
        category,
        equipmentName,
        equipmentType,
        manufacturer,
        model,
        rentalRatePerDay,
        currentStatus,
        currentGrade,
        location
    } where currentStatus = 'Available';

    @odata.draft.enabled
    @restrict: [
        { grant: ['READ'], to: ['Dispatcher', 'Manager', 'Admin', 'Auditor'] },
        { grant: ['*'], to: ['Dispatcher', 'Manager', 'Admin'] }
    ]
    entity Rentals as projection on my.Rentals;

    @restrict: [
        { grant: ['READ'], to: ['Dispatcher', 'Manager', 'Admin', 'Auditor'] },
        { grant: ['*'], to: ['Dispatcher', 'Manager', 'Admin'] }
    ]
    entity RentalItems as projection on my.RentalItems;

    @readonly
    @restrict: [
        { grant: ['READ'], to: ['Dispatcher', 'Manager', 'Admin', 'Auditor'] }
    ]
    entity RentalStatusHistory as projection on my.RentalStatusHistory;

    @readonly
    @restrict: [
        { grant: ['READ'], to: ['Dispatcher', 'YardWorker', 'Manager', 'Admin', 'Auditor'] }
    ]
    entity EquipmentTransfers as projection on my.EquipmentTransfers;

    @readonly
    @restrict: [
        { grant: ['READ'], to: ['Dispatcher', 'YardWorker', 'Manager', 'Admin', 'Auditor'] }
    ]
    entity LocationEvents as projection on my.LocationEvents;

    @readonly
    @restrict: [
        { grant: ['READ'], to: ['Dispatcher', 'YardWorker', 'Manager', 'Admin', 'Auditor'] }
    ]
    entity AssetStatusHistory as projection on my.AssetStatusHistory;

    @readonly
    @cds.persistence.skip
    @restrict: [
        { grant: ['READ'], to: ['Dispatcher', 'YardWorker', 'Manager', 'Admin', 'Auditor', 'Technician', 'BillingClerk'] }
    ]
    entity LocationTypes {
        key code : String(50);
        name     : String(100);
    }

    // Actions restricted by role
    @requires: ['Dispatcher', 'Manager', 'Admin']
    action checkOutRental(rentalId: UUID not null) returns Rentals;
    @requires: ['Dispatcher', 'YardWorker', 'Manager', 'Admin']
    action checkInRental(rentalId: UUID not null, actualReturnDate: Date) returns Rentals;
    @requires: ['Dispatcher', 'Manager', 'Admin']
    action cancelRental(rentalId: UUID not null, reason: String) returns Rentals;
    @requires: ['Dispatcher', 'Manager', 'Admin']
    action transferEquipment(equipmentId: UUID not null, toLocationId: UUID not null, reason: String) returns Equipment;
}
