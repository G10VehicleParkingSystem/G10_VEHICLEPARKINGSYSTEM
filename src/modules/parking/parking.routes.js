const express = require("express");

const {
  checkIn,
  getVehicleTracking
} = require("./parking.controller");

const router = express.Router();

router.post("/check-in", checkIn);

router.get(
  "/tracking/:vehicleNumber",
  getVehicleTracking
);

module.exports = router;
