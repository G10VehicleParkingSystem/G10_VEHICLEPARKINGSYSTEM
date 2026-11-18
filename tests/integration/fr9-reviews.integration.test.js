const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../../app");

const Review = require("../../src/modules/review/review.model");
const Reservation = require("../../src/modules/reservation/reservation.model");
const ParkingSession = require("../../src/modules/parking/parking.model");
const ParkingSlot = require("../../src/modules/slot/slot.model");

const TEST_DB_URI =
  "mongodb://127.0.0.1:27017/g10_vehicle_parking_test_fr9";

describe("FR-9 Review Integration Tests", () => {
  let userId;
  let otherUserId;
  let slotId;
  let reservationId;
  let incompleteReservationId;
  let reviewId;

  before(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.dropDatabase();

    await Promise.all([
      Review.init(),
      Reservation.init(),
      ParkingSession.init(),
      ParkingSlot.init()
    ]);

    userId = new mongoose.Types.ObjectId();
    otherUserId = new mongoose.Types.ObjectId();

    const slot = await ParkingSlot.create({
      slotNumber: "FR901",
      length: 5,
      width: 2.5,
      height: 2,
      status: "AVAILABLE"
    });

    slotId = slot._id;

    const reservations = await Reservation.create([
      {
        userId,
        vehicleId: new mongoose.Types.ObjectId(),
        slotId,
        startTime: new Date("2026-11-14T10:00:00Z"),
        endTime: new Date("2026-11-14T11:00:00Z"),
        status: "COMPLETED"
      },
      {
        userId,
        vehicleId: new mongoose.Types.ObjectId(),
        slotId,
        startTime: new Date("2026-11-15T10:00:00Z"),
        endTime: new Date("2026-11-15T11:00:00Z"),
        status: "CONFIRMED"
      }
    ]);

    reservationId = reservations[0]._id;
    incompleteReservationId = reservations[1]._id;

    await ParkingSession.create({
      reservationId,
      userId,
      vehicleId: reservations[0].vehicleId,
      slotId,
      entryTime: new Date("2026-11-14T10:00:00Z"),
      exitTime: new Date("2026-11-14T11:00:00Z"),
      status: "COMPLETED"
    });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("should create a review after completed parking", async () => {
    const response = await request(app)
      .post("/api/reviews")
      .send({
        userId: userId.toString(),
        reservationId: reservationId.toString(),
        rating: 5,
        review: "Excellent parking experience"
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.rating, 5);
    assert.equal(response.body.data.slotId, slotId.toString());

    reviewId = response.body.data._id;

    const saved = await Review.findById(reviewId);
    assert.ok(saved);
    assert.equal(saved.review, "Excellent parking experience");
  });

  it("should reject duplicate reviews for the same reservation", async () => {
    const response = await request(app)
      .post("/api/reviews")
      .send({
        userId: userId.toString(),
        reservationId: reservationId.toString(),
        rating: 4,
        review: "Duplicate review"
      });

    assert.equal(response.status, 409);
  });

  it("should reject reviews before parking is completed", async () => {
    const response = await request(app)
      .post("/api/reviews")
      .send({
        userId: userId.toString(),
        reservationId: incompleteReservationId.toString(),
        rating: 4,
        review: "Not completed yet"
      });

    assert.equal(response.status, 400);
  });

  it("should reject reviews for another user's reservation", async () => {
    const response = await request(app)
      .post("/api/reviews")
      .send({
        userId: otherUserId.toString(),
        reservationId: reservationId.toString(),
        rating: 4,
        review: "Unauthorized review"
      });

    assert.equal(response.status, 400);
  });

  it("should reject ratings outside the range 1 to 5", async () => {
    const response = await request(app)
      .post("/api/reviews")
      .send({
        userId: userId.toString(),
        reservationId: incompleteReservationId.toString(),
        rating: 6,
        review: "Invalid rating"
      });

    assert.equal(response.status, 400);
  });

  it("should reject non-integer ratings", async () => {
    const response = await request(app)
      .post("/api/reviews")
      .send({
        userId: userId.toString(),
        reservationId: incompleteReservationId.toString(),
        rating: 3.5,
        review: "Invalid rating"
      });

    assert.equal(response.status, 400);
  });

  it("should reject review text longer than 500 characters", async () => {
    const response = await request(app)
      .post("/api/reviews")
      .send({
        userId: userId.toString(),
        reservationId: incompleteReservationId.toString(),
        rating: 4,
        review: "A".repeat(501)
      });

    assert.equal(response.status, 400);
  });

  it("should retrieve reviews for a parking slot with average rating", async () => {
    const response = await request(app)
      .get(`/api/reviews/slot/${slotId}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.rating.averageRating, 5);
    assert.equal(response.body.rating.totalReviews, 1);
  });

  it("should retrieve reviews submitted by a user", async () => {
    const response = await request(app)
      .get(`/api/reviews/user/${userId}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.length, 1);
  });

  it("should update the user's own review", async () => {
    const response = await request(app)
      .patch(`/api/reviews/${reviewId}`)
      .send({
        userId: userId.toString(),
        rating: 4,
        review: "Good parking experience"
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.rating, 4);
    assert.equal(response.body.data.review, "Good parking experience");

    const saved = await Review.findById(reviewId);
    assert.equal(saved.rating, 4);
  });

  it("should reject another user updating the review", async () => {
    const response = await request(app)
      .patch(`/api/reviews/${reviewId}`)
      .send({
        userId: otherUserId.toString(),
        rating: 2,
        review: "Unauthorized update"
      });

    assert.equal(response.status, 404);
  });

  it("should delete the user's own review", async () => {
    const response = await request(app)
      .delete(`/api/reviews/${reviewId}`)
      .query({ userId: userId.toString() });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    const saved = await Review.findById(reviewId);
    assert.equal(saved, null);
  });

  it("should return zero average rating when a slot has no reviews", async () => {
    const response = await request(app)
      .get(`/api/reviews/slot/${slotId}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.rating.averageRating, 0);
    assert.equal(response.body.rating.totalReviews, 0);
  });
});
