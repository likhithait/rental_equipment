sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (MessageToast, MessageBox) {
    "use strict";

    // shared capture dialog (app/common/evidence-capture.js), loaded once per launchpad session
    var oDialogScript = null;
    function loadCaptureDialog() {
        if (window.openEvidencePhotoCaptureDialog) {
            return Promise.resolve();
        }
        if (!oDialogScript) {
            oDialogScript = new Promise(function (resolve, reject) {
                var oScript = document.createElement("script");
                oScript.src = "/common/evidence-capture.js";
                oScript.onload = resolve;
                oScript.onerror = function () {
                    oDialogScript = null;
                    reject(new Error("Photo capture could not be loaded"));
                };
                document.head.appendChild(oScript);
            });
        }
        return oDialogScript;
    }

    return {
        /**
         * "Capture Photo" action of the photo evidence table (see manifest.json).
         * Uploads a photo for the repair bill shown on the object page.
         */
        onCapturePhoto: function (oBindingContext) {
            var sId = oBindingContext && oBindingContext.getProperty("ID");
            if (!sId) {
                MessageBox.error("Open the repair bill first, then capture the photo.");
                return;
            }

            loadCaptureDialog().then(function () {
                window.openEvidencePhotoCaptureDialog({
                    entityType: "RepairBills",
                    entityId: sId,
                    repairBill_ID: sId,
                    defaultPhotoType: "DamageEvidence",
                    onSuccess: function () {
                        MessageToast.show("Evidence photo uploaded");
                        // reload the photo table of this repair bill (draft or active)
                        oBindingContext.requestSideEffects([{ $NavigationPropertyPath: "photos" }]);
                    }
                });
            }).catch(function (oError) {
                MessageBox.error(oError.message);
            });
        }
    };
});
