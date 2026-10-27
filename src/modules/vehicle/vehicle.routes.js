const express = require("express");

const {
  registerVehicle,
  getVehicle
} = require("./vehicle.controller");

const router = express.Router();

router.post("/", registerVehicle);

router.get("/:vehicleNumber", getVehicle);

module.exports = router;