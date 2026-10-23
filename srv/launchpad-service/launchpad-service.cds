using { RentalEquipmentTrackingApp as my } from '../../db/schema';

/**
 * Cross-app endpoints used by the Fiori launchpad (app/index.html) and the
 * photo evidence capture dialog (app/common/evidence-capture.js).
 * Replaces the former unauthenticated Express routes /api/user and /api/upload-evidence.
 */
@path: '/api'
@requires: 'authenticated-user'
@cds.server.body_parser.limit: '15mb' // base64 encoded evidence photos
service LaunchpadService {

    type WhoAmI {
        user   : String;
        name   : String;
        email  : String;
        roles  : array of String;
    }

    type Kpis {
        availableAssets   : Integer;
        rentedAssets      : Integer;
        damagedAssets     : Integer;
        activeRentals     : Integer;
        pendingBills      : Integer;
        pendingBillAmount : Decimal(15,2);
        openRepairJobs    : Integer;
        plannedMaintenance: Integer;
        customers         : Integer;
        locations         : Integer;
    }

    type EvidencePhoto {
        ID          : UUID;
        fileName    : String;
        photoType   : String;
        mediaUrl    : LargeString;
        sha256      : String(64);
        isCloudinary: Boolean;
        isDraft     : Boolean;
    }

    /** logged-in user and the user's application roles (drives the launchpad tiles) */
    function whoAmI() returns WhoAmI;

    /** numbers shown on the launchpad tiles */
    function kpis() returns Kpis;

    /** Cloudinary upload + SHA-256 fingerprint, stored as DamagePhotos row of an inspection, damage or repair bill */
    @requires: ['YardWorker', 'Technician', 'BillingClerk', 'Manager', 'Admin']
    action uploadEvidence(
        imageBase64     : LargeString not null,
        fileName        : String(255),
        photoType       : my.EvidenceType,
        conditionLog_ID : UUID,
        damage_ID       : UUID,
        repairBill_ID   : UUID,
        latitude        : Decimal(9,6),
        longitude       : Decimal(9,6)
    ) returns EvidencePhoto;

    /** Cloudinary configuration check for the capture dialog */
    function cloudinaryStatus() returns { configured: Boolean; cloudName: String };
}
