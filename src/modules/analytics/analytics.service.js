const Reservation = require("../reservation/reservation.model");
const Payment = require("../payment/payment.model");
const Vehicle = require("../vehicle/vehicle.model");
const ParkingSlot = require("../slot/slot.model");

function roundAmount(amount) {
  return Number(amount.toFixed(2));
}

function buildRevenueReport(payments) {
  const successfulPayments = payments.filter(
    (payment) => payment.status === "SUCCESS"
  );

  let parkingRevenue = 0;
  let fineRevenue = 0;
  const dailyRevenue = {};

  successfulPayments.forEach((payment) => {
    if (payment.fineId) {
      fineRevenue += payment.amount;
    } else {
      parkingRevenue += payment.amount;
    }

    const day = new Date(payment.createdAt).toISOString().slice(0, 10);
    dailyRevenue[day] = (dailyRevenue[day] || 0) + payment.amount;
  });

  return {
    totalRevenue: roundAmount(parkingRevenue + fineRevenue),
    parkingRevenue: roundAmount(parkingRevenue),
    fineRevenue: roundAmount(fineRevenue),
    successfulPayments: successfulPayments.length,
    failedPayments: payments.filter((payment) => payment.status === "FAILED")
      .length,
    dailyRevenue: Object.entries(dailyRevenue)
      .map(([date, amount]) => ({ date, amount: roundAmount(amount) }))
      .sort((a, b) => a.date.localeCompare(b.date))
  };
}

function buildCurrentOccupancy(slots) {
  const occupiedSlots = slots.filter(
    (slot) => slot.status === "OCCUPIED"
  ).length;

  return {
    totalSlots: slots.length,
    occupiedSlots,
    availableSlots: slots.length - occupiedSlots,
    occupancyRate:
      slots.length === 0
        ? 0
        : roundAmount((occupiedSlots / slots.length) * 100)
  };
}

async function getAnalytics() {
  const [reservations, payments, vehicles, slots] = await Promise.all([
    Reservation.find().lean(),
    Payment.find().lean(),
    Vehicle.find().lean(),
    ParkingSlot.find().lean()
  ]);

  const confirmedReservations = reservations.filter(
    (reservation) => reservation.status === "CONFIRMED"
  );

  const completedReservations = reservations.filter(
    (reservation) => reservation.status === "COMPLETED"
  );

  const cancelledReservations = reservations.filter(
    (reservation) => reservation.status === "CANCELLED"
  );

  // Slot occupancy
  const slotNumbers = {};

  slots.forEach((slot) => {
    slotNumbers[slot._id.toString()] = slot.slotNumber;
  });

  const slotUsage = {};

  reservations.forEach((reservation) => {
    const slot = reservation.slotId?.toString();

    if (!slot) return;

    slotUsage[slot] = (slotUsage[slot] || 0) + 1;
  });

  const frequentlyUsedSlots = Object.entries(slotUsage)
    .map(([slotId, count]) => ({
      slotId,
      slotNumber: slotNumbers[slotId] || null,
      reservationCount: count
    }))
    .sort((a, b) => b.reservationCount - a.reservationCount);

  // Peak-hour analysis
  const hourlyUsage = {};

  reservations.forEach((reservation) => {
    if (!reservation.startTime) return;

    const hour = new Date(reservation.startTime).getHours();

    hourlyUsage[hour] = (hourlyUsage[hour] || 0) + 1;
  });

  const peakHours = Object.entries(hourlyUsage)
    .map(([hour, count]) => ({
      hour: Number(hour),
      reservationCount: count
    }))
    .sort((a, b) => b.reservationCount - a.reservationCount);

  // Vehicle type breakdown
  const vehicleTypes = {};

  vehicles.forEach((vehicle) => {
    vehicleTypes[vehicle._id.toString()] = vehicle.type;
  });

  const typeUsage = {};

  reservations.forEach((reservation) => {
    const type =
      vehicleTypes[reservation.vehicleId?.toString()] || "UNKNOWN";

    typeUsage[type] = (typeUsage[type] || 0) + 1;
  });

  const vehicleTypeBreakdown = Object.entries(typeUsage)
    .map(([type, count]) => ({
      type,
      reservationCount: count
    }))
    .sort((a, b) => b.reservationCount - a.reservationCount);

  return {
    summary: {
      totalReservations: reservations.length,
      confirmedReservations: confirmedReservations.length,
      completedReservations: completedReservations.length,
      cancelledReservations: cancelledReservations.length
    },

    occupancy: {
      current: buildCurrentOccupancy(slots),
      frequentlyUsedSlots
    },

    peakHours,

    vehicleTypeBreakdown,

    revenue: buildRevenueReport(payments)
  };
}

module.exports = {
  getAnalytics
};
