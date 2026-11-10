const test = require("node:test");
const assert = require("node:assert/strict");

const Reservation = require("../src/modules/reservation/reservation.model");
const Notification = require("../src/modules/notification/notification.model");
const Payment = require("../src/modules/payment/payment.model");
const { sendReservationReminders } = require("../src/modules/notification/notification.reminders");
const paymentService = require("../src/modules/payment/payment.service");
const { createNotification } = require("../src/modules/notification/notification.controller");
const { createResponse, stubModel, id } = require("./helpers/test-utils");

function captureNotifications(t) {
  const notifications = [];
  stubModel(t, Notification, {
    create: async (data) => {
      notifications.push(data);
      return data;
    }
  });
  return notifications;
}

test("notification controller requires all fields", async () => {
  const res = createResponse();

  await createNotification({ body: { userId: id().toString() } }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /are required/);
});

test("reminders notify upcoming and expiring reservations once each", async (t) => {
  const now = new Date("2026-10-21T10:00:00Z");
  const queues = {
    upcomingNotifiedAt: [{ _id: id(), userId: id() }],
    expiryNotifiedAt: [{ _id: id(), userId: id() }, { _id: id(), userId: id() }]
  };
  const filters = {};
  stubModel(t, Reservation, {
    findOneAndUpdate: async (filter, update) => {
      const [flag] = Object.keys(update.$set);
      filters[flag] = filter;
      assert.equal(filter[flag], null);
      assert.equal(update.$set[flag], now);
      return queues[flag].shift() || null;
    }
  });
  const notifications = captureNotifications(t);

  const result = await sendReservationReminders(now);

  assert.deepEqual(result, { upcoming: 1, expiring: 2 });
  assert.deepEqual(
    notifications.map((notification) => notification.type),
    ["RESERVATION_UPCOMING", "PARKING_EXPIRING", "PARKING_EXPIRING"]
  );
  assert.deepEqual(filters.upcomingNotifiedAt.startTime, {
    $gt: now,
    $lte: new Date("2026-10-21T10:30:00Z")
  });
  assert.deepEqual(filters.expiryNotifiedAt.endTime, {
    $gt: now,
    $lte: new Date("2026-10-21T10:15:00Z")
  });
});

test("a failed payment is recorded and notified", async (t) => {
  const originalGateway = process.env.PAYMENT_GATEWAY;
  delete process.env.PAYMENT_GATEWAY;
  t.after(() => {
    if (originalGateway === undefined) {
      delete process.env.PAYMENT_GATEWAY;
    } else {
      process.env.PAYMENT_GATEWAY = originalGateway;
    }
  });

  const userId = id();
  const recorded = [];
  stubModel(t, Reservation, {
    findOne: async () => ({
      status: "CONFIRMED",
      startTime: new Date("2026-10-21T10:00:00Z"),
      endTime: new Date("2026-10-21T11:00:00Z")
    })
  });
  stubModel(t, Payment, {
    findOne: async () => null,
    create: async (data) => {
      recorded.push(data);
      return { ...data, _id: id() };
    }
  });
  const notifications = captureNotifications(t);

  await assert.rejects(
    () =>
      paymentService.payForReservation({
        reservationId: id(),
        userId,
        paymentMethod: "UPI"
      }),
    /Payment failed/
  );

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].status, "FAILED");
  assert.equal(notifications[0].type, "PAYMENT_FAILED");
});

test("a successful payment is notified as successful", async (t) => {
  const originalGateway = process.env.PAYMENT_GATEWAY;
  process.env.PAYMENT_GATEWAY = "demo";
  t.after(() => {
    if (originalGateway === undefined) {
      delete process.env.PAYMENT_GATEWAY;
    } else {
      process.env.PAYMENT_GATEWAY = originalGateway;
    }
  });

  stubModel(t, Reservation, {
    findOne: async () => ({
      status: "CONFIRMED",
      startTime: new Date("2026-10-21T10:00:00Z"),
      endTime: new Date("2026-10-21T11:30:00Z")
    })
  });
  stubModel(t, Payment, {
    findOne: async () => null,
    create: async (data) => ({ ...data, _id: id() })
  });
  const notifications = captureNotifications(t);

  const payment = await paymentService.payForReservation({
    reservationId: id(),
    userId: id(),
    paymentMethod: "UPI"
  });

  assert.equal(payment.amount, 100);
  assert.equal(notifications[0].type, "PAYMENT_SUCCESS");
});
