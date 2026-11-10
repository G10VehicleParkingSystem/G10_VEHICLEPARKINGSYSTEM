
const vehicleService = require("./vehicle.service");

async function registerVehicle(req, res) {
  try {
    const result = await vehicleService.registerVehicle(req.body);

    return res.status(201).json({
      success: true,
      message: "Vehicle registered successfully",
      vehicle: {
        _id: result.vehicle._id,
        vehicleNumber: result.vehicle.vehicleNumber,
        type: result.vehicle.type,
        length: result.vehicle.length,
        width: result.vehicle.width,
        height: result.vehicle.height
      },
      qrCode: result.qrCode
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function getVehicle(req, res) {
  try {
    const vehicle = await vehicleService.getVehicle(
      req.params.vehicleNumber
    );

    return res.status(200).json({
      success: true,
      vehicle
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message
    });
  }
}

// Get QR code of a registered vehicle
async function getVehicleQr(req, res) {
  try {
    const qrCode = await vehicleService.getVehicleQr(
      req.params.vehicleNumber
    );

    return res.status(200).json({
      success: true,
      qrCode
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message
    });
  }
}

// Verify scanned QR code
async function verifyVehicleQr(req, res) {
  try {
    const vehicle = await vehicleService.verifyVehicleQr(
      req.body.token
    );

    return res.status(200).json({
      success: true,
      message: "Vehicle identified successfully",
      vehicle
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = {
  registerVehicle,
  getVehicle,
  getVehicleQr,
  verifyVehicleQr
};
