const mongoose = require("mongoose");
const Reservation = require("./reservation.model");
const Subscription = require("../subscription/subscription.model");
const Vehicle = require("../vehicle/vehicle.model");
const ParkingSlot = require("../slot/slot.model");
const notificationService = require("../notification/notification.service");
const { vehicleFitsSlot } = require("../slot/slot.service");

const LOCK_HOLD_MS = 5000;

// Runs work() while holding the slot's booking lock. The lock is taken with a single
// atomic update, so only one request per slot can check for overlaps and save at a
// time. It expires after LOCK_HOLD_MS in case a server dies while holding it; a
// request gives up after BOOKING_LOCK_WAIT_MS (default 3 s) of waiting.
async function withSlotLock(slotId, work) {
  const token = new mongoose.Types.ObjectId();
  const giveUpAt = Date.now() + Number(process.env.BOOKING_LOCK_WAIT_MS || 3000);

  for (;;) {
    const now = new Date();
    const result = await ParkingSlot.updateOne(
      {
        _id: slotId,
        $or: [{ bookingLock: null }, { bookingLockExpires: { $lte: now } }]
      },
      {
        $set: {
          bookingLock: token,
          bookingLockExpires: new Date(now.getTime() + LOCK_HOLD_MS)
        }
      }
    );

    if (result.modifiedCount === 1) break;

    if (Date.now() >= giveUpAt) {
      throw new Error("This parking slot is being booked by someone else, please try again");
    }

    await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 30));
  }

  try {
    return await work();
  } finally {
    await ParkingSlot.updateOne(
      { _id: slotId, bookingLock: token },
      { $set: { bookingLock: null, bookingLockExpires: null } }
    );
  }
}

async function checkSlotAvailability(slotId, startTime, endTime) {
  const now = new Date();

  const [overlappingReservation, overlappingSubscription] =
    await Promise.all([
      Reservation.findOne({
        slotId,
        status: "CONFIRMED",
        startTime: { $lt: endTime },
        endTime: { $gt: startTime }
      }),

      Subscription.findOne({
        slotId,
        startDate: { $lt: endTime },
        endDate: { $gt: startTime },
        $or: [
          { status: "ACTIVE" },
          {
            status: "PENDING_PAYMENT",
            pendingExpiresAt: { $gt: now }
          }
        ]
      })
    ]);

  return !overlappingReservation && !overlappingSubscription;
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

  for (const [name, value] of Object.entries({ userId, vehicleId, slotId })) {
    if (!mongoose.isValidObjectId(value)) {
      throw new Error(`${name} is not a valid id`);
    }
  }

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid reservation time");
  }

  if (start >= end) {
    throw new Error("End time must be after start time");
  }

  if (start < new Date()) {
    throw new Error("Reservation cannot start in the past");
  }

  const [vehicle, slot] = await Promise.all([
    Vehicle.findById(vehicleId),
    ParkingSlot.findById(slotId)
  ]);

  if (!vehicle) {
    throw new Error("Vehicle not found");
  }

  if (!slot) {
    throw new Error("Parking slot not found");
  }

  if (!vehicleFitsSlot(vehicle, slot)) {
    throw new Error("Vehicle does not fit the selected parking slot");
  }

  const reservation = await withSlotLock(slotId, async () => {
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
  });

  await notificationService.notifyReservationConfirmed(
    userId,
    reservation._id
  );

  return reservation;
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
