const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");
const crypto = require("crypto");

const app = require("../../app");

const Vehicle = require("../../src/modules/vehicle/vehicle.model");
const ParkingSlot = require("../../src/modules/slot/slot.model");
const Reservation = require("../../src/modules/reservation/reservation.model");
const Subscription = require("../../src/modules/subscription/subscription.model");
const Notification = require("../../src/modules/notification/notification.model");

const TEST_DB_URI =
  "mongodb://127.0.0.1:27017/g10_vehicle_parking_test_fr2";

describe("FR-2 Reservation API Integration Tests", () => {
  let userId;
  let vehicleId;
  let slotId;
  let smallSlotId;
  let reservationId;

  const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endTime = new Date(Date.now() + 25 * 60 * 60 * 1000);

  before(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.dropDatabase();

    await Promise.all([
      Vehicle.init(),
      ParkingSlot.init(),
      Reservation.init(),
      Subscription.init(),
      Notification.init()
    ]);

    userId = new mongoose.Types.ObjectId();

    const vehicle = await Vehicle.create({
      vehicleNumber: "KA01FR2001",
      type: "CAR",
      length: 4.5,
      width: 2,
      height: 1.8,
      qrToken: crypto.randomBytes(32).toString("hex")
    });

    vehicleId = vehicle._id;

    const slot = await ParkingSlot.create({
      slotNumber: "A101",
      length: 5,
      width: 2.5,
      height: 2
    });

    slotId = slot._id;

    const smallSlot = await ParkingSlot.create({
      slotNumber: "A102",
      length: 3,
      width: 1.5,
      height: 1.5
    });

    smallSlotId = smallSlot._id;
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  async function createReservation(overrides = {}) {
    return request(app)
      .post("/api/reservations")
      .send({
        userId: userId.toString(),
        vehicleId: vehicleId.toString(),
        slotId: slotId.toString(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        ...overrides
      });
  }

  it("should create a reservation and persist it in MongoDB", async () => {
    const response = await createReservation();

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);

    reservationId = response.body.reservation._id;

    const savedReservation = await Reservation.findById(reservationId);

    assert.ok(savedReservation);
    assert.equal(savedReservation.status, "CONFIRMED");
    assert.equal(savedReservation.userId.toString(), userId.toString());
    assert.equal(savedReservation.slotId.toString(), slotId.toString());
  });

  it("should create a reservation confirmation notification", async () => {
    const notification = await Notification.findOne({
      userId,
      type: "RESERVATION_CONFIRMED",
      relatedId: reservationId
    });

    assert.ok(notification);
    assert.equal(notification.title, "Reservation Confirmed");
    assert.equal(notification.isRead, false);
  });

  it("should reject an overlapping reservation", async () => {
    const response = await createReservation();

    assert.equal(response.status, 400);
    assert.match(response.body.message, /already reserved/i);
  });

  it("should reject a reservation conflicting with an active subscription", async () => {
    const subscriptionSlot = await ParkingSlot.create({
      slotNumber: "A103",
      length: 5,
      width: 2.5,
      height: 2
    });

    await Subscription.create({
      userId,
      vehicleId,
      slotId: subscriptionSlot._id,
      startDate: startTime,
      endDate: endTime,
      monthlyAmount: 2000,
      status: "ACTIVE"
    });

    const response = await createReservation({
      slotId: subscriptionSlot._id.toString()
    });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /already reserved/i);
  });

  it("should reject a vehicle that does not fit the selected slot", async () => {
    const response = await createReservation({
      slotId: smallSlotId.toString()
    });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /does not fit/i);
  });

  it("should reject invalid reservation IDs", async () => {
    const response = await createReservation({
      userId: "invalid-id"
    });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /not a valid id/i);
  });

  it("should reject an invalid time range", async () => {
    const response = await createReservation({
      startTime: endTime.toISOString(),
      endTime: startTime.toISOString()
    });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /End time must be after start time/i);
  });

  it("should reject reservations starting in the past", async () => {
    const response = await createReservation({
      startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /past/i);
  });

  it("should retrieve reservations belonging to a user", async () => {
    const response = await request(app)
      .get(`/api/reservations/my/${userId}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.ok(Array.isArray(response.body.reservations));

    assert.ok(
      response.body.reservations.some(
        (reservation) => reservation._id === reservationId
      )
    );
  });

  it("should reject cancellation by another user", async () => {
    const anotherUserId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .delete(`/api/reservations/${reservationId}`)
      .query({ userId: anotherUserId.toString() });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /not found/i);
  });

  it("should cancel a reservation and update MongoDB", async () => {
    const response = await request(app)
      .delete(`/api/reservations/${reservationId}`)
      .query({ userId: userId.toString() });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.reservation.status, "CANCELLED");

    const savedReservation = await Reservation.findById(reservationId);

    assert.equal(savedReservation.status, "CANCELLED");
  });

  it("should reject cancellation of an already cancelled reservation", async () => {
    const response = await request(app)
      .delete(`/api/reservations/${reservationId}`)
      .query({ userId: userId.toString() });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /already cancelled/i);
  });
});

