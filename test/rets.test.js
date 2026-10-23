import cds from '@sap/cds';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { GET, POST, PATCH, DELETE } = cds.test(import.meta.dirname + '/..');

// test logins (package.json -> cds.requires.[test].auth); in BTP the login comes from XSUAA
const as = (user) => ({ auth: { username: user, password: user } });
const ADMIN = as('admin');
const MANAGER = as('manager');
const DISPATCHER = as('dispatcher');
const INSPECTOR = as('inspector');     // YardWorker
const TECHNICIAN = as('technician');
const BILLING = as('billing');         // BillingClerk
const AUDITOR = as('auditor');

// seed data keys (db/data)
const CUSTOMER1 = '20000000-0000-0000-0000-000000000001';
const EQ_CAT320 = '30000000-0000-0000-0000-000000000001';    // Available
const EQ_KOMATSU = '30000000-0000-0000-0000-000000000002';   // RentedOut on RC-2026-0901
const EQ_GENERATOR = '30000000-0000-0000-0000-000000000006'; // Available
const EQ_PLATE = '30000000-0000-0000-0000-000000000007';     // UnderMaintenance
const LOC_WORKSHOP = '10000000-0000-0000-0000-000000000004';
const LOC_DELHI = '10000000-0000-0000-0000-000000000003';
const LOG_RETURN = '50000000-0000-0000-0000-000000000002';   // check-in of RENT-10001 (locked)
const DAMAGE_HOSE = '60000000-0000-0000-0000-000000000002';  // not billed yet
const BILL_POSTED = '80000000-0000-0000-0000-000000000001';

// expects the request to fail with the given status
async function fails(request, status) {
    try { await request; } catch (err) { return assert.equal(err.response?.status, status, err.message); }
    assert.fail(`expected HTTP ${status}`);
}

const active = (path, entity, ID) => `${path}/${entity}(ID=${ID},IsActiveEntity=true)`;
const draft = (path, entity, ID) => `${path}/${entity}(ID=${ID},IsActiveEntity=false)`;
const activate = (path, entity, ID, user) => POST(`${draft(path, entity, ID)}/${service(path)}.draftActivate`, {}, user);
const edit = (path, entity, ID, user) => POST(`${active(path, entity, ID)}/${service(path)}.draftEdit`, { PreserveChanges: true }, user);
const service = (path) => ({ '/rental': 'RentalService', '/inspection': 'InspectionService', '/billing': 'BillingService', '/maintenance': 'MaintenanceService' })[path];

const equipment = async (ID) => (await GET(active('/rental', 'Equipment', ID), ADMIN)).data;
const history = async (ID) => (await GET(`/rental/AssetStatusHistory?$filter=equipment_ID eq ${ID}`, ADMIN)).data.value;

// a 1x1 PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const PNG_SHA256 = crypto.createHash('sha256').update(Buffer.from(PNG, 'base64')).digest('hex');

// creates and activates a rental contract with the given equipment
async function createContract(equipmentIds) {
    const { data: rental } = await POST('/rental/Rentals', {
        customer_ID: CUSTOMER1, rentalDate: '2026-11-10', expectedReturnDate: '2026-11-20'
    }, DISPATCHER);
    for (const equipment_ID of equipmentIds) {
        await POST(`${draft('/rental', 'Rentals', rental.ID)}/items`, { equipment_ID }, DISPATCHER);
    }
    return (await activate('/rental', 'Rentals', rental.ID, DISPATCHER)).data;
}

// creates and activates a condition log (inspection)
async function inspect(rental_ID, equipment_ID, inspectionType, conditionGrade = 'A') {
    const { data: log } = await POST('/inspection/ConditionLogs', {}, INSPECTOR);
    await PATCH(draft('/inspection', 'ConditionLogs', log.ID), { rental_ID, equipment_ID }, INSPECTOR);
    await PATCH(draft('/inspection', 'ConditionLogs', log.ID), { inspectionType, conditionGrade }, INSPECTOR);
    return (await activate('/inspection', 'ConditionLogs', log.ID, INSPECTOR)).data;
}

describe('Login and roles', () => {

    it('rejects anonymous requests', async () => {
        await fails(GET('/rental/Equipment'), 401);
        await fails(GET('/api/whoAmI()'), 401);
    });

    it('returns the application roles of the user for the launchpad', async () => {
        const { data } = await GET('/api/whoAmI()', INSPECTOR);
        assert.equal(data.user, 'inspector');
        assert.deepEqual(data.roles, ['YardWorker']);
    });

    it('returns the KPI numbers for the launchpad tiles', async () => {
        const { data } = await GET('/api/kpis()', DISPATCHER);
        assert.equal(data.availableAssets, 2);
        assert.equal(data.rentedAssets, 1);
        assert.equal(data.customers, 4);
    });

    it('does not let a technician approve repair bills', async () => {
        await fails(POST('/billing/approveRepairBill', { billId: BILL_POSTED, approvalReason: 'x' }, TECHNICIAN), 403);
    });

    it('does not let an auditor post invoices or cancel contracts', async () => {
        await fails(POST('/billing/postInvoice', { billId: BILL_POSTED }, AUDITOR), 403);
        await fails(POST('/rental/cancelRental', { rentalId: '40000000-0000-0000-0000-000000000002' }, AUDITOR), 403);
    });
});

describe('Rental contracts', () => {
    let contract;

    it('allocates equipment of a new contract and rents it out', async () => {
        contract = await createContract([EQ_GENERATOR]);
        assert.equal(contract.rentalStatus, 'Active');
        assert.match(contract.contractNo, /^RENT-\d+$/);
        assert.equal((await equipment(EQ_GENERATOR)).currentStatus, 'RentedOut');
        assert.equal((await history(EQ_GENERATOR)).length, 1);
    });

    it('does not offer rented equipment for another contract', async () => {
        const { data } = await GET('/rental/AvailableEquipment', DISPATCHER);
        assert.ok(!data.value.some((e) => e.ID === EQ_GENERATOR));
    });

    it('lets the dispatcher change an existing contract (was blocked by its own rented equipment)', async () => {
        await edit('/rental', 'Rentals', contract.ID, DISPATCHER);
        await PATCH(draft('/rental', 'Rentals', contract.ID), { expectedReturnDate: '2026-11-25' }, DISPATCHER);
        const { data } = await activate('/rental', 'Rentals', contract.ID, DISPATCHER);
        assert.equal(data.expectedReturnDate, '2026-11-25');
        assert.equal(data.rentalStatus, 'Active');
        // no second "RentedOut" history entry for the same allocation
        assert.equal((await history(EQ_GENERATOR)).length, 1);
    });

    it('rejects a return date before the start date', async () => {
        await edit('/rental', 'Rentals', contract.ID, DISPATCHER);
        await PATCH(draft('/rental', 'Rentals', contract.ID), { expectedReturnDate: '2026-11-01' }, DISPATCHER);
        await fails(activate('/rental', 'Rentals', contract.ID, DISPATCHER), 400);
        await DELETE(draft('/rental', 'Rentals', contract.ID), DISPATCHER);
    });

    it('cancels the contract once and frees its equipment', async () => {
        const { data } = await POST('/rental/cancelRental', { rentalId: contract.ID, reason: 'customer cancelled' }, DISPATCHER);
        assert.equal(data.rentalStatus, 'Cancelled');
        assert.equal((await equipment(EQ_GENERATOR)).currentStatus, 'Available');
        await fails(POST('/rental/cancelRental', { rentalId: contract.ID }, DISPATCHER), 409);
    });

    it('does not let a cancelled contract be edited', async () => {
        await fails(edit('/rental', 'Rentals', contract.ID, DISPATCHER), 409);
    });

    it('does not transfer rented equipment and keeps the status of transferred equipment', async () => {
        await fails(POST('/rental/transferEquipment', { equipmentId: EQ_KOMATSU, toLocationId: LOC_WORKSHOP }, DISPATCHER), 409);
        const { data } = await POST('/rental/transferEquipment', { equipmentId: EQ_PLATE, toLocationId: LOC_DELHI, reason: 'service' }, DISPATCHER);
        assert.equal(data.location_ID, LOC_DELHI);
        assert.equal(data.currentStatus, 'UnderMaintenance');   // was reset to "Available" before
    });

    it('keeps a blank draft that another user is still filling in', async () => {
        const { data: customer } = await POST('/rental/Customers', {}, DISPATCHER);
        await GET('/rental/Customers', MANAGER);   // list refresh of somebody else
        const { data } = await GET(draft('/rental', 'Customers', customer.ID), DISPATCHER);
        assert.equal(data.ID, customer.ID);
    });
});

// an inspection that is not locked (both seed inspections are), used by the photo tests
let openInspection;

describe('Inspections', () => {
    let contract, checkIn;

    it('checks equipment out and in (status history used to fail in InspectionService)', async () => {
        contract = await createContract([EQ_GENERATOR, EQ_CAT320]);
        const out = await inspect(contract.ID, EQ_GENERATOR, 'CheckOut');
        assert.equal(out.inspectionType, 'CheckOut');
        openInspection = out.ID;
        assert.equal((await equipment(EQ_GENERATOR)).currentStatus, 'RentedOut');

        checkIn = await inspect(contract.ID, EQ_GENERATOR, 'CheckIn', 'A');
        assert.equal((await equipment(EQ_GENERATOR)).currentStatus, 'Available');
    });

    it('keeps the contract active while other equipment is still out', async () => {
        const { data } = await GET(active('/rental', 'Rentals', contract.ID), DISPATCHER);
        assert.equal(data.rentalStatus, 'Active');
    });

    it('marks the contract returned when the last equipment is checked in', async () => {
        await inspect(contract.ID, EQ_CAT320, 'CheckOut');
        await inspect(contract.ID, EQ_CAT320, 'CheckIn', 'B');
        const { data } = await GET(active('/rental', 'Rentals', contract.ID), DISPATCHER);
        assert.equal(data.rentalStatus, 'Returned');
        assert.ok(data.actualReturnDate);
    });

    it('rejects a check-in without check-out', async () => {
        const other = await createContract([EQ_GENERATOR]);
        await fails(inspect(other.ID, EQ_GENERATOR, 'CheckIn'), 400);
        await POST('/rental/cancelRental', { rentalId: other.ID }, DISPATCHER);
    });

    it('does not re-apply status changes when an old inspection is edited', async () => {
        await POST('/rental/transferEquipment', { equipmentId: EQ_GENERATOR, toLocationId: LOC_WORKSHOP }, DISPATCHER);
        const before = (await history(EQ_GENERATOR)).length;
        await edit('/inspection', 'ConditionLogs', checkIn.ID, INSPECTOR);
        await PATCH(draft('/inspection', 'ConditionLogs', checkIn.ID), { notes: 'typo fixed' }, INSPECTOR);
        await activate('/inspection', 'ConditionLogs', checkIn.ID, INSPECTOR);
        assert.equal((await history(EQ_GENERATOR)).length, before);
    });

    it('locks an inspection against any further change, also through drafts', async () => {
        await fails(POST('/inspection/lockInspection', { conditionLogId: checkIn.ID }, INSPECTOR), 403);
        await POST('/inspection/lockInspection', { conditionLogId: checkIn.ID }, MANAGER);
        await fails(edit('/inspection', 'ConditionLogs', checkIn.ID, INSPECTOR), 403);
        await fails(POST('/inspection/acknowledgeInspection', { conditionLogId: checkIn.ID }, INSPECTOR), 403);
    });
});

describe('Photo evidence', () => {

    it('stores the photo with its SHA-256 fingerprint (Cloudinary not configured: data URI)', async () => {
        const { data } = await POST('/api/uploadEvidence', {
            imageBase64: `data:image/png;base64,${PNG}`, fileName: 'dent.png', conditionLog_ID: openInspection
        }, INSPECTOR);
        assert.equal(data.sha256, PNG_SHA256);
        assert.equal(data.isDraft, false);
        assert.equal(data.photoType, 'Return');
        assert.match(data.mediaUrl, /^data:image\/png;base64,/);

        const { data: photos } = await GET(`${active('/inspection', 'ConditionLogs', openInspection)}/photos`, INSPECTOR);
        const photo = photos.value.find((p) => p.ID === data.ID);
        assert.equal(photo.uploadedBy, 'inspector');
    });

    it('attaches the photo to the draft while the inspection is edited', async () => {
        await edit('/inspection', 'ConditionLogs', openInspection, INSPECTOR);
        const { data } = await POST('/api/uploadEvidence', {
            imageBase64: PNG, conditionLog_ID: openInspection, photoType: 'DamageEvidence'
        }, INSPECTOR);
        assert.equal(data.isDraft, true);
        await activate('/inspection', 'ConditionLogs', openInspection, INSPECTOR);
        const { data: photos } = await GET(`${active('/inspection', 'ConditionLogs', openInspection)}/photos`, INSPECTOR);
        assert.ok(photos.value.some((p) => p.ID === data.ID && p.photoType === 'DamageEvidence'));
        // the earlier photo survived the edit (the old SAVE hook deleted active photos)
        assert.equal(photos.value.length, 2);
    });

    it('does not add photos to a locked inspection', async () => {
        await fails(POST('/api/uploadEvidence', { imageBase64: PNG, conditionLog_ID: LOG_RETURN }, INSPECTOR), 403);
    });

    it('accepts images only and requires a parent and a write role', async () => {
        await fails(POST('/api/uploadEvidence', { imageBase64: 'data:text/html;base64,PGI+', conditionLog_ID: openInspection }, INSPECTOR), 400);
        await fails(POST('/api/uploadEvidence', { imageBase64: PNG }, INSPECTOR), 400);
        await fails(POST('/api/uploadEvidence', { imageBase64: PNG, conditionLog_ID: openInspection }, AUDITOR), 403);
    });
});

describe('Damage billing', () => {
    let bill;

    it('calculates the damage charge from the pricing rules', async () => {
        ({ data: bill } = await POST('/billing/calculateDamageCharge', { damageId: DAMAGE_HOSE }, BILLING));
        assert.match(bill.invoiceNo, new RegExp(`^INV-${new Date().getFullYear()}-\\d+$`));
        assert.equal(bill.equipment_ID, EQ_CAT320);
        assert.equal(bill.damageType, 'HydraulicLeak');
        assert.equal(Number(bill.totalAmount), Number((Number(bill.repairAmount) + Number(bill.taxAmount)).toFixed(2)));
        await fails(POST('/billing/calculateDamageCharge', { damageId: DAMAGE_HOSE }, BILLING), 409);
    });

    it('adjusts with the tax rate of the bill and lets the manager approve', async () => {
        const rate = Number(bill.taxAmount) / Number(bill.repairAmount);
        const { data: adjusted } = await POST('/billing/adjustRepairBill', {
            billId: bill.ID, partsCost: 1000, labourCost: 500, paintingCost: 0, reason: 'goodwill'
        }, BILLING);
        assert.equal(adjusted.billingStatus, 'Adjusted');
        assert.equal(Number(adjusted.repairAmount), 1500);
        assert.equal(Number(adjusted.taxAmount), Number((1500 * rate).toFixed(2)));

        await fails(POST('/billing/approveRepairBill', { billId: bill.ID }, BILLING), 403);
        const { data: approved } = await POST('/billing/approveRepairBill', { billId: bill.ID }, MANAGER);
        assert.equal(approved.billingStatus, 'Approved');
    });

    it('posts the invoice with its number and queues the S/4HANA message (crashed the server before)', async () => {
        const { data: posted } = await POST('/billing/postInvoice', { billId: bill.ID }, BILLING);
        assert.equal(posted.billingStatus, 'Posted');
        assert.equal(posted.invoiceNo, bill.invoiceNo);

        const { data } = await GET('/billing/IntegrationMessages?$filter=status eq \'Pending\'', ADMIN);
        assert.ok(data.value.some((m) => JSON.parse(m.payload).invoiceNo === bill.invoiceNo));
    });

    it('does not re-open posted bills', async () => {
        await fails(POST('/billing/approveRepairBill', { billId: BILL_POSTED }, MANAGER), 409);
        await fails(POST('/billing/rejectRepairBill', { billId: bill.ID, reason: 'x' }, MANAGER), 409);
        await fails(edit('/billing', 'RepairBills', bill.ID, BILLING), 409);
    });
});

describe('Workshop repairs', () => {
    let job;

    it('dispatches a repair job and takes the asset out of the fleet', async () => {
        ({ data: job } = await POST('/maintenance/createRepairJob', { damageId: DAMAGE_HOSE, technician: 'Mike' }, TECHNICIAN));
        assert.equal(job.status, 'InProgress');
        assert.equal((await equipment(EQ_CAT320)).currentStatus, 'InRepair');
        await fails(POST('/maintenance/createRepairJob', { damageId: DAMAGE_HOSE }, TECHNICIAN), 409);
    });

    it('releases the asset when the repair job is completed (stayed InRepair before)', async () => {
        const { data } = await POST('/maintenance/completeRepairJob', { repairJobId: job.ID, labourHours: 3, actualCost: 9000 }, TECHNICIAN);
        assert.equal(data.status, 'Completed');
        assert.ok(data.closedAt);
        const eq = await equipment(EQ_CAT320);
        assert.equal(eq.currentStatus, 'Available');
        await fails(POST('/maintenance/completeRepairJob', { repairJobId: job.ID }, TECHNICIAN), 409);
    });

    it('only releases assets that are in the workshop', async () => {
        await fails(POST('/maintenance/releaseEquipmentToAvailable', { equipmentId: EQ_KOMATSU }, TECHNICIAN), 409);
    });
});
