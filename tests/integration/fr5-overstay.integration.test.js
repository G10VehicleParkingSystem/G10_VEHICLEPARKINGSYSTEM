
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../../app");

const Reservation = require("../../src/modules/reservation/reservation.model");
const OverstayFine = require("../../src/modules/overstay/overstay.model");
const ParkingSession = require("../../src/modules/parking/parking.model");
const ParkingSlot = require("../../src/modules/slot/slot.model");
const Notification = require("../../src/modules/notification/notification.model");

const TEST_DB_URI =
  "mongodb://127.0.0.1:27017/g10_vehicle_parking_test_fr5";

describe("FR-5 Overstay and Fine Integration Tests", () => {
  let userId;
  let vehicleId;
  let slotId;
  let overdueReservationId;
  let checkoutReservationId;
  let futureReservationId;
  let cancelledReservationId;
  let originalFineRate;

  before(async () => {
    originalFineRate = process.env.FINE_PER_HOUR;
    process.env.FINE_PER_HOUR = "100";

    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.dropDatabase();

    await Promise.all([
      Reservation.init(),
      OverstayFine.init(),
      ParkingSession.init(),
      ParkingSlot.init(),
      Notification.init()
    ]);

    userId = new mongoose.Types.ObjectId();
    vehicleId = new mongoose.Types.ObjectId();

    const now = Date.now();

    const slot = await ParkingSlot.create({
      slotNumber: "FR501",
      length: 5,
      width: 2.5,
      height: 2,
      status: "OCCUPIED"
    });

    slotId = slot._id;

    const overdueReservation = await Reservation.create({
      userId,
      vehicleId,
      slotId,
      startTime: new Date(now - 3 * 60 * 60 * 1000),
      endTime: new Date(now - 90 * 60 * 1000 + 5000),
      status: "CONFIRMED"
    });

    overdueReservationId = overdueReservation._id;

    const checkoutReservation = await Reservation.create({
      userId,
      vehicleId,
      slotId,
      startTime: new Date(now - 2 * 60 * 60 * 1000),
      endTime: new Date(now - 30 * 60 * 1000),
      status: "CONFIRMED"
    });

    checkoutReservationId = checkoutReservation._id;

    await ParkingSession.create({
      reservationId: checkoutReservationId,
      userId,
      vehicleId,
      slotId,
      entryTime: new Date(now - 2 * 60 * 60 * 1000),
      status: "ACTIVE"
    });

    const futureReservation = await Reservation.create({
      userId,
      vehicleId,
      slotId,
      startTime: new Date(now + 60 * 60 * 1000),
      endTime: new Date(now + 2 * 60 * 60 * 1000),
      status: "CONFIRMED"
    });

    futureReservationId = futureReservation._id;

    const cancelledReservation = await Reservation.create({
      userId,
      vehicleId,
      slotId,
      startTime: new Date(now - 3 * 60 * 60 * 1000),
      endTime: new Date(now - 60 * 60 * 1000),
      status: "CANCELLED"
    });

    cancelledReservationId = cancelledReservation._id;
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();

    if (originalFineRate === undefined) {
      delete process.env.FINE_PER_HOUR;
    } else {
      process.env.FINE_PER_HOUR = originalFineRate;
    }
  });

  it("should detect overdue reservations and create fine records", async () => {
    const response = await request(app)
      .post("/api/overstays/detect");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.detected, 2);

    const fine = await OverstayFine.findOne({
      reservationId: overdueReservationId
    });

    assert.ok(fine);
    assert.equal(fine.status, "UNPAID");
    assert.equal(fine.overdueMinutes, 90);
    assert.equal(fine.fineAmount, 200);
  });

  it("should create an overstay notification", async () => {
    const notification = await Notification.findOne({
      userId,
      relatedId: overdueReservationId,
      type: "OVERSTAY"
    });

    assert.ok(notification);
    assert.equal(notification.title, "Parking Overstay Detected");
  });

  it("should not create duplicate fines or notifications on repeated detection", async () => {
    await request(app)
      .post("/api/overstays/detect")
      .expect(200);

    const fines = await OverstayFine.find({
      reservationId: overdueReservationId
    });

    const notifications = await Notification.find({
      userId,
      relatedId: overdueReservationId,
      type: "OVERSTAY"
    });

    assert.equal(fines.length, 1);
    assert.equal(notifications.length, 1);
  });

  it("should not generate a fine for a reservation that has not expired", async () => {
    const fine = await OverstayFine.findOne({
      reservationId: futureReservationId
    });

    assert.equal(fine, null);
  });

  it("should retrieve fines belonging to a user", async () => {
    const response = await request(app)
      .get(`/api/overstays/my/${userId}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.ok(Array.isArray(response.body.fines));
    assert.equal(response.body.fines.length, 2);
  });

  it("should complete checkout, update the parking session and release the slot", async () => {
    const response = await request(app)
      .post(`/api/overstays/${checkoutReservationId}/checkout`)
      .send({ userId: userId.toString() });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.reservation.status, "COMPLETED");
    assert.ok(response.body.fine);

    const reservation = await Reservation.findById(checkoutReservationId);
    assert.equal(reservation.status, "COMPLETED");

    const session = await ParkingSession.findOne({
      reservationId: checkoutReservationId
    });

    assert.equal(session.status, "COMPLETED");
    assert.ok(session.exitTime);

    const slot = await ParkingSlot.findById(slotId);
    assert.equal(slot.status, "AVAILABLE");
  });

  it("should reject checkout for a cancelled reservation", async () => {
    const response = await request(app)
      .post(`/api/overstays/${cancelledReservationId}/checkout`)
      .send({ userId: userId.toString() });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /Cancelled reservations/i);
  });
});
