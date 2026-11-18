
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../../app");

const Reservation = require("../../src/modules/reservation/reservation.model");
const Payment = require("../../src/modules/payment/payment.model");
const Vehicle = require("../../src/modules/vehicle/vehicle.model");
const ParkingSlot = require("../../src/modules/slot/slot.model");

const TEST_DB_URI =
  "mongodb://127.0.0.1:27017/g10_vehicle_parking_test_fr6";

describe("FR-6 Admin Analytics Integration Tests", () => {
  let vehicleId;
  let slotId;

  before(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.dropDatabase();

    await Promise.all([
      Reservation.init(),
      Payment.init(),
      Vehicle.init(),
      ParkingSlot.init()
    ]);

    const vehicle = await Vehicle.create({
      vehicleNumber: "KA01FR6001",
      type: "CAR",
      length: 4.5,
      width: 2,
      height: 1.8,
      qrToken: `FR6-${new mongoose.Types.ObjectId()}`
    });

    vehicleId = vehicle._id;

    const slot = await ParkingSlot.create({
      slotNumber: "FR601",
      length: 5,
      width: 2.5,
      height: 2,
      status: "OCCUPIED"
    });

    slotId = slot._id;

    const userId = new mongoose.Types.ObjectId();

    await Reservation.create([
      {
        userId,
        vehicleId,
        slotId,
        startTime: new Date("2026-11-16T10:00:00Z"),
        endTime: new Date("2026-11-16T11:00:00Z"),
        status: "CONFIRMED"
      },
      {
        userId,
        vehicleId,
        slotId,
        startTime: new Date("2026-11-16T10:00:00Z"),
        endTime: new Date("2026-11-16T11:00:00Z"),
        status: "COMPLETED"
      },
      {
        userId,
        vehicleId,
        slotId,
        startTime: new Date("2026-11-16T14:00:00Z"),
        endTime: new Date("2026-11-16T15:00:00Z"),
        status: "CANCELLED"
      }
    ]);

    await Payment.create([
      {
        userId,
        reservationId: new mongoose.Types.ObjectId(),
        amount: 100,
        currency: "INR",
        paymentMethod: "UPI",
        status: "SUCCESS",
        transactionId: "FR6-TXN-001",
        providerReference: "FR6-REF-001"
      },
      {
        userId,
        fineId: new mongoose.Types.ObjectId(),
        amount: 200,
        currency: "INR",
        paymentMethod: "CARD",
        status: "SUCCESS",
        transactionId: "FR6-TXN-002",
        providerReference: "FR6-REF-002"
      },
      {
        userId,
        reservationId: new mongoose.Types.ObjectId(),
        amount: 50,
        currency: "INR",
        paymentMethod: "WALLET",
        status: "FAILED",
        transactionId: "FR6-TXN-003",
        providerReference: "NOT_PROCESSED"
      }
    ]);
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("should return the analytics dashboard successfully", async () => {
    const response = await request(app)
      .get("/api/analytics");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.ok(response.body.analytics);
  });

  it("should calculate reservation status summary correctly", async () => {
    const response = await request(app).get("/api/analytics");
    const summary = response.body.analytics.summary;

    assert.equal(summary.totalReservations, 3);
    assert.equal(summary.confirmedReservations, 1);
    assert.equal(summary.completedReservations, 1);
    assert.equal(summary.cancelledReservations, 1);
  });

  it("should calculate current slot occupancy correctly", async () => {
    const response = await request(app).get("/api/analytics");
    const occupancy = response.body.analytics.occupancy.current;

    assert.equal(occupancy.totalSlots, 1);
    assert.equal(occupancy.occupiedSlots, 1);
    assert.equal(occupancy.availableSlots, 0);
    assert.equal(occupancy.occupancyRate, 100);
  });

  it("should identify frequently used parking slots", async () => {
    const response = await request(app).get("/api/analytics");

    const frequentlyUsedSlots =
      response.body.analytics.occupancy.frequentlyUsedSlots;

    assert.equal(frequentlyUsedSlots.length, 1);
    assert.equal(frequentlyUsedSlots[0].slotNumber, "FR601");
    assert.equal(frequentlyUsedSlots[0].reservationCount, 3);
  });

  it("should calculate peak-hour reservation usage", async () => {
    const response = await request(app).get("/api/analytics");
    const peakHours = response.body.analytics.peakHours;

    assert.ok(Array.isArray(peakHours));
    assert.equal(peakHours[0].hour, 15);
    assert.equal(peakHours[0].reservationCount, 2);
  });

  it("should calculate vehicle type breakdown", async () => {
    const response = await request(app).get("/api/analytics");

    const breakdown =
      response.body.analytics.vehicleTypeBreakdown;

    assert.equal(breakdown.length, 1);
    assert.equal(breakdown[0].type, "CAR");
    assert.equal(breakdown[0].reservationCount, 3);
  });

  it("should calculate parking revenue, fine revenue and failed payments", async () => {
    const response = await request(app).get("/api/analytics");
    const revenue = response.body.analytics.revenue;

    assert.equal(revenue.totalRevenue, 300);
    assert.equal(revenue.parkingRevenue, 100);
    assert.equal(revenue.fineRevenue, 200);
    assert.equal(revenue.successfulPayments, 2);
    assert.equal(revenue.failedPayments, 1);
  });

  it("should generate daily revenue entries", async () => {
    const response = await request(app).get("/api/analytics");
    const dailyRevenue = response.body.analytics.revenue.dailyRevenue;

    assert.equal(dailyRevenue.length, 1);
    assert.equal(dailyRevenue[0].amount, 300);
    assert.match(dailyRevenue[0].date, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("FR-6 Analytics Empty Database Integration Test", () => {
  before(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.dropDatabase();
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("should return zero analytics when no records exist", async () => {
    const response = await request(app).get("/api/analytics");

    assert.equal(response.status, 200);
    assert.equal(response.body.analytics.summary.totalReservations, 0);
    assert.equal(response.body.analytics.revenue.totalRevenue, 0);
    assert.equal(response.body.analytics.occupancy.current.totalSlots, 0);
    assert.equal(response.body.analytics.occupancy.current.occupancyRate, 0);
  });
});
