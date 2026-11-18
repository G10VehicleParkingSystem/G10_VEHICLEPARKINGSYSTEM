const express = require("express");

const {
  checkIn,
  checkInSubscription,
  checkOutSubscription,
  getVehicleTracking
} = require("./parking.controller");

const { ownVehicleOnly } = require("../vehicle/vehicle.controller");

const router = express.Router();

router.post("/check-in", checkIn);
router.post("/subscription/check-in", checkInSubscription);
router.post(
  "/subscription/:subscriptionId/check-out",
  checkOutSubscription
);

router.get(
  "/tracking/:vehicleNumber",
  ownVehicleOnly,
  getVehicleTracking
);

module.exports = router;
