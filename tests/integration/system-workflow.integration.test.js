
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../../app");

const Vehicle = require("../../src/modules/vehicle/vehicle.model");
const ParkingSlot = require("../../src/modules/slot/slot.model");
const Reservation = require("../../src/modules/reservation/reservation.model");
const Payment = require("../../src/modules/payment/payment.model");
const ParkingSession = require("../../src/modules/parking/parking.model");
const OverstayFine = require("../../src/modules/overstay/overstay.model");
const Notification = require("../../src/modules/notification/notification.model");

const TEST_DB_URI =
  "mongodb://127.0.0.1:27017/g10_vehicle_parking_test_workflow";

describe("Complete Vehicle Parking System - End-to-End Integration", () => {
  let userId;
  let vehicleId;
  let slotId;
  let reservationId;
  let fineId;
  let originalEnvironment;

  before(async () => {
    originalEnvironment = {
      PAYMENT_GATEWAY: process.env.PAYMENT_GATEWAY,
      HOURLY_PARKING_RATE: process.env.HOURLY_PARKING_RATE,
      FINE_PER_HOUR: process.env.FINE_PER_HOUR
    };

    process.env.PAYMENT_GATEWAY = "demo";
    process.env.HOURLY_PARKING_RATE = "50";
    process.env.FINE_PER_HOUR = "100";

    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.dropDatabase();

    await Promise.all([
      Vehicle.init(),
      ParkingSlot.init(),
      Reservation.init(),
      Payment.init(),
      ParkingSession.init(),
      OverstayFine.init(),
      Notification.init()
    ]);

    userId = new mongoose.Types.ObjectId();
  });

  after(async () => {
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
      }
    } finally {
      for (const [key, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("should complete the entire vehicle registration, booking, payment, parking, overstay and checkout workflow", async () => {

    // STEP 1: Register a vehicle
    const vehicleResponse = await request(app)
      .post("/api/vehicles")
      .send({
        vehicleNumber: "KA01WF9001",
        type: "CAR",
        length: 4.5,
        width: 2,
        height: 1.8
      });

    assert.equal(vehicleResponse.status, 201);
    assert.equal(vehicleResponse.body.success, true);
    assert.equal(
      vehicleResponse.body.vehicle.vehicleNumber,
      "KA01WF9001"
    );

    vehicleId = vehicleResponse.body.vehicle._id;

    const savedVehicle = await Vehicle.findById(vehicleId);
    assert.ok(savedVehicle);
    assert.equal(savedVehicle.type, "CAR");

    // STEP 2: Create a parking slot
    const slotResponse = await request(app)
      .post("/api/slots")
      .send({
        slotNumber: "WF901",
        length: 5,
        width: 2.5,
        height: 2
      });

    assert.equal(slotResponse.status, 201);
    assert.equal(slotResponse.body.success, true);

    slotId = slotResponse.body.slot._id;

    const savedSlot = await ParkingSlot.findById(slotId);
    assert.ok(savedSlot);
    assert.equal(savedSlot.status, "AVAILABLE");

    // STEP 3: Create a reservation
    const startTime = new Date(Date.now() + 60 * 1000);
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

    const reservationResponse = await request(app)
      .post("/api/reservations")
      .send({
        userId: userId.toString(),
        vehicleId,
        slotId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      });

    assert.equal(reservationResponse.status, 201);
    assert.equal(reservationResponse.body.success, true);
    assert.equal(
      reservationResponse.body.reservation.status,
      "CONFIRMED"
    );

    reservationId = reservationResponse.body.reservation._id;

    const savedReservation = await Reservation.findById(reservationId);
    assert.ok(savedReservation);
    assert.equal(savedReservation.status, "CONFIRMED");

    // STEP 4: Pay for the reservation
    const paymentResponse = await request(app)
      .post(`/api/payments/reservations/${reservationId}`)
      .send({
        userId: userId.toString(),
        paymentMethod: "UPI"
      });

    assert.equal(paymentResponse.status, 201);
    assert.equal(paymentResponse.body.success, true);
    assert.equal(paymentResponse.body.payment.status, "SUCCESS");

    const parkingPayment = await Payment.findOne({
      reservationId,
      status: "SUCCESS"
    });

    assert.ok(parkingPayment);
    assert.equal(parkingPayment.paymentMethod, "UPI");

    // STEP 5: Check in the vehicle
    const checkInResponse = await request(app)
      .post("/api/parking/check-in")
      .send({
        reservationId,
        userId: userId.toString()
      });

    assert.equal(checkInResponse.status, 201);
    assert.equal(checkInResponse.body.success, true);
    assert.equal(checkInResponse.body.session.status, "ACTIVE");

    const activeSession = await ParkingSession.findOne({
      reservationId,
      status: "ACTIVE"
    });

    assert.ok(activeSession);

    const occupiedSlot = await ParkingSlot.findById(slotId);
    assert.equal(occupiedSlot.status, "OCCUPIED");

    // STEP 6: Verify vehicle tracking
    const trackingResponse = await request(app)
      .get("/api/parking/tracking/KA01WF9001");

    assert.equal(trackingResponse.status, 200);
    assert.equal(trackingResponse.body.success, true);
    assert.ok(trackingResponse.body.currentSlot);

    // STEP 7: Simulate an overstay.
    // Move the reservation end time into the past in MongoDB.
    const overdueEndTime = new Date(Date.now() - 60 * 1000);

    await Reservation.updateOne(
      { _id: reservationId },
      { $set: { endTime: overdueEndTime } }
    );

    const updatedReservation = await Reservation.findById(reservationId);
    assert.ok(updatedReservation.endTime <= new Date());

    // STEP 8: Detect overstay and generate a fine
    const overstayResponse = await request(app)
      .post("/api/overstays/detect");

    assert.equal(overstayResponse.status, 200);
    assert.equal(overstayResponse.body.success, true);
    assert.equal(overstayResponse.body.detected, 1);

    const savedFine = await OverstayFine.findOne({
      reservationId
    });

    assert.ok(savedFine);
    assert.equal(savedFine.status, "UNPAID");
    assert.ok(savedFine.overdueMinutes >= 1);
    assert.equal(savedFine.fineAmount, 100);

    fineId = savedFine._id;

    // STEP 9: Verify overstay notification
    const overstayNotification = await Notification.findOne({
      userId,
      relatedId: reservationId,
      type: "OVERSTAY"
    });

    assert.ok(overstayNotification);
    assert.equal(
      overstayNotification.title,
      "Parking Overstay Detected"
    );

    // STEP 10: Complete checkout
    const checkoutResponse = await request(app)
      .post(`/api/overstays/${reservationId}/checkout`)
      .send({
        userId: userId.toString()
      });

    assert.equal(checkoutResponse.status, 200);
    assert.equal(checkoutResponse.body.success, true);
    assert.equal(
      checkoutResponse.body.reservation.status,
      "COMPLETED"
    );
    assert.ok(checkoutResponse.body.fine);

    const completedReservation = await Reservation.findById(reservationId);
    assert.equal(completedReservation.status, "COMPLETED");

    const completedSession = await ParkingSession.findOne({
      reservationId
    });

    assert.equal(completedSession.status, "COMPLETED");
    assert.ok(completedSession.exitTime);

    const releasedSlot = await ParkingSlot.findById(slotId);
    assert.equal(releasedSlot.status, "AVAILABLE");

    // STEP 11: Pay the overstay fine
    const finePaymentResponse = await request(app)
      .post(`/api/payments/fines/${fineId}`)
      .send({
        userId: userId.toString(),
        paymentMethod: "CARD"
      });

    assert.equal(finePaymentResponse.status, 201);
    assert.equal(finePaymentResponse.body.success, true);
    assert.equal(finePaymentResponse.body.payment.status, "SUCCESS");

    const paidFine = await OverstayFine.findById(fineId);
    assert.equal(paidFine.status, "PAID");
    assert.ok(paidFine.paidAt);

    // STEP 12: Verify payment transaction history
    const transactionsResponse = await request(app)
      .get(`/api/payments/my/${userId}`);

    assert.equal(transactionsResponse.status, 200);
    assert.equal(transactionsResponse.body.success, true);
    assert.equal(transactionsResponse.body.transactions.length, 2);

    // STEP 13: Verify notifications across modules
    const notificationsResponse = await request(app)
      .get(`/api/notifications/${userId}`);

    assert.equal(notificationsResponse.status, 200);
    assert.equal(notificationsResponse.body.success, true);

    const notifications = notificationsResponse.body.notifications;
    const notificationTypes = notifications.map(
      (notification) => notification.type
    );

    assert.ok(notificationTypes.includes("RESERVATION_CONFIRMED"));
    assert.ok(notificationTypes.includes("PAYMENT_SUCCESS"));
    assert.ok(notificationTypes.includes("OVERSTAY"));

    // STEP 14: Verify final analytics
    const analyticsResponse = await request(app)
      .get("/api/analytics");

    assert.equal(analyticsResponse.status, 200);
    assert.equal(analyticsResponse.body.success, true);

    const analytics = analyticsResponse.body.analytics;

    assert.equal(analytics.summary.totalReservations, 1);
    assert.equal(analytics.summary.completedReservations, 1);

    assert.equal(analytics.occupancy.current.totalSlots, 1);
    assert.equal(analytics.occupancy.current.availableSlots, 1);
    assert.equal(analytics.occupancy.current.occupiedSlots, 0);

    assert.equal(analytics.revenue.successfulPayments, 2);
    assert.equal(
      analytics.revenue.totalRevenue,
      parkingPayment.amount + finePaymentResponse.body.payment.amount
    );

    assert.equal(analytics.revenue.fineRevenue, 100);
    assert.equal(analytics.revenue.parkingRevenue, parkingPayment.amount);

    // STEP 15: Verify final persisted state
    const finalVehicle = await Vehicle.findById(vehicleId);
    const finalSlot = await ParkingSlot.findById(slotId);
    const finalReservation = await Reservation.findById(reservationId);
    const finalSession = await ParkingSession.findOne({ reservationId });
    const finalPayments = await Payment.find({ userId });
    const finalFine = await OverstayFine.findById(fineId);

    assert.ok(finalVehicle);
    assert.equal(finalSlot.status, "AVAILABLE");
    assert.equal(finalReservation.status, "COMPLETED");
    assert.equal(finalSession.status, "COMPLETED");
    assert.equal(finalPayments.length, 2);
    assert.equal(finalFine.status, "PAID");
  });
});
