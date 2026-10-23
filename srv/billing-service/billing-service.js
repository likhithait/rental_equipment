import cds from '@sap/cds';

export default class BillingService extends cds.ApplicationService {
    async init() {
        const { RepairBills, PricingRules, DamageRecords, Rentals, IntegrationMessages } = this.entities;

        // billing status workflow: which statuses each action may start from
        const ALLOWED_FROM = {
            approve: ['Draft', 'PendingApproval', 'Adjusted', 'Disputed'],
            reject: ['Draft', 'PendingApproval', 'Adjusted', 'Disputed'],
            adjust: ['Draft', 'PendingApproval', 'Approved', 'Disputed'],
            dispute: ['PendingApproval', 'Approved', 'Adjusted', 'Posted'],
            post: ['Approved', 'Adjusted']
        };
        const DEFAULT_TAX_PERCENT = 18;

        const readBill = async (req, billId, step) => {
            const bill = await SELECT.one.from(RepairBills).where({ ID: billId });
            if (!bill) return req.reject(404, `Repair bill ${billId} not found`);
            if (!ALLOWED_FROM[step].includes(bill.billingStatus)) {
                return req.reject(409, `Repair bill ${bill.invoiceNo || billId} is "${bill.billingStatus}" - this action needs status ${ALLOWED_FROM[step].join(', ')}.`);
            }
            return bill;
        };

        // tax rate of a bill (as calculated before), falls back to the standard rate
        const taxPercentOf = (bill) => {
            const repair = Number(bill.repairAmount || 0);
            const tax = Number(bill.taxAmount || 0);
            return repair > 0 && tax > 0 ? (tax / repair) * 100 : DEFAULT_TAX_PERCENT;
        };

        // Next invoice number INV-<year>-<n> over active bills and open drafts
        const nextInvoiceNo = async () => {
            const year = new Date().getFullYear();
            let maxNum = 1000;
            const active = await cds.db.run(SELECT.from(RepairBills).columns('invoiceNo')) || [];
            const drafts = await cds.db.run(SELECT.from(RepairBills.drafts).columns('invoiceNo')) || [];
            for (const b of [...active, ...drafts]) {
                // only legitimate standard invoice numbers like INV-2026-1003 count
                const match = String(b?.invoiceNo || '').match(/^INV-(?:\d{4}-)?(\d{4,6})$/);
                if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
            }
            return `INV-${year}-${maxNum + 1}`;
        };

        // Automatically calculate totals on RepairBills manual entry or edit and validate customer-rental match
        this.before(['CREATE', 'UPDATE'], 'RepairBills', async (req) => {
            const data = req.data;
            const parts = Number(data.partsCost || 0);
            const labour = Number(data.labourCost || 0);
            const painting = Number(data.paintingCost || 0);
            const repair = parts + labour + painting;

            if (repair > 0 || data.taxAmount !== undefined) {
                data.repairAmount = repair;
                const tax = Number(data.taxAmount || 0);
                data.taxAmount = Number(tax.toFixed(2));
                data.totalAmount = Number((repair + tax).toFixed(2));
            }

            // Ensure selected Rental Contract belongs to the selected Customer
            if (data.rental_ID && data.customer_ID) {
                const rental = await cds.db.run(
                    SELECT.one.from('RentalEquipmentTrackingApp.Rentals').where({ ID: data.rental_ID })
                );
                if (rental && rental.customer_ID !== data.customer_ID) {
                    req.error(400, 'Selected Rental Contract does not belong to the selected Customer.', 'rental_ID');
                }
            }
        });

        // Provide fixed-values dropdown entries for Severity
        this.on('READ', 'Severities', () => [
            { code: 'Low' },
            { code: 'Medium' },
            { code: 'High' },
            { code: 'Critical' }
        ]);

        // Auto-generate invoice number and pre-populate defaults on new RepairBills draft
        this.before(['CREATE', 'NEW'], 'RepairBills.drafts', async (req) => {
            if (!req.data.invoiceNo) {
                req.data.invoiceNo = await nextInvoiceNo();
            }
            if (!req.data.billDate) {
                req.data.billDate = new Date().toISOString().split('T')[0];
            }
            if (!req.data.billingStatus) {
                req.data.billingStatus = 'Draft';
            }
            // User requested: keep Damage Particulars blank for manual entry (no auto-fill)
        });

        this.before(['CREATE', 'NEW'], 'DamagePhotos.drafts', async (req) => {
            if (!req.data.photoType) req.data.photoType = 'DamageEvidence';
        });

        // Posted and rejected bills are final - they cannot be edited any more
        this.before('EDIT', 'RepairBills', async (req) => {
            const bill = await SELECT.one.from(RepairBills).columns('billingStatus', 'invoiceNo').where({ ID: req.params[0]?.ID });
            if (bill && ['Posted', 'Rejected'].includes(bill.billingStatus)) {
                return req.reject(409, `Repair bill ${bill.invoiceNo} is ${bill.billingStatus} and can no longer be edited.`);
            }
        });

        // remember whether the bill is created (first activation) or only changed
        this.before('SAVE', 'RepairBills', async (req) => {
            req._isNewBill = !(await SELECT.one.from(RepairBills).columns('ID').where({ ID: req.data.ID }));
        });

        // Defaults on new PricingRules draft
        this.before(['CREATE', 'NEW'], 'PricingRules.drafts', async (req) => {
            if (!req.data.severity) req.data.severity = 'Medium';
            if (!req.data.taxPercent) req.data.taxPercent = 18.00;
            if (!req.data.baseCharge) req.data.baseCharge = 1000.00;
            if (!req.data.labourRate) req.data.labourRate = 2500.00;
            if (!req.data.partsCharge) req.data.partsCharge = 0.00;
            if (!req.data.paintingCharge) req.data.paintingCharge = 0.00;
            if (!req.data.autoApproveLimit) req.data.autoApproveLimit = 25000.00;
        });

        // Cascading Customer -> Rental Contract -> Equipment validation & auto-fill
        this.before(['UPDATE', 'PATCH'], 'RepairBills.drafts', async (req) => {
            const draftId = req.data.ID || req.params?.[0]?.ID || req.params?.[0];

            // 1. If Customer is selected/changed
            if (req.data.customer_ID !== undefined) {
                let cur = {};
                if (draftId) {
                    cur = await cds.db.run(SELECT.one.from('BillingService.RepairBills.drafts').where({ ID: draftId })) || {};
                }
                const currentRentalId = req.data.rental_ID !== undefined ? req.data.rental_ID : cur.rental_ID;
                if (currentRentalId) {
                    const rental = await cds.db.run(
                        SELECT.one.from('RentalEquipmentTrackingApp.Rentals').where({ ID: currentRentalId })
                    );
                    if (rental && rental.customer_ID !== req.data.customer_ID) {
                        // The existing rental does not belong to the newly selected customer -> clear rental and equipment
                        req.data.rental_ID = null;
                        req.data.equipment_ID = null;
                    }
                }
            }

            // 2. If Rental Contract is selected/changed
            if (req.data.rental_ID !== undefined) {
                if (req.data.rental_ID) {
                    const rental = await cds.db.run(
                        SELECT.one.from('RentalEquipmentTrackingApp.Rentals').where({ ID: req.data.rental_ID })
                    );
                    if (rental) {
                        if (!req.data.customer_ID) {
                            req.data.customer_ID = rental.customer_ID;
                        }
                    }

                    // Get equipment assigned to this rental contract
                    const rentalItems = await cds.db.run(
                        SELECT.from('RentalEquipmentTrackingApp.RentalItems').where({ rental_ID: req.data.rental_ID })
                    ) || [];
                    const assignedEquipIds = rentalItems.map(item => item.equipment_ID).filter(Boolean);

                    let cur = {};
                    if (draftId) {
                        cur = await cds.db.run(SELECT.one.from('BillingService.RepairBills.drafts').where({ ID: draftId })) || {};
                    }
                    const currentEquipId = req.data.equipment_ID !== undefined ? req.data.equipment_ID : cur.equipment_ID;

                    if (currentEquipId && !assignedEquipIds.includes(currentEquipId)) {
                        // Currently selected equipment is not on this contract -> clear equipment
                        req.data.equipment_ID = null;
                    } else if (!currentEquipId && assignedEquipIds.length === 1) {
                        // Exactly 1 equipment on this contract -> auto-select it!
                        req.data.equipment_ID = assignedEquipIds[0];
                    }
                } else {
                    // Contract cleared -> clear equipment
                    req.data.equipment_ID = null;
                }
            }

            if (req.data.damage_ID) {
                const damage = await cds.db.run(
                    SELECT.one.from('RentalEquipmentTrackingApp.DamageRecords').where({ ID: req.data.damage_ID })
                );
                if (damage) {
                    if (damage.liableParty_ID) req.data.customer_ID = damage.liableParty_ID;

                    if (damage.conditionLog_ID) {
                        const log = await cds.db.run(
                            SELECT.one.from('RentalEquipmentTrackingApp.ConditionLogs').where({ ID: damage.conditionLog_ID })
                        );
                        if (log?.rental_ID) {
                            req.data.rental_ID = log.rental_ID;
                            if (!req.data.customer_ID) {
                                const rental = await cds.db.run(
                                    SELECT.one.from('RentalEquipmentTrackingApp.Rentals').where({ ID: log.rental_ID })
                                );
                                if (rental?.customer_ID) req.data.customer_ID = rental.customer_ID;
                            }
                        }
                    }
                    if (damage.repairEstimate && !req.data.repairAmount) {
                        const est = Number(damage.repairEstimate);
                        req.data.repairAmount = est;
                        req.data.partsCost = Number((est * 0.6).toFixed(2));
                        req.data.labourCost = Number((est * 0.4).toFixed(2));
                        req.data.paintingCost = 0.00;
                        req.data.taxAmount = Number((est * 0.18).toFixed(2));
                        req.data.totalAmount = Number((est + req.data.taxAmount).toFixed(2));
                    }
                }
            }

            // Recalculate totals if any cost component or tax is updated
            if (req.data.partsCost !== undefined || req.data.labourCost !== undefined || req.data.paintingCost !== undefined || req.data.taxAmount !== undefined) {
                const draftId = req.data.ID || req.params?.[0]?.ID || req.params?.[0];
                let cur = {};
                if (draftId) {
                    cur = await cds.db.run(SELECT.one.from('BillingService.RepairBills.drafts').where({ ID: draftId })) || {};
                }
                const toNum = (val, fb = 0) => (val !== undefined && val !== null && !isNaN(Number(val))) ? Number(val) : fb;
                const parts = req.data.partsCost !== undefined ? toNum(req.data.partsCost, 0) : toNum(cur.partsCost, 0);
                const labour = req.data.labourCost !== undefined ? toNum(req.data.labourCost, 0) : toNum(cur.labourCost, 0);
                const painting = req.data.paintingCost !== undefined ? toNum(req.data.paintingCost, 0) : toNum(cur.paintingCost, 0);
                const repair = Number((parts + labour + painting).toFixed(2));
                req.data.repairAmount = repair;
                const tax = req.data.taxAmount !== undefined ? toNum(req.data.taxAmount, 0) : toNum(cur.taxAmount, 0);
                req.data.taxAmount = Number(tax.toFixed(2));
                req.data.totalAmount = Number((repair + tax).toFixed(2));
            }
        });

        // Automatically set Equipment status to Damaged when a Repair Bill is created
        // (later edits of the bill must not undo a repair that happened in the meantime)
        this.after('SAVE', 'RepairBills', async (_, req) => {
            // CAP returns only the keys after CREATE - the activated bill is in req.data
            const bill = req.data;
            if (req._isNewBill && bill.equipment_ID && bill.billingStatus !== 'Posted' && bill.billingStatus !== 'Rejected') {
                try {
                    const eq = await cds.db.run(
                        SELECT.one.from('RentalEquipmentTrackingApp.Equipment').where({ ID: bill.equipment_ID })
                    );
                    if (eq && eq.currentStatus !== 'Damaged' && eq.currentStatus !== 'Quarantined') {
                        await cds.db.run(
                            UPDATE('RentalEquipmentTrackingApp.Equipment').set({
                                currentStatus: 'Damaged'
                            }).where({ ID: bill.equipment_ID })
                        );
                        await cds.db.run(
                            INSERT.into('RentalEquipmentTrackingApp.AssetStatusHistory').entries({
                                equipment_ID: bill.equipment_ID,
                                oldStatus: eq.currentStatus,
                                newStatus: 'Damaged',
                                reason: `Repair Bill ${bill.invoiceNo || bill.ID} generated for damage charges`
                            })
                        );
                        console.log(`[BillingService] ✅ Updated Equipment ${bill.equipment_ID} status to Damaged`);
                    }
                } catch (err) {
                    console.warn('[BillingService] Equipment status update warning:', err.message);
                }
            }
        });

        // Action: Automated Pricing Engine - calculate charge based on PricingRules
        this.on('calculateDamageCharge', async (req) => {
            const { damageId } = req.data;
            const damage = await SELECT.one.from(DamageRecords).where({ ID: damageId });
            if (!damage) return req.reject(404, `Damage record ${damageId} not found`);

            const openBill = await SELECT.one.from(RepairBills).columns('invoiceNo', 'billingStatus')
                .where`damage_ID = ${damageId} and billingStatus != 'Rejected'`;
            if (openBill) {
                return req.reject(409, `Damage is already billed with ${openBill.invoiceNo} (${openBill.billingStatus}).`);
            }

            // Trace ConditionLog -> Rental -> Customer
            const conditionLog = await SELECT.one.from('RentalEquipmentTrackingApp.ConditionLogs').where({ ID: damage.conditionLog_ID });
            const rental = conditionLog?.rental_ID
                ? await SELECT.one.from(Rentals).where({ ID: conditionLog.rental_ID })
                : null;
            const customerId = damage.liableParty_ID || rental?.customer_ID;

            if (!rental || !customerId) {
                return req.reject(400, 'Cannot generate bill: Missing associated Rental or Customer for this damage');
            }

            // Find matching PricingRule
            let rule = await SELECT.one.from(PricingRules).where({
                damageType: damage.damageType,
                severity: damage.severity
            });

            // Default fallback if specific rule not found
            if (!rule) {
                rule = {
                    baseCharge: 150.00,
                    partsCharge: 200.00,
                    labourRate: 85.00,
                    paintingCharge: 50.00,
                    taxPercent: 18.00,
                    autoApproveLimit: 500.00
                };
            }

            const base = Number(rule.baseCharge || 0);
            const parts = Number(rule.partsCharge || 0);
            const labour = Number(rule.labourRate || 0) * 2; // standard 2 labour hours
            const painting = Number(rule.paintingCharge || 0);
            const repair = Number((base + parts + labour + painting).toFixed(2));
            const tax = Number((repair * (Number(rule.taxPercent ?? DEFAULT_TAX_PERCENT) / 100)).toFixed(2));
            const total = Number((repair + tax).toFixed(2));

            // Auto-approval check against threshold
            const autoApproved = rule.autoApproveLimit && total <= Number(rule.autoApproveLimit);
            const billingStatus = autoApproved ? 'Approved' : 'PendingApproval';

            const billId = cds.utils.uuid();
            await INSERT.into(RepairBills).entries({
                ID: billId,
                invoiceNo: await nextInvoiceNo(),
                rental_ID: rental.ID,
                customer_ID: customerId,
                equipment_ID: conditionLog?.equipment_ID || null,
                damage_ID: damageId,
                damageDescription: damage.description,
                severity: damage.severity,
                damageType: damage.damageType,
                area: damage.area,
                origin: damage.origin,
                inspectionRef: damage.conditionLog_ID,
                billDate: new Date().toISOString().split('T')[0],
                partsCost: parts,
                labourCost: labour + base, // labour includes the base diagnostic fee
                paintingCost: painting,
                repairAmount: repair,
                taxAmount: tax,
                totalAmount: total,
                billingStatus: billingStatus,
                approvalReason: autoApproved ? 'Auto-approved within threshold limit' : 'Pending clerk/manager review'
            });

            // Update damage status
            await UPDATE(DamageRecords).set({
                damageStatus: 'Billed',
                repairEstimate: total,
                customerLiable: true
            }).where({ ID: damageId });

            return await SELECT.one.from(RepairBills).where({ ID: billId });
        });

        // Action: Approve Repair Bill
        this.on('approveRepairBill', async (req) => {
            const { billId, approvalReason } = req.data;
            const bill = await readBill(req, billId, 'approve');
            if (!bill) return;

            await UPDATE(RepairBills).set({
                billingStatus: 'Approved',
                approvalReason: approvalReason || `Approved by ${req.user.id}`
            }).where({ ID: billId });

            return await SELECT.one.from(RepairBills).where({ ID: billId });
        });

        // Action: Adjust Repair Bill (editable cost lines)
        this.on('adjustRepairBill', async (req) => {
            const { billId, partsCost, labourCost, paintingCost, reason } = req.data;
            if (!reason) return req.reject(400, 'Adjustment reason is mandatory');

            const bill = await readBill(req, billId, 'adjust');
            if (!bill) return;

            const parts = Number(partsCost ?? bill.partsCost ?? 0);
            const labour = Number(labourCost ?? bill.labourCost ?? 0);
            const painting = Number(paintingCost ?? bill.paintingCost ?? 0);
            if ([parts, labour, painting].some((v) => v < 0)) {
                return req.reject(400, 'Cost lines cannot be negative');
            }
            const repair = Number((parts + labour + painting).toFixed(2));
            const tax = Number((repair * taxPercentOf(bill) / 100).toFixed(2));
            const total = Number((repair + tax).toFixed(2));

            await UPDATE(RepairBills).set({
                partsCost: parts,
                labourCost: labour,
                paintingCost: painting,
                repairAmount: repair,
                taxAmount: tax,
                totalAmount: total,
                billingStatus: 'Adjusted',
                approvalReason: reason
            }).where({ ID: billId });

            return await SELECT.one.from(RepairBills).where({ ID: billId });
        });

        // Action: Reject Repair Bill
        this.on('rejectRepairBill', async (req) => {
            const { billId, reason } = req.data;
            if (!reason) return req.reject(400, 'Rejection reason is mandatory');
            if (!await readBill(req, billId, 'reject')) return;

            await UPDATE(RepairBills).set({
                billingStatus: 'Rejected',
                approvalReason: reason
            }).where({ ID: billId });

            return await SELECT.one.from(RepairBills).where({ ID: billId });
        });

        // Action: Dispute Repair Bill
        this.on('disputeRepairBill', async (req) => {
            const { billId, reason } = req.data;
            if (!reason) return req.reject(400, 'Dispute reason is mandatory');
            if (!await readBill(req, billId, 'dispute')) return;

            await UPDATE(RepairBills).set({
                billingStatus: 'Disputed',
                approvalReason: reason
            }).where({ ID: billId });

            return await SELECT.one.from(RepairBills).where({ ID: billId });
        });

        // Action: Post / Finalize Invoice
        this.on('postInvoice', async (req) => {
            const { billId } = req.data;
            const bill = await readBill(req, billId, 'post');
            if (!bill) return;

            // keep the invoice number the customer already knows (INV-<year>-<n>)
            const invoiceNo = bill.invoiceNo || await nextInvoiceNo();
            await UPDATE(RepairBills).set({
                billingStatus: 'Posted',
                invoiceNo: invoiceNo
            }).where({ ID: billId });

            // Outbox message for SAP S/4HANA billing - it stays "Pending" until a sender picks it up
            const rental = await SELECT.one.from(Rentals).where({ ID: bill.rental_ID });
            await INSERT.into(IntegrationMessages).entries({
                messageType: 'Damage Billing Request',
                reference: rental ? rental.contractNo : billId,
                targetSystem: 'SAP S/4HANA',
                status: 'Pending',
                payload: JSON.stringify({
                    invoiceNo,
                    billId,
                    customerId: bill.customer_ID,
                    contractNo: rental?.contractNo,
                    repairAmount: bill.repairAmount,
                    taxAmount: bill.taxAmount,
                    totalAmount: bill.totalAmount,
                    date: new Date().toISOString()
                }),
                lastAttemptAt: new Date().toISOString()
            });

            return await SELECT.one.from(RepairBills).where({ ID: billId });
        });

        await super.init();
    }
}
