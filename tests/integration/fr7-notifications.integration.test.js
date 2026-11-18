const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../../app");
const Notification = require("../../src/modules/notification/notification.model");

const TEST_DB_URI =
  "mongodb://127.0.0.1:27017/g10_vehicle_parking_test_fr7";

describe("FR-7 Notification API Integration Tests", () => {
  let userId;
  let otherUserId;
  let notificationId;

  before(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.dropDatabase();
    await Notification.init();

    userId = new mongoose.Types.ObjectId().toString();
    otherUserId = new mongoose.Types.ObjectId().toString();
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("should create a notification and persist it in MongoDB", async () => {
    const response = await request(app)
      .post("/api/notifications")
      .send({
        userId,
        type: "RESERVATION_CONFIRMED",
        title: "Reservation Confirmed",
        message: "Your parking reservation is confirmed."
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.notification.isRead, false);

    const saved = await Notification.findById(
      response.body.notification._id
    );

    assert.ok(saved);
    assert.equal(saved.title, "Reservation Confirmed");
    notificationId = saved._id.toString();
  });

  it("should reject notification creation when required fields are missing", async () => {
    const response = await request(app)
      .post("/api/notifications")
      .send({
        userId,
        type: "PAYMENT_SUCCESS",
        title: "Payment Successful"
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should reject an unsupported notification type", async () => {
    const response = await request(app)
      .post("/api/notifications")
      .send({
        userId,
        type: "INVALID_TYPE",
        title: "Invalid",
        message: "Invalid notification type"
      });

    assert.equal(response.status, 400);
  });

  it("should retrieve notifications belonging to a user", async () => {
    await request(app)
      .post("/api/notifications")
      .send({
        userId,
        type: "PAYMENT_SUCCESS",
        title: "Payment Successful",
        message: "Payment received."
      });

    const response = await request(app)
      .get(`/api/notifications/${userId}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.notifications.length, 2);

    assert.ok(
      response.body.notifications.every(
        (notification) => notification.userId === userId
      )
    );
  });

  it("should not return another user's notifications", async () => {
    const response = await request(app)
      .get(`/api/notifications/${otherUserId}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.notifications.length, 0);
  });

  it("should mark a notification as read and persist the change", async () => {
    const response = await request(app)
      .patch(`/api/notifications/${notificationId}/read`)
      .query({ userId });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.notification.isRead, true);

    const saved = await Notification.findById(notificationId);
    assert.equal(saved.isRead, true);
  });

  it("should reject marking another user's notification as read", async () => {
    const response = await request(app)
      .patch(`/api/notifications/${notificationId}/read`)
      .query({ userId: otherUserId });

    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
  });

  it("should return 404 for a non-existent notification", async () => {
    const missingId = new mongoose.Types.ObjectId().toString();

    const response = await request(app)
      .patch(`/api/notifications/${missingId}/read`)
      .query({ userId });

    assert.equal(response.status, 404);
  });

  it("should reject an invalid notification ID", async () => {
    const response = await request(app)
      .patch("/api/notifications/invalid-id/read")
      .query({ userId });

    assert.equal(response.status, 500);
    assert.equal(response.body.success, false);
  });
});
