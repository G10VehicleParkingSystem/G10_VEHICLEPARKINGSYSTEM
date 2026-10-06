const express = require("express");

const {
  getVehicleTracking
} = require("./parking.controller");

const router = express.Router();

router.get(
  "/tracking/:vehicleNumber",
  getVehicleTracking
);

module.exports = router;