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
const ParkingSession = require("../../src/modules/parking/parking.model");

const TEST_DB_URI =
  "mongodb://127.0.0.1:27017/g10_vehicle_parking_test_fr4";

describe("FR-4 Parking and Vehicle Tracking Integration Tests", () => {
  let userId;
  let vehicleId;
  let vehicleNumber;
  let slotId;
  let subscriptionId;
  let reservationId;
  let occupiedReservationId;
  let cancelledReservationId;
  let expiredReservationId;

  before(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.dropDatabase();

    await Promise.all([
      Vehicle.init(),
      ParkingSlot.init(),
      Reservation.init(),
      Subscription.init(),
      ParkingSession.init()
    ]);

    userId = new mongoose.Types.ObjectId();
    vehicleNumber = "KA01FR4001";

    const vehicle = await Vehicle.create({
      vehicleNumber,
      type: "CAR",
      length: 4.5,
      width: 2,
      height: 1.8,
      qrToken: crypto.randomBytes(32).toString("hex")
    });

    vehicleId = vehicle._id;

    const slot = await ParkingSlot.create({
      slotNumber: "FR401",
      length: 5,
      width: 2.5,
      height: 2,
      status: "AVAILABLE"
    });

    slotId = slot._id;

    const subscriptionSlot = await ParkingSlot.create({
      slotNumber: "FR402",
      length: 5,
      width: 2.5,
      height: 2,
      status: "AVAILABLE"
    });

    const now = new Date();

    const reservation = await Reservation.create({
      userId,
      vehicleId,
      slotId,
      startTime: new Date(now.getTime() - 5 * 60 * 1000),
      endTime: new Date(now.getTime() + 60 * 60 * 1000),
      status: "CONFIRMED"
    });

    reservationId = reservation._id;

    const occupiedReservation = await Reservation.create({
      userId,
      vehicleId,
      slotId,
      startTime: new Date(now.getTime() - 5 * 60 * 1000),
      endTime: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      status: "CONFIRMED"
    });

    occupiedReservationId = occupiedReservation._id;

    const cancelledReservation = await Reservation.create({
      userId,
      vehicleId,
      slotId,
      startTime: new Date(now.getTime() - 5 * 60 * 1000),
      endTime: new Date(now.getTime() + 60 * 60 * 1000),
      status: "CANCELLED"
    });

    cancelledReservationId = cancelledReservation._id;

    const expiredReservation = await Reservation.create({
      userId,
      vehicleId,
      slotId,
      startTime: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() - 60 * 60 * 1000),
      status: "CONFIRMED"
    });

    expiredReservationId = expiredReservation._id;

    const subscription = await Subscription.create({
      userId,
      vehicleId,
      slotId: subscriptionSlot._id,
      startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      monthlyAmount: 2000,
      status: "ACTIVE"
    });

    subscriptionId = subscription._id;
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("should check in a reserved vehicle and create an active session", async () => {
    const response = await request(app)
      .post("/api/parking/check-in")
      .send({
        reservationId: reservationId.toString(),
        userId: userId.toString()
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.session.status, "ACTIVE");

    const session = await ParkingSession.findOne({ reservationId });
    assert.ok(session);
    assert.equal(session.status, "ACTIVE");
  });

  it("should mark the parking slot as occupied after check-in", async () => {
    const slot = await ParkingSlot.findById(slotId);
    assert.equal(slot.status, "OCCUPIED");
  });

  it("should reject duplicate check-in for the same reservation", async () => {
    const response = await request(app)
      .post("/api/parking/check-in")
      .send({
        reservationId: reservationId.toString(),
        userId: userId.toString()
      });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /already checked in/i);
  });

  it("should reject check-in when the parking slot is occupied", async () => {
    const response = await request(app)
      .post("/api/parking/check-in")
      .send({
        reservationId: occupiedReservationId.toString(),
        userId: userId.toString()
      });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /currently occupied/i);
  });

  it("should reject check-in for a cancelled reservation", async () => {
    const response = await request(app)
      .post("/api/parking/check-in")
      .send({
        reservationId: cancelledReservationId.toString(),
        userId: userId.toString()
      });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /Only confirmed reservations/i);
  });

  it("should reject check-in for an expired reservation", async () => {
    const response = await request(app)
      .post("/api/parking/check-in")
      .send({
        reservationId: expiredReservationId.toString(),
        userId: userId.toString()
      });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /already ended/i);
  });

  it("should check in an active subscription and occupy its slot", async () => {
    const response = await request(app)
      .post("/api/parking/subscription/check-in")
      .send({
        subscriptionId: subscriptionId.toString(),
        userId: userId.toString()
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.status, "ACTIVE");

    const session = await ParkingSession.findOne({
      subscriptionId,
      status: "ACTIVE"
    });

    assert.ok(session);

    const slot = await ParkingSlot.findById(session.slotId);
    assert.equal(slot.status, "OCCUPIED");
  });

  it("should check out a subscription and release its slot", async () => {
    const response = await request(app)
      .post(`/api/parking/subscription/${subscriptionId}/check-out`)
      .send({ userId: userId.toString() });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.status, "COMPLETED");

    const session = await ParkingSession.findOne({
      subscriptionId,
      status: "COMPLETED"
    });

    assert.ok(session);
    assert.ok(session.exitTime);

    const slot = await ParkingSlot.findById(session.slotId);
    assert.equal(slot.status, "AVAILABLE");
  });

  it("should return current vehicle tracking and completed parking history", async () => {
    const response = await request(app)
      .get(`/api/parking/tracking/${vehicleNumber}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.vehicle.vehicleNumber, vehicleNumber);

    assert.equal(response.body.currentSlot.slotNumber, "FR401");
    assert.ok(Array.isArray(response.body.parkingHistory));

    assert.ok(
      response.body.parkingHistory.some(
        (session) => session.status === "COMPLETED"
      )
    );
  });

  it("should return 404 for an unknown vehicle", async () => {
    const response = await request(app)
      .get("/api/parking/tracking/KA99UNKNOWN");

    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
  });
});
