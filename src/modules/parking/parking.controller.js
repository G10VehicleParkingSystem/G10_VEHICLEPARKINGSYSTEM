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

async function checkInSubscription(req, res) {
  try {
    const { subscriptionId, userId } = req.body;

    if (!subscriptionId || !userId) {
      return res.status(400).json({
        success: false,
        message: "subscriptionId and userId are required"
      });
    }

    const session = await parkingService.checkInSubscription({
      subscriptionId,
      userId
    });

    return res.status(201).json({
      success: true,
      message: "Subscription check-in successful",
      data: session
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function checkOutSubscription(req, res) {
  try {
    const { userId } = req.body;
    const { subscriptionId } = req.params;

    if (!subscriptionId || !userId) {
      return res.status(400).json({
        success: false,
        message: "subscriptionId and userId are required"
      });
    }

    const session = await parkingService.checkOutSubscription({
      subscriptionId,
      userId
    });

    return res.status(200).json({
      success: true,
      message: "Subscription check-out successful",
      data: session
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
  checkInSubscription,
  checkOutSubscription,
  getVehicleTracking
};
