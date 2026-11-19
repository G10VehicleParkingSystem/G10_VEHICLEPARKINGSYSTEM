// White-box tests for payments (FR-3, FR-5 fines) and monthly passes (FR-8): the
// paths through payment.service.js and subscription.service.js, including retries
// that must not charge twice and the clean-up when a payment fails.
const test = require("node:test");
const assert = require("node:assert/strict");

const Payment = require("../src/modules/payment/payment.model");
const Reservation = require("../src/modules/reservation/reservation.model");
const OverstayFine = require("../src/modules/overstay/overstay.model");
const Notification = require("../src/modules/notification/notification.model");
const Subscription = require("../src/modules/subscription/subscription.model");
const Vehicle = require("../src/modules/vehicle/vehicle.model");
const ParkingSlot = require("../src/modules/slot/slot.model");
const paymentService = require("../src/modules/payment/payment.service");
const subscriptionService = require("../src/modules/subscription/subscription.service");
const { stubModel, id, minutesFromNow } = require("./helpers/test-utils");

function gateway(t, value) {
  const original = process.env.PAYMENT_GATEWAY;
  process.env.PAYMENT_GATEWAY = value;
  t.after(() => {
    if (original === undefined) delete process.env.PAYMENT_GATEWAY;
    else process.env.PAYMENT_GATEWAY = original;
  });
}

function capturePayments(t, findOne = async () => null) {
  const created = [];
  const alerts = [];
  stubModel(t, Payment, {
    findOne,
    create: async (p) => {
      const payment = { _id: id(), createdAt: new Date(), ...p };
      created.push(payment);
      return payment;
    }
  });
  stubModel(t, Notification, { create: async (n) => alerts.push(n.type) });
  return { created, alerts };
}

const saveable = (obj) => ({ saved: 0, async save() { this.saved += 1; return this; }, ...obj });

/* ---------- reservation payments ---------- */

test("WB-PAY-01 an unknown payment method is refused before anything is read", async () => {
  await assert.rejects(
    paymentService.payForReservation({ reservationId: id(), userId: id(), paymentMethod: "CASH" }),
    /paymentMethod must be one of/
  );
});

test("WB-PAY-02 paying for someone else's or an unknown booking fails", async (t) => {
  stubModel(t, Reservation, { findOne: async () => null });
  await assert.rejects(
    paymentService.payForReservation({ reservationId: id(), userId: id(), paymentMethod: "UPI" }),
    /Reservation not found/
  );
});

test("WB-PAY-03 a booking that is already paid returns the earlier payment (no double charge)", async (t) => {
  const earlier = { _id: "paid-once", status: "SUCCESS" };
  stubModel(t, Reservation, { findOne: async () => ({ status: "COMPLETED" }) });
  const { created } = capturePayments(t, async () => earlier);
  const result = await paymentService.payForReservation({ reservationId: id(), userId: id(), paymentMethod: "UPI" });
  assert.equal(result, earlier);
  assert.equal(created.length, 0);
});

test("WB-PAY-04 only confirmed bookings can be paid", async (t) => {
  stubModel(t, Reservation, { findOne: async () => ({ status: "CANCELLED" }) });
  capturePayments(t);
  await assert.rejects(
    paymentService.payForReservation({ reservationId: id(), userId: id(), paymentMethod: "UPI" }),
    /Only confirmed/
  );
});

test("WB-PAY-05 a successful payment charges each started hour and sends a payment alert", async (t) => {
  gateway(t, "demo");
  stubModel(t, Reservation, {
    findOne: async () => ({ status: "CONFIRMED", startTime: minutesFromNow(0), endTime: minutesFromNow(90) })
  });
  const { created, alerts } = capturePayments(t);
  const payment = await paymentService.payForReservation({ reservationId: id(), userId: id(), paymentMethod: "WALLET" });
  assert.equal(payment.status, "SUCCESS");
  assert.equal(payment.amount, 100);
  assert.equal(payment.provider, "DEMO_GATEWAY");
  assert.match(payment.transactionId, /^TXN-/);
  assert.deepEqual(alerts, ["PAYMENT_SUCCESS"]);
  assert.equal(created.length, 1);
});

test("WB-PAY-06 a gateway failure records a FAILED payment and tells the user", async (t) => {
  gateway(t, "none");
  stubModel(t, Reservation, {
    findOne: async () => ({ status: "CONFIRMED", startTime: minutesFromNow(0), endTime: minutesFromNow(60) })
  });
  const { created, alerts } = capturePayments(t);
  await assert.rejects(
    paymentService.payForReservation({ reservationId: id(), userId: id(), paymentMethod: "CARD" }),
    /Payment failed/
  );
  assert.equal(created[0].status, "FAILED");
  assert.equal(created[0].providerReference, "NOT_PROCESSED");
  assert.deepEqual(alerts, ["PAYMENT_FAILED"]);
});

test("WB-PAY-07 two payments racing for one booking: the duplicate-key loser returns the winner's payment", async (t) => {
  gateway(t, "demo");
  const winner = { _id: "winner", status: "SUCCESS" };
  let lookups = 0;
  stubModel(t, Reservation, {
    findOne: async () => ({ status: "CONFIRMED", startTime: minutesFromNow(0), endTime: minutesFromNow(60) })
  });
  stubModel(t, Payment, {
    findOne: async () => (lookups++ === 0 ? null : winner),
    create: async () => { throw Object.assign(new Error("dup"), { code: 11000 }); }
  });
  const result = await paymentService.payForReservation({ reservationId: id(), userId: id(), paymentMethod: "UPI" });
  assert.equal(result, winner);

  stubModel(t, Payment, {
    findOne: async () => null,
    create: async () => { throw new Error("disk full"); }
  });
  await assert.rejects(
    paymentService.payForReservation({ reservationId: id(), userId: id(), paymentMethod: "UPI" }),
    /disk full/
  );
});

/* ---------- fine payments ---------- */

test("WB-PAY-08 fines: unknown fine, already paid, and not checked out yet are refused", async (t) => {
  stubModel(t, OverstayFine, { findOne: async () => null });
  await assert.rejects(paymentService.payFine({ fineId: id(), userId: id(), paymentMethod: "UPI" }), /Fine not found/);

  stubModel(t, OverstayFine, { findOne: async () => saveable({ status: "PAID" }) });
  capturePayments(t);
  await assert.rejects(paymentService.payFine({ fineId: id(), userId: id(), paymentMethod: "UPI" }), /already paid/);

  stubModel(t, OverstayFine, { findOne: async () => saveable({ status: "UNPAID", reservationId: id() }) });
  stubModel(t, Reservation, { findOne: async () => null });
  await assert.rejects(paymentService.payFine({ fineId: id(), userId: id(), paymentMethod: "UPI" }), /after checkout/);
});

test("WB-PAY-09 a fine whose payment already went through is marked PAID without charging again", async (t) => {
  const fine = saveable({ status: "UNPAID" });
  const earlier = { _id: "p", createdAt: new Date("2026-10-01") };
  stubModel(t, OverstayFine, { findOne: async () => fine });
  const { created } = capturePayments(t, async () => earlier);
  const result = await paymentService.payFine({ fineId: id(), userId: id(), paymentMethod: "UPI" });
  assert.equal(result, earlier);
  assert.equal(fine.status, "PAID");
  assert.equal(fine.paidAt, earlier.createdAt);
  assert.equal(created.length, 0);
});

test("WB-PAY-10 paying a fine after checkout charges the fine amount and marks it PAID", async (t) => {
  gateway(t, "demo");
  const fine = saveable({ status: "UNPAID", fineAmount: 200, reservationId: id() });
  stubModel(t, OverstayFine, { findOne: async () => fine });
  stubModel(t, Reservation, { findOne: async () => ({ status: "COMPLETED" }) });
  const { created } = capturePayments(t);
  const payment = await paymentService.payFine({ fineId: id(), userId: id(), paymentMethod: "NET_BANKING" });
  assert.equal(payment.amount, 200);
  assert.equal(fine.status, "PAID");
  assert.ok(fine.paidAt instanceof Date);
  assert.equal(created.length, 1);
});

test("WB-PAY-11 fine payment races: duplicate key returns the saved payment, other errors propagate", async (t) => {
  gateway(t, "demo");
  stubModel(t, Reservation, { findOne: async () => ({ status: "COMPLETED" }) });
  stubModel(t, OverstayFine, { findOne: async () => saveable({ status: "UNPAID", fineAmount: 100 }) });
  let lookups = 0;
  stubModel(t, Payment, {
    findOne: async () => (lookups++ === 0 ? null : { _id: "winner" }),
    create: async () => { throw Object.assign(new Error("dup"), { code: 11000 }); }
  });
  assert.equal((await paymentService.payFine({ fineId: id(), userId: id(), paymentMethod: "UPI" }))._id, "winner");

  stubModel(t, Payment, { findOne: async () => null, create: async () => { throw new Error("db down"); } });
  await assert.rejects(paymentService.payFine({ fineId: id(), userId: id(), paymentMethod: "UPI" }), /db down/);
});

/* ---------- subscription payments ---------- */

test("WB-PAY-12 subscription payment checks amount and period (boundary values 0, -1, NaN)", async () => {
  for (const amount of [0, -1, "abc"]) {
    await assert.rejects(
      paymentService.payForSubscription({ subscriptionId: id(), userId: id(), paymentMethod: "UPI", amount, periodStart: new Date() }),
      /must be positive/
    );
  }
  await assert.rejects(
    paymentService.payForSubscription({ subscriptionId: id(), userId: id(), paymentMethod: "UPI", amount: 3000, periodStart: "nope" }),
    /Invalid subscription billing period/
  );
});

test("WB-PAY-13 subscription payment: retry returns the saved payment, new period charges once", async (t) => {
  gateway(t, "demo");
  const args = { subscriptionId: id(), userId: id(), paymentMethod: "UPI", amount: 3000, periodStart: new Date() };
  capturePayments(t, async () => ({ _id: "existing" }));
  assert.equal((await paymentService.payForSubscription(args))._id, "existing");

  const { created } = capturePayments(t);
  const paid = await paymentService.payForSubscription(args);
  assert.equal(paid.amount, 3000);
  assert.equal(created.length, 1);
});

test("WB-PAY-14 subscription payment error: recovers a saved payment, otherwise rethrows", async (t) => {
  gateway(t, "none");
  const args = { subscriptionId: id(), userId: id(), paymentMethod: "UPI", amount: 3000, periodStart: new Date() };
  let lookups = 0;
  stubModel(t, Payment, { findOne: async () => (lookups++ === 0 ? null : { _id: "saved" }), create: async (p) => p });
  stubModel(t, Notification, { create: async () => ({}) });
  assert.equal((await paymentService.payForSubscription(args))._id, "saved");

  stubModel(t, Payment, { findOne: async () => null, create: async (p) => p });
  await assert.rejects(paymentService.payForSubscription(args), /Payment failed/);
});

test("WB-PAY-15 transaction history is the user's payments, newest first", async (t) => {
  const userId = id();
  let filter, sort;
  stubModel(t, Payment, { find: (f) => ((filter = f), { sort: async (s) => ((sort = s), []) }) });
  await paymentService.getUserTransactions(userId);
  assert.deepEqual(filter, { userId });
  assert.deepEqual(sort, { createdAt: -1 });
});

/* ---------- subscription.service ---------- */

function passWorld(t, overrides = {}) {
  const updates = [];
  const sub = saveable({ _id: id(), status: "PENDING_PAYMENT" });
  stubModel(t, Subscription, {
    updateMany: async () => ({ modifiedCount: 0 }),
    findOne: async () => null,
    create: async (data) => Object.assign(sub, data),
    updateOne: async (filter, update) => updates.push(update)
  });
  stubModel(t, Vehicle, { findById: async () => ({ length: 4, width: 1.8, height: 1.5 }) });
  stubModel(t, ParkingSlot, { findById: async () => ({ status: "AVAILABLE", length: 5, width: 2.5, height: 2.2 }) });
  stubModel(t, Reservation, { findOne: async () => null });
  for (const [model, fns] of overrides.models || []) stubModel(t, model, fns);
  return { sub, updates };
}

const passInput = () => ({ userId: String(id()), vehicleId: String(id()), slotId: String(id()), paymentMethod: "UPI" });

test("WB-SUB-01 buying a pass: vehicle and slot must exist, be free, fit, and not be booked", async (t) => {
  const cases = [
    [[Vehicle, { findById: async () => null }], /Vehicle not found/],
    [[ParkingSlot, { findById: async () => null }], /Parking slot not found/],
    [[ParkingSlot, { findById: async () => ({ status: "OCCUPIED" }) }], /currently occupied/],
    [[ParkingSlot, { findById: async () => ({ status: "AVAILABLE", length: 2, width: 1, height: 1 }) }], /does not fit/],
    [[Reservation, { findOne: async () => ({ _id: "booking" }) }], /existing reservation/],
    [[Subscription, { findOne: async () => ({ _id: "other" }) }], /already has a pending or active/],
    [[Subscription, { create: async () => { throw Object.assign(new Error("dup"), { code: 11000 }); } }], /already reserved by another/],
    [[Subscription, { create: async () => { throw new Error("db down"); } }], /db down/]
  ];
  for (const [override, message] of cases) {
    passWorld(t, { models: [override] });
    await assert.rejects(subscriptionService.createSubscription(passInput()), message);
  }
});

test("WB-SUB-02 buying a pass activates it once the payment succeeds", async (t) => {
  const { sub } = passWorld(t);
  const original = paymentService.payForSubscription;
  paymentService.payForSubscription = async ({ amount }) => ({ _id: "pay-1", amount });
  t.after(() => (paymentService.payForSubscription = original));

  const result = await subscriptionService.createSubscription(passInput());
  assert.equal(result.subscription.status, "ACTIVE");
  assert.equal(result.subscription.paymentId, "pay-1");
  assert.equal(result.payment.amount, 3000);
  assert.equal(sub.pendingExpiresAt, null);
  assert.ok(result.subscription.endDate > result.subscription.startDate);
});

test("WB-SUB-03 a failed pass payment marks it PAYMENT_FAILED and releases the slot lock", async (t) => {
  const { updates } = passWorld(t);
  const original = paymentService.payForSubscription;
  paymentService.payForSubscription = async () => { throw new Error("Payment failed: declined"); };
  t.after(() => (paymentService.payForSubscription = original));

  await assert.rejects(subscriptionService.createSubscription(passInput()), /declined/);
  assert.equal(updates[0].$set.status, "PAYMENT_FAILED");
  assert.deepEqual(Object.keys(updates[0].$unset).sort(), ["pendingExpiresAt", "slotLock"]);
});

test("WB-SUB-04 renewing: unknown or inactive passes are refused; an active one extends by a month", async (t) => {
  const endDate = new Date("2026-11-30T10:00:00Z");
  const pass = saveable({ _id: id(), status: "ACTIVE", endDate, slotId: id(), cancelAtPeriodEnd: true });
  const args = { subscriptionId: String(id()), userId: String(id()), paymentMethod: "UPI" };
  stubModel(t, Subscription, { updateMany: async () => ({ modifiedCount: 0 }), findOne: async () => null });
  await assert.rejects(subscriptionService.renewSubscription(args), /not found/);

  stubModel(t, Subscription, { findOne: async () => saveable({ status: "EXPIRED" }) });
  await assert.rejects(subscriptionService.renewSubscription(args), /Only active subscriptions can be renewed/);

  stubModel(t, Subscription, { findOne: async () => pass });
  stubModel(t, Reservation, { findOne: async () => null });
  const original = paymentService.payForSubscription;
  paymentService.payForSubscription = async ({ periodStart }) => ({ _id: "pay-2", periodStart });
  t.after(() => (paymentService.payForSubscription = original));

  const result = await subscriptionService.renewSubscription(args);
  assert.equal(result.payment.periodStart.toISOString(), endDate.toISOString());
  assert.equal(pass.endDate.toISOString(), "2026-12-30T10:00:00.000Z");
  assert.equal(pass.cancelAtPeriodEnd, false);
  assert.equal(pass.saved, 1);
});

test("WB-SUB-05 stopping renewal: not found, not active, already stopped, then success", async (t) => {
  const args = { subscriptionId: String(id()), userId: String(id()) };
  stubModel(t, Subscription, { updateMany: async () => ({ modifiedCount: 0 }), findOne: async () => null });
  await assert.rejects(subscriptionService.cancelSubscription(args), /not found/);

  stubModel(t, Subscription, { findOne: async () => saveable({ status: "EXPIRED" }) });
  await assert.rejects(subscriptionService.cancelSubscription(args), /Only active subscriptions can be cancelled/);

  stubModel(t, Subscription, { findOne: async () => saveable({ status: "ACTIVE", cancelAtPeriodEnd: true }) });
  await assert.rejects(subscriptionService.cancelSubscription(args), /already scheduled/);

  const pass = saveable({ status: "ACTIVE", cancelAtPeriodEnd: false });
  stubModel(t, Subscription, { findOne: async () => pass });
  const result = await subscriptionService.cancelSubscription(args);
  assert.equal(result.cancelAtPeriodEnd, true);
  assert.equal(pass.saved, 1);
});

test("WB-SUB-06 listing my passes expires old ones first and sorts newest first", async (t) => {
  const userId = String(id());
  let expiredFirst = false;
  let sort;
  stubModel(t, Subscription, {
    updateMany: async () => ((expiredFirst = true), { modifiedCount: 1 }),
    find: () => ({ sort: async (s) => ((sort = s), []) })
  });
  await subscriptionService.getUserSubscriptions(userId);
  assert.equal(expiredFirst, true);
  assert.deepEqual(sort, { createdAt: -1 });
});
