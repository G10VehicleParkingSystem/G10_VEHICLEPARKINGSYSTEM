// Black-box system tests for the G10 Vehicle Parking System.
//
// Runs against a live server through its public REST API only: no knowledge of the
// code, just inputs and the outputs the SRS / Test Plan promise. Each case carries its
// Test Plan feature id (VPS-F-xxx / VPS-NF-xxx), a test case id, and the black-box
// technique used to choose the input:
//   EP  equivalence partitioning (one valid or invalid class per case)
//   BVA boundary value analysis (values on and either side of a limit)
//   DT  decision table (combinations of conditions, e.g. role x resource)
//   ST  state transition (booking: CONFIRMED -> checked in -> COMPLETED / CANCELLED)
//   UC  use-case / scenario test (an end-to-end user journey)
//   PERF response time measured against the NFR target
//
// Test data: MONGO_URI is used only to set up an overstay (a booking that ended in the
// past, which the API rightly refuses to create) and to inspect stored passwords and
// payments for VPS-NF-004. Without it those cases are reported as not run.
//
//   BASE_URL=http://localhost:5000/api ADMIN_EMAIL=... ADMIN_PASSWORD=... \
//   MONGO_URI=mongodb://127.0.0.1:27017/<same db as the server> \
//   BLACKBOX_JSON=docs/reports/data/black-box-results.json node tests/blackbox/run-blackbox.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BASE = (process.env.BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");
const ADMIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
const OUT = process.env.BLACKBOX_JSON;
const PERF_RUNS = Number(process.env.PERF_RUNS || 20);

if (!ADMIN.email || !ADMIN.password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (the parking office account the server creates).");
  process.exit(2);
}

const run = Date.now().toString(36).toUpperCase();
const lower = run.toLowerCase();
const results = [];

/* ---------- HTTP helpers ---------- */

async function api(method, path, { body, token, raw } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const started = performance.now();
  const res = await fetch(BASE + path, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const ms = performance.now() - started;
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, ms };
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`Server at ${BASE} is not answering.`);
  process.exit(2);
}

/* ---------- test case bookkeeping ---------- */

// tc(id, requirement, technique, title, input, expected, fn) where fn returns
// { actual, pass } (or throws). Each case is timed.
async function tc(id, requirement, technique, title, input, expected, fn) {
  const started = performance.now();
  let actual;
  let pass = false;
  let status = "FAIL";
  try {
    const out = await fn();
    if (out === null) {
      status = "NOT RUN";
      actual = "Needs MONGO_URI for test data";
    } else {
      ({ actual, pass } = out);
      status = pass ? "PASS" : "FAIL";
    }
  } catch (error) {
    actual = `Error: ${error.message}`;
  }
  const ms = Math.round(performance.now() - started);
  results.push({ id, requirement, technique, title, input, expected, actual, status, ms });
  const mark = status === "PASS" ? "✓" : status === "NOT RUN" ? "-" : "✗";
  console.log(`${mark} ${id.padEnd(12)} ${status.padEnd(7)} ${title}${status === "FAIL" ? `\n    expected: ${expected}\n    actual:   ${actual}` : ""}`);
}

const is = (res, status, extra = true) => ({ actual: `${res.status} ${res.json.message || ""}`.trim(), pass: res.status === status && extra });
// All booking times are offsets from one clock reading, so a "60-minute" booking is
// exactly 60 minutes (two separate Date.now() calls could make it 60 min + 1 ms,
// which is correctly billed as two started hours).
const T0 = Date.now();
const at = (minutes) => new Date(T0 + minutes * 60000).toISOString();

/* ---------- optional database access for test data ---------- */

let db = null;
let mongoose = null;
if (process.env.MONGO_URI) {
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGO_URI);
  db = mongoose.connection.db;
}

await waitForServer();
console.log(`Black-box tests against ${BASE} (run ${run})\n`);

/* ======================= VPS-F-001 / NF-004: accounts ======================= */

const office = (await api("POST", "/auth/login", { body: ADMIN })).json.token;
const pwd = `pw-${lower}-ok`;
const emailA = `ananya-${lower}@college.test`;
const emailB = `rahul-${lower}@college.test`;
let tokenA, tokenB, userA, userB;

await tc("TC-AUTH-01", "VPS-F-001", "EP", "Register a student with valid details",
  `name, ${emailA}, 9-char password`, "201, account returned without any password field",
  async () => {
    const r = await api("POST", "/auth/register", { body: { name: "Ananya Rao", email: emailA, password: pwd, detail: "3rd year, CSE" } });
    userA = r.json.user;
    tokenA = r.json.token;
    const leaks = JSON.stringify(r.json).includes(pwd) || "passwordHash" in (r.json.user || {});
    return is(r, 201, !leaks && Boolean(r.json.token));
  });

await tc("TC-AUTH-02", "VPS-F-001", "EP", "Register with an email that is already used",
  emailA, "409 already exists",
  async () => is(await api("POST", "/auth/register", { body: { name: "X", email: emailA.toUpperCase(), password: pwd } }), 409));

await tc("TC-AUTH-03", "VPS-F-001", "BVA", "Password one below the minimum (7 characters)",
  "password '1234567'", "400",
  async () => is(await api("POST", "/auth/register", { body: { name: "X", email: `bva7-${lower}@college.test`, password: "1234567" } }), 400));

await tc("TC-AUTH-04", "VPS-F-001", "BVA", "Password exactly at the minimum (8 characters)",
  "password '12345678'", "201",
  async () => is(await api("POST", "/auth/register", { body: { name: "X", email: `bva8-${lower}@college.test`, password: "12345678" } }), 201));

await tc("TC-AUTH-05", "VPS-F-001", "BVA", "Password above the maximum (73 characters)",
  "73 x 'a'", "400",
  async () => is(await api("POST", "/auth/register", { body: { name: "X", email: `bva73-${lower}@college.test`, password: "a".repeat(73) } }), 400));

await tc("TC-AUTH-06", "VPS-F-001", "EP", "Register with an invalid email",
  "'not-an-email'", "400",
  async () => is(await api("POST", "/auth/register", { body: { name: "X", email: "not-an-email", password: pwd } }), 400));

await tc("TC-AUTH-07", "VPS-F-001", "EP", "Sign-up cannot create an administrator",
  "role 'admin'", "400",
  async () => is(await api("POST", "/auth/register", { body: { name: "X", email: `adm-${lower}@college.test`, password: pwd, role: "admin" } }), 400));

await tc("TC-AUTH-08", "VPS-F-001", "EP", "Sign in with the correct password",
  emailA, "200 with a token",
  async () => {
    const r = await api("POST", "/auth/login", { body: { email: emailA, password: pwd } });
    return is(r, 200, Boolean(r.json.token));
  });

await tc("TC-AUTH-09", "VPS-F-001", "EP", "Sign in with a wrong password",
  "wrong password", "401 'Email or password is incorrect'",
  async () => {
    const r = await api("POST", "/auth/login", { body: { email: emailA, password: "wrong-password" } });
    return is(r, 401, r.json.message === "Email or password is incorrect");
  });

await tc("TC-AUTH-10", "VPS-F-001", "EP", "Unknown email gets the same message (no account enumeration)",
  "nobody@college.test", "401 with the same message as a wrong password",
  async () => {
    const r = await api("POST", "/auth/login", { body: { email: `nobody-${lower}@college.test`, password: pwd } });
    return is(r, 401, r.json.message === "Email or password is incorrect");
  });

await tc("TC-AUTH-11", "VPS-F-001", "EP", "Register a faculty member",
  "role 'faculty'", "201, role faculty",
  async () => {
    const r = await api("POST", "/auth/register", { body: { name: "Dr. Kavitha Iyer", email: `kavitha-${lower}@college.test`, password: pwd, role: "faculty" } });
    return is(r, 201, r.json.user?.role === "faculty");
  });

{
  const r = await api("POST", "/auth/register", { body: { name: "Rahul Menon", email: emailB, password: pwd } });
  userB = r.json.user;
  tokenB = r.json.token;
}

/* ======================= Test Plan 5.1: security validation ======================= */

await tc("TC-SEC-01", "VPS-F-001 / 5.1", "EP", "Protected function without signing in",
  "GET /reservations/my/<id>, no token", "401",
  async () => is(await api("GET", `/reservations/my/${userA._id}`), 401));

await tc("TC-SEC-02", "VPS-F-001 / 5.1", "EP", "Forged token",
  "Authorization: Bearer forged.token.value", "401",
  async () => is(await api("GET", "/slots", { token: "forged.token.value" }), 401));

for (const [n, method, path, body] of [
  [3, "GET", "/analytics"],
  [4, "POST", "/slots", { slotNumber: `X${run}`, length: 5, width: 2.5, height: 2.2 }],
  [5, "POST", "/overstays/detect"],
  [6, "POST", "/notifications", { userId: "000000000000000000000001", type: "FINE", title: "x", message: "x" }]
]) {
  await tc(`TC-SEC-0${n}`, "VPS-F-013 / 5.1", "DT", `Student calls admin-only ${method} ${path}`,
    "student token", "403",
    async () => is(await api(method, path, { body, token: tokenA }), 403));
}

await tc("TC-SEC-07", "VPS-F-008 / 5.1", "DT", "Student reads another student's payment history",
  "A's token, B's id", "403",
  async () => is(await api("GET", `/payments/my/${userB._id}`, { token: tokenA }), 403));

await tc("TC-SEC-08", "VPS-F-010 / 5.1", "DT", "Student reads another student's reservations",
  "A's token, B's id", "403",
  async () => is(await api("GET", `/reservations/my/${userB._id}`, { token: tokenA }), 403));

await tc("TC-SEC-09", "VPS-F-001 / 5.1", "EP", "NoSQL injection in the login email",
  `{"email": {"$gt": ""}, "password": {"$gt": ""}}`, "400, not signed in",
  async () => is(await api("POST", "/auth/login", { body: { email: { $gt: "" }, password: { $gt: "" } } }), 400));

await tc("TC-SEC-10", "VPS-F-001 / 5.1", "EP", "Malformed JSON body",
  "'{bad json'", "4xx, server keeps running",
  async () => {
    const r = await api("POST", "/auth/login", { raw: "{bad json" });
    const alive = (await fetch(`${BASE}/health`)).ok;
    return { actual: `${r.status}, server alive: ${alive}`, pass: r.status >= 400 && r.status < 500 && alive };
  });

/* ======================= VPS-F-002: vehicles ======================= */

const officeSlot = (slotNumber, length, width, height) =>
  api("POST", "/slots", { body: { slotNumber, length, width, height }, token: office });

const small = (await officeSlot(`S${run}`, 5, 2.5, 2.2)).json.slot;
const large = (await officeSlot(`L${run}`, 20, 5, 5)).json.slot;
const bikeBay = (await officeSlot(`TW${run}`, 2.2, 1, 1.6)).json.slot;
const plateA = `KA01${run}`;
let carA;

await tc("TC-VEH-01", "VPS-F-002", "EP", "Register a car with valid details",
  `${plateA}, CAR 4.5 x 1.8 x 1.5`, "201 with a QR gate pass image",
  async () => {
    const r = await api("POST", "/vehicles", { body: { vehicleNumber: plateA.toLowerCase(), type: "CAR", length: 4.5, width: 1.8, height: 1.5 }, token: tokenA });
    carA = r.json.vehicle;
    return is(r, 201, r.json.qrCode?.startsWith("data:image/png") && carA?.vehicleNumber === plateA);
  });

await tc("TC-VEH-02", "VPS-F-002", "EP", "Register the same number again",
  plateA, "400 already registered",
  async () => is(await api("POST", "/vehicles", { body: { vehicleNumber: plateA, type: "CAR", length: 4.5, width: 1.8, height: 1.5 }, token: tokenB }), 400));

for (const [n, technique, label, length] of [[3, "BVA", "length 0 (on the boundary)", 0], [4, "BVA", "length -1 (below)", -1], [5, "EP", "length as text", "4.5"]]) {
  await tc(`TC-VEH-0${n}`, "VPS-F-002", technique, `Vehicle with ${label}`,
    `length ${JSON.stringify(length)}`, "400",
    async () => is(await api("POST", "/vehicles", { body: { vehicleNumber: `KA0${n}X${run}`, type: "CAR", length, width: 1.8, height: 1.5 }, token: tokenA }), 400));
}

await tc("TC-VEH-06", "VPS-F-002", "BVA", "Vehicle with the smallest positive size (0.1 m)",
  "0.1 x 0.1 x 0.1", "201",
  async () => is(await api("POST", "/vehicles", { body: { vehicleNumber: `KA06X${run}`, type: "BIKE", length: 0.1, width: 0.1, height: 0.1 }, token: tokenB }), 201));

await tc("TC-VEH-07", "VPS-F-002", "EP", "Vehicle type outside the allowed list",
  "type 'PLANE'", "400",
  async () => is(await api("POST", "/vehicles", { body: { vehicleNumber: `KA07X${run}`, type: "PLANE", length: 4, width: 2, height: 2 }, token: tokenA }), 400));

await tc("TC-VEH-08", "VPS-F-002", "EP", "My vehicles lists only my own",
  "GET /vehicles/mine as A", `contains ${plateA}, not B's vehicle`,
  async () => {
    const r = await api("GET", "/vehicles/mine", { token: tokenA });
    const plates = (r.json.vehicles || []).map((v) => v.vehicleNumber);
    return is(r, 200, plates.includes(plateA) && !plates.includes(`KA06X${run}`));
  });

await tc("TC-VEH-09", "VPS-F-002", "EP", "Scan an invalid QR gate pass",
  "token 'not-a-real-token'", "400",
  async () => is(await api("POST", "/vehicles/verify-qr", { body: { token: "not-a-real-token" }, token: office }), 400));

/* ======================= VPS-F-003: slot recommendation ======================= */

await tc("TC-SLOT-01", "VPS-F-003", "EP", "Car gets the smallest slot it fits, not the large one",
  `${plateA} with free slots S (5 m) and L (20 m)`, `S${run}`,
  async () => {
    const r = await api("POST", "/slots/recommend", { body: { vehicleNumber: plateA }, token: tokenA });
    return { actual: `${r.status} ${r.json.slot?.slotNumber}`, pass: r.status === 200 && r.json.slot?.length <= small.length };
  });

const bikePlate = `KA02B${run}`;
await api("POST", "/vehicles", { body: { vehicleNumber: bikePlate, type: "BIKE", length: 2, width: 0.8, height: 1.2 }, token: tokenA });
await tc("TC-SLOT-02", "VPS-F-003", "EP", "Two-wheeler gets a two-wheeler bay",
  `${bikePlate} BIKE 2 x 0.8 x 1.2`, "a slot no bigger than the bike bay",
  async () => {
    const r = await api("POST", "/slots/recommend", { body: { vehicleNumber: bikePlate }, token: tokenA });
    return { actual: `${r.status} ${r.json.slot?.slotNumber}`, pass: r.status === 200 && r.json.slot.length <= bikeBay.length };
  });

const exactPlate = `KA03E${run}`;
await api("POST", "/vehicles", { body: { vehicleNumber: exactPlate, type: "CAR", length: 5, width: 2.5, height: 2.2 }, token: tokenA });
await tc("TC-SLOT-03", "VPS-F-003", "BVA", "Vehicle exactly the size of a slot fits it",
  "5 x 2.5 x 2.2 vehicle, 5 x 2.5 x 2.2 slot", "200, a slot at least that size",
  async () => {
    const r = await api("POST", "/slots/recommend", { body: { vehicleNumber: exactPlate }, token: tokenA });
    const s = r.json.slot || {};
    return { actual: `${r.status} ${s.slotNumber}`, pass: r.status === 200 && s.length >= 5 && s.width >= 2.5 && s.height >= 2.2 };
  });

const truckPlate = `KA04T${run}`;
await api("POST", "/vehicles", { body: { vehicleNumber: truckPlate, type: "TRUCK", length: 500, width: 4, height: 4.5 }, token: tokenA });
await tc("TC-SLOT-04", "VPS-F-003", "EP", "Vehicle too big for every slot",
  "TRUCK 500 m long", "404 no suitable slot",
  async () => is(await api("POST", "/slots/recommend", { body: { vehicleNumber: truckPlate }, token: tokenA }), 404));

await tc("TC-SLOT-05", "VPS-F-003", "EP", "Recommendation without a vehicle number",
  "{}", "400",
  async () => is(await api("POST", "/slots/recommend", { body: {}, token: tokenA }), 400));

await tc("TC-SLOT-06", "VPS-F-003", "EP", "Recommendation for an unknown vehicle",
  "ZZ99UNKNOWN", "404",
  async () => is(await api("POST", "/slots/recommend", { body: { vehicleNumber: `ZZ99${run}` }, token: tokenA }), 404));

await tc("TC-SLOT-07", "VPS-F-003", "BVA", "Office adds a slot with a zero dimension",
  "width 0", "400",
  async () => is(await officeSlot(`Z${run}`, 5, 0, 2), 400));

/* ======================= VPS-F-004 / 005 / 006: reservations ======================= */

let bookingA;
await tc("TC-RES-01", "VPS-F-004", "EP", "Book a free slot for one hour",
  `${plateA} in S${run}, +10 to +70 min`, "201 CONFIRMED",
  async () => {
    const r = await api("POST", "/reservations", { body: { vehicleId: carA._id, slotId: small._id, startTime: at(10), endTime: at(70) }, token: tokenA });
    bookingA = r.json.reservation;
    return is(r, 201, bookingA?.status === "CONFIRMED");
  });

await tc("TC-RES-02", "VPS-F-005", "EP", "View my reservations",
  "GET /reservations/my/<A>", "200 and contains the new booking",
  async () => {
    const r = await api("GET", `/reservations/my/${userA._id}`, { token: tokenA });
    return is(r, 200, r.json.reservations?.some((b) => b._id === bookingA._id));
  });

await tc("TC-RES-03", "VPS-F-006", "EP", "Overlapping booking of the same slot",
  "+20 to +40 min (inside the first booking)", "400 already reserved",
  async () => is(await api("POST", "/reservations", { body: { vehicleId: carA._id, slotId: small._id, startTime: at(20), endTime: at(40) }, token: tokenB }), 400));

await tc("TC-RES-04", "VPS-F-006", "BVA", "Booking that overlaps by one minute at the end",
  "+69 to +100 min", "400",
  async () => is(await api("POST", "/reservations", { body: { vehicleId: carA._id, slotId: small._id, startTime: new Date(Date.parse(bookingA.endTime) - 60000).toISOString(), endTime: at(100) }, token: tokenA }), 400));

await tc("TC-RES-05", "VPS-F-006", "BVA", "Booking that starts exactly when the other ends",
  "start = previous end", "201 (touching is not overlapping)",
  async () => is(await api("POST", "/reservations", { body: { vehicleId: carA._id, slotId: small._id, startTime: bookingA.endTime, endTime: at(130) }, token: tokenA }), 201));

await tc("TC-RES-06", "VPS-F-004", "BVA", "End time equal to start time",
  "start = end = +200 min", "400",
  async () => is(await api("POST", "/reservations", { body: { vehicleId: carA._id, slotId: large._id, startTime: at(200), endTime: at(200) }, token: tokenA }), 400));

await tc("TC-RES-07", "VPS-F-004", "EP", "Booking that starts in the past",
  "-30 to +30 min", "400",
  async () => is(await api("POST", "/reservations", { body: { vehicleId: carA._id, slotId: large._id, startTime: at(-30), endTime: at(30) }, token: tokenA }), 400));

await tc("TC-RES-08", "VPS-F-004", "EP", "Vehicle that does not fit the chosen slot",
  "car in the two-wheeler bay", "400",
  async () => is(await api("POST", "/reservations", { body: { vehicleId: carA._id, slotId: bikeBay._id, startTime: at(300), endTime: at(360) }, token: tokenA }), 400));

await tc("TC-RES-09", "VPS-F-004", "EP", "Invalid ids in the booking",
  "slotId 'abc'", "400",
  async () => is(await api("POST", "/reservations", { body: { vehicleId: carA._id, slotId: "abc", startTime: at(300), endTime: at(360) }, token: tokenA }), 400));

let toCancel;
await tc("TC-RES-10", "VPS-F-005", "ST", "Cancel a future booking (CONFIRMED -> CANCELLED)",
  "large slot +400 to +460 min, then DELETE", "200 CANCELLED",
  async () => {
    toCancel = (await api("POST", "/reservations", { body: { vehicleId: carA._id, slotId: large._id, startTime: at(400), endTime: at(460) }, token: tokenA })).json.reservation;
    const r = await api("DELETE", `/reservations/${toCancel._id}`, { token: tokenA });
    return is(r, 200, r.json.reservation?.status === "CANCELLED");
  });

await tc("TC-RES-11", "VPS-F-005", "ST", "Cancel the same booking again",
  "DELETE again", "400 already cancelled",
  async () => is(await api("DELETE", `/reservations/${toCancel._id}`, { token: tokenA }), 400));

await tc("TC-RES-12", "VPS-F-005", "ST", "A cancelled time can be booked again",
  "same slot and time", "201",
  async () => is(await api("POST", "/reservations", { body: { vehicleId: carA._id, slotId: large._id, startTime: at(400), endTime: at(460) }, token: tokenB }), 201));

await tc("TC-RES-13", "VPS-F-005", "DT", "Another student cancels my booking",
  "B deletes A's booking", "400 not found (not cancelled)",
  async () => is(await api("DELETE", `/reservations/${bookingA._id}`, { token: tokenB }), 400));

await tc("TC-RES-14", "VPS-NF-005", "EP", "Twenty requests book the same free slot at the same moment (3 rounds)",
  "3 x 20 parallel POST /reservations, identical slot and time", "exactly one 201 per round",
  async () => {
    const wins = [];
    for (let round = 0; round < 3; round += 1) {
      const race = (await officeSlot(`R${round}${run}`, 6, 3, 3)).json.slot;
      const statuses = (await Promise.all(Array.from({ length: 20 }, () =>
        api("POST", "/reservations", { body: { vehicleId: carA._id, slotId: race._id, startTime: at(600), endTime: at(660) }, token: tokenA })
      ))).map((r) => r.status);
      wins.push(statuses.filter((code) => code === 201).length);
    }
    return { actual: `bookings confirmed per round: ${wins.join(", ")}`, pass: wins.every((n) => n === 1) };
  });

await tc("TC-RES-15", "VPS-F-004 / 5.1", "DT", "A userId in the body cannot book for someone else",
  "A's token with userId of B", "booking stored under A",
  async () => {
    const r = await api("POST", "/reservations", { body: { userId: userB._id, vehicleId: carA._id, slotId: large._id, startTime: at(800), endTime: at(860) }, token: tokenA });
    return { actual: `${r.status}, owner ${r.json.reservation?.userId === userA._id ? "A" : "B"}`, pass: r.status === 201 && r.json.reservation.userId === userA._id };
  });

/* ======================= VPS-F-009 / 010: tracking and history ======================= */

await tc("TC-TRK-01", "VPS-F-009", "ST", "Check in to a confirmed booking",
  "POST /parking/check-in", "201 ACTIVE",
  async () => {
    const r = await api("POST", "/parking/check-in", { body: { reservationId: bookingA._id }, token: tokenA });
    return is(r, 201, r.json.session?.status === "ACTIVE");
  });

await tc("TC-TRK-02", "VPS-F-009", "EP", "Find my vehicle while it is parked",
  plateA, `current slot S${run}`,
  async () => {
    const r = await api("GET", `/parking/tracking/${plateA}`, { token: tokenA });
    return { actual: `${r.status} ${r.json.currentSlot?.slotNumber}`, pass: r.status === 200 && r.json.currentSlot?.slotNumber === `S${run}` };
  });

await tc("TC-TRK-03", "VPS-F-009", "ST", "Check in twice",
  "same booking", "400 already checked in",
  async () => is(await api("POST", "/parking/check-in", { body: { reservationId: bookingA._id }, token: tokenA }), 400));

await tc("TC-TRK-04", "VPS-F-009", "EP", "Track an unregistered vehicle",
  `ZZ00${run}`, "404",
  async () => is(await api("GET", `/parking/tracking/ZZ00${run}`, { token: tokenA }), 404));

await tc("TC-TRK-05", "VPS-F-009 / 5.1", "DT", "Track another student's vehicle",
  "B tracks A's car", "403",
  async () => is(await api("GET", `/parking/tracking/${plateA}`, { token: tokenB }), 403));

await tc("TC-TRK-06", "VPS-F-009", "DT", "Parking office tracks any vehicle",
  "office tracks A's car", "200",
  async () => is(await api("GET", `/parking/tracking/${plateA}`, { token: office }), 200));

/* ======================= VPS-F-007 / 008: payments ======================= */

let paymentA;
await tc("TC-PAY-01", "VPS-F-007", "EP", "Pay for a one-hour booking by UPI",
  "UPI, 60-minute booking", "201 SUCCESS, Rs 50",
  async () => {
    const r = await api("POST", `/payments/reservations/${bookingA._id}`, { body: { paymentMethod: "UPI" }, token: tokenA });
    paymentA = r.json.payment;
    return { actual: `${r.status} ${paymentA?.status} Rs ${paymentA?.amount}`, pass: r.status === 201 && paymentA?.status === "SUCCESS" && paymentA.amount === 50 };
  });

await tc("TC-PAY-02", "VPS-F-007 / NF-005", "EP", "Pay the same booking again",
  "second UPI payment", "same transaction returned, not charged twice",
  async () => {
    const r = await api("POST", `/payments/reservations/${bookingA._id}`, { body: { paymentMethod: "UPI" }, token: tokenA });
    return { actual: `${r.status} ${r.json.payment?.transactionId === paymentA.transactionId ? "same" : "new"} transaction`, pass: r.json.payment?.transactionId === paymentA.transactionId };
  });

const longBooking = (await api("POST", "/reservations", { body: { vehicleId: carA._id, slotId: large._id, startTime: at(1000), endTime: at(1061) }, token: tokenA })).json.reservation;
await tc("TC-PAY-03", "VPS-F-007", "BVA", "Booking of 61 minutes is billed as two hours",
  "61-minute booking", "Rs 100",
  async () => {
    const r = await api("POST", `/payments/reservations/${longBooking._id}`, { body: { paymentMethod: "CARD" }, token: tokenA });
    return { actual: `${r.status} Rs ${r.json.payment?.amount}`, pass: r.status === 201 && r.json.payment.amount === 100 };
  });

await tc("TC-PAY-04", "VPS-F-007", "EP", "Unsupported payment method",
  "paymentMethod 'CASH'", "400",
  async () => is(await api("POST", `/payments/reservations/${bookingA._id}`, { body: { paymentMethod: "CASH" }, token: tokenA }), 400));

await tc("TC-PAY-05", "VPS-F-007", "ST", "Pay for a cancelled booking",
  "cancelled booking", "400",
  async () => is(await api("POST", `/payments/reservations/${toCancel._id}`, { body: { paymentMethod: "UPI" }, token: tokenA }), 400));

await tc("TC-PAY-06", "VPS-F-008", "EP", "Payment history shows my transactions",
  "GET /payments/my/<A>", "200 with both payments",
  async () => {
    const r = await api("GET", `/payments/my/${userA._id}`, { token: tokenA });
    return is(r, 200, (r.json.transactions || []).filter((p) => p.status === "SUCCESS").length >= 2);
  });

/* ======================= VPS-F-011 / 012: overstay and fines ======================= */

let lateBooking;
await tc("TC-OVER-01", "VPS-F-011", "UC", "Overstay is detected for a booking that ended 90 minutes ago",
  "B's booking ended 90 min ago; office runs detection", "detected >= 1",
  async () => {
    if (!db) return null;
    const carB = (await api("POST", "/vehicles", { body: { vehicleNumber: `KA09L${run}`, type: "CAR", length: 4, width: 1.7, height: 1.5 }, token: tokenB })).json.vehicle;
    const lateSlot = (await officeSlot(`O${run}`, 5, 2.5, 2.2)).json.slot;
    const { ObjectId } = mongoose.Types;
    lateBooking = (await db.collection("reservations").insertOne({
      userId: new ObjectId(userB._id), vehicleId: new ObjectId(carB._id), slotId: new ObjectId(lateSlot._id),
      startTime: new Date(Date.now() - 3 * 3600e3), endTime: new Date(Date.now() - 90 * 60e3),
      status: "CONFIRMED", createdAt: new Date(), updatedAt: new Date()
    })).insertedId.toString();
    const r = await api("POST", "/overstays/detect", { token: office });
    return { actual: `${r.status} detected ${r.json.detected}`, pass: r.status === 200 && r.json.detected >= 1 };
  });

let fineB;
await tc("TC-FINE-01", "VPS-F-012", "BVA", "Fine for 90 minutes over is two started hours",
  "90 min overdue at Rs 100/hour", "overdueMinutes >= 90, fine Rs 200, UNPAID",
  async () => {
    if (!db) return null;
    const r = await api("GET", `/overstays/my/${userB._id}`, { token: tokenB });
    fineB = (r.json.fines || []).find((f) => f.reservationId === lateBooking);
    return { actual: `${fineB?.overdueMinutes} min, Rs ${fineB?.fineAmount}, ${fineB?.status}`, pass: fineB?.overdueMinutes >= 90 && fineB.fineAmount === 200 && fineB.status === "UNPAID" };
  });

await tc("TC-FINE-02", "VPS-F-012", "ST", "Fine cannot be paid before checking out",
  "pay the fine while the booking is open", "400",
  async () => {
    if (!db) return null;
    return is(await api("POST", `/payments/fines/${fineB._id}`, { body: { paymentMethod: "UPI" }, token: tokenB }), 400);
  });

await tc("TC-FINE-03", "VPS-F-012", "ST", "Check out late, then pay the fine",
  "checkout, then pay by card", "200 checkout with fine Rs 200, then 201 SUCCESS Rs 200",
  async () => {
    if (!db) return null;
    const out = await api("POST", `/overstays/${lateBooking}/checkout`, { body: {}, token: tokenB });
    const pay = await api("POST", `/payments/fines/${fineB._id}`, { body: { paymentMethod: "CARD" }, token: tokenB });
    return { actual: `checkout ${out.status} fine Rs ${out.json.fine?.fineAmount}; pay ${pay.status} Rs ${pay.json.payment?.amount}`, pass: out.status === 200 && out.json.fine?.fineAmount === 200 && pay.status === 201 && pay.json.payment?.amount === 200 };
  });

await tc("TC-FINE-04", "VPS-F-012", "DT", "Another student pays my fine",
  "A pays B's fine", "400 fine not found",
  async () => {
    if (!db) return null;
    return is(await api("POST", `/payments/fines/${fineB._id}`, { body: { paymentMethod: "UPI" }, token: tokenA }), 400);
  });

await tc("TC-OVER-02", "VPS-F-011", "ST", "Check out before the booking ends: no fine",
  "A checks out the 1-hour booking early", "200 COMPLETED, no fine",
  async () => {
    const r = await api("POST", `/overstays/${bookingA._id}/checkout`, { body: {}, token: tokenA });
    return { actual: `${r.status} ${r.json.reservation?.status}, fine ${r.json.fine ? r.json.fine.fineAmount : "none"}`, pass: r.status === 200 && r.json.reservation?.status === "COMPLETED" && !r.json.fine };
  });

await tc("TC-HIST-01", "VPS-F-010", "ST", "After checkout the visit appears in parking history",
  plateA, "no current slot, 1 visit in history",
  async () => {
    const r = await api("GET", `/parking/tracking/${plateA}`, { token: tokenA });
    return { actual: `current ${r.json.currentSlot ? r.json.currentSlot.slotNumber : "none"}, history ${r.json.parkingHistory?.length}`, pass: r.status === 200 && !r.json.currentSlot && r.json.parkingHistory?.length === 1 };
  });

/* ======================= VPS-F-013: analytics ======================= */

await tc("TC-ANA-01", "VPS-F-013", "EP", "Parking office opens the analytics report",
  "GET /analytics as office", "200 with occupancy, peak hours, vehicle types, revenue",
  async () => {
    const r = await api("GET", "/analytics", { token: office });
    const a = r.json.analytics || {};
    return is(r, 200, Boolean(a.summary && a.occupancy && a.peakHours && a.vehicleTypeBreakdown && a.revenue) && a.revenue.totalRevenue >= 150);
  });

/* ======================= VPS-F-014: notifications ======================= */

await tc("TC-NTF-01", "VPS-F-014", "UC", "Booking and payment alerts are delivered",
  "A's alerts", "RESERVATION_CONFIRMED and PAYMENT_SUCCESS present",
  async () => {
    const r = await api("GET", `/notifications/${userA._id}`, { token: tokenA });
    const types = new Set((r.json.notifications || []).map((n) => n.type));
    return { actual: [...types].join(", "), pass: types.has("RESERVATION_CONFIRMED") && types.has("PAYMENT_SUCCESS") };
  });

await tc("TC-NTF-02", "VPS-F-014", "UC", "Overstay alert is delivered",
  "B's alerts", "OVERSTAY present",
  async () => {
    if (!db) return null;
    const r = await api("GET", `/notifications/${userB._id}`, { token: tokenB });
    return { actual: (r.json.notifications || []).map((n) => n.type).join(", "), pass: r.json.notifications?.some((n) => n.type === "OVERSTAY") };
  });

await tc("TC-NTF-03", "VPS-F-014", "ST", "Mark an alert as read",
  "PATCH /notifications/<id>/read", "200 isRead true",
  async () => {
    const list = (await api("GET", `/notifications/${userA._id}`, { token: tokenA })).json.notifications;
    const r = await api("PATCH", `/notifications/${list[0]._id}/read`, { token: tokenA });
    return is(r, 200, r.json.notification?.isRead === true);
  });

await tc("TC-NTF-04", "VPS-F-014 / 5.1", "DT", "Mark someone else's alert as read",
  "B marks A's alert", "404",
  async () => {
    const list = (await api("GET", `/notifications/${userA._id}`, { token: tokenA })).json.notifications;
    return is(await api("PATCH", `/notifications/${list[0]._id}/read`, { token: tokenB }), 404);
  });

/* ======================= FR-8 monthly pass, FR-9 ratings ======================= */

let pass;
await tc("TC-SUB-01", "FR-8", "UC", "Buy a monthly pass for a free slot",
  "UPI, Rs 3000 plan", "201 ACTIVE for one month",
  async () => {
    const passSlot = (await officeSlot(`M${run}`, 5.5, 2.6, 2.4)).json.slot;
    const r = await api("POST", "/subscriptions", { body: { vehicleId: carA._id, slotId: passSlot._id, paymentMethod: "UPI" }, token: tokenA });
    pass = r.json.subscription;
    return is(r, 201, pass?.status === "ACTIVE" && r.json.payment?.amount === 3000);
  });

await tc("TC-SUB-02", "FR-8", "ST", "Stop renewal of the pass",
  "PATCH /subscriptions/<id>/cancel", "200 cancelAtPeriodEnd true",
  async () => {
    const r = await api("PATCH", `/subscriptions/${pass._id}/cancel`, { body: {}, token: tokenA });
    return is(r, 200, r.json.subscription?.cancelAtPeriodEnd === true);
  });

await tc("TC-REV-01", "FR-9", "EP", "Rate a completed visit 4 stars",
  "rating 4", "201",
  async () => is(await api("POST", "/reviews", { body: { reservationId: bookingA._id, rating: 4, review: "Easy to find" }, token: tokenA }), 201));

await tc("TC-REV-02", "FR-9", "BVA", "Rating above the maximum",
  "rating 6", "400",
  async () => is(await api("POST", "/reviews", { body: { reservationId: bookingA._id, rating: 6 }, token: tokenA }), 400));

await tc("TC-REV-03", "FR-9", "EP", "Rate the same visit twice",
  "second rating", "409",
  async () => is(await api("POST", "/reviews", { body: { reservationId: bookingA._id, rating: 5 }, token: tokenA }), 409));

/* ======================= VPS-NF-004: stored data ======================= */

await tc("TC-SEC-11", "VPS-NF-004", "EP", "Passwords are stored only as bcrypt hashes",
  "users collection, A's record", "passwordHash starts with $2, no plain password anywhere",
  async () => {
    if (!db) return null;
    const doc = await db.collection("users").findOne({ email: emailA });
    const text = JSON.stringify(doc);
    return { actual: `hash prefix ${doc?.passwordHash?.slice(0, 4)}, plain text found: ${text.includes(pwd)}`, pass: /^\$2[aby]\$/.test(doc?.passwordHash || "") && !text.includes(pwd) };
  });

await tc("TC-SEC-12", "VPS-NF-004", "EP", "No card details are stored with payments",
  "payments collection, A's payments", "no card number, CVV or expiry fields",
  async () => {
    if (!db) return null;
    const docs = await db.collection("payments").find({ userId: new mongoose.Types.ObjectId(userA._id) }).toArray();
    const keys = new Set(docs.flatMap((d) => Object.keys(d)));
    const bad = [...keys].filter((k) => /card|cvv|expiry|pan/i.test(k));
    return { actual: `fields: ${[...keys].sort().join(", ")}`, pass: docs.length > 0 && bad.length === 0 };
  });

/* ======================= VPS-NF-001 / 002 / 003: response times ======================= */

const perf = [];
async function measure(id, requirement, title, limitMs, makeRequest) {
  const times = [];
  for (let i = 0; i < PERF_RUNS; i += 1) {
    const r = await makeRequest(i);
    if (r.status >= 500) throw new Error(`server error ${r.status}`);
    times.push(r.ms);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const p95 = times[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)];
  const max = times[times.length - 1];
  perf.push({ id, requirement, title, runs: times.length, avgMs: +avg.toFixed(1), p95Ms: +p95.toFixed(1), maxMs: +max.toFixed(1), limitMs });
  await tc(id, requirement, "PERF", title, `${PERF_RUNS} requests`, `every response under ${limitMs / 1000} s`,
    async () => ({ actual: `avg ${avg.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${max.toFixed(1)} ms`, pass: max < limitMs }));
}

await measure("TC-PERF-01", "VPS-NF-001", "Slot recommendation response time", 3000,
  () => api("POST", "/slots/recommend", { body: { vehicleNumber: bikePlate }, token: tokenA }));
await measure("TC-PERF-02", "VPS-NF-001", "Reservation response time", 3000,
  (i) => api("POST", "/reservations", { body: { vehicleId: carA._id, slotId: large._id, startTime: at(2000 + i * 120), endTime: at(2060 + i * 120) }, token: tokenA }));
await measure("TC-PERF-03", "VPS-NF-002", "Vehicle search response time", 2000,
  () => api("GET", `/parking/tracking/${plateA}`, { token: tokenA }));
await measure("TC-PERF-04", "VPS-NF-003", "Analytics report response time", 5000,
  () => api("GET", "/analytics", { token: office }));

/* ---------- summary ---------- */

const count = (s) => results.filter((r) => r.status === s).length;
const summary = { total: results.length, passed: count("PASS"), failed: count("FAIL"), notRun: count("NOT RUN") };
console.log(`\n${summary.passed} passed, ${summary.failed} failed, ${summary.notRun} not run, ${summary.total} total`);

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ base: BASE, run, finishedAt: new Date().toISOString(), node: process.version, summary, performance: perf, cases: results }, null, 2));
}
if (mongoose) await mongoose.disconnect();
process.exit(summary.failed ? 1 : 0);
