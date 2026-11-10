const test = require("node:test");
const assert = require("node:assert/strict");

const Vehicle = require("../src/modules/vehicle/vehicle.model");
const ParkingSlot = require("../src/modules/slot/slot.model");
const ParkingSession = require("../src/modules/parking/parking.model");
const Reservation = require("../src/modules/reservation/reservation.model");
const parkingService = require("../src/modules/parking/parking.service");
const { checkIn } = require("../src/modules/parking/parking.controller");
const {
  createResponse,
  stubModel,
  id,
  minutesFromNow
} = require("./helpers/test-utils");

function sessionQuery(result) {
  const query = {
    populate: () => query,
    sort: async () => result
  };
  return query;
}

test("tracking requires a vehicle number", async () => {
  await assert.rejects(
    () => parkingService.getVehicleTracking(""),
    /Vehicle number is required/
  );
});

test("tracking reports an unknown vehicle", async (t) => {
  stubModel(t, Vehicle, { findOne: async () => null });

  await assert.rejects(
    () => parkingService.getVehicleTracking("KA01AB1234"),
    /Vehicle not found/
  );
});

test("tracking returns the current slot and past sessions", async (t) => {
  const slot = { slotNumber: "A1" };
  const history = [{ status: "COMPLETED" }];
  stubModel(t, Vehicle, { findOne: async () => ({ _id: id() }) });
  stubModel(t, ParkingSession, {
    findOne: () => sessionQuery({ slotId: slot }),
    find: () => sessionQuery(history)
  });

  const result = await parkingService.getVehicleTracking("ka01ab1234");

  assert.equal(result.currentSlot, slot);
  assert.equal(result.parkingHistory, history);
});

test("check-in controller requires reservationId and userId", async () => {
  const res = createResponse();

  await checkIn({ body: { userId: id().toString() } }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /reservationId and userId are required/);
});

test("check-in is refused when the slot is occupied", async (t) => {
  stubModel(t, Reservation, {
    findOne: async () => ({
      _id: id(),
      slotId: id(),
      status: "CONFIRMED",
      endTime: minutesFromNow(60)
    })
  });
  stubModel(t, ParkingSession, { findOne: async () => null });
  stubModel(t, ParkingSlot, { findOneAndUpdate: async () => null });

  await assert.rejects(
    () => parkingService.checkIn({ reservationId: id(), userId: id() }),
    /currently occupied/
  );
});

test("check-in opens an active session and occupies the slot", async (t) => {
  const reservation = {
    _id: id(),
    userId: id(),
    vehicleId: id(),
    slotId: id(),
    status: "CONFIRMED",
    endTime: minutesFromNow(60)
  };
  let slotUpdate;
  stubModel(t, Reservation, { findOne: async () => reservation });
  stubModel(t, ParkingSession, {
    findOne: async () => null,
    create: async (data) => data
  });
  stubModel(t, ParkingSlot, {
    findOneAndUpdate: async (filter, update) => {
      slotUpdate = { filter, update };
      return { _id: reservation.slotId };
    }
  });

  const session = await parkingService.checkIn({
    reservationId: reservation._id,
    userId: reservation.userId
  });

  assert.equal(session.status, "ACTIVE");
  assert.equal(session.reservationId, reservation._id);
  assert.deepEqual(slotUpdate.filter, {
    _id: reservation.slotId,
    status: "AVAILABLE"
  });
  assert.deepEqual(slotUpdate.update, { status: "OCCUPIED" });
});

test("completing a session releases the slot", async (t) => {
  const slotId = id();
  let releasedSlot;
  stubModel(t, ParkingSession, {
    findOneAndUpdate: async () => ({ slotId, status: "COMPLETED" })
  });
  stubModel(t, ParkingSlot, {
    updateOne: async (filter, update) => {
      releasedSlot = { filter, update };
    }
  });

  await parkingService.completeSession(id());

  assert.deepEqual(releasedSlot, {
    filter: { _id: slotId },
    update: { status: "AVAILABLE" }
  });
});
