
const Vehicle = require("./vehicle.model");
const crypto = require("crypto");
const QRCode = require("qrcode");

async function registerVehicle({
  vehicleNumber,
  type,
  length,
  width,
  height
}) {
  if (
    !vehicleNumber ||
    !type ||
    length === undefined ||
    width === undefined ||
    height === undefined
  ) {
    throw new Error("All vehicle details are required");
  }

  if (
    typeof length !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    throw new Error("Vehicle dimensions must be numbers");
  }

  if (length <= 0 || width <= 0 || height <= 0) {
    throw new Error("Vehicle dimensions must be greater than zero");
  }

  const normalizedNumber = vehicleNumber.trim().toUpperCase();

  const existingVehicle = await Vehicle.findOne({
    vehicleNumber: normalizedNumber
  });

  if (existingVehicle) {
    throw new Error("Vehicle is already registered");
  }

  // Generate a secure, unique token for this vehicle
  const qrToken = crypto.randomBytes(32).toString("hex");

  // Save vehicle details and token in MongoDB
  const vehicle = await Vehicle.create({
    vehicleNumber: normalizedNumber,
    type,
    length,
    width,
    height,
    qrToken
  });

  // Generate QR code containing only the token
  const qrCode = await QRCode.toDataURL(qrToken, {
    errorCorrectionLevel: "H",
    width: 300,
    margin: 2
  });

  return {
    vehicle,
    qrCode
  };
}

async function getVehicle(vehicleNumber) {
  const vehicle = await Vehicle.findOne({
    vehicleNumber: vehicleNumber.toUpperCase()
  });

  if (!vehicle) {
    throw new Error("Vehicle not found");
  }

  return vehicle;
}

// Generate/retrieve QR code for an existing vehicle

async function getVehicleQr(vehicleNumber) {
  const vehicle = await Vehicle.findOne({
    vehicleNumber: vehicleNumber.toUpperCase()
  }).select("+qrToken");

  if (!vehicle) {
    throw new Error("Vehicle not found");
  }

  // Generate a token for older vehicle records
  if (!vehicle.qrToken) {
    vehicle.qrToken = crypto.randomBytes(32).toString("hex");
    await vehicle.save();
  }

  const qrCode = await QRCode.toDataURL(vehicle.qrToken, {
    errorCorrectionLevel: "H",
    width: 300,
    margin: 2
  });

  return qrCode;
}

// Verify a scanned QR code
async function verifyVehicleQr(token) {
  if (!token || typeof token !== "string") {
    throw new Error("Valid QR token is required");
  }

  const vehicle = await Vehicle.findOne({
    qrToken: token
  }).select("+qrToken");

  if (!vehicle) {
    throw new Error("Invalid QR code or vehicle not found");
  }

  // Return vehicle information without exposing the QR token
  return {
    id: vehicle._id,
    vehicleNumber: vehicle.vehicleNumber,
    type: vehicle.type,
    length: vehicle.length,
    width: vehicle.width,
    height: vehicle.height
  };
}

module.exports = {
  registerVehicle,
  getVehicle,
  getVehicleQr,
  verifyVehicleQr
};
