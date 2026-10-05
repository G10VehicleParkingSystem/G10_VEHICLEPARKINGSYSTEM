const Reservation = require("../reservation/reservation.model");
const OverstayFine = require("./overstay.model");
const notificationService = require("../notification/notification.service");
const { calculateOverstayFine } = require("../payment/payment.calculations");

function getFineRate() {
  return Number(process.env.FINE_PER_HOUR || 100);
}

async function updateFineForReservation(reservation, now) {
  const { overdueMinutes, fineAmount } = calculateOverstayFine(
    reservation.endTime,
    now,
    getFineRate()
  );
  if (overdueMinutes === 0) {
    return null;
  }

  const existingFine = await OverstayFine.findOne({
    reservationId: reservation._id
  });
  const fine = await OverstayFine.findOneAndUpdate(
    { reservationId: reservation._id },
    {
      $set: { userId: reservation.userId, overdueMinutes, fineAmount },
      $setOnInsert: { status: "UNPAID" }
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  if (!existingFine) {
    await notificationService.notifyOverstay(
      reservation.userId,
      reservation._id,
      fineAmount
    );
  }
  return fine;
}

async function detectOverstays(now = new Date()) {
  const reservations = await Reservation.find({
    status: "CONFIRMED",
    endTime: { $lte: now }
  });
  const fines = [];

  for (const reservation of reservations) {
    const fine = await updateFineForReservation(reservation, now);
    if (fine) {
      fines.push(fine);
    }
  }

  return { detected: fines.length, fines };
}

async function getUserFines(userId) {
  return OverstayFine.find({ userId }).sort({ createdAt: -1 });
}

async function checkout({ reservationId, userId, now = new Date() }) {
  const reservation = await Reservation.findOne({
    _id: reservationId,
    userId
  });
  if (!reservation) {
    throw new Error("Reservation not found");
  }
  if (reservation.status === "CANCELLED") {
    throw new Error("Cancelled reservations cannot be checked out");
  }

  let fine = await OverstayFine.findOne({ reservationId: reservation._id });
  if (reservation.status === "CONFIRMED") {
    fine = await updateFineForReservation(reservation, now) || fine;
    reservation.status = "COMPLETED";
    await reservation.save();
  }

  return { reservation, fine };
}

module.exports = { detectOverstays, getUserFines, checkout };