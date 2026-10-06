const parkingService = require("./parking.service");

async function getVehicleTracking(req, res) {
  try {
    const { vehicleNumber } = req.params;

    const trackingData =
      await parkingService.getVehicleTracking(vehicleNumber);

    return res.status(200).json({
      success: true,
      message: "Vehicle tracking details retrieved successfully",
      ...trackingData
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = {
  getVehicleTracking
};