using { InspectionService } from '../../srv/inspection-service/inspection-service';

/* ==========================================================================
   9. INSPECTION SERVICE - CONDITION LOGS & INSPECTIONS (FR-005, FR-006)
   ========================================================================== */

annotate InspectionService.ContractEquipment with @(
    UI.LineItem: [
        { Value: equipmentName, Label: 'Equipment Name' },
        { Value: equipmentNo, Label: 'Asset ID' },
        { Value: serialNumber, Label: 'Serial Number' },
        { Value: currentStatus, Label: 'Status' },
        { Value: currentGrade, Label: 'Grade' }
    ]
);

annotate InspectionService.ConditionLogs with @(
    UI.HeaderInfo: {
        TypeName: 'Inspection Log',
        TypeNamePlural: 'Condition Logs & Inspections',
        Title: { Value: inspectionType },
        Description: { Value: inspectionDate }
    },
    UI.SelectionFields: [
        inspectionType,
        conditionGrade,
        inspectionDate,
        inspector,
        locked
    ],
    UI.LineItem: [
        { Value: equipment.equipmentName, Label: 'Equipment Asset' },
        { Value: equipment.serialNumber, Label: 'Serial No' },
        { Value: rental.contractNo, Label: 'Contract No' },
        { Value: inspectionType, Label: 'Type (Check-Out/In)' },
        { Value: inspectionDate, Label: 'Inspection Date' },
        {
            Value: conditionGrade,
            Label: 'Grade',
            Criticality: (
                conditionGrade = 'A' ? 3 :
                conditionGrade = 'B' ? 2 :
                conditionGrade = 'C' ? 2 : 1
            )
        },
        { Value: meterReading, Label: 'Meter Hours' },
        { Value: inspector, Label: 'Inspector' },
        { Value: customerAck, Label: 'Customer Signed' },
        { Value: locked, Label: 'Locked' }
    ],
    UI.Facets: [
        {
            $Type: 'UI.ReferenceFacet',
            Label: 'Inspection Findings',
            Target: '@UI.FieldGroup#InspectionFindings'
        },
        {
            $Type: 'UI.ReferenceFacet',
            Label: 'Photographic Evidence & Hashes',
            Target: 'photos/@UI.LineItem'
        }
    ],
    Common.SideEffects #RentalChange: {
        SourceProperties: [ rental_ID ],
        TargetProperties: [ equipment_ID, inspectionType ]
    },
    Common.SideEffects #EquipmentChange: {
        SourceProperties: [ equipment_ID ],
        TargetProperties: [ inspectionType ]
    },
    UI.FieldGroup #InspectionFindings: {
        Data: [
            { Value: rental_ID, Label: 'Rental Contract' },
            { Value: equipment_ID, Label: 'Equipment Asset' },
            { Value: inspectionType, Label: 'Inspection Type' },
            { Value: inspectionDate, Label: 'Date & Time' },
            { Value: conditionGrade, Label: 'Condition Grade' },
            { Value: meterReading, Label: 'Meter Reading (Hours)' },
            { Value: inspector, Label: 'Inspector Name' },
            { Value: notes, Label: 'Inspection Notes' },
            { Value: customerAck, Label: 'Customer Acknowledged' },
            { Value: signatureUrl, Label: 'Digital Signature Ref' },
            { Value: locked, Label: 'Report Locked (Immutable)' }
        ]
    }
);

annotate InspectionService.ConditionLogs with {
    equipment        @title: 'Equipment Asset'       @Common.Label: 'Equipment Asset'
                     @Common.Text: equipment.equipmentName @Common.TextArrangement: #TextFirst
                     @Common.ValueList: {
                         CollectionPath: 'ContractEquipment',
                         Parameters: [
                             { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: equipment_ID, ValueListProperty: 'equipment_ID' },
                             { $Type: 'Common.ValueListParameterIn',    LocalDataProperty: rental_ID,    ValueListProperty: 'rental_ID' },
                             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'equipmentName' },
                             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'equipmentNo' },
                             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'serialNumber' },
                             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'currentStatus' }
                         ]
                     };
    rental           @title: 'Rental Contract'       @Common.Label: 'Rental Contract'
                     @Common.Text: rental.contractNo @Common.TextArrangement: #TextFirst
                     @Common.ValueList: {
                         CollectionPath: 'Rentals',
                         Parameters: [
                             { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: rental_ID, ValueListProperty: 'ID' },
                             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'contractNo' },
                             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'rentalStatus' }
                         ]
                     };
    inspectionDate   @title: 'Date & Time'           @Common.Label: 'Date & Time';
    inspectionType   @title: 'Inspection Type'       @Common.Label: 'Inspection Type'
                     @Common.ValueListWithFixedValues: true
                     @Common.ValueList: {
                         CollectionPath: 'InspectionTypes',
                         Parameters: [
                             { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: inspectionType, ValueListProperty: 'code' },
                             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
                         ]
                     };
    conditionGrade   @title: 'Condition Grade'       @Common.Label: 'Condition Grade' @Common.ValueListWithFixedValues: true;
    suggestedGrade   @title: 'Suggested Grade'       @Common.Label: 'Suggested Grade';
    inspectionStatus @title: 'Review State'          @Common.Label: 'Review State';
    inspector        @title: 'Inspector Name'        @Common.Label: 'Inspector Name'
                     @Common.ValueListWithFixedValues: true
                     @Common.ValueList: {
                         CollectionPath: 'Inspectors',
                         Parameters: [
                             { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: inspector, ValueListProperty: 'code' },
                             { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
                         ]
                     };
    meterReading     @title: 'Meter Reading (Hours)' @Common.Label: 'Meter Reading (Hours)';
    notes            @title: 'Inspection Notes'      @Common.Label: 'Inspection Notes';
    customerAck      @title: 'Customer Acknowledged' @Common.Label: 'Customer Acknowledged';
    signatureUrl     @title: 'Digital Signature Ref' @Common.Label: 'Digital Signature Ref';
    locked           @title: 'Report Locked (Immutable)' @Common.Label: 'Report Locked (Immutable)';
};

/* ==========================================================================
   10. INSPECTION SERVICE - DAMAGE RECORDS & DAMAGE MANAGEMENT (FR-007)
   ========================================================================== */

annotate InspectionService.DamageRecords with @(
    UI.HeaderInfo: {
        TypeName: 'Damage Incident',
        TypeNamePlural: 'Damage Incidents & Records',
        Title: { Value: damageType },
        Description: { Value: area }
    },
    UI.SelectionFields: [
        damageType,
        area,
        severity,
        origin,
        damageStatus,
        billable,
        customerLiable
    ],
    UI.LineItem: [
        { Value: damageType, Label: 'Damage Type' },
        { Value: area, Label: 'Equipment Area' },
        {
            Value: severity,
            Label: 'Severity',
            Criticality: (
                severity = 'Low' ? 3 :
                severity = 'Medium' ? 2 : 1
            )
        },
        { Value: origin, Label: 'Origin (New/Pre-existing)' },
        { Value: repairEstimate, Label: 'Estimated Repair ($)' },
        { Value: billable, Label: 'Billable' },
        { Value: customerLiable, Label: 'Customer Liable' },
        {
            Value: damageStatus,
            Label: 'Damage Status',
            Criticality: (
                damageStatus = 'Repaired' ? 3 :
                damageStatus = 'Billed' ? 3 :
                damageStatus = 'InRepair' ? 2 : 1
            )
        }
    ],
    UI.Facets: [
        {
            $Type: 'UI.ReferenceFacet',
            Label: 'Damage Particulars',
            Target: '@UI.FieldGroup#DamageInfo'
        },
        {
            $Type: 'UI.ReferenceFacet',
            Label: 'Photo Evidence',
            Target: 'photos/@UI.LineItem'
        }
    ],
    UI.FieldGroup #DamageInfo: {
        Data: [
            { Value: conditionLog_ID, Label: 'Inspection Reference' },
            { Value: damageType, Label: 'Damage Classification' },
            { Value: area, Label: 'Area / Component' },
            { Value: severity, Label: 'Severity' },
            { Value: description, Label: 'Damage Description' },
            { Value: origin, Label: 'Origin' },
            { Value: repairEstimate, Label: 'Estimated Repair Cost ($)' },
            { Value: billable, Label: 'Billable to Customer' },
            { Value: customerLiable, Label: 'Customer Liable' },
            { Value: damageStatus, Label: 'Current Status' }
        ]
    }
);

annotate InspectionService.DamageRecords with {
    conditionLog   @title: 'Inspection Reference'   @Common.Label: 'Inspection Reference' @Common.ValueList: {
        CollectionPath: 'ConditionLogs',
        Parameters: [
            { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: conditionLog_ID, ValueListProperty: 'ID' },
            { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'inspectionType' },
            { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'conditionGrade' }
        ]
    };
    damageType     @title: 'Damage Type'            @Common.Label: 'Damage Type' @Common.ValueListWithFixedValues: true;
    area           @title: 'Equipment Area'         @Common.Label: 'Equipment Area' @Common.ValueListWithFixedValues: true;
    severity       @title: 'Severity'               @Common.Label: 'Severity' @Common.ValueListWithFixedValues: true;
    damageStatus   @title: 'Damage Status'          @Common.Label: 'Damage Status' @Common.ValueListWithFixedValues: true;
    repairEstimate @title: 'Estimated Repair ($)'   @Common.Label: 'Estimated Repair ($)';
    description    @title: 'Damage Description'     @Common.Label: 'Damage Description';
};

/* ==========================================================================
   11. DAMAGE PHOTOS - EVIDENCE GALLERY WITH INTEGRITY HASH (FR-009)
   ========================================================================== */

annotate InspectionService.DamagePhotos with @(
    // photos are only added through the "Capture Photo" action (Cloudinary upload + SHA-256 seal)
    // and must not be edited afterwards, otherwise the integrity hash would be meaningless
    Capabilities: {
        InsertRestrictions: { Insertable: false },
        DeleteRestrictions: { Deletable: true },
        UpdateRestrictions: { Updatable: false }
    },
    UI.LineItem: [
        { Value: mediaUrl, Label: 'Photo Preview' },
        { Value: fileName, Label: 'Photo Filename' },
        { Value: photoType, Label: 'Evidence Type' },
        { Value: sha256, Label: 'SHA-256 Tamper Hash' },
        { Value: latitude, Label: 'GPS Lat' },
        { Value: longitude, Label: 'GPS Long' },
        { Value: uploadedAt, Label: 'Captured On' },
        { Value: uploadedBy, Label: 'Captured By' }
    ]
);

annotate InspectionService.DamagePhotos with {
    fileName  @title: 'Photo Filename' @Common.Label: 'Photo Filename';
    photoType @title: 'Evidence Type'  @Common.Label: 'Evidence Type' @Common.ValueListWithFixedValues: true;
    mediaUrl  @title: 'Photo Preview / URL' @Common.Label: 'Photo Preview / URL' @UI.IsImageURL: true;
    sha256    @title: 'SHA-256 Tamper Hash' @Common.Label: 'SHA-256 Tamper Hash';
};
