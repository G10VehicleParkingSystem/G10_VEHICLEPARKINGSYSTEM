const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../../app");

const Subscription = require("../../src/modules/subscription/subscription.model");
const Vehicle = require("../../src/modules/vehicle/vehicle.model");
const ParkingSlot = require("../../src/modules/slot/slot.model");
const Payment = require("../../src/modules/payment/payment.model");

const TEST_DB_URI =
  "mongodb://127.0.0.1:27017/g10_vehicle_parking_test_fr8";

describe("FR-8 Subscription Integration Tests", () => {
  let userId;
  let vehicleId;
  let slotId;
  let secondSlotId;
  let subscriptionId;

  const originalGateway = process.env.PAYMENT_GATEWAY;
  const originalRate = process.env.MONTHLY_SUBSCRIPTION_RATE;

  before(async () => {
    process.env.PAYMENT_GATEWAY = "demo";
    process.env.MONTHLY_SUBSCRIPTION_RATE = "3000";

    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.dropDatabase();

    await Promise.all([
      Subscription.init(),
      Vehicle.init(),
      ParkingSlot.init(),
      Payment.init()
    ]);

    userId = new mongoose.Types.ObjectId();

    const vehicle = await Vehicle.create({
      vehicleNumber: "KA01FR8001",
      type: "CAR",
      length: 4.5,
      width: 2,
      height: 1.8,
      qrToken: `FR8-${new mongoose.Types.ObjectId()}`
    });

    vehicleId = vehicle._id;

    const slots = await ParkingSlot.create([
      {
        slotNumber: "FR801",
        length: 5,
        width: 2.5,
        height: 2,
        status: "AVAILABLE"
      },
      {
        slotNumber: "FR802",
        length: 5,
        width: 2.5,
        height: 2,
        status: "AVAILABLE"
      }
    ]);

    slotId = slots[0]._id;
    secondSlotId = slots[1]._id;
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
      delete process.env.MONTHLY_SUBSCRIPTION_RATE;
    } else {
      process.env.MONTHLY_SUBSCRIPTION_RATE = originalRate;
    }
  });

  it("should return the monthly subscription plan", async () => {
    const response = await request(app)
      .get("/api/subscriptions/plans");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.plan.amount, 3000);
    assert.equal(response.body.plan.durationMonths, 1);
    assert.equal(response.body.plan.currency, "INR");
  });

  it("should create and activate a subscription with successful payment", async () => {
    const response = await request(app)
      .post("/api/subscriptions")
      .send({
        userId: userId.toString(),
        vehicleId: vehicleId.toString(),
        slotId: slotId.toString(),
        paymentMethod: "UPI"
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.subscription.status, "ACTIVE");
    assert.equal(response.body.subscription.monthlyAmount, 3000);
    assert.equal(response.body.payment.status, "SUCCESS");

    subscriptionId = response.body.subscription._id;

    const saved = await Subscription.findById(subscriptionId);
    assert.equal(saved.status, "ACTIVE");
    assert.equal(saved.pendingExpiresAt, null);
    assert.ok(saved.paymentId);
  });

  it("should persist the subscription payment", async () => {
    const payments = await Payment.find({
      subscriptionId
    });

    assert.equal(payments.length, 1);
    assert.equal(payments[0].amount, 3000);
    assert.equal(payments[0].status, "SUCCESS");
  });

  it("should reject another subscription for an already locked slot", async () => {
    const response = await request(app)
      .post("/api/subscriptions")
      .send({
        userId: userId.toString(),
        vehicleId: vehicleId.toString(),
        slotId: slotId.toString(),
        paymentMethod: "UPI"
      });

    assert.equal(response.status, 400);
  });

  it("should reject subscription creation when required fields are missing", async () => {
    const response = await request(app)
      .post("/api/subscriptions")
      .send({
        userId: userId.toString(),
        vehicleId: vehicleId.toString()
      });

    assert.equal(response.status, 400);
  });

  it("should reject subscription creation for an invalid vehicle ID", async () => {
    const response = await request(app)
      .post("/api/subscriptions")
      .send({
        userId: userId.toString(),
        vehicleId: "invalid-id",
        slotId: secondSlotId.toString(),
        paymentMethod: "UPI"
      });

    assert.equal(response.status, 400);
  });

  it("should retrieve subscriptions belonging to the user", async () => {
    const response = await request(app)
      .get(`/api/subscriptions/my/${userId}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.subscriptions.length, 1);
    assert.equal(
      response.body.subscriptions[0]._id,
      subscriptionId
    );
  });

  it("should renew an active subscription and extend its end date", async () => {
    const beforeRenewal = await Subscription.findById(subscriptionId);
    const oldEndDate = new Date(beforeRenewal.endDate);

    const response = await request(app)
      .post(`/api/subscriptions/${subscriptionId}/renew`)
      .send({
        userId: userId.toString(),
        paymentMethod: "CARD"
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.subscription.status, "ACTIVE");
    assert.equal(response.body.payment.status, "SUCCESS");

    const updated = await Subscription.findById(subscriptionId);

    assert.ok(new Date(updated.endDate) > oldEndDate);
    assert.equal(updated.cancelAtPeriodEnd, false);
  });

  it("should schedule subscription cancellation at period end", async () => {
    const response = await request(app)
      .patch(`/api/subscriptions/${subscriptionId}/cancel`)
      .send({
        userId: userId.toString()
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(
      response.body.subscription.cancelAtPeriodEnd,
      true
    );

    const saved = await Subscription.findById(subscriptionId);
    assert.equal(saved.status, "ACTIVE");
    assert.equal(saved.cancelAtPeriodEnd, true);
  });

  it("should reject duplicate cancellation requests", async () => {
    const response = await request(app)
      .patch(`/api/subscriptions/${subscriptionId}/cancel`)
      .send({
        userId: userId.toString()
      });

    assert.equal(response.status, 400);
  });

  it("should reject renewal by another user", async () => {
    const response = await request(app)
      .post(`/api/subscriptions/${subscriptionId}/renew`)
      .send({
        userId: new mongoose.Types.ObjectId().toString(),
        paymentMethod: "UPI"
      });

    assert.equal(response.status, 400);
  });
});
