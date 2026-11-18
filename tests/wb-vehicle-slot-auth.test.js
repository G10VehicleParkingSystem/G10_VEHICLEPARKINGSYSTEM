// White-box tests for the remaining branches of vehicles and QR passes (FR-1),
// slots (FR-1), reservations (FR-2), in-app alerts (FR-7) and accounts (security).
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const Vehicle = require("../src/modules/vehicle/vehicle.model");
const ParkingSlot = require("../src/modules/slot/slot.model");
const Reservation = require("../src/modules/reservation/reservation.model");
const Notification = require("../src/modules/notification/notification.model");
const User = require("../src/modules/auth/user.model");
const vehicleService = require("../src/modules/vehicle/vehicle.service");
const slotService = require("../src/modules/slot/slot.service");
const reservationService = require("../src/modules/reservation/reservation.service");
const notificationService = require("../src/modules/notification/notification.service");
const authService = require("../src/modules/auth/auth.service");
const { stubModel, id, minutesFromNow } = require("./helpers/test-utils");

const withSelect = (value) => ({ select: async () => value });

/* ---------- vehicles and QR gate passes ---------- */

test("WB-VEH-01 registration rejects non-numeric sizes and stores the owner when signed in", async (t) => {
  await assert.rejects(
    vehicleService.registerVehicle({ vehicleNumber: "KA01", type: "CAR", length: "4", width: 1.8, height: 1.5 }),
    /must be numbers/
  );

  let saved;
  stubModel(t, Vehicle, { findOne: async () => null, create: async (v) => (saved = v) });
  const owner = id();
  const result = await vehicleService.registerVehicle({
    vehicleNumber: " ka01ab1234 ", type: "CAR", length: 4.5, width: 1.8, height: 1.5, owner
  });
  assert.equal(saved.vehicleNumber, "KA01AB1234");
  assert.equal(saved.owner, owner);
  assert.match(saved.qrToken, /^[0-9a-f]{64}$/);
  assert.match(result.qrCode, /^data:image\/png;base64,/);
});

test("WB-VEH-02 getVehicle finds by upper-case number or reports not found", async (t) => {
  let filter;
  stubModel(t, Vehicle, { findOne: async (f) => ((filter = f), { vehicleNumber: "KA01" }) });
  await vehicleService.getVehicle("ka01");
  assert.deepEqual(filter, { vehicleNumber: "KA01" });

  stubModel(t, Vehicle, { findOne: async () => null });
  await assert.rejects(vehicleService.getVehicle("ka01"), /Vehicle not found/);
});

test("WB-VEH-03 QR pass: unknown vehicle, old record gets a token, existing token is reused", async (t) => {
  stubModel(t, Vehicle, { findOne: () => withSelect(null) });
  await assert.rejects(vehicleService.getVehicleQr("KA01"), /not found/);

  const old = { qrToken: undefined, saved: 0, async save() { this.saved += 1; } };
  stubModel(t, Vehicle, { findOne: () => withSelect(old) });
  assert.match(await vehicleService.getVehicleQr("KA01"), /^data:image\/png/);
  assert.equal(old.saved, 1);
  assert.match(old.qrToken, /^[0-9a-f]{64}$/);

  const current = { qrToken: "a".repeat(64), saved: 0, async save() { this.saved += 1; } };
  stubModel(t, Vehicle, { findOne: () => withSelect(current) });
  await vehicleService.getVehicleQr("KA01");
  assert.equal(current.saved, 0);
});

test("WB-VEH-04 QR scan: missing or wrong token is refused, a valid one returns the vehicle without the token", async (t) => {
  await assert.rejects(vehicleService.verifyVehicleQr(undefined), /Valid QR token is required/);
  await assert.rejects(vehicleService.verifyVehicleQr(42), /Valid QR token is required/);

  stubModel(t, Vehicle, { findOne: () => withSelect(null) });
  await assert.rejects(vehicleService.verifyVehicleQr("x"), /Invalid QR code/);

  stubModel(t, Vehicle, {
    findOne: () => withSelect({ _id: "v1", vehicleNumber: "KA01", type: "BIKE", length: 2, width: 0.8, height: 1.2, qrToken: "secret" })
  });
  const vehicle = await vehicleService.verifyVehicleQr("secret");
  assert.equal(vehicle.vehicleNumber, "KA01");
  assert.equal(vehicle.qrToken, undefined);
});

test("WB-VEH-05 ownership: admin sees all; owner yes; other student no; unowned or unknown vehicles stay open", async (t) => {
  const me = { id: String(id()), role: "student" };
  assert.equal(await vehicleService.canSeeVehicle("KA01", { id: "x", role: "admin" }), true);

  stubModel(t, Vehicle, { findOne: () => withSelect({ owner: me.id }) });
  assert.equal(await vehicleService.canSeeVehicle("ka01", me), true);

  stubModel(t, Vehicle, { findOne: () => withSelect({ owner: String(id()) }) });
  assert.equal(await vehicleService.canSeeVehicle("ka01", me), false);

  stubModel(t, Vehicle, { findOne: () => withSelect({ owner: null }) });
  assert.equal(await vehicleService.canSeeVehicle("ka01", me), true);

  stubModel(t, Vehicle, { findOne: () => withSelect(null) });
  assert.equal(await vehicleService.canSeeVehicle("ka01", me), true);
});

test("WB-VEH-06 my vehicles are filtered by owner, newest first", async (t) => {
  const owner = id();
  let filter, sort;
  stubModel(t, Vehicle, { find: (f) => ((filter = f), { sort: async (s) => ((sort = s), []) }) });
  await vehicleService.getUserVehicles(owner);
  assert.deepEqual(filter, { owner });
  assert.deepEqual(sort, { createdAt: -1 });
});

/* ---------- slots ---------- */

test("WB-SLT-01 createSlot: missing fields, non-numeric sizes, duplicate number, and success", async (t) => {
  await assert.rejects(slotService.createSlot({ slotNumber: "A1", length: 5, width: 2.5 }), /are required/);
  await assert.rejects(slotService.createSlot({ slotNumber: "A1", length: "5", width: 2.5, height: 2 }), /must be numbers/);

  stubModel(t, ParkingSlot, { findOne: async () => ({ _id: "dup" }) });
  await assert.rejects(slotService.createSlot({ slotNumber: "a1", length: 5, width: 2.5, height: 2 }), /already exists/);

  let created;
  stubModel(t, ParkingSlot, { findOne: async () => null, create: async (s) => (created = s) });
  await slotService.createSlot({ slotNumber: "a1", length: 5, width: 2.5, height: 2 });
  assert.equal(created.slotNumber, "A1");
});

test("WB-SLT-02 getSlots filters by an upper-cased status only when one is given", async (t) => {
  const filters = [];
  stubModel(t, ParkingSlot, { find: (f) => (filters.push(f), { sort: async () => [] }) });
  await slotService.getSlots("available");
  await slotService.getSlots();
  assert.deepEqual(filters, [{ status: "AVAILABLE" }, {}]);
});

test("WB-SLT-03 recommendSlot reports an unknown vehicle with status 404", async (t) => {
  stubModel(t, Vehicle, { findOne: async () => null });
  await assert.rejects(slotService.recommendSlot("ka99"), (error) => error.statusCode === 404 && /Vehicle not found/.test(error.message));
});

/* ---------- reservations ---------- */

test("WB-RES-01 createReservation input checks: bad ids, bad times, end before start, start in the past", async () => {
  const ids = { userId: String(id()), vehicleId: String(id()), slotId: String(id()) };
  await assert.rejects(
    reservationService.createReservation({ ...ids, userId: "nope", startTime: minutesFromNow(10), endTime: minutesFromNow(70) }),
    /userId is not a valid id/
  );
  await assert.rejects(
    reservationService.createReservation({ ...ids, startTime: "not a date", endTime: minutesFromNow(70) }),
    /Invalid reservation time/
  );
  const start = minutesFromNow(30);
  await assert.rejects(reservationService.createReservation({ ...ids, startTime: start, endTime: start }), /End time must be after/);
  await assert.rejects(
    reservationService.createReservation({ ...ids, startTime: minutesFromNow(-10), endTime: minutesFromNow(50) }),
    /cannot start in the past/
  );
});

function bookingWorld(t, lockResults, { overlap = null } = {}) {
  const lockCalls = [];
  stubModel(t, Vehicle, { findById: async () => ({ length: 4, width: 1.8, height: 1.5 }) });
  stubModel(t, ParkingSlot, {
    findById: async () => ({ length: 5, width: 2.5, height: 2.2 }),
    updateOne: async (filter, update) => {
      lockCalls.push({ filter, update });
      return { modifiedCount: "bookingLock" in filter && filter.bookingLock !== null ? 1 : lockResults.shift() ?? 1 };
    }
  });
  stubModel(t, Reservation, { findOne: async () => overlap, create: async (r) => ({ _id: id(), ...r }) });
  stubModel(t, require("../src/modules/subscription/subscription.model"), { findOne: async () => null });
  stubModel(t, Notification, { create: async () => ({}) });
  return lockCalls;
}

const bookingInput = () => ({
  userId: String(id()), vehicleId: String(id()), slotId: String(id()),
  startTime: minutesFromNow(60), endTime: minutesFromNow(120)
});

test("WB-RES-04 booking lock: waits while the slot is busy, then books and releases the lock", async (t) => {
  const calls = bookingWorld(t, [0, 0, 1]);
  const booking = await reservationService.createReservation(bookingInput());
  assert.equal(booking.status, "CONFIRMED");
  const takes = calls.filter((c) => c.filter.$or);
  const release = calls.at(-1);
  assert.equal(takes.length, 3);
  assert.equal(String(release.filter.bookingLock), String(takes[0].update.$set.bookingLock));
  assert.equal(release.update.$set.bookingLock, null);
});

test("WB-RES-05 booking lock is released even when the slot turns out to be taken", async (t) => {
  const calls = bookingWorld(t, [1], { overlap: { _id: "other" } });
  await assert.rejects(reservationService.createReservation(bookingInput()), /already reserved/);
  assert.equal(calls.at(-1).update.$set.bookingLock, null);
});

test("WB-RES-06 booking lock gives up with a clear message when the slot stays busy", async (t) => {
  const original = process.env.BOOKING_LOCK_WAIT_MS;
  process.env.BOOKING_LOCK_WAIT_MS = "60";
  t.after(() => {
    if (original === undefined) delete process.env.BOOKING_LOCK_WAIT_MS;
    else process.env.BOOKING_LOCK_WAIT_MS = original;
  });
  bookingWorld(t, Array(1000).fill(0));
  await assert.rejects(reservationService.createReservation(bookingInput()), /being booked by someone else/);
});

test("WB-RES-02 cancel: not found, already cancelled, already started, and success", async (t) => {
  stubModel(t, Reservation, { findOne: async () => null });
  await assert.rejects(reservationService.cancelReservation(id(), id()), /not found/);

  stubModel(t, Reservation, { findOne: async () => ({ status: "CANCELLED" }) });
  await assert.rejects(reservationService.cancelReservation(id(), id()), /already cancelled/);

  stubModel(t, Reservation, { findOne: async () => ({ status: "CONFIRMED", startTime: minutesFromNow(-1) }) });
  await assert.rejects(reservationService.cancelReservation(id(), id()), /after its start time/);

  const booking = { status: "CONFIRMED", startTime: minutesFromNow(60), async save() { return this; } };
  stubModel(t, Reservation, { findOne: async () => booking });
  const result = await reservationService.cancelReservation(id(), id());
  assert.equal(result.status, "CANCELLED");
});

test("WB-RES-03 my reservations are sorted by start time", async (t) => {
  let sort;
  stubModel(t, Reservation, { find: () => ({ sort: async (s) => ((sort = s), []) }) });
  await reservationService.getUserReservations(id());
  assert.deepEqual(sort, { startTime: 1 });
});

/* ---------- in-app alerts ---------- */

test("WB-NTF-01 alerts are listed newest first and only the owner can mark one read", async (t) => {
  const userId = id();
  let listFilter, readFilter;
  stubModel(t, Notification, {
    find: (f) => ((listFilter = f), { sort: async () => [] }),
    findOneAndUpdate: async (f) => ((readFilter = f), { isRead: true })
  });
  await notificationService.getUserNotifications(userId);
  await notificationService.markAsRead("n1", userId);
  assert.deepEqual(listFilter, { userId });
  assert.deepEqual(readFilter, { _id: "n1", userId });
});

/* ---------- accounts ---------- */

test("WB-AUT-01 register input checks: name, email format and password length boundaries (7, 8, 72, 73)", async (t) => {
  await assert.rejects(authService.register({ name: " ", email: "a@b.co", password: "12345678" }), /Name is required/);
  await assert.rejects(authService.register({ name: "A", email: "not-an-email", password: "12345678" }), /valid email/);
  await assert.rejects(authService.register({ name: "A", email: "a@b.co", password: "1234567" }), /at least 8/);
  await assert.rejects(authService.register({ name: "A", email: "a@b.co", password: "x".repeat(73) }), /at most 72/);

  stubModel(t, User, { findOne: async () => null, create: async (u) => ({ _id: id(), ...u }) });
  assert.equal((await authService.register({ name: "A", email: "a@b.co", password: "12345678" })).user.role, "student");
  const faculty = await authService.register({ name: "B", email: "b@b.co", password: "x".repeat(72), role: "faculty" });
  assert.equal(faculty.user.role, "faculty");
});

test("WB-AUT-02 login: missing fields and an unknown email give the same generic answer", async (t) => {
  await assert.rejects(authService.login({ email: "a@b.co" }), /Email and password are required/);
  stubModel(t, User, { findOne: () => ({ select: async () => null }) });
  await assert.rejects(authService.login({ email: "nobody@b.co", password: "whatever1" }), (e) => e.status === 401);
});

test("WB-AUT-03 getUser returns the public profile or 404", async (t) => {
  stubModel(t, User, { findById: async () => ({ _id: "u", name: "A", email: "a@b.co", role: "student", passwordHash: "h" }) });
  const user = await authService.getUser("u");
  assert.equal(user.passwordHash, undefined);
  assert.equal(user.detail, "");

  stubModel(t, User, { findById: async () => null });
  await assert.rejects(authService.getUser("u"), (e) => e.status === 404);
});

test("WB-AUT-04 ensureAdmin: no settings, creates once, leaves an existing admin, never promotes a student", async (t) => {
  assert.equal(await authService.ensureAdmin({}), null);
  await assert.rejects(authService.ensureAdmin({ email: "o@c.edu", password: "short" }), /at least 8/);

  let created;
  stubModel(t, User, { findOne: async () => null, create: async (u) => (created = u) });
  await authService.ensureAdmin({ email: " Office@C.edu ", password: "office-pass" });
  assert.equal(created.email, "office@c.edu");
  assert.equal(created.role, "admin");
  assert.notEqual(created.passwordHash, "office-pass");

  stubModel(t, User, { findOne: async () => ({ role: "admin", email: "office@c.edu" }) });
  assert.equal((await authService.ensureAdmin({ email: "office@c.edu", password: "office-pass" })).role, "admin");

  stubModel(t, User, { findOne: async () => ({ role: "student" }) });
  assert.equal(await authService.ensureAdmin({ email: "office@c.edu", password: "office-pass" }), null);
});

test("WB-AUT-05 a token signed with another secret, or expired, is rejected", () => {
  const jwt = require("jsonwebtoken");
  assert.throws(() => authService.verifyToken(jwt.sign({ role: "admin" }, "other-secret", { subject: "u" })));
  assert.throws(() => authService.verifyToken(jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { subject: "u", expiresIn: -10 })));
});
