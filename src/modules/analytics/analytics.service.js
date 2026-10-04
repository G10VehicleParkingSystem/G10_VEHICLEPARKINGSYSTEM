const Reservation = require("../reservation/reservation.model");

async function getAnalytics() {
  const reservations = await Reservation.find().lean();

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
  const slotUsage = {};

  reservations.forEach((reservation) => {
    const slot = reservation.slotId?.toString();

    if (!slot) return;

    slotUsage[slot] = (slotUsage[slot] || 0) + 1;
  });

  const frequentlyUsedSlots = Object.entries(slotUsage)
    .map(([slotId, count]) => ({
      slotId,
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
  // vehicleId is kept here because the current reservation
  // module stores vehicleId rather than vehicle type.
  const vehicleUsage = {};

  reservations.forEach((reservation) => {
    const vehicle = reservation.vehicleId?.toString();

    if (!vehicle) return;

    vehicleUsage[vehicle] = (vehicleUsage[vehicle] || 0) + 1;
  });

  const vehicleTypeBreakdown = Object.entries(vehicleUsage)
    .map(([vehicleId, count]) => ({
      vehicleId,
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
      frequentlyUsedSlots
    },

    peakHours,

    vehicleTypeBreakdown,

    revenue: {
      message:
        "Revenue calculation will be connected when the payment module is integrated.",
      totalRevenue: 0
    }
  };
}

module.exports = {
  getAnalytics
};