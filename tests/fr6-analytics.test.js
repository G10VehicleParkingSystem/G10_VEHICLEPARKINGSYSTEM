const test = require("node:test");
const assert = require("node:assert/strict");

const Reservation = require("../src/modules/reservation/reservation.model");
const Payment = require("../src/modules/payment/payment.model");
const Vehicle = require("../src/modules/vehicle/vehicle.model");
const ParkingSlot = require("../src/modules/slot/slot.model");
const { getAnalytics } = require("../src/modules/analytics/analytics.service");
const { stubModel, lean, id } = require("./helpers/test-utils");

test("analytics aggregates occupancy, vehicle types and revenue", async (t) => {
  const car = id();
  const bike = id();
  const slotA = id();
  const slotB = id();

  stubModel(t, Reservation, {
    find: () =>
      lean([
        { vehicleId: car, slotId: slotA, status: "COMPLETED", startTime: new Date(2026, 9, 20, 9) },
        { vehicleId: car, slotId: slotA, status: "CONFIRMED", startTime: new Date(2026, 9, 21, 9) },
        { vehicleId: bike, slotId: slotB, status: "CANCELLED", startTime: new Date(2026, 9, 21, 18) }
      ])
  });
  stubModel(t, Payment, {
    find: () =>
      lean([
        { amount: 100, status: "SUCCESS", reservationId: id(), createdAt: new Date("2026-10-20T10:00:00Z") },
        { amount: 200, status: "SUCCESS", fineId: id(), createdAt: new Date("2026-10-21T10:00:00Z") },
        { amount: 50, status: "FAILED", reservationId: id(), createdAt: new Date("2026-10-21T11:00:00Z") }
      ])
  });
  stubModel(t, Vehicle, {
    find: () =>
      lean([
        { _id: car, type: "CAR" },
        { _id: bike, type: "BIKE" }
      ])
  });
  stubModel(t, ParkingSlot, {
    find: () =>
      lean([
        { _id: slotA, slotNumber: "A1", status: "OCCUPIED" },
        { _id: slotB, slotNumber: "B1", status: "AVAILABLE" }
      ])
  });

  const analytics = await getAnalytics();

  assert.deepEqual(analytics.summary, {
    totalReservations: 3,
    confirmedReservations: 1,
    completedReservations: 1,
    cancelledReservations: 1
  });
  assert.deepEqual(analytics.occupancy.current, {
    totalSlots: 2,
    occupiedSlots: 1,
    availableSlots: 1,
    occupancyRate: 50
  });
  assert.equal(analytics.occupancy.frequentlyUsedSlots[0].slotNumber, "A1");
  assert.equal(analytics.occupancy.frequentlyUsedSlots[0].reservationCount, 2);
  assert.deepEqual(analytics.peakHours[0], { hour: 9, reservationCount: 2 });
  assert.deepEqual(analytics.vehicleTypeBreakdown, [
    { type: "CAR", reservationCount: 2 },
    { type: "BIKE", reservationCount: 1 }
  ]);
  assert.equal(analytics.revenue.totalRevenue, 300);
  assert.equal(analytics.revenue.parkingRevenue, 100);
  assert.equal(analytics.revenue.fineRevenue, 200);
  assert.equal(analytics.revenue.successfulPayments, 2);
  assert.equal(analytics.revenue.failedPayments, 1);
  assert.deepEqual(analytics.revenue.dailyRevenue, [
    { date: "2026-10-20", amount: 100 },
    { date: "2026-10-21", amount: 200 }
  ]);
});

test("analytics handles an empty facility", async (t) => {
  for (const model of [Reservation, Payment, Vehicle, ParkingSlot]) {
    stubModel(t, model, { find: () => lean([]) });
  }

  const analytics = await getAnalytics();

  assert.equal(analytics.occupancy.current.occupancyRate, 0);
  assert.equal(analytics.revenue.totalRevenue, 0);
  assert.deepEqual(analytics.vehicleTypeBreakdown, []);
});
