const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../../app");

const Payment = require("../../src/modules/payment/payment.model");
const Reservation = require("../../src/modules/reservation/reservation.model");
const OverstayFine = require("../../src/modules/overstay/overstay.model");
const Notification = require("../../src/modules/notification/notification.model");

const TEST_DB_URI =
  "mongodb://127.0.0.1:27017/g10_vehicle_parking_test_fr3";

describe("FR-3 Payment API Integration Tests", () => {
  let userId;
  let reservationId;
  let failedReservationId;
  let fineId;
  let originalGateway;
  let originalRate;

  before(async () => {
    originalGateway = process.env.PAYMENT_GATEWAY;
    originalRate = process.env.HOURLY_PARKING_RATE;

    process.env.PAYMENT_GATEWAY = "demo";
    process.env.HOURLY_PARKING_RATE = "50";

    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.dropDatabase();

    await Promise.all([
      Payment.init(),
      Reservation.init(),
      OverstayFine.init(),
      Notification.init()
    ]);

    userId = new mongoose.Types.ObjectId();

    const reservation = await Reservation.create({
      userId,
      vehicleId: new mongoose.Types.ObjectId(),
      slotId: new mongoose.Types.ObjectId(),
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
      status: "CONFIRMED"
    });

    reservationId = reservation._id;

    const failedReservation = await Reservation.create({
      userId,
      vehicleId: new mongoose.Types.ObjectId(),
      slotId: new mongoose.Types.ObjectId(),
      startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 49 * 60 * 60 * 1000),
      status: "CONFIRMED"
    });

    failedReservationId = failedReservation._id;

    const completedReservation = await Reservation.create({
      userId,
      vehicleId: new mongoose.Types.ObjectId(),
      slotId: new mongoose.Types.ObjectId(),
      startTime: new Date(Date.now() - 3 * 60 * 60 * 1000),
      endTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
      status: "COMPLETED"
    });

    const fine = await OverstayFine.create({
      reservationId: completedReservation._id,
      userId,
      overdueMinutes: 30,
      fineAmount: 100,
      status: "UNPAID"
    });

    fineId = fine._id;
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();

    if (originalGateway === undefined) {
      delete process.env.PAYMENT_GATEWAY;
    } else {
      process.env.PAYMENT_GATEWAY = originalGateway;
    }

    if (originalRate === undefined) {
      delete process.env.HOURLY_PARKING_RATE;
    } else {
      process.env.HOURLY_PARKING_RATE = originalRate;
    }
  });

  it("should process reservation payment and save it in MongoDB", async () => {
    const response = await request(app)
      .post(`/api/payments/reservations/${reservationId}`)
      .send({
        userId: userId.toString(),
        paymentMethod: "UPI"
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.payment.status, "SUCCESS");
    assert.equal(response.body.payment.amount, 100);
    assert.equal(response.body.payment.currency, "INR");

    const savedPayment = await Payment.findOne({
      reservationId,
      status: "SUCCESS"
    });

    assert.ok(savedPayment);
    assert.equal(savedPayment.paymentMethod, "UPI");
  });

  it("should create a payment success notification", async () => {
    const payment = await Payment.findOne({
      reservationId,
      status: "SUCCESS"
    });

    const notification = await Notification.findOne({
      userId,
      relatedId: payment._id,
      type: "PAYMENT_SUCCESS"
    });

    assert.ok(notification);
    assert.equal(notification.title, "Payment Successful");
  });

  it("should return the existing successful payment on retry", async () => {
    const response = await request(app)
      .post(`/api/payments/reservations/${reservationId}`)
      .send({
        userId: userId.toString(),
        paymentMethod: "UPI"
      });

    assert.equal(response.status, 201);

    const payments = await Payment.find({
      reservationId,
      status: "SUCCESS"
    });

    assert.equal(payments.length, 1);
    assert.equal(
      response.body.payment._id,
      payments[0]._id.toString()
    );
  });

  it("should reject an unsupported payment method", async () => {
    const response = await request(app)
      .post(`/api/payments/reservations/${failedReservationId}`)
      .send({
        userId: userId.toString(),
        paymentMethod: "CASH"
      });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /paymentMethod must be one of/i);
  });

  it("should reject payment for a reservation that does not belong to the user", async () => {
    const anotherUserId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .post(`/api/payments/reservations/${reservationId}`)
      .send({
        userId: anotherUserId.toString(),
        paymentMethod: "CARD"
      });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /Reservation not found/i);
  });

  it("should record failed payment when the gateway is unavailable", async () => {
    process.env.PAYMENT_GATEWAY = "unavailable";

    const response = await request(app)
      .post(`/api/payments/reservations/${failedReservationId}`)
      .send({
        userId: userId.toString(),
        paymentMethod: "CARD"
      });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /Payment failed/i);

    const failedPayment = await Payment.findOne({
      reservationId: failedReservationId,
      status: "FAILED"
    });

    assert.ok(failedPayment);
    assert.equal(failedPayment.providerReference, "NOT_PROCESSED");

    const notification = await Notification.findOne({
      userId,
      relatedId: failedPayment._id,
      type: "PAYMENT_FAILED"
    });

    assert.ok(notification);

    process.env.PAYMENT_GATEWAY = "demo";
  });

  it("should process an overstay fine payment after checkout", async () => {
    const response = await request(app)
      .post(`/api/payments/fines/${fineId}`)
      .send({
        userId: userId.toString(),
        paymentMethod: "CARD"
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.payment.status, "SUCCESS");
    assert.equal(response.body.payment.amount, 100);

    const savedFine = await OverstayFine.findById(fineId);
    assert.equal(savedFine.status, "PAID");
    assert.ok(savedFine.paidAt);
  });

  it("should retrieve the user's payment transaction history", async () => {
    const response = await request(app)
      .get(`/api/payments/my/${userId}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.ok(Array.isArray(response.body.transactions));
    assert.ok(response.body.transactions.length >= 3);
  });
});

