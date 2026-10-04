const Reservation = require("./reservation.model");

async function checkSlotAvailability(slotId, startTime, endTime) {
  const overlappingReservation = await Reservation.findOne({
    slotId,
    status: "CONFIRMED",
    startTime: { $lt: endTime },
    endTime: { $gt: startTime }
  });

  return !overlappingReservation;
}

async function createReservation({
  userId,
  vehicleId,
  slotId,
  startTime,
  endTime
}) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid reservation time");
  }

  if (start >= end) {
    throw new Error("End time must be after start time");
  }

  if (start < new Date()) {
    throw new Error("Reservation cannot start in the past");
  }

  const available = await checkSlotAvailability(slotId, start, end);

  if (!available) {
    throw new Error(
      "This parking slot is already reserved for the selected time"
    );
  }

  return Reservation.create({
    userId,
    vehicleId,
    slotId,
    startTime: start,
    endTime: end,
    status: "CONFIRMED"
  });
}

async function getUserReservations(userId) {
  return Reservation.find({ userId }).sort({ startTime: 1 });
}

async function cancelReservation(reservationId, userId) {
  const reservation = await Reservation.findOne({
    _id: reservationId,
    userId
  });

  if (!reservation) {
    throw new Error("Reservation not found");
  }

  if (reservation.status === "CANCELLED") {
    throw new Error("Reservation is already cancelled");
  }

  if (new Date() >= reservation.startTime) {
    throw new Error(
      "Reservation cannot be cancelled after its start time"
    );
  }

  reservation.status = "CANCELLED";
  return reservation.save();
}

module.exports = {
  checkSlotAvailability,
  createReservation,
  getUserReservations,
  cancelReservation
};
