const ParkingSession = require("./parking.model");
const Vehicle = require("../vehicle/vehicle.model");
const ParkingSlot = require("../slot/slot.model");
const Reservation = require("../reservation/reservation.model");

async function checkIn({ reservationId, userId, now = new Date() }) {
  const reservation = await Reservation.findOne({
    _id: reservationId,
    userId
  });

  if (!reservation) {
    throw new Error("Reservation not found");
  }

  if (reservation.status !== "CONFIRMED") {
    throw new Error("Only confirmed reservations can be checked in");
  }

  if (now >= reservation.endTime) {
    throw new Error("Reservation has already ended");
  }

  const existingSession = await ParkingSession.findOne({
    reservationId: reservation._id
  });

  if (existingSession) {
    throw new Error("Reservation is already checked in");
  }

  const slot = await ParkingSlot.findOneAndUpdate(
    { _id: reservation.slotId, status: "AVAILABLE" },
    { status: "OCCUPIED" },
    { new: true }
  );

  if (!slot) {
    throw new Error("Parking slot is currently occupied");
  }

  try {
    return await ParkingSession.create({
      reservationId: reservation._id,
      userId: reservation.userId,
      vehicleId: reservation.vehicleId,
      slotId: reservation.slotId,
      entryTime: now,
      status: "ACTIVE"
    });
  } catch (error) {
    await ParkingSlot.updateOne({ _id: slot._id }, { status: "AVAILABLE" });
    throw error;
  }
}

async function completeSession(reservationId, now = new Date()) {
  const session = await ParkingSession.findOneAndUpdate(
    { reservationId, status: "ACTIVE" },
    { status: "COMPLETED", exitTime: now },
    { new: true }
  );

  if (session) {
    await ParkingSlot.updateOne(
      { _id: session.slotId },
      { status: "AVAILABLE" }
    );
  }

  return session;
}

async function getVehicleTracking(vehicleNumber) {
  if (!vehicleNumber) {
    throw new Error("Vehicle number is required");
  }

  const vehicle = await Vehicle.findOne({
    vehicleNumber: vehicleNumber.toUpperCase()
  });

  if (!vehicle) {
    throw new Error("Vehicle not found");
  }

  const currentSession = await ParkingSession.findOne({
    vehicleId: vehicle._id,
    status: "ACTIVE"
  })
    .populate("slotId")
    .sort({ entryTime: -1 });

  const parkingHistory = await ParkingSession.find({
    vehicleId: vehicle._id,
    status: "COMPLETED"
  })
    .populate("slotId")
    .sort({ entryTime: -1 });

  return {
    vehicle,
    currentSlot: currentSession ? currentSession.slotId : null,
    parkingHistory
  };
}

module.exports = {
  checkIn,
  completeSession,
  getVehicleTracking
};
