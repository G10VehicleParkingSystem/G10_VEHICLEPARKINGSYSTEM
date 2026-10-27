const vehicleService = require("./vehicle.service");

async function registerVehicle(req, res) {
  try {
    const vehicle = await vehicleService.registerVehicle(req.body);

    return res.status(201).json({
      success: true,
      message: "Vehicle registered successfully",
      vehicle
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

module.exports = {
  registerVehicle,
  getVehicle
};