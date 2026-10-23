import cds from '@sap/cds';
import { purgeAbandonedDrafts } from '../common/drafts.js';

export default class RentalService extends cds.ApplicationService {
    async init() {
        const { Customers, Locations, Rentals, RentalItems, RentalStatusHistory, Equipment, EquipmentTransfers, AssetStatusHistory } = this.entities;

        this.before('READ', 'Equipment', async (req) => {
            // Only clean up on list queries, not when editing a specific draft by key
            if (!req.params?.length && !req.query?.SELECT?.one) {
                await purgeAbandonedDrafts(Equipment.drafts, 'equipmentName is null and location_ID is null');
            }
        });

        // Helper: Generate next sequential Equipment No (EQ-1001) and Serial Number (SN-1001)
        async function getNextEquipmentNumbers() {
            let maxEq = 1000;
            let maxSn = 1000;
            try {
                const eqs = await cds.db.run(
                    SELECT.from('RentalEquipmentTrackingApp.Equipment').columns('equipmentNo', 'serialNumber')
                );
                for (const item of eqs || []) {
                    if (item.equipmentNo) {
                        const m = String(item.equipmentNo).match(/EQ-(\d+)/i) || String(item.equipmentNo).match(/(\d+)/);
                        if (m) {
                            const val = parseInt(m[1], 10);
                            if (!isNaN(val) && val > maxEq) maxEq = val;
                        }
                    }
                    if (item.serialNumber) {
                        const m = String(item.serialNumber).match(/SN-(\d+)/i) || String(item.serialNumber).match(/(\d+)/);
                        if (m) {
                            const val = parseInt(m[1], 10);
                            if (!isNaN(val) && val > maxSn) maxSn = val;
                        }
                    }
                }
            } catch (e) {
                // Ignore fallback
            }
            return {
                equipmentNo: `EQ-${maxEq + 1}`,
                serialNumber: `SN-${maxSn + 1}`
            };
        }

        // Auto-generate Equipment No and Serial Number on draft creation
        this.before('NEW', 'Equipment.drafts', async (req) => {
            const nextNums = await getNextEquipmentNumbers();
            if (!req.data.equipmentNo) req.data.equipmentNo = nextNums.equipmentNo;
            if (!req.data.serialNumber) req.data.serialNumber = nextNums.serialNumber;
            if (!req.data.plant) req.data.plant = 'PLANT-DEF';
        });

        // Strict validation: Equipment is only accepted if all required details are provided
        this.before(['CREATE', 'SAVE'], 'Equipment', async (req) => {
            if (!req.data.equipmentNo || !req.data.serialNumber) {
                const nextNums = await getNextEquipmentNumbers();
                if (!req.data.equipmentNo) req.data.equipmentNo = nextNums.equipmentNo;
                if (!req.data.serialNumber) req.data.serialNumber = nextNums.serialNumber;
            }
            if (!req.data.plant) req.data.plant = 'PLANT-DEF';

            if (!req.data.equipmentName || !String(req.data.equipmentName).trim()) {
                req.error(400, 'Equipment Name is mandatory and must be provided', 'equipmentName');
            }
            if (!req.data.location_ID) {
                req.error(400, 'Depot Location is mandatory and must be selected', 'location_ID');
            }
        });

        // Automatically clean up blank or abandoned customer drafts so they never clutter the list
        this.before('READ', 'Customers', async (req) => {
            if (!req.params?.length && !req.query?.SELECT?.one) {
                await purgeAbandonedDrafts(Customers.drafts, "companyName is null or companyName = ''");
            }
        });

        // Strict validation: Customers requires Company Name, valid Email Address, and valid Phone / Contact Number
        this.before('SAVE', 'Customers', async (req) => {
            let companyName = req.data.companyName;
            let email = req.data.email;
            let phone = req.data.phone;

            if (req.data.ID && (companyName === undefined || email === undefined || phone === undefined)) {
                try {
                    const existing = await cds.db.run(
                        SELECT.one.from('RentalService.Customers.drafts').where({ ID: req.data.ID })
                    ) || await cds.db.run(
                        SELECT.one.from(Customers).where({ ID: req.data.ID })
                    );
                    if (existing) {
                        if (companyName === undefined) companyName = existing.companyName;
                        if (email === undefined) email = existing.email;
                        if (phone === undefined) phone = existing.phone;
                    }
                } catch (e) {
                    // Fall back to current data
                }
            }

            // 1. Mandatory Company / Customer Name
            if (!companyName || !String(companyName).trim()) {
                req.error(400, 'Company / Customer Name is mandatory and must be provided', 'companyName');
            }

            // 2. Mandatory & Format Validation: Email Address
            if (!email || !String(email).trim()) {
                req.error(400, 'Email Address is mandatory and must be provided', 'email');
            } else {
                const trimmedEmail = String(email).trim();
                const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
                if (!emailRegex.test(trimmedEmail)) {
                    req.error(400, `Invalid email address format "${trimmedEmail}". Please enter a valid email address (e.g. name@domain.com).`, 'email');
                }
            }

            // 3. Mandatory & Format Validation: Phone / Contact Number
            if (!phone || !String(phone).trim()) {
                req.error(400, 'Phone / Mobile No is mandatory and must be provided', 'phone');
            } else {
                const trimmedPhone = String(phone).trim();
                const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
                const digitsOnly = trimmedPhone.replace(/\D/g, '');
                if (!phoneRegex.test(trimmedPhone) || digitsOnly.length < 7 || digitsOnly.length > 15) {
                    req.error(400, `Invalid contact number format "${trimmedPhone}". Please enter a valid phone number with 7 to 15 digits (e.g. +91 98765 43210 or 10-digit mobile number).`, 'phone');
                }
            }
        });

        // Automatically clean up blank or abandoned location drafts so they never clutter the list
        this.before('READ', 'Locations', async (req) => {
            if (!req.params?.length && !req.query?.SELECT?.one) {
                await purgeAbandonedDrafts(Locations.drafts, "locationName is null or locationName = ''");
            }
        });

        // Provide fixed-values dropdown entries for LocationTypes
        this.on('READ', 'LocationTypes', () => [
            { code: 'Yard', name: 'Yard' },
            { code: 'Depot', name: 'Depot' },
            { code: 'Workshop', name: 'Workshop' }
        ]);

        // Helper: Generate next sequential plant code (e.g. PLANT-1010)
        async function getNextPlantCode() {
            let maxNum = 1000;
            try {
                const locs = await cds.db.run(
                    SELECT.from('RentalEquipmentTrackingApp.Locations').columns('plant')
                );
                for (const loc of locs || []) {
                    if (loc.plant) {
                        const m = String(loc.plant).match(/PLANT-(\d+)/i) || String(loc.plant).match(/(\d+)/);
                        if (m) {
                            const val = parseInt(m[1], 10);
                            if (!isNaN(val) && val > maxNum) maxNum = val;
                        }
                    }
                }
            } catch (e) {
                // Ignore fallback
            }
            return `PLANT-${maxNum + 10}`;
        }

        // Auto-generate Plant Code on draft creation
        this.before('NEW', 'Locations.drafts', async (req) => {
            if (!req.data.plant) {
                req.data.plant = await getNextPlantCode();
            }
        });

        // Strict validation: All fields on Locations are compulsory
        this.before(['CREATE', 'SAVE'], 'Locations', async (req) => {
            if (!req.data.locationName || !String(req.data.locationName).trim()) {
                req.error(400, 'Location Name is mandatory and must be provided', 'locationName');
            }
            if (!req.data.locationType || !String(req.data.locationType).trim()) {
                req.error(400, 'Location Type is mandatory and must be selected', 'locationType');
            }
            if (!req.data.address || !String(req.data.address).trim()) {
                req.error(400, 'Full Address is mandatory and must be provided', 'address');
            }
            if (!req.data.city || !String(req.data.city).trim()) {
                req.error(400, 'City is mandatory and must be provided', 'city');
            }
            if (req.data.latitude === undefined || req.data.latitude === null || req.data.latitude === '') {
                req.error(400, 'GPS Latitude is mandatory and must be provided', 'latitude');
            }
            if (req.data.longitude === undefined || req.data.longitude === null || req.data.longitude === '') {
                req.error(400, 'GPS Longitude is mandatory and must be provided', 'longitude');
            }
            if (!req.data.plant) {
                req.data.plant = await getNextPlantCode();
            }
        });

        // Helper: Generate next sequential contract number (e.g. RENT-10002)
        async function getNextContractNumber() {
            let maxNum = 10000;
            try {
                const rentals = await cds.db.run(
                    SELECT.from('RentalEquipmentTrackingApp.Rentals').columns('contractNo')
                );
                for (const r of rentals || []) {
                    if (r.contractNo) {
                        const m = String(r.contractNo).match(/RENT-(\d+)/i);
                        if (m) {
                            const val = parseInt(m[1], 10);
                            if (!isNaN(val) && val > maxNum) maxNum = val;
                        }
                    }
                }
            } catch (e) {
                // DB query fallback
            }
            try {
                const drafts = await cds.db.run(
                    SELECT.from('RentalService.Rentals.drafts').columns('contractNo')
                );
                for (const d of drafts || []) {
                    if (d.contractNo) {
                        const m = String(d.contractNo).match(/RENT-(\d+)/i);
                        if (m) {
                            const val = parseInt(m[1], 10);
                            if (!isNaN(val) && val > maxNum) maxNum = val;
                        }
                    }
                }
            } catch (e) {
                // Drafts table fallback
            }
            return `RENT-${maxNum + 1}`;
        }

        // Helper: Validate equipment allocation globally (same contract duplicate + booked in other contracts + status)
        async function validateEquipmentAllocation(equipmentId, currentRentalId, currentItemId, req, fieldName = 'equipment_ID') {
            if (!equipmentId) return null;

            const eq = await cds.db.run(SELECT.one.from(Equipment).where({ ID: equipmentId }));
            if (!eq) {
                req.error(400, 'Selected equipment does not exist.', fieldName);
                return null;
            }

            // 1. Check duplicate within the same rental contract (drafts or active items)
            if (currentRentalId) {
                try {
                    const draftItems = await cds.db.run(
                        SELECT.from('RentalService.RentalItems.drafts').where({ rental_ID: currentRentalId })
                    );
                    const dupDraft = (draftItems || []).find(i => i.equipment_ID === equipmentId && i.ID !== currentItemId);
                    if (dupDraft) {
                        req.error(400, `Equipment "${eq.equipmentName}" is already allocated in this contract. Please select a different equipment.`, fieldName);
                        return null;
                    }
                } catch (e) {
                    // Drafts check fallback
                }
            }

            // 2. Check if equipment is booked or out on rent in ANY other contract
            try {
                const otherBookings = await cds.db.run(
                    SELECT.from('RentalEquipmentTrackingApp.RentalItems as I')
                        .join('RentalEquipmentTrackingApp.Rentals as R').on('I.rental_ID = R.ID')
                        .where`I.equipment_ID = ${equipmentId} and R.ID != ${currentRentalId || ''} and R.rentalStatus in ('Active', 'Booked') and I.itemStatus in ('Reserved', 'OutOnRent')`
                        .columns('R.contractNo', 'R.rentalStatus')
                );
                if (otherBookings && otherBookings.length > 0) {
                    const contractRef = otherBookings[0].contractNo || 'another active contract';
                    req.error(400, `Equipment "${eq.equipmentName}" is already booked under contract "${contractRef}". An equipment cannot be assigned while it is booked or out on rent in any contract.`, fieldName);
                    return null;
                }
            } catch (e) {
                // Check fallback
            }

            // 3. Check if equipment is currently in another open rental draft
            try {
                const otherDrafts = await cds.db.run(
                    SELECT.from('RentalService.RentalItems.drafts as I')
                        .join('RentalService.Rentals.drafts as R').on('I.rental_ID = R.ID')
                        .where`I.equipment_ID = ${equipmentId} and R.ID != ${currentRentalId || ''} and I.ID != ${currentItemId || ''}`
                        .columns('R.contractNo')
                );
                if (otherDrafts && otherDrafts.length > 0) {
                    const contractRef = otherDrafts[0].contractNo || 'another contract draft';
                    req.error(400, `Equipment "${eq.equipmentName}" is currently selected in contract draft "${contractRef}". Please select a different equipment.`, fieldName);
                    return null;
                }
            } catch (e) {
                // Draft join fallback
            }

            // 4. Check operational status in Equipment master
            if (eq.currentStatus !== 'Available') {
                const statusMsg = eq.currentStatus === 'InRepair'
                    ? `Equipment "${eq.equipmentName}" (${eq.serialNumber}) is currently in repair at the workshop and cannot be rented out.`
                    : `Equipment "${eq.equipmentName}" (${eq.serialNumber}) cannot be allocated because its operational status is "${eq.currentStatus}". Only Available equipment can be rented.`;
                req.error(400, statusMsg, fieldName);
                return null;
            }

            // 5. Check if equipment has an active or in-progress repair job
            try {
                const activeRepairs = await cds.db.run(
                    SELECT.from('RentalEquipmentTrackingApp.RepairJobs')
                        .where`equipment_ID = ${equipmentId} and status in ('Open', 'InProgress')`
                );
                if (activeRepairs && activeRepairs.length > 0) {
                    req.error(400, `Equipment "${eq.equipmentName}" (${eq.serialNumber}) is currently undergoing repair in the workshop (Status: ${activeRepairs[0].status}). It cannot be rented until the repair is completed.`, fieldName);
                    return null;
                }
            } catch { /* optional lookup - ignore */ }

            return eq;
        }

        // Auto-generate contract number and set default status on draft creation
        this.before(['CREATE', 'NEW'], 'Rentals.drafts', async (req) => {
            if (!req.data.contractNo) {
                req.data.contractNo = await getNextContractNumber();
            }
            if (!req.data.rentalStatus) {
                req.data.rentalStatus = 'Booked';
            }
        });

        this.before('CREATE', 'Rentals', async (req) => {
            if (!req.data.contractNo) {
                req.data.contractNo = await getNextContractNumber();
            }
        });

        // Closed, cancelled or returned contracts are history - they cannot be edited any more
        this.before('EDIT', 'Rentals', async (req) => {
            const rental = await SELECT.one.from(Rentals).columns('contractNo', 'rentalStatus').where({ ID: req.params[0]?.ID });
            if (rental && ['Returned', 'Closed', 'Cancelled'].includes(rental.rentalStatus)) {
                return req.reject(409, `Contract ${rental.contractNo} is ${rental.rentalStatus} and can no longer be changed.`);
            }
        });

        // Strict validation: Rentals require contract number, customer, dates, and non-booked equipment
        this.before('SAVE', 'Rentals', async (req) => {
            const existing = await SELECT.one.from(Rentals).where({ ID: req.data.ID });
            const activeItems = existing ? await SELECT.from(RentalItems).columns('equipment_ID').where({ rental_ID: req.data.ID }) : [];
            const alreadyAllocated = new Set(activeItems.map((i) => i.equipment_ID));

            // Mandatory & auto-generated contract number
            if (!req.data.contractNo || !String(req.data.contractNo).trim()) {
                req.data.contractNo = existing?.contractNo || await getNextContractNumber();
            }

            if (!req.data.customer_ID) {
                req.error(400, 'Customer / Client is mandatory and must be selected', 'customer_ID');
            }
            if (!req.data.rentalDate) {
                req.error(400, 'Rental Start Date is mandatory', 'rentalDate');
            }
            if (!req.data.expectedReturnDate) {
                req.error(400, 'Expected Return Date is mandatory', 'expectedReturnDate');
            } else if (req.data.rentalDate && req.data.expectedReturnDate < req.data.rentalDate) {
                req.error(400, 'Expected Return Date cannot be before the Rental Start Date', 'expectedReturnDate');
            }

            // Retrieve all items for this rental draft
            const rentalId = req.data.ID;
            let items = req.data.items;
            if (!items || items.length === 0) {
                try {
                    items = await cds.db.run(
                        SELECT.from('RentalService.RentalItems.drafts').where({ rental_ID: rentalId })
                    );
                } catch { /* optional lookup - ignore */ }
            }

            if (!items || items.length === 0) {
                req.error(400, 'At least one equipment item must be allocated to create a contract.', 'items');
                return;
            }

            const seenEquipment = new Set();
            const newEquipment = [];
            for (const item of items) {
                if (!item.equipment_ID) {
                    req.error(400, 'All allocated item rows must have an Equipment Asset selected.', 'items');
                    return;
                }
                if (seenEquipment.has(item.equipment_ID)) {
                    const eq = await cds.db.run(SELECT.one.from(Equipment).where({ ID: item.equipment_ID }));
                    req.error(400, `Equipment "${eq?.equipmentName || item.equipment_ID}" is added more than once. Duplicate equipment allocations are not allowed in the same contract.`, 'items');
                    return;
                }
                seenEquipment.add(item.equipment_ID);

                // Equipment that this contract already holds is rented out to it - only newly
                // allocated equipment has to pass the global booking & status validation
                if (!alreadyAllocated.has(item.equipment_ID)) {
                    newEquipment.push(item.equipment_ID);
                    await validateEquipmentAllocation(item.equipment_ID, rentalId, item.ID, req, 'items');
                }
            }

            // Set contract status to Active upon creation, keep the status of an existing contract
            req.data.rentalStatus = existing ? existing.rentalStatus : 'Active';
            req._newContract = !existing;
            req._newEquipment = newEquipment;
        });

        // After contract is saved: transition newly allocated equipment to RentedOut and items to OutOnRent
        // (re-saving an existing contract must not touch equipment that was returned in the meantime)
        this.after('SAVE', 'Rentals', async (_, req) => {
            // CAP returns only the keys after CREATE - the activated contract is in req.data
            const data = req.data;
            const rentalId = data.ID;
            const newEquipment = new Set(req._newEquipment || []);
            if (!newEquipment.size || !['Active', 'Booked'].includes(data.rentalStatus)) return;

            const items = (await cds.db.run(SELECT.from(RentalItems).where({ rental_ID: rentalId })))
                .filter((item) => newEquipment.has(item.equipment_ID));

            // Update item statuses to OutOnRent
            await cds.db.run(
                UPDATE(RentalItems).set({ itemStatus: 'OutOnRent' }).where({ ID: { in: items.map((i) => i.ID) } })
            );

            // Update each allocated equipment asset to RentedOut
            for (const item of items) {
                if (item.equipment_ID) {
                    const eq = await cds.db.run(SELECT.one.from(Equipment).where({ ID: item.equipment_ID }));
                    await cds.db.run(
                        UPDATE(Equipment).set({ currentStatus: 'RentedOut' }).where({ ID: item.equipment_ID })
                    );
                    await cds.db.run(
                        INSERT.into(AssetStatusHistory).entries({
                            equipment_ID: item.equipment_ID,
                            oldStatus: eq?.currentStatus || 'Available',
                            newStatus: 'RentedOut',
                            reason: `Allocated under contract ${data.contractNo || rentalId}`
                        })
                    );
                }
            }

            // Record rental status history of a new contract
            if (req._newContract) {
                await cds.db.run(
                    INSERT.into(RentalStatusHistory).entries({
                        rental_ID: rentalId,
                        oldStatus: 'Booked',
                        newStatus: 'Active'
                    })
                );
            }
        });

        // Auto-fill item details (dates, rate, status) on item draft creation
        this.before(['CREATE', 'NEW'], 'RentalItems.drafts', async (req) => {
            if (!req.data.itemStatus) req.data.itemStatus = 'Reserved';

            // Find parent rental to pre-populate start and end dates
            const rentalId = req.data.rental_ID || req.params?.find(p => p.ID)?.ID || req.params?.[0]?.ID;
            if (rentalId) {
                const parent = await cds.db.run(
                    SELECT.one.from('RentalService.Rentals.drafts').where({ ID: rentalId })
                ) || await cds.db.run(
                    SELECT.one.from(Rentals).where({ ID: rentalId })
                );
                if (parent) {
                    if (!req.data.startDate && parent.rentalDate) {
                        req.data.startDate = parent.rentalDate;
                    }
                    if (!req.data.endDate && parent.expectedReturnDate) {
                        req.data.endDate = parent.expectedReturnDate;
                    }
                }
            }

            // If equipment is already selected, pull daily rate
            if (req.data.equipment_ID) {
                await validateEquipmentAllocation(req.data.equipment_ID, rentalId, req.data.ID, req, 'equipment_ID');
                if (!req.data.dailyRentalRate) {
                    const eq = await cds.db.run(SELECT.one.from(Equipment).where({ ID: req.data.equipment_ID }));
                    if (eq?.rentalRatePerDay) {
                        req.data.dailyRentalRate = eq.rentalRatePerDay;
                    }
                }
            }
        });

        // When equipment is selected or item dates/rates change on draft
        this.before('UPDATE', 'RentalItems.drafts', async (req) => {
            const thisItemId = req.data.ID || req.params?.[0]?.ID || req.params?.find(p => p.ID)?.ID;
            const currentItem = await cds.db.run(
                SELECT.one.from('RentalService.RentalItems.drafts').where({ ID: thisItemId })
            );

            const rentalId = req.data.rental_ID || currentItem?.rental_ID || req.params?.find(p => p.ID && p.ID !== thisItemId)?.ID;

            // Validate that selected equipment is Available, not duplicated, and not booked elsewhere
            if (req.data.equipment_ID && (!currentItem || currentItem.equipment_ID !== req.data.equipment_ID)) {
                const eq = await validateEquipmentAllocation(req.data.equipment_ID, rentalId, thisItemId, req, 'equipment_ID');
                if (eq?.rentalRatePerDay) {
                    req.data.dailyRentalRate = eq.rentalRatePerDay;
                }
            }

            // Auto-fill start and end dates from parent contract if still empty
            if (rentalId && (!req.data.startDate || !req.data.endDate)) {
                const parent = await cds.db.run(
                    SELECT.one.from('RentalService.Rentals.drafts').where({ ID: rentalId })
                ) || await cds.db.run(
                    SELECT.one.from(Rentals).where({ ID: rentalId })
                );
                if (parent) {
                    if (!req.data.startDate && !currentItem?.startDate && parent.rentalDate) {
                        req.data.startDate = parent.rentalDate;
                    }
                    if (!req.data.endDate && !currentItem?.endDate && parent.expectedReturnDate) {
                        req.data.endDate = parent.expectedReturnDate;
                    }
                }
            }

            // Recalculate parent rental draft totalRentalAmount if dates and rate are available
            if (rentalId) {
                const effectiveRate = req.data.dailyRentalRate ?? currentItem?.dailyRentalRate;
                const effectiveStart = req.data.startDate ?? currentItem?.startDate;
                const effectiveEnd = req.data.endDate ?? currentItem?.endDate;

                if (effectiveRate && effectiveStart && effectiveEnd) {
                    try {
                        const allDraftItems = await cds.db.run(
                            SELECT.from('RentalService.RentalItems.drafts').where({ rental_ID: rentalId })
                        );
                        let total = 0;
                        for (const itm of allDraftItems || []) {
                            const rate = itm.ID === thisItemId ? effectiveRate : itm.dailyRentalRate;
                            const sDate = itm.ID === thisItemId ? effectiveStart : itm.startDate;
                            const eDate = itm.ID === thisItemId ? effectiveEnd : itm.endDate;
                            if (rate && sDate && eDate) {
                                const days = Math.max(1, Math.ceil((new Date(eDate) - new Date(sDate)) / (1000 * 60 * 60 * 24)));
                                total += Number(rate) * days;
                            }
                        }
                        if (total > 0) {
                            await cds.db.run(
                                UPDATE('RentalService.Rentals.drafts').set({ totalRentalAmount: total }).where({ ID: rentalId })
                            );
                        }
                    } catch (e) {
                        // Ignore if draft update fails
                    }
                }
            }
        });

        // Automatically update rental total amount on items change
        this.before(['CREATE', 'UPDATE'], 'Rentals', async (req) => {
            if (req.data.items && Array.isArray(req.data.items)) {
                let total = 0;
                for (const item of req.data.items) {
                    if (item.dailyRentalRate && item.startDate && item.endDate) {
                        const days = Math.max(1, Math.ceil((new Date(item.endDate) - new Date(item.startDate)) / (1000 * 60 * 60 * 24)));
                        total += Number(item.dailyRentalRate) * days;
                    }
                }
                if (total > 0) req.data.totalRentalAmount = total;
            }
        });

        // Action: Check Out Rental
        this.on('checkOutRental', async (req) => {
            const { rentalId } = req.data;
            const rental = await SELECT.one.from(Rentals).where({ ID: rentalId });
            if (!rental) return req.reject(404, `Rental ${rentalId} not found`);
            if (rental.rentalStatus !== 'Booked') {
                return req.reject(409, `Only Booked rentals can be checked out. Current status: ${rental.rentalStatus}`);
            }

            const items = await SELECT.from(RentalItems).where({ rental_ID: rentalId });

            // Update rental status
            await UPDATE(Rentals).set({ rentalStatus: 'Active' }).where({ ID: rentalId });

            // Record rental status history
            await INSERT.into(RentalStatusHistory).entries({
                rental_ID: rentalId,
                oldStatus: rental.rentalStatus,
                newStatus: 'Active'
            });

            // Update each equipment to RentedOut
            for (const item of items) {
                await UPDATE(RentalItems).set({ itemStatus: 'OutOnRent' }).where({ ID: item.ID });
                if (item.equipment_ID) {
                    const eq = await SELECT.one.from(Equipment).where({ ID: item.equipment_ID });
                    await UPDATE(Equipment).set({ currentStatus: 'RentedOut' }).where({ ID: item.equipment_ID });
                    await INSERT.into(AssetStatusHistory).entries({
                        equipment_ID: item.equipment_ID,
                        oldStatus: eq?.currentStatus,
                        newStatus: 'RentedOut',
                        reason: `Checked out under rental contract ${rental.contractNo || rentalId}`
                    });
                }
            }

            return await SELECT.one.from(Rentals).where({ ID: rentalId });
        });

        // Action: Check In Rental (Return)
        this.on('checkInRental', async (req) => {
            const { rentalId, actualReturnDate } = req.data;
            const rental = await SELECT.one.from(Rentals).where({ ID: rentalId });
            if (!rental) return req.reject(404, `Rental ${rentalId} not found`);
            if (!['Active', 'Overdue'].includes(rental.rentalStatus)) {
                return req.reject(409, `Only Active or Overdue rentals can be checked in. Current status: ${rental.rentalStatus}`);
            }

            const returnDate = actualReturnDate || new Date().toISOString().split('T')[0];
            const items = await SELECT.from(RentalItems).where({ rental_ID: rentalId });

            // Update rental status
            await UPDATE(Rentals).set({
                rentalStatus: 'Returned',
                actualReturnDate: returnDate
            }).where({ ID: rentalId });

            await INSERT.into(RentalStatusHistory).entries({
                rental_ID: rentalId,
                oldStatus: rental.rentalStatus,
                newStatus: 'Returned'
            });

            // Equipment that is still out on rent is returned and now pending yard inspection
            for (const item of items) {
                if (item.itemStatus === 'Returned') continue;
                await UPDATE(RentalItems).set({ itemStatus: 'Returned' }).where({ ID: item.ID });
                if (item.equipment_ID) {
                    const eq = await SELECT.one.from(Equipment).where({ ID: item.equipment_ID });
                    await UPDATE(Equipment).set({ currentStatus: 'ReturnedPendingInspection' }).where({ ID: item.equipment_ID });
                    await INSERT.into(AssetStatusHistory).entries({
                        equipment_ID: item.equipment_ID,
                        oldStatus: eq?.currentStatus,
                        newStatus: 'ReturnedPendingInspection',
                        reason: `Returned from rental contract ${rental.contractNo || rentalId}`
                    });
                }
            }

            return await SELECT.one.from(Rentals).where({ ID: rentalId });
        });

        // Action: Cancel Rental
        this.on('cancelRental', async (req) => {
            const { rentalId, reason } = req.data;
            const rental = await SELECT.one.from(Rentals).where({ ID: rentalId });
            if (!rental) return req.reject(404, `Rental ${rentalId} not found`);
            if (!['Booked', 'Active', 'Overdue'].includes(rental.rentalStatus)) {
                return req.reject(409, `Contract ${rental.contractNo} is ${rental.rentalStatus} and cannot be cancelled.`);
            }

            await UPDATE(Rentals).set({ rentalStatus: 'Cancelled' }).where({ ID: rentalId });
            await INSERT.into(RentalStatusHistory).entries({
                rental_ID: rentalId,
                oldStatus: rental.rentalStatus,
                newStatus: 'Cancelled'
            });

            // Free equipment that is still allocated to this contract back to Available
            // (returned items and equipment that is damaged or in repair are left as they are)
            const items = await SELECT.from(RentalItems).where({ rental_ID: rentalId, itemStatus: { in: ['Reserved', 'OutOnRent'] } });
            for (const item of items) {
                await UPDATE(RentalItems).set({ itemStatus: 'Returned' }).where({ ID: item.ID });
                if (!item.equipment_ID) continue;
                const eq = await SELECT.one.from(Equipment).where({ ID: item.equipment_ID });
                if (eq?.currentStatus === 'RentedOut') {
                    await UPDATE(Equipment).set({ currentStatus: 'Available' }).where({ ID: item.equipment_ID });
                    await INSERT.into(AssetStatusHistory).entries({
                        equipment_ID: item.equipment_ID,
                        oldStatus: eq.currentStatus,
                        newStatus: 'Available',
                        reason: `Contract ${rental.contractNo} cancelled${reason ? ': ' + reason : ''}`
                    });
                }
            }

            return await SELECT.one.from(Rentals).where({ ID: rentalId });
        });

        // Action: Transfer Equipment between locations
        this.on('transferEquipment', async (req) => {
            const { equipmentId, toLocationId, reason } = req.data;
            const eq = await SELECT.one.from(Equipment).where({ ID: equipmentId });
            if (!eq) return req.reject(404, `Equipment ${equipmentId} not found`);
            if (!await SELECT.one.from(Locations).columns('ID').where({ ID: toLocationId })) {
                return req.reject(404, `Location ${toLocationId} not found`);
            }
            if (eq.location_ID === toLocationId) {
                return req.reject(400, `${eq.equipmentName} is already stationed at this location`);
            }
            if (eq.currentStatus === 'RentedOut') {
                return req.reject(409, `${eq.equipmentName} is rented out and cannot be transferred until it is returned`);
            }

            await INSERT.into(EquipmentTransfers).entries({
                equipment_ID: equipmentId,
                fromLocation_ID: eq.location_ID,
                toLocation_ID: toLocationId,
                reason: reason || 'Relocation transfer'
            });

            // the operational status (e.g. InRepair) does not change by moving the asset
            await UPDATE(Equipment).set({
                location_ID: toLocationId
            }).where({ ID: equipmentId });

            return await SELECT.one.from(Equipment).where({ ID: equipmentId });
        });

        // Action: Assign / Station Equipment to this Depot Location
        this.on('assignEquipment', 'Locations', async (req) => {
            const locationId = req.params[0]?.ID || req.params?.find(p => p.ID)?.ID;
            const { equipmentId, reason } = req.data;

            if (!locationId) return req.reject(400, 'Depot Location ID is missing');
            if (!equipmentId) return req.reject(400, 'Please select an equipment asset to assign');

            const loc = await SELECT.one.from(Locations).where({ ID: locationId });
            if (!loc) return req.reject(404, 'Depot Location not found');

            const eq = await SELECT.one.from(Equipment).where({ ID: equipmentId });
            if (!eq) return req.reject(404, 'Equipment not found');

            // Record equipment transfer log
            await INSERT.into(EquipmentTransfers).entries({
                equipment_ID: equipmentId,
                fromLocation_ID: eq.location_ID || null,
                toLocation_ID: locationId,
                reason: reason || `Assigned to ${loc.locationName}`
            });

            // Update equipment's depot location
            await UPDATE(Equipment).set({
                location_ID: locationId
            }).where({ ID: equipmentId });

            return await SELECT.one.from(Locations).where({ ID: locationId });
        });

        // Delegate AvailableEquipment queries to Equipment with currentStatus = Available
        // and strictly exclude any equipment booked in active/booked contracts or in open drafts
        this.on('READ', 'AvailableEquipment', async (req) => {
            const bookedEqIds = new Set();

            // 1. Find all equipment IDs allocated in active or booked contracts
            try {
                const bookedItems = await cds.db.run(
                    SELECT.from('RentalEquipmentTrackingApp.RentalItems as I')
                        .join('RentalEquipmentTrackingApp.Rentals as R').on('I.rental_ID = R.ID')
                        .where`R.rentalStatus in ('Active', 'Booked') and I.itemStatus in ('Reserved', 'OutOnRent') and I.equipment_ID is not null`
                        .columns('I.equipment_ID as eqId')
                );
                for (const b of bookedItems || []) {
                    if (b.eqId) bookedEqIds.add(b.eqId);
                }
            } catch (e) {
                // Table query fallback
            }

            // 2. Also exclude any equipment allocated in open drafts
            try {
                const draftItems = await cds.db.run(
                    SELECT.from('RentalService.RentalItems.drafts').columns('equipment_ID').where`equipment_ID is not null`
                );
                for (const d of draftItems || []) {
                    if (d.equipment_ID) bookedEqIds.add(d.equipment_ID);
                }
            } catch (e) {
                // Drafts table fallback
            }

            // 3. Exclude any equipment currently undergoing repair in the workshop
            try {
                const repairJobs = await cds.db.run(
                    SELECT.from('RentalEquipmentTrackingApp.RepairJobs')
                        .where`status in ('Open', 'InProgress') and equipment_ID is not null`
                        .columns('equipment_ID')
                );
                for (const r of repairJobs || []) {
                    if (r.equipment_ID) bookedEqIds.add(r.equipment_ID);
                }
            } catch { /* optional lookup - ignore */ }

            const cqn = SELECT.from(Equipment);
            if (req.query.SELECT.columns) cqn.SELECT.columns = req.query.SELECT.columns;
            if (req.query.SELECT.orderBy) cqn.SELECT.orderBy = req.query.SELECT.orderBy;
            if (req.query.SELECT.limit) cqn.SELECT.limit = req.query.SELECT.limit;
            if (req.query.SELECT.count) cqn.SELECT.count = req.query.SELECT.count;
            if (req.query.SELECT.search) cqn.SELECT.search = req.query.SELECT.search;

            const bookedArray = Array.from(bookedEqIds);
            if (bookedArray.length > 0) {
                if (req.query.SELECT.where) {
                    cqn.where`currentStatus = 'Available' and ID not in (${bookedArray}) and (${req.query.SELECT.where})`;
                } else {
                    cqn.where`currentStatus = 'Available' and ID not in (${bookedArray})`;
                }
            } else {
                if (req.query.SELECT.where) {
                    cqn.where`currentStatus = 'Available' and (${req.query.SELECT.where})`;
                } else {
                    cqn.where({ currentStatus: 'Available' });
                }
            }

            return await cds.db.run(cqn);
        });

        // Initialize: synchronize any legacy null contract numbers and active equipment statuses
        try {
            const nullContracts = await cds.db.run(
                SELECT.from('RentalEquipmentTrackingApp.Rentals').where`contractNo is null or contractNo = ''`
            );
            for (const c of nullContracts || []) {
                const nextNo = await getNextContractNumber();
                await cds.db.run(UPDATE('RentalEquipmentTrackingApp.Rentals').set({ contractNo: nextNo }).where({ ID: c.ID }));
            }
        } catch { /* optional lookup - ignore */ }

        try {
            const activeAllocations = await cds.db.run(
                SELECT.from('RentalEquipmentTrackingApp.RentalItems as I')
                    .join('RentalEquipmentTrackingApp.Rentals as R').on('I.rental_ID = R.ID')
                    .where`R.rentalStatus in ('Active', 'Booked') and I.itemStatus in ('Reserved', 'OutOnRent') and I.equipment_ID is not null`
                    .columns('I.equipment_ID as eqId')
            );
            for (const alloc of activeAllocations || []) {
                if (alloc.eqId) {
                    await cds.db.run(
                        UPDATE(Equipment).set({ currentStatus: 'RentedOut' }).where({ ID: alloc.eqId, currentStatus: 'Available' })
                    );
                }
            }
        } catch { /* optional lookup - ignore */ }

        await super.init();
    }
}
