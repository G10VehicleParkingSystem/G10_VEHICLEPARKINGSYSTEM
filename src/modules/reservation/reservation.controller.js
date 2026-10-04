const reservationService = require("./reservation.service");

async function createReservation(req, res) {
  try {
    const {
      userId,
      vehicleId,
      slotId,
      startTime,
      endTime
    } = req.body;

    if (!userId || !vehicleId || !slotId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "userId, vehicleId, slotId, startTime and endTime are required"
      });
    }

    const reservation = await reservationService.createReservation({
      userId,
      vehicleId,
      slotId,
      startTime,
      endTime
    });

    res.status(201).json({
      success: true,
      message: "Parking slot reserved successfully",
      reservation
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function getMyReservations(req, res) {
  try {
    const reservations =
      await reservationService.getUserReservations(req.params.userId);

    res.json({
      success: true,
      reservations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

async function cancelReservation(req, res) {
  try {
    const reservation =
      await reservationService.cancelReservation(
        req.params.id,
        req.query.userId
      );

    res.json({
      success: true,
      message: "Reservation cancelled successfully",
      reservation
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = {
  createReservation,
  getMyReservations,
  cancelReservation
};
