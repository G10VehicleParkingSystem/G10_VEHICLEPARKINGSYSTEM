const express = require("express");

const {
  checkIn,
  checkInSubscription,
  checkOutSubscription,
  getVehicleTracking
} = require("./parking.controller");

const router = express.Router();

router.post("/check-in", checkIn);
router.post("/subscription/check-in", checkInSubscription);
router.post(
  "/subscription/:subscriptionId/check-out",
  checkOutSubscription
);

router.get(
  "/tracking/:vehicleNumber",
  getVehicleTracking
);

module.exports = router;
