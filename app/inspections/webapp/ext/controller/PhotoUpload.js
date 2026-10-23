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
         * Uploads a photo for the inspection shown on the object page.
         */
        onCapturePhoto: function (oBindingContext) {
            var sId = oBindingContext && oBindingContext.getProperty("ID");
            if (!sId) {
                MessageBox.error("Open the inspection first, then capture the photo.");
                return;
            }

            loadCaptureDialog().then(function () {
                window.openEvidencePhotoCaptureDialog({
                    entityType: "ConditionLogs",
                    entityId: sId,
                    conditionLog_ID: sId,
                    defaultPhotoType: "Return",
                    onSuccess: function () {
                        MessageToast.show("Evidence photo uploaded");
                        // reload the photo table of this inspection (draft or active)
                        oBindingContext.requestSideEffects([{ $NavigationPropertyPath: "photos" }]);
                    }
                });
            }).catch(function (oError) {
                MessageBox.error(oError.message);
            });
        }
    };
});
