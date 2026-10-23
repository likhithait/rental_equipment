# 🚜 RETS - Rental Equipment Tracking System

[![SAP CAP](https://img.shields.io/badge/SAP%20CAP-v10-0a84ff?style=for-the-badge&logo=sap)](https://cap.cloud.sap)
[![SAP HANA Cloud](https://img.shields.io/badge/SAP%20HANA%20Cloud-HDI-0070f2?style=for-the-badge&logo=sap)](https://www.sap.com/products/technology-platform/hana.html)
[![SAP Fiori](https://img.shields.io/badge/SAP%20Fiori-Elements-009688?style=for-the-badge&logo=sap)](https://experience.sap.com/fiori/)
[![Cloudinary](https://img.shields.io/badge/Cloudinary-CDN%20Evidence-3448C5?style=for-the-badge&logo=cloudinary)](https://cloudinary.com)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?style=for-the-badge&logo=node.js)](https://nodejs.org/)

An enterprise-grade **Rental Equipment Tracking and Lifecycle Management System** built on **SAP Cloud Application Programming Model (CAP)**, **SAP HANA Cloud**, and **SAP Fiori**. Designed for heavy machinery yards, equipment depots, and construction rental operations to streamline rental dispatch, automated check-in inspections, workshop repairs, and photographic damage billing.

---

## 📑 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [Key Features & Modules](#-key-features--modules)
- [Enterprise Tech Stack](#-enterprise-tech-stack)
- [Fiori Applications](#-fiori-applications)
- [OData Services & APIs](#-odata-services--apis)
- [Project Directory Structure](#-project-directory-structure)
- [Automated Tests](#-automated-tests)
- [Photographic Evidence Integration (Cloudinary)](#-photographic-evidence-integration-cloudinary)
- [SAP BTP Deployment (MTA)](#-sap-btp-deployment-mta)
- [Security & Role-Based Access (RBAC)](#-security--role-based-access-rbac)
- [Business Rules](#-business-rules)

---

## 🏗 Overview & Architecture

RETS unifies yard logistics, customer rentals, equipment maintenance, and financial billing into a single platform:

```mermaid
graph TD
    User([Yard Staff / Inspector / Dispatcher / Manager]) --> AppRouter[SAP Approuter + XSUAA login]
    AppRouter --> FioriPortal[SAP Fiori Launchpad /index.html]

    subgraph FioriFrontend [SAP Fiori Elements Applications - UI5]
        FioriPortal --> AppFleet[Fleet Overview]
        FioriPortal --> AppRentals[Rental Contracts]
        FioriPortal --> AppInsp[Inspections & Photo Capture]
        FioriPortal --> AppMaint[Maintenance Planner]
        FioriPortal --> AppRepair[Repair Jobs]
        FioriPortal --> AppBilling[Damage Charge Approval]
        FioriPortal --> AppCust[Customer Management]
        FioriPortal --> AppLoc[Depots & Yards]
    end

    subgraph CAPBackend [SAP CAP Services - OData v4]
        FioriPortal --> SrvApi[LaunchpadService /api]
        AppRentals --> SrvRental[RentalService]
        AppFleet --> SrvRental
        AppCust --> SrvRental
        AppLoc --> SrvRental
        AppInsp --> SrvInsp[InspectionService]
        AppMaint --> SrvMaint[MaintenanceService]
        AppRepair --> SrvMaint
        AppBilling --> SrvBill[BillingService]
        AppInsp --> SrvApi
        AppBilling --> SrvApi
    end

    subgraph Infrastructure [Data & Cloud Storage]
        CAPBackend --> HANA[(SAP HANA Cloud HDI)]
        SrvApi --> CDN[Cloudinary CDN Photographic Evidence]
        AppRouter --> XSUAA[SAP BTP XSUAA Security]
    end
```

---

## ✨ Key Features & Modules

- **Fleet & Asset Tracking**: Operational status (`Available`, `RentedOut`, `ReturnedPendingInspection`, `Damaged`, `InRepair`, `Quarantined`, ...) with condition grade, meter hours, depot and a full status history.
- **Rental Contract Lifecycle**: Contract numbers (`RENT-10002`, ...), equipment allocation with double-booking protection, check-in, cancellation and status history.
- **Digital Yard Inspections**: Check-Out (dispatch) and Check-In (return) condition logs with grades A-D, enforced Check-Out → Check-In sequence per contract, immutable (locked) reports.
- **Photographic Damage Evidence (FR-009)**: Live camera or file upload, SHA-256 fingerprint computed in the browser and verified by the server, stored on Cloudinary CDN.
- **Workshop Maintenance & Repairs**: Preventive maintenance schedules, repair jobs from damage records, automatic release of the asset back into the fleet.
- **Damage Billing & Approval**: Pricing-rule based charge calculation, adjust / approve / reject / dispute workflow, invoice posting with an S/4HANA outbox message.

---

## 💻 Enterprise Tech Stack

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Backend Framework** | SAP CAP (`@sap/cds` v10) | Node.js services with OData v4, Fiori draft handling |
| **Persistence Layer** | SAP HANA Cloud / `@cap-js/hana` | HDI container on BTP (SQLite only for `npm test`) |
| **Frontend UI** | SAP Fiori Elements (SAPUI5 1.153) | List Report / Object Page apps in a Fiori launchpad (sandbox) |
| **Media / CDN** | Cloudinary SDK (`cloudinary` v2) | Image storage for damage proof |
| **Security & Auth** | SAP BTP XSUAA (`@sap/xssec` v4) | OAuth 2.0 / JWT, role-based access on services and actions |
| **Packaging** | Cloud Foundry MTA (`mta.yaml`) | Approuter, CAP server, HDI deployer |
| **Tests** | `@cap-js/cds-test` + `node:test` | 30 API tests for roles, lifecycle and billing (`npm test`) |

---

## 📱 Fiori Applications

The launchpad (`app/index.html`) shows only the tiles that the logged-in user's roles grant access to, each with a live KPI number.

| App Path | Module Name | Service | Roles |
| :--- | :--- | :--- | :--- |
| [`app/fleet-overview`](app/fleet-overview) | **Fleet Overview** | RentalService | Admin, Dispatcher, YardWorker, Manager, Auditor |
| [`app/rentals`](app/rentals) | **Rental Contracts** | RentalService | Admin, Dispatcher, Manager, Auditor |
| [`app/customer-management`](app/customer-management) | **Customer Management** | RentalService | Admin, Dispatcher, Manager |
| [`app/locations`](app/locations) | **Depots & Yards** | RentalService | Admin, Dispatcher, YardWorker, Manager, Auditor |
| [`app/inspections`](app/inspections) | **Inspections** | InspectionService | Admin, Dispatcher, YardWorker, Manager, Auditor |
| [`app/damage-charge-approval`](app/damage-charge-approval) | **Damage Charge Approval** | BillingService | Admin, BillingClerk, Manager, Auditor, YardWorker, Technician |
| [`app/repair-jobs`](app/repair-jobs) | **Workshop Repair Jobs** | MaintenanceService | Admin, Technician, Manager |
| [`app/maintenance-planner`](app/maintenance-planner) | **Maintenance Planner** | MaintenanceService | Admin, Technician, Manager |

Every app is a standalone UI5 component (`webapp/Component.js`, `manifest.json`, `index.html`) and can also be opened directly, e.g. `<link>/rentals/webapp/index.html`.

---

## 🔌 OData Services & APIs

- **`RentalService`** (`/rental`): equipment, customers, contracts and items, depots; actions `checkOutRental`, `checkInRental`, `cancelRental`, `transferEquipment`, `Locations.assignEquipment`.
- **`InspectionService`** (`/inspection`): condition logs, damage records, photos; actions `submitInspection`, `lockInspection`, `acknowledgeInspection`.
- **`MaintenanceService`** (`/maintenance`): maintenance records, repair jobs; actions `createRepairJob`, `completeRepairJob`, `completeMaintenanceRecord`, `releaseEquipmentToAvailable`.
- **`BillingService`** (`/billing`): repair bills, pricing rules, S/4HANA outbox; actions `calculateDamageCharge`, `adjustRepairBill`, `approveRepairBill`, `rejectRepairBill`, `disputeRepairBill`, `postInvoice`.
- **`LaunchpadService`** (`/api`): `whoAmI()` and `kpis()` for the launchpad, `uploadEvidence` for the photo capture dialog, `cloudinaryStatus()`.

---

## 📂 Project Directory Structure

```text
sprint/
├── app/                              # SAP Fiori frontend
│   ├── index.html                    # Fiori launchpad (sandbox), tiles by user role
│   ├── common/evidence-capture.js    # Photo capture dialog (camera / upload, SHA-256)
│   ├── customer-management/          # Customer Directory
│   ├── damage-charge-approval/       # Damage Billing & Approval (+ Capture Photo action)
│   ├── fleet-overview/               # Fleet & Equipment Health
│   ├── inspections/                  # Yard Inspections (+ Capture Photo action)
│   ├── locations/                    # Depots & Yards
│   ├── maintenance-planner/          # Maintenance Scheduling
│   ├── rentals/                      # Rental Contracts & Allocations
│   └── repair-jobs/                  # Workshop Work Orders
├── db/
│   ├── schema.cds                    # Domain model
│   └── data/                         # Demo data (CSV), loaded locally and deployed to HDI
├── srv/
│   ├── billing-service/              # Pricing engine & approval workflow
│   ├── inspection-service/           # Inspection lifecycle
│   ├── maintenance-service/          # Repair jobs & maintenance
│   ├── rental-service/               # Contracts, allocation, transfers
│   ├── launchpad-service/            # whoAmI, KPIs, photo evidence upload
│   ├── common/                       # Cloudinary client, draft clean-up
│   └── index.cds                     # Service index
├── test/rets.test.js                 # API tests (npm test)
├── .deploy/app-router/               # SAP Approuter (XSUAA login, CSRF)
├── mta.yaml                          # Multi-Target Application descriptor + role collections
├── xs-security.json                  # XSUAA scopes & role templates
└── package.json                      # Dependencies, CAP config, test logins
```

---

## 🧪 Automated Tests

```bash
npm test
```

The tests need no BTP services: they run against an in-memory SQLite database with the demo data and
test logins per role (`package.json` → `cds.requires.[test]`), and cover login and roles, the rental contract lifecycle, check-out / check-in inspections, locking, photo evidence (including drafts), damage billing and workshop repairs.

---

## 📸 Photographic Evidence Integration (Cloudinary)

During yard inspections and damage billing, the **Capture Photo** action of the photo table opens the capture dialog:

- **Capture**: live camera (WebRTC) or image file from the device, with GPS position when the browser allows it.
- **Integrity**: the browser computes the SHA-256 hash; `LaunchpadService.uploadEvidence` recomputes it from the uploaded bytes and the dialog rejects a mismatch.
- **Storage**: the image goes to Cloudinary (`srv/common/cloudinary.js`); the `DamagePhotos` row stores URL, public ID, hash, GPS, uploader and time.
- **Drafts**: while the inspection or bill is being edited, the photo is added to the draft and activated together with it.
- **Immutability**: photo rows cannot be edited, and photos cannot be added to a locked inspection.

---


## ☁ SAP BTP Deployment (MTA)

**Prerequisites:** Cloud Foundry enabled in the subaccount, SAP HANA Cloud instance **running** and mapped to the CF space,
BAS dev space *Full Stack Cloud Application* (has `mbt` and `cf deploy` built in).

```bash
cd ~/projects/sprint
git pull
npm install
cf login                                   # API endpoint of your subaccount, e.g. https://api.cf.us10-001.hana.ondemand.com
mbt build                                  # creates mta_archives/sprint_1.0.0.mtar
cf deploy mta_archives/sprint_1.0.0.mtar
```

`cf deploy` creates/updates: the HDI container `RETS` (`hdi-shared`), the XSUAA instance `sprint-auth`
(plan `application`), the CAP server `sprint-srv` (512 MB), the approuter `sprint` (256 MB)
and deploys tables + sample data.

**After the deployment**

1. `cf apps` → copy the URL of **sprint** (the approuter) – this is the public link of the app.
2. BTP cockpit → Subaccount → Security → **Role Collections** → add the users
   (identity provider **Default identity provider**; the user needs an SAP account – free at accounts.sap.com):
   - **RETS_Admin (org-space)**, **RETS_Manager (org-space)**, **RETS_Dispatcher (org-space)**, **RETS_YardWorker (org-space)**,
     **RETS_Technician (org-space)**, **RETS_BillingClerk (org-space)**, **RETS_Auditor (org-space)** – see [roles](#-security--role-based-access-rbac).
3. Users open the link → SAP login → Fiori launchpad with the tiles of their role. Logout: `<link>/do/logout`.

**Updating** after code changes: `git pull`, `mbt build`, `cf deploy mta_archives/sprint_1.0.0.mtar` again.

**Trial notes:** HANA Cloud stops every night – start it in HANA Cloud Central; then `cf restart sprint-srv` if needed.

**Cloudinary (optional):** `cf set-env sprint-srv CLOUDINARY_URL "cloudinary://<api_key>:<api_secret>@<cloud_name>"`
and `cf restage sprint-srv` (repeat after each `cf deploy`). Without it, evidence photos are stored as SHA-256 sealed data URIs in HANA.

---

## 🔐 Security & Role-Based Access (RBAC)

Users log in with their SAP account through the approuter (XSUAA). Roles are defined in [`xs-security.json`](xs-security.json)
and enforced by CAP (`@requires` / `@restrict` on services, entities **and actions**):

| Role collection | Role | Sees in the launchpad | Can do |
| :--- | :--- | :--- | :--- |
| **RETS_Admin** | Admin | all 8 tiles | everything |
| **RETS_Manager** | Manager | all 8 tiles | approve / reject bills, lock inspections, pricing rules |
| **RETS_Dispatcher** | Dispatcher | Customers, Fleet, Rentals, Depots, Inspections | customers, depots, contracts, check-out / cancel / transfer |
| **RETS_YardWorker** | YardWorker | Fleet, Depots, Inspections, Damage Charges | inspections, damage records, photo evidence, check-in |
| **RETS_Technician** | Technician | Repair Jobs, Maintenance Planner, Damage Charges | repair jobs, maintenance, release of repaired equipment |
| **RETS_BillingClerk** | BillingClerk | Damage Charge Approval | calculate, adjust, dispute and post repair bills |
| **RETS_Auditor** | Auditor | Fleet, Rentals, Depots, Inspections, Damage Charges | read only |

Deployed app: use the collections named **RETS_&lt;Role&gt; (org-space)**. `…/api/whoAmI()` shows login and roles.

---

## 📋 Business Rules

- **Allocation**: equipment can only be allocated when it is `Available`, has no open repair job and is not booked or selected in another contract.
- **Contracts**: saving a new contract activates it and rents its equipment out; changing an existing contract only validates newly added equipment. Returned, closed and cancelled contracts are read-only.
- **Inspections**: the inspection type is suggested from the contract history (Check-Out, then Check-In) and validated on save. Status changes are applied once, when the inspection is created. A contract becomes `Returned` when its last equipment is checked in.
- **Bill workflow**: `Draft/PendingApproval → Adjusted → Approved → Posted`, with `Rejected` and `Disputed` branches; posted and rejected bills cannot be edited.
- **Repairs**: completing a repair job marks the damage `Repaired` and releases the asset to `Available` (grade B) unless another repair job on it is still open.

---

## 📄 License & Maintainer

Maintained for the **SAP Sprint Project**, originally by **VasuPMen** and Dipeswar Pal.
Built with ❤️ using the SAP Cloud Application Programming Model.
