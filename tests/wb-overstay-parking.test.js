// White-box tests for the overstay (FR-5) and parking session (FR-4, FR-8) services.
// Each test is aimed at one branch of the code, so together they cover every decision
// in overstay.service.js and parking.service.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const Reservation = require("../src/modules/reservation/reservation.model");
const OverstayFine = require("../src/modules/overstay/overstay.model");
const ParkingSession = require("../src/modules/parking/parking.model");
const ParkingSlot = require("../src/modules/slot/slot.model");
const Subscription = require("../src/modules/subscription/subscription.model");
const Vehicle = require("../src/modules/vehicle/vehicle.model");
const Notification = require("../src/modules/notification/notification.model");
const overstayService = require("../src/modules/overstay/overstay.service");
const parkingService = require("../src/modules/parking/parking.service");
const { stubModel, id, minutesFromNow } = require("./helpers/test-utils");

// A mongoose-style query: chainable populate/sort/select that resolves to value.
function query(value) {
  const q = {
    populate: () => q,
    select: () => q,
    sort: () => q,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return q;
}

function reservation(overrides = {}) {
  return {
    _id: id(),
    userId: id(),
    vehicleId: id(),
    slotId: id(),
    status: "CONFIRMED",
    startTime: minutesFromNow(-120),
    endTime: minutesFromNow(-30),
    saved: 0,
    async save() {
      this.saved += 1;
      return this;
    },
    ...overrides
  };
}

/* ---------- overstay.service ---------- */

test("WB-OVR-01 detectOverstays fines an overdue booking and alerts the user once", async (t) => {
  const late = reservation();
  const alerts = [];
  let upsert;
  stubModel(t, Reservation, { find: async () => [late] });
  stubModel(t, OverstayFine, {
    findOne: async () => null,
    findOneAndUpdate: async (filter, update) => (upsert = { filter, update, ...update.$set })
  });
  stubModel(t, ParkingSession, { findOne: async () => ({ _id: "session-1" }) });
  stubModel(t, Notification, { create: async (n) => alerts.push(n) });

  const result = await overstayService.detectOverstays(new Date());

  assert.equal(result.detected, 1);
  assert.equal(upsert.update.$set.sessionId, "session-1");
  assert.equal(upsert.update.$set.overdueMinutes, 30);
  assert.equal(upsert.update.$set.fineAmount, 100);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "OVERSTAY");
});

test("WB-OVR-02 an existing fine is updated without a second alert, and no session gives sessionId null", async (t) => {
  const late = reservation();
  const alerts = [];
  let set;
  stubModel(t, Reservation, { find: async () => [late] });
  stubModel(t, OverstayFine, {
    findOne: async () => ({ _id: "fine-1" }),
    findOneAndUpdate: async (filter, update) => (set = update.$set)
  });
  stubModel(t, ParkingSession, { findOne: async () => null });
  stubModel(t, Notification, { create: async (n) => alerts.push(n) });

  await overstayService.detectOverstays(new Date());

  assert.equal(set.sessionId, null);
  assert.equal(alerts.length, 0);
});

test("WB-OVR-03 boundary: a booking that ends exactly now is not fined", async (t) => {
  const now = new Date();
  stubModel(t, Reservation, { find: async () => [reservation({ endTime: now })] });
  stubModel(t, OverstayFine, {
    findOneAndUpdate: async () => assert.fail("no fine expected")
  });

  const result = await overstayService.detectOverstays(now);
  assert.deepEqual(result, { detected: 0, fines: [] });
});

test("WB-OVR-04 getUserFines filters by user and sorts newest first", async (t) => {
  const userId = id();
  let filter, sort;
  stubModel(t, OverstayFine, {
    find: (f) => {
      filter = f;
      return { sort: async (s) => ((sort = s), []) };
    }
  });
  await overstayService.getUserFines(userId);
  assert.deepEqual(filter, { userId });
  assert.deepEqual(sort, { createdAt: -1 });
});

test("WB-OVR-05 checkout refuses an unknown or cancelled reservation", async (t) => {
  stubModel(t, Reservation, { findOne: async () => null });
  await assert.rejects(overstayService.checkout({ reservationId: id(), userId: id() }), /not found/);

  stubModel(t, Reservation, { findOne: async () => reservation({ status: "CANCELLED" }) });
  await assert.rejects(overstayService.checkout({ reservationId: id(), userId: id() }), /Cancelled/);
});

test("WB-OVR-06 checkout of a late booking completes it, fines it and frees the slot", async (t) => {
  const late = reservation();
  const slotUpdates = [];
  stubModel(t, Reservation, { findOne: async () => late });
  stubModel(t, OverstayFine, {
    findOne: async () => null,
    findOneAndUpdate: async (filter, update) => ({ ...update.$set, status: "UNPAID" })
  });
  stubModel(t, ParkingSession, {
    findOne: async () => null,
    findOneAndUpdate: async () => ({ _id: "s1", slotId: late.slotId })
  });
  stubModel(t, ParkingSlot, { updateOne: async (f, u) => slotUpdates.push(u) });
  stubModel(t, Notification, { create: async () => ({}) });

  const result = await overstayService.checkout({ reservationId: late._id, userId: late.userId });

  assert.equal(result.reservation.status, "COMPLETED");
  assert.equal(late.saved, 1);
  assert.equal(result.fine.fineAmount, 100);
  assert.deepEqual(slotUpdates, [{ status: "AVAILABLE" }]);
});

test("WB-OVR-07 checkout on time keeps no fine; an already completed booking is returned as is", async (t) => {
  const onTime = reservation({ endTime: minutesFromNow(30) });
  stubModel(t, Reservation, { findOne: async () => onTime });
  stubModel(t, OverstayFine, { findOne: async () => null });
  stubModel(t, ParkingSession, { findOneAndUpdate: async () => null });

  const result = await overstayService.checkout({ reservationId: onTime._id, userId: onTime.userId });
  assert.equal(result.reservation.status, "COMPLETED");
  assert.equal(result.fine, null);

  const done = reservation({ status: "COMPLETED" });
  stubModel(t, Reservation, { findOne: async () => done });
  stubModel(t, OverstayFine, { findOne: async () => ({ _id: "old-fine" }) });
  const again = await overstayService.checkout({ reservationId: done._id, userId: done.userId });
  assert.equal(again.fine._id, "old-fine");
  assert.equal(done.saved, 0);
});

/* ---------- parking.service: reservation check-in ---------- */

test("WB-PRK-01 checkIn rejects unknown, unconfirmed and finished bookings", async (t) => {
  stubModel(t, Reservation, { findOne: async () => null });
  await assert.rejects(parkingService.checkIn({ reservationId: id(), userId: id() }), /not found/);

  stubModel(t, Reservation, { findOne: async () => reservation({ status: "COMPLETED" }) });
  await assert.rejects(parkingService.checkIn({ reservationId: id(), userId: id() }), /Only confirmed/);

  const now = new Date();
  stubModel(t, Reservation, { findOne: async () => reservation({ endTime: now }) });
  await assert.rejects(parkingService.checkIn({ reservationId: id(), userId: id(), now }), /already ended/);
});

test("WB-PRK-02 checkIn rejects a second check-in and an occupied slot", async (t) => {
  stubModel(t, Reservation, { findOne: async () => reservation({ endTime: minutesFromNow(60) }) });
  stubModel(t, ParkingSession, { findOne: async () => ({ _id: "s" }) });
  await assert.rejects(parkingService.checkIn({ reservationId: id(), userId: id() }), /already checked in/);

  stubModel(t, ParkingSession, { findOne: async () => null });
  stubModel(t, ParkingSlot, { findOneAndUpdate: async () => null });
  await assert.rejects(parkingService.checkIn({ reservationId: id(), userId: id() }), /currently occupied/);
});

test("WB-PRK-03 checkIn occupies the slot and opens an ACTIVE session", async (t) => {
  const booking = reservation({ endTime: minutesFromNow(60) });
  let created;
  stubModel(t, Reservation, { findOne: async () => booking });
  stubModel(t, ParkingSession, { findOne: async () => null, create: async (s) => (created = s) });
  stubModel(t, ParkingSlot, { findOneAndUpdate: async () => ({ _id: booking.slotId }) });

  const session = await parkingService.checkIn({ reservationId: booking._id, userId: booking.userId });
  assert.equal(session.status, "ACTIVE");
  assert.equal(created.slotId, booking.slotId);
});

test("WB-PRK-04 checkIn frees the slot again when the session cannot be saved", async (t) => {
  const booking = reservation({ endTime: minutesFromNow(60) });
  const released = [];
  stubModel(t, Reservation, { findOne: async () => booking });
  stubModel(t, ParkingSession, { findOne: async () => null, create: async () => { throw new Error("write failed"); } });
  stubModel(t, ParkingSlot, {
    findOneAndUpdate: async () => ({ _id: booking.slotId }),
    updateOne: async (f, u) => released.push(u.status)
  });

  await assert.rejects(parkingService.checkIn({ reservationId: booking._id, userId: booking.userId }), /write failed/);
  assert.deepEqual(released, ["AVAILABLE"]);
});

test("WB-PRK-05 completeSession frees the slot only when a session was active", async (t) => {
  const released = [];
  stubModel(t, ParkingSlot, { updateOne: async () => released.push(1) });
  stubModel(t, ParkingSession, { findOneAndUpdate: async () => null });
  assert.equal(await parkingService.completeSession(id()), null);
  assert.equal(released.length, 0);

  stubModel(t, ParkingSession, { findOneAndUpdate: async () => ({ slotId: id() }) });
  await parkingService.completeSession(id());
  assert.equal(released.length, 1);
});

/* ---------- parking.service: monthly pass check-in / out (FR-8) ---------- */

test("WB-PRK-06 subscription check-in covers no pass, already in, slot taken, success and rollback", async (t) => {
  const pass = { _id: id(), userId: id(), vehicleId: id(), slotId: id() };

  stubModel(t, Subscription, { findOne: async () => null });
  await assert.rejects(parkingService.checkInSubscription({ subscriptionId: id(), userId: id() }), /No active subscription/);

  stubModel(t, Subscription, { findOne: async () => pass });
  stubModel(t, ParkingSession, { findOne: async () => ({ _id: "s" }) });
  await assert.rejects(parkingService.checkInSubscription({ subscriptionId: pass._id, userId: pass.userId }), /already checked in/);

  stubModel(t, ParkingSession, { findOne: async () => null, create: async (s) => s });
  stubModel(t, ParkingSlot, { findOneAndUpdate: async () => null });
  await assert.rejects(parkingService.checkInSubscription({ subscriptionId: pass._id, userId: pass.userId }), /currently occupied/);

  stubModel(t, ParkingSlot, { findOneAndUpdate: async () => ({ _id: pass.slotId }) });
  const session = await parkingService.checkInSubscription({ subscriptionId: pass._id, userId: pass.userId });
  assert.equal(session.subscriptionId, pass._id);
  assert.equal(session.reservationId, null);

  const released = [];
  stubModel(t, ParkingSession, { findOne: async () => null, create: async () => { throw new Error("db down"); } });
  stubModel(t, ParkingSlot, {
    findOneAndUpdate: async () => ({ _id: pass.slotId }),
    updateOne: async (f, u) => released.push(u.status)
  });
  await assert.rejects(parkingService.checkInSubscription({ subscriptionId: pass._id, userId: pass.userId }), /db down/);
  assert.deepEqual(released, ["AVAILABLE"]);
});

test("WB-PRK-07 subscription check-out needs an active session and frees the slot", async (t) => {
  stubModel(t, ParkingSession, { findOneAndUpdate: async () => null });
  await assert.rejects(parkingService.checkOutSubscription({ subscriptionId: id(), userId: id() }), /No active parking session/);

  const released = [];
  stubModel(t, ParkingSession, { findOneAndUpdate: async () => ({ slotId: id(), status: "COMPLETED" }) });
  stubModel(t, ParkingSlot, { updateOne: async (f, u) => released.push(u.status) });
  const session = await parkingService.checkOutSubscription({ subscriptionId: id(), userId: id() });
  assert.equal(session.status, "COMPLETED");
  assert.deepEqual(released, ["AVAILABLE"]);
});

test("WB-PRK-08 vehicle tracking: missing number, unknown vehicle, parked and not parked", async (t) => {
  await assert.rejects(parkingService.getVehicleTracking(""), /required/);

  stubModel(t, Vehicle, { findOne: async () => null });
  await assert.rejects(parkingService.getVehicleTracking("ka01"), /not found/);

  const car = { _id: id(), vehicleNumber: "KA01" };
  const slot = { slotNumber: "A-01" };
  stubModel(t, Vehicle, { findOne: async () => car });
  stubModel(t, ParkingSession, {
    findOne: () => query({ slotId: slot }),
    find: () => query([{ slotId: { slotNumber: "B-02" } }])
  });
  const parked = await parkingService.getVehicleTracking("ka01");
  assert.equal(parked.currentSlot.slotNumber, "A-01");
  assert.equal(parked.parkingHistory.length, 1);

  stubModel(t, ParkingSession, { findOne: () => query(null), find: () => query([]) });
  const away = await parkingService.getVehicleTracking("ka01");
  assert.equal(away.currentSlot, null);
});
