using { MaintenanceService } from '../../srv/maintenance-service/maintenance-service';

/* ==========================================================================
   4. MAINTENANCE SERVICE - WORKSHOP & REPAIRS (FR-012, FR-013)
   ========================================================================== */

annotate MaintenanceService.RepairJobs with @(
    UI.HeaderInfo: {
        TypeName: 'Workshop Repair Job',
        TypeNamePlural: 'Workshop Repair Jobs',
        Title: { Value: equipment_ID },
        Description: { Value: status }
    },
    UI.SelectionFields: [

        
        status,
        technician,
        equipment_ID
    ],
    UI.LineItem: [
        { Value: equipment.equipmentName, Label: 'Asset' },
        { Value: equipment.serialNumber, Label: 'Serial' },
        { Value: technician, Label: 'Assigned Technician' },
        { Value: labourHours, Label: 'Actual Hours' },
        { Value: actualCost, Label: 'Actual Repair Cost ($)' },
        {
            Value: status,
            Label: 'Status',
            Criticality: (
                status = 'Completed' ? 3 :
                status = 'InProgress' ? 2 : 1
            )
        },
        { Value: repairDetails, Label: 'Work Performed Details' },
        { Value: beforePhotoUrl, Label: 'Before Photo' },
        { Value: afterPhotoUrl, Label: 'After Photo' },
        { Value: closedAt, Label: 'Completed At' }
    ],
    UI.Facets: [
        {
            $Type: 'UI.ReferenceFacet',
            Label: 'Repair Job Specifications',
            Target: '@UI.FieldGroup#RepairDetails'
        }
    ],
    Common.SideEffects #DamageSelected: {
        SourceProperties: [ damage_ID ],
        TargetProperties: [ equipment_ID, actualCost ]
    },
    UI.FieldGroup #RepairDetails: {
        Data: [
            { Value: equipment_ID, Label: 'Equipment Asset' },
            { Value: damage_ID, Label: 'Damage Reference' },
            { Value: technician, Label: 'Lead Technician' },
            { Value: labourHours, Label: 'Labour Hours' },
            { Value: actualCost, Label: 'Material & Labor Cost ($)' },
            { Value: status, Label: 'Job Status' },
            { Value: repairDetails, Label: 'Technician Work Log' },
            { Value: beforePhotoUrl, Label: 'Pre-Repair Photo URL' },
            { Value: afterPhotoUrl, Label: 'Post-Repair Evidence URL' },
            { Value: closedAt, Label: 'Completion Timestamp' }
        ]
    }
);

annotate MaintenanceService.RepairJobs with {
    equipment      @title: 'Equipment Asset'          @Common.Label: 'Equipment Asset'
                   @Common.Text: equipment.equipmentName @Common.TextArrangement: #TextFirst
                   @Common.ValueList: {
                       CollectionPath: 'DamagedEquipment',
                       Parameters: [
                           { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: equipment_ID, ValueListProperty: 'ID' },
                           { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'equipmentName' },
                           { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'serialNumber' },
                           { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'currentStatus' }
                       ]
                   };
    damage         @title: 'Damage Reference'         @Common.Label: 'Damage Reference'
                   @Common.ValueList: {
                       CollectionPath: 'DamageRecords',
                       Parameters: [
                           { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: damage_ID, ValueListProperty: 'ID' },
                           { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'damageType' },
                           { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'area' },
                           { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'severity' }
                       ]
                   };
    technician     @title: 'Lead Technician'          @Common.Label: 'Lead Technician';
    labourHours    @title: 'Labour Hours'             @Common.Label: 'Labour Hours';
    actualCost     @title: 'Material & Labor Cost ($)' @Common.Label: 'Material & Labor Cost ($)';
    status         @title: 'Job Status'               @Common.Label: 'Job Status';
    repairDetails  @title: 'Technician Work Log'      @Common.Label: 'Technician Work Log';
    beforePhotoUrl @title: 'Pre-Repair Photo URL'     @Common.Label: 'Pre-Repair Photo URL';
    afterPhotoUrl  @title: 'Post-Repair Evidence URL' @Common.Label: 'Post-Repair Evidence URL';
    closedAt       @title: 'Completion Timestamp'     @Common.Label: 'Completion Timestamp';
};

annotate MaintenanceService.DamagedEquipment with {
    equipmentName @title: 'Equipment Name'     @Common.Label: 'Equipment Name';
    serialNumber  @title: 'Serial Number'      @Common.Label: 'Serial Number';
    currentStatus @title: 'Operational Status' @Common.Label: 'Operational Status';
    currentGrade  @title: 'Condition Grade'    @Common.Label: 'Condition Grade';
};
