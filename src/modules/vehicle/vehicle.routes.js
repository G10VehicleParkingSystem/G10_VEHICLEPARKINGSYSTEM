
const express = require("express");

const {
  registerVehicle,
  getVehicle,
  getVehicleQr,
  verifyVehicleQr
} = require("./vehicle.controller");

const router = express.Router();

// Register vehicle and generate QR code
router.post("/", registerVehicle);

// Verify scanned QR code
router.post("/verify-qr", verifyVehicleQr);

// Retrieve QR code for an existing vehicle
router.get("/:vehicleNumber/qr", getVehicleQr);

// Get vehicle details
router.get("/:vehicleNumber", getVehicle);

module.exports = router;
