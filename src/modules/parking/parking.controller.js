const parkingService = require("./parking.service");

async function checkIn(req, res) {
  try {
    const { reservationId, userId } = req.body;

    if (!reservationId || !userId) {
      return res.status(400).json({
        success: false,
        message: "reservationId and userId are required"
      });
    }

    const session = await parkingService.checkIn({ reservationId, userId });

    return res.status(201).json({
      success: true,
      message: "Vehicle checked in successfully",
      session
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

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
  checkIn,
  getVehicleTracking
};
