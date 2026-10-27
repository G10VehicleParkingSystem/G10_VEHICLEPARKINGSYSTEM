const test = require("node:test");
const assert = require("node:assert/strict");

const Reservation = require("../src/modules/reservation/reservation.model");
const Vehicle = require("../src/modules/vehicle/vehicle.model");
const ParkingSlot = require("../src/modules/slot/slot.model");
const Notification = require("../src/modules/notification/notification.model");
const reservationService = require("../src/modules/reservation/reservation.service");
const { createReservation } = require("../src/modules/reservation/reservation.controller");
const {
  createResponse,
  stubModel,
  id,
  minutesFromNow
} = require("./helpers/test-utils");

function reservationInput(overrides = {}) {
  return {
    userId: id().toString(),
    vehicleId: id().toString(),
    slotId: id().toString(),
    startTime: minutesFromNow(60),
    endTime: minutesFromNow(120),
    ...overrides
  };
}

function stubVehicleAndSlot(t, { vehicle, slot }) {
  stubModel(t, Vehicle, { findById: async () => vehicle });
  stubModel(t, ParkingSlot, { findById: async () => slot });
}

const car = { length: 4.5, width: 1.8, height: 1.5 };
const largeSlot = { length: 5, width: 2.5, height: 2.2 };

test("reservation controller requires all fields", async () => {
  const res = createResponse();

  await createReservation({ body: { userId: id().toString() } }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /are required/);
});

test("reservation rejects invalid ids", async () => {
  await assert.rejects(
    () => reservationService.createReservation(reservationInput({ slotId: "abc" })),
    /slotId is not a valid id/
  );
});

test("reservation rejects an end time before the start time", async () => {
  await assert.rejects(
    () =>
      reservationService.createReservation(
        reservationInput({ endTime: minutesFromNow(30) })
      ),
    /End time must be after start time/
  );
});

test("reservation rejects a start time in the past", async () => {
  await assert.rejects(
    () =>
      reservationService.createReservation(
        reservationInput({ startTime: minutesFromNow(-5) })
      ),
    /cannot start in the past/
  );
});

test("reservation rejects a vehicle that does not fit the slot", async (t) => {
  stubVehicleAndSlot(t, {
    vehicle: { length: 8, width: 3, height: 3.5 },
    slot: largeSlot
  });

  await assert.rejects(
    () => reservationService.createReservation(reservationInput()),
    /does not fit/
  );
});

test("reservation rejects overlapping bookings for the same slot", async (t) => {
  let overlapQuery;
  stubVehicleAndSlot(t, { vehicle: car, slot: largeSlot });
  stubModel(t, Reservation, {
    findOne: async (filter) => {
      overlapQuery = filter;
      return { _id: id() };
    }
  });

  const input = reservationInput();
  await assert.rejects(
    () => reservationService.createReservation(input),
    /already reserved/
  );
  assert.equal(overlapQuery.status, "CONFIRMED");
  assert.deepEqual(overlapQuery.startTime, { $lt: input.endTime });
  assert.deepEqual(overlapQuery.endTime, { $gt: input.startTime });
});

test("a confirmed reservation sends a confirmation notification", async (t) => {
  const reservationId = id();
  let notification;
  stubVehicleAndSlot(t, { vehicle: car, slot: largeSlot });
  stubModel(t, Reservation, {
    findOne: async () => null,
    create: async (data) => ({ ...data, _id: reservationId })
  });
  stubModel(t, Notification, {
    create: async (data) => {
      notification = data;
      return data;
    }
  });

  const reservation = await reservationService.createReservation(
    reservationInput()
  );

  assert.equal(reservation.status, "CONFIRMED");
  assert.equal(notification.type, "RESERVATION_CONFIRMED");
  assert.equal(notification.relatedId, reservationId);
});

test("cancellation is refused after the start time", async (t) => {
  stubModel(t, Reservation, {
    findOne: async () => ({
      status: "CONFIRMED",
      startTime: minutesFromNow(-10)
    })
  });

  await assert.rejects(
    () => reservationService.cancelReservation(id(), id()),
    /cannot be cancelled after its start time/
  );
});

test("cancellation marks the reservation cancelled", async (t) => {
  const reservation = {
    status: "CONFIRMED",
    startTime: minutesFromNow(30),
    save: async function save() {
      return this;
    }
  };
  stubModel(t, Reservation, { findOne: async () => reservation });

  const result = await reservationService.cancelReservation(id(), id());

  assert.equal(result.status, "CANCELLED");
});
