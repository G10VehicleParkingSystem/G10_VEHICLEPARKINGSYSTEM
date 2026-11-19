
const express = require("express");

const {
  registerVehicle,
  getVehicle,
  getVehicleQr,
  verifyVehicleQr,
  getMyVehicles,
  ownVehicleOnly
} = require("./vehicle.controller");

const router = express.Router();

// Register vehicle and generate QR code
router.post("/", registerVehicle);

// Vehicles registered by the signed-in user
router.get("/mine", getMyVehicles);

// Verify scanned QR code
router.post("/verify-qr", verifyVehicleQr);

// Retrieve QR code for an existing vehicle
router.get("/:vehicleNumber/qr", ownVehicleOnly, getVehicleQr);

// Get vehicle details
router.get("/:vehicleNumber", ownVehicleOnly, getVehicle);

module.exports = router;
