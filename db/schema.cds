using { cuid, managed } from '@sap/cds/common';

namespace RentalEquipmentTrackingApp;

/* ==========================================================================
   CUSTOM DATA TYPES & ENUMERATIONS
   ========================================================================== */

type ConditionGrade : String(1) enum {
    @title: 'Grade A - Excellent / Like New'
    A;
    @title: 'Grade B - Good / Minor Wear'
    B;
    @title: 'Grade C - Fair / Notable Wear'
    C;
    @title: 'Grade D - Poor / Damaged'
    D;
};

type Severity : String(10) enum {
    @title: 'Low'
    Low;
    @title: 'Medium'
    Medium;
    @title: 'High'
    High;
    @title: 'Critical'
    Critical;
};

type InspectionType : String(15) enum {
    @title: 'Check-In (Return from Rent)'
    CheckIn;
    @title: 'Check-Out (Dispatch)'
    CheckOut;
};

// type InspectorName : String(100) enum {
//     @title: 'Ramesh Patel (Senior Yard Inspector)'
//     Ramesh_Patel = 'Ramesh Patel';
//     @title: 'Kavita Reddy (Rental Dispatcher)'
//     Kavita_Reddy = 'Kavita Reddy';
//     @title: 'Mike D''souza (Lead Workshop Technician)'
//     Mike_Dsouza = 'Mike D''souza';
//     @title: 'Vikram Mehta (System Administrator)'
//     Vikram_Mehta = 'Vikram Mehta';
//     @title: 'Sanjay Verma (Operations & Fleet Director)'
//     Sanjay_Verma = 'Sanjay Verma';
//     @title: 'Yard Worker (Yard Staff)'
//     Yard_Worker = 'Yard Worker';
// };

type EquipmentArea : String(50) enum {
    @title: 'Exterior & Bodywork'
    Exterior = 'Exterior';
    @title: 'Chassis & Undercarriage'
    Chassis = 'Chassis';
    @title: 'Engine & Powertrain'
    Engine = 'Engine';
    @title: 'Hydraulic System'
    Hydraulic = 'Hydraulic';
    @title: 'Operator Cabin & Controls'
    Cabin = 'Cabin';
    @title: 'Electrical & Electronics'
    Electrical = 'Electrical';
    @title: 'Tires, Rims & Tracks'
    TiresTracks = 'TiresTracks';
    @title: 'Bucket & Working Attachments'
    Attachments = 'Attachments';
};

type DamageClassification : String(50) enum {
    @title: 'Scratch / Cosmetic Dent'
    ScratchDent = 'ScratchDent';
    @title: 'Structural Crack / Bending'
    StructuralCrack = 'StructuralCrack';
    @title: 'Hydraulic Leak / Pressure Drop'
    HydraulicLeak = 'HydraulicLeak';
    @title: 'Electrical Malfunction'
    ElectricalFault = 'ElectricalFault';
    @title: 'Broken Glass / Mirror'
    BrokenGlass = 'BrokenGlass';
    @title: 'Missing Part / Tool'
    MissingPart = 'MissingPart';
    @title: 'Engine / Mechanical Failure'
    MechanicalFailure = 'MechanicalFailure';
    @title: 'Excessive Wear & Tear'
    ExcessiveWear = 'ExcessiveWear';
};

type EvidenceType : String(50) enum {
    @title: 'Return from Rent Photo'
    Return = 'Return';
    @title: 'Dispatch / Pre-Rental Photo'
    Dispatch = 'Dispatch';
    @title: 'Damage Incident Evidence'
    DamageEvidence = 'DamageEvidence';
    @title: 'Post-Repair Verification'
    PostRepair = 'PostRepair';
};

type EquipmentStatus : String(30) enum {
    Available;
    RentedOut;
    ReturnedPendingInspection;
    Damaged;
    InRepair;
    InTransit;
    UnderMaintenance;
    Quarantined;
    Retired;
};

type RentalStatus : String(15) enum {
    Booked;
    Active;
    Returned;
    Overdue;
    Closed;
    Cancelled;
};

type ItemStatus : String(15) enum {
    Reserved;
    OutOnRent;
    Returned;
};

type LocationType : String(50) enum {
    @title: 'Yard'
    Yard = 'Yard';
    @title: 'Depot'
    Depot = 'Depot';
    @title: 'Workshop'
    Workshop = 'Workshop';
};

type MaintenanceType : String(30) enum {
    @title: 'Preventive Maintenance'
    Preventive;
    @title: 'Corrective Repair'
    Corrective;
    @title: 'Routine Safety Inspection'
    Inspection;
    @title: 'Instrument & Sensor Calibration'
    Calibration;
    @title: 'Major Overhaul / Workshop Job'
    RepairJob;
};

type MaintenanceStatus : String(15) enum {
    @title: 'Planned'
    Planned;
    @title: 'In Progress'
    InProgress;
    @title: 'Completed'
    Completed;
    @title: 'Cancelled'
    Cancelled;
};

type DamageStatus : String(20) enum {
    Reported;
    Confirmed;
    InRepair;
    Repaired;
    Billed;
    Disputed;
    Closed;
};

type BillingStatus : String(20) enum {
    Draft;
    PendingApproval;
    Approved;
    Rejected;
    Adjusted;
    Posted;
    Billed;
    Disputed;
    Failed;
};

type Money : Decimal(12,2);

/* ==========================================================================
   MASTER DATA ENTITIES
   ========================================================================== */

entity Customers : cuid, managed {
    companyName   : String(100) @mandatory @title: 'Customer / Client' @Common.Label: 'Customer / Client';
    contactPerson : String(100) @title: 'Authorized Contact Person' @Common.Label: 'Authorized Contact Person';
    email         : String(100) @mandatory @title: 'Email Address' @Common.Label: 'Email Address';
    phone         : String(20)  @mandatory @title: 'Phone / Mobile No' @Common.Label: 'Phone / Mobile No';
    address       : String(255) @title: 'Office / Yard Address' @Common.Label: 'Office / Yard Address';
    rentals       : Association to many Rentals
                       on rentals.customer = $self;
};

entity Locations : cuid, managed {
    locationName : String(100) @mandatory;
    locationType : LocationType @mandatory;
    plant        : String(10); // Plant code auto-generated
    address      : String(255) @mandatory;
    city         : String(100) @mandatory;
    latitude     : Decimal(9,6) @mandatory;
    longitude    : Decimal(9,6) @mandatory;
    equipment    : Association to many Equipment
                       on equipment.location = $self;
};

entity Equipment : cuid, managed {
    equipmentNo         : String(50) @readonly @title: 'Equipment No' @Common.Label: 'Equipment No';
    serialNumber        : String(100) @readonly @title: 'Serial Number' @Common.Label: 'Serial Number';
    category            : String(50) @title: 'Category' @Common.Label: 'Category';
    equipmentName       : String(100) @mandatory @title: 'Equipment Name' @Common.Label: 'Equipment Name';
    equipmentType       : String(50) @title: 'Equipment Type' @Common.Label: 'Equipment Type';
    manufacturer        : String(100) @title: 'Manufacturer' @Common.Label: 'Manufacturer';
    model               : String(100) @title: 'Model' @Common.Label: 'Model';
    plant               : String(10) @UI.Hidden: true;
    location            : Association to Locations @mandatory @title: 'Depot Location' @Common.Label: 'Depot Location';
    latitude            : Decimal(9,6) @UI.Hidden: true;
    longitude           : Decimal(9,6) @UI.Hidden: true;
    purchaseDate        : Date @title: 'Purchase Date' @Common.Label: 'Purchase Date';
    rentalRatePerDay    : Money @title: 'Daily Rental Rate' @Common.Label: 'Daily Rental Rate';
    currentStatus       : EquipmentStatus default #Available @title: 'Operational Status' @Common.Label: 'Operational Status';
    currentGrade        : ConditionGrade default #A @title: 'Condition Grade' @Common.Label: 'Condition Grade';
    currentMeterReading : Decimal(10,2) @title: 'Meter Reading (Hours)' @Common.Label: 'Meter Reading (Hours)';
    custodian           : String(100) @title: 'Current Custodian' @Common.Label: 'Current Custodian';
    barcode             : String(100) @UI.Hidden: true;
    nextServiceDate     : Date @title: 'Next Service Date' @Common.Label: 'Next Service Date';
    maintenance         : Association to many MaintenanceRecords
                              on maintenance.equipment = $self;
    conditionLogs       : Association to many ConditionLogs
                              on conditionLogs.equipment = $self;
    transfers           : Association to many EquipmentTransfers
                              on transfers.equipment = $self;
    locationEvents      : Association to many LocationEvents
                              on locationEvents.equipment = $self;
    repairJobs          : Association to many RepairJobs
                              on repairJobs.equipment = $self;
    statusHistory       : Association to many AssetStatusHistory
                              on statusHistory.equipment = $self;
};

entity EquipmentTransfers : cuid, managed {
    equipment    : Association to Equipment @mandatory;
    fromLocation : Association to Locations;
    toLocation   : Association to Locations @mandatory;
    transferDate : DateTime @cds.on.insert: $now;
    reason       : String(255);
};

entity LocationEvents : cuid, managed {
    equipment  : Association to Equipment @mandatory;
    latitude   : Decimal(9,6);
    longitude  : Decimal(9,6);
    address    : String(255);
    recordedAt : DateTime @cds.on.insert: $now;
    recordedBy : String(100);
};

entity AssetStatusHistory : cuid {
    equipment : Association to Equipment @mandatory;
    oldStatus : EquipmentStatus;
    newStatus : EquipmentStatus;
    changedAt : Timestamp @cds.on.insert: $now;
    changedBy : String(100) @cds.on.insert: $user;
    reason    : String(255);
};

/* ==========================================================================
   TRANSACTIONAL: RENTALS & CONTRACTS
   ========================================================================== */

entity Rentals : cuid, managed {
    contractNo         : String(50) @mandatory @title: 'Contract Number' @Common.Label: 'Contract Number';
    customer           : Association to Customers @mandatory @title: 'Customer / Client' @Common.Label: 'Customer / Client';
    rentalDate         : Date @mandatory @title: 'Rental Start Date' @Common.Label: 'Rental Start Date';
    expectedReturnDate : Date @mandatory @title: 'Expected Return Date' @Common.Label: 'Expected Return Date';
    actualReturnDate   : Date @title: 'Actual Return Date' @Common.Label: 'Actual Return Date' @UI.Hidden;
    rentalStatus       : RentalStatus default #Booked @title: 'Contract Status' @Common.Label: 'Contract Status';
    totalRentalAmount  : Money @title: 'Total Contract Value ($)' @Common.Label: 'Total Contract Value ($)';
    items              : Composition of many RentalItems
                            on items.rental = $self;
    statusHistory      : Association to many RentalStatusHistory
                            on statusHistory.rental = $self;
    conditionLogs      : Association to many ConditionLogs
                            on conditionLogs.rental = $self;
};

entity RentalItems : cuid, managed {
    rental          : Association to Rentals @mandatory @title: 'Rental Contract' @Common.Label: 'Rental Contract';
    equipment       : Association to Equipment @mandatory @title: 'Equipment Asset' @Common.Label: 'Equipment Asset';
    dailyRentalRate : Money @title: 'Daily Rental Rate ($)' @Common.Label: 'Daily Rental Rate ($)';
    startDate       : Date @title: 'Start Date' @Common.Label: 'Start Date';
    endDate         : Date @title: 'End Date' @Common.Label: 'End Date';
    itemStatus      : ItemStatus default #Reserved @title: 'Item Status' @Common.Label: 'Item Status';
};

entity RentalStatusHistory : cuid {
    rental     : Association to Rentals @mandatory;
    oldStatus  : RentalStatus;
    newStatus  : RentalStatus;
    changedAt  : Timestamp @cds.on.insert: $now;
    changedBy  : String(100) @cds.on.insert: $user;
};

/* ==========================================================================
   TRANSACTIONAL: INSPECTIONS & CONDITION LOGGING
   ========================================================================== */

entity ConditionLogs : cuid, managed {
    equipment        : Association to Equipment @mandatory @title: 'Equipment Asset' @Common.Label: 'Equipment Asset';
    rental           : Association to Rentals @title: 'Rental Contract' @Common.Label: 'Rental Contract';
    inspectionDate   : DateTime @mandatory @title: 'Date & Time' @Common.Label: 'Date & Time';
    inspectionType   : InspectionType @mandatory @title: 'Inspection Type' @Common.Label: 'Inspection Type';
    conditionGrade   : ConditionGrade @mandatory @title: 'Condition Grade' @Common.Label: 'Condition Grade';
    suggestedGrade   : ConditionGrade @title: 'Suggested Grade' @Common.Label: 'Suggested Grade';
    inspectionStatus : String(20) default 'Draft' @title: 'Review State' @Common.Label: 'Review State';
    inspector        : String(50) @title: 'Inspector Name' @Common.Label: 'Inspector Name';
    meterReading     : Decimal(10,2) @title: 'Meter Reading (Hours)' @Common.Label: 'Meter Reading (Hours)';
    checklistJson    : LargeString; // Structured inspection checklist items
    notes            : String(500) @title: 'Inspection Notes' @Common.Label: 'Inspection Notes';
    customerAck      : Boolean default false @title: 'Customer Acknowledged' @Common.Label: 'Customer Acknowledged';
    signatureUrl     : String(500) @title: 'Digital Signature Ref' @Common.Label: 'Digital Signature Ref';
    locked           : Boolean default false @title: 'Report Locked (Immutable)' @Common.Label: 'Report Locked (Immutable)';
    damages          : Association to many DamageRecords
                           on damages.conditionLog = $self;
    photos           : Composition of many DamagePhotos
                           on photos.conditionLog = $self;
};

entity DamageRecords : cuid, managed {
    conditionLog   : Association to ConditionLogs @title: 'Inspection Reference' @Common.Label: 'Inspection Reference';
    area           : EquipmentArea @title: 'Equipment Area' @Common.Label: 'Equipment Area';
    damageType     : DamageClassification @mandatory @title: 'Damage Type' @Common.Label: 'Damage Type';
    description    : String(500) @title: 'Damage Description' @Common.Label: 'Damage Description';
    severity       : Severity @mandatory @title: 'Severity' @Common.Label: 'Severity';
    origin         : String(20) @title: 'Origin (New/Pre-existing)' @Common.Label: 'Origin (New/Pre-existing)';
    billable       : Boolean @title: 'Billable' @Common.Label: 'Billable';
    repairEstimate : Money @title: 'Estimated Repair ($)' @Common.Label: 'Estimated Repair ($)';
    customerLiable : Boolean default false @title: 'Customer Liable' @Common.Label: 'Customer Liable';
    liableParty    : Association to Customers;
    preExisting    : Boolean default false;
    damageStatus   : DamageStatus @title: 'Damage Status' @Common.Label: 'Damage Status';
    photos         : Composition of many DamagePhotos
                        on photos.damage = $self;
    repairBills    : Association to many RepairBills
                        on repairBills.damage = $self;
};

entity DamagePhotos : cuid {
    repairBill   : Association to RepairBills;
    damage       : Association to DamageRecords;
    conditionLog : Association to ConditionLogs;
    fileName     : String(255) @title: 'Photo Filename' @Common.Label: 'Photo Filename';
    photoType    : EvidenceType default #Return @title: 'Evidence Type' @Common.Label: 'Evidence Type';
    mediaType    : String(100) @Core.IsMediaType;
    content      : LargeBinary @Core.MediaType: mediaType;
    mediaUrl     : String(500) @Core.IsURL;
    publicId     : String(255);
    sha256       : String(64); // Integrity verification
    latitude     : Decimal(9,6);
    longitude    : Decimal(9,6);
    uploadedAt   : Timestamp @cds.on.insert: $now;
    uploadedBy   : String(100) @cds.on.insert: $user;
};

/* ==========================================================================
   MAINTENANCE & WORKSHOP
   ========================================================================== */

entity MaintenanceRecords : cuid, managed {
    equipment           : Association to Equipment @mandatory @title: 'Equipment Asset' @Common.Label: 'Equipment Asset';
    maintenanceType     : MaintenanceType @mandatory @title: 'Maintenance Type' @Common.Label: 'Maintenance Type';
    maintenanceDate     : Date @title: 'Maintenance Date' @Common.Label: 'Maintenance Date';
    description         : String(500) @title: 'Scope of Work / Description' @Common.Label: 'Scope of Work / Description';
    serviceProvider     : String(150) @title: 'Service Provider / Workshop' @Common.Label: 'Service Provider / Workshop';
    cost                : Money @title: 'Estimated Service Cost ($)' @Common.Label: 'Estimated Service Cost ($)';
    nextMaintenanceDate : Date @title: 'Next Service Due Date' @Common.Label: 'Next Service Due Date';
    status              : MaintenanceStatus default #Planned @title: 'Maintenance Status' @Common.Label: 'Maintenance Status';
};

entity RepairJobs : cuid, managed {
    equipment        : Association to Equipment @mandatory @title: 'Equipment Asset' @Common.Label: 'Equipment Asset';
    damage           : Association to DamageRecords @title: 'Damage Reference' @Common.Label: 'Damage Reference';
    technician       : String(100) @title: 'Lead Technician' @Common.Label: 'Lead Technician';
    labourHours      : Decimal(5,2) @title: 'Labour Hours' @Common.Label: 'Labour Hours';
    actualCost       : Money @title: 'Material & Labor Cost ($)' @Common.Label: 'Material & Labor Cost ($)';
    repairDetails    : String(500) @title: 'Technician Work Log' @Common.Label: 'Technician Work Log';
    status           : String(20) default 'Open' @title: 'Job Status' @Common.Label: 'Job Status';
    beforePhotoUrl   : String(500) @title: 'Pre-Repair Photo URL' @Common.Label: 'Pre-Repair Photo URL';
    afterPhotoUrl    : String(500) @title: 'Post-Repair Evidence URL' @Common.Label: 'Post-Repair Evidence URL';
    closedAt         : DateTime @title: 'Completion Timestamp' @Common.Label: 'Completion Timestamp';
};

/* ==========================================================================
   FINANCIAL: REPAIR BILLING & PRICING RULES
   ========================================================================== */

entity RepairBills : cuid, managed {
    rental            : Association to Rentals @mandatory @title: 'Rental Contract' @Common.Label: 'Rental Contract';
    customer          : Association to Customers @mandatory @title: 'Customer / Client' @Common.Label: 'Customer / Client';
    equipment         : Association to Equipment @title: 'Damaged Equipment' @Common.Label: 'Damaged Equipment';
    damageDescription : String(500) @title: 'Damage Description' @Common.Label: 'Damage Description';
    severity          : Severity @title: 'Severity' @Common.Label: 'Severity';
    damageType        : String(50) @title: 'Damage Classification' @Common.Label: 'Damage Classification';
    area              : String(100) @title: 'Area / Component' @Common.Label: 'Area / Component';
    origin            : String(50) @title: 'Origin' @Common.Label: 'Origin';
    inspectionRef     : String(100) @title: 'Inspection Reference' @Common.Label: 'Inspection Reference';
    damage            : Association to DamageRecords @title: 'Damage Record Reference' @Common.Label: 'Damage Record Reference';
    photos            : Composition of many DamagePhotos on photos.repairBill = $self;
    billDate         : Date @title: 'Bill Date' @Common.Label: 'Bill Date';
    partsCost        : Money @title: 'Parts Cost ($)' @Common.Label: 'Parts Cost ($)';
    labourCost       : Money @title: 'Labour Cost ($)' @Common.Label: 'Labour Cost ($)';
    paintingCost     : Money @title: 'Painting Cost ($)' @Common.Label: 'Painting Cost ($)';
    repairAmount     : Money @title: 'Net Repair Amount ($)' @Common.Label: 'Net Repair Amount ($)';
    taxAmount        : Money @title: 'Tax Amount ($)' @Common.Label: 'Tax Amount ($)';
    totalAmount      : Money @title: 'Total Invoice Amount ($)' @Common.Label: 'Total Invoice Amount ($)';
    billingStatus    : BillingStatus default #Draft @title: 'Approval Status' @Common.Label: 'Approval Status';
    approvalReason   : String(255) @title: 'Approval Notes' @Common.Label: 'Approval Notes';
    invoiceNo        : String(50) @title: 'Invoice Number' @Common.Label: 'Invoice Number';
};

entity PricingRules : cuid, managed {
    damageType       : String(50) @mandatory @title: 'Damage Category' @Common.Label: 'Damage Category';
    severity         : Severity @mandatory @title: 'Severity Level' @Common.Label: 'Severity Level';
    baseCharge       : Money @mandatory @title: 'Base Diagnostic Fee ($)' @Common.Label: 'Base Diagnostic Fee ($)';
    partsCharge      : Money @title: 'Standard Parts ($)' @Common.Label: 'Standard Parts ($)';
    labourRate       : Decimal(10,2) @title: 'Labour Rate ($/hr)' @Common.Label: 'Labour Rate ($/hr)';
    paintingCharge   : Money @title: 'Painting Surcharge ($)' @Common.Label: 'Painting Surcharge ($)';
    taxPercent       : Decimal(5,2) @title: 'Tax Percentage (%)' @Common.Label: 'Tax Percentage (%)';
    autoApproveLimit : Money @title: 'Auto-Approve Threshold ($)' @Common.Label: 'Auto-Approve Threshold ($)';
};

/* ==========================================================================
   INTEGRATION & OUTBOX MONITORING
   ========================================================================== */

entity IntegrationMessages : cuid, managed {
    messageType     : String(100) @mandatory; // e.g. Damage Billing Request
    reference       : String(100) @mandatory; // e.g. RENT-10001
    targetSystem    : String(50) default 'SAP S/4HANA';
    status          : String(20) default 'Pending'; // Success, Pending, Failed
    billingDocument : String(50);             // e.g. 9000123456
    payload         : LargeString;
    errorMessage    : String(500);
    retryCount      : Integer default 0;
    lastAttemptAt   : Timestamp;
};

