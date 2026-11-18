// End-to-end smoke test used by the CI/CD pipeline.
// Signs in, then walks one booking through the running API (security, FR-1 to FR-6)
// and exits non-zero on the first unexpected answer. Accounts, slot and vehicle numbers
// are unique per run, so it is safe to point at a database that already holds data.
// The server must have been started with the same ADMIN_EMAIL / ADMIN_PASSWORD.
// SMOKE_READ_ONLY=1 only reads (sign-in, role checks, slots, analytics) and creates
// nothing, for checking the live site without adding test data to its database.
//   BASE_URL=http://localhost:5000/api ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/smoke-test.mjs
const BASE = (process.env.BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");
const WAIT_SECONDS = Number(process.env.SMOKE_WAIT_SECONDS || 60);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const READ_ONLY = process.env.SMOKE_READ_ONLY === "1";

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("✗ set ADMIN_EMAIL and ADMIN_PASSWORD (the parking office account the server creates)");
  process.exit(1);
}

const run = Date.now().toString(36).toUpperCase();
let step = 0;

async function call(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

// expect(name, method, path, body, status, token)
async function expect(name, method, path, body, status, token) {
  step += 1;
  const res = await call(method, path, body, token);
  if (res.status !== status) {
    console.error(`✗ ${step}. ${name}: expected ${status}, got ${res.status} ${JSON.stringify(res.json)}`);
    process.exit(1);
  }
  console.log(`✓ ${step}. ${name} (${res.status})`);
  return res.json;
}

async function waitForHealth() {
  const deadline = Date.now() + WAIT_SECONDS * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await call("GET", "/health");
      if (res.status === 200) return;
    } catch {
      // Server not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.error(`✗ backend at ${BASE} did not become healthy within ${WAIT_SECONDS} s`);
  process.exit(1);
}

console.log(`Smoke test against ${BASE}`);
await waitForHealth();
await expect("health check", "GET", "/health", null, 200);

// Security (D-1): accounts, tokens and roles.
await expect("API refuses requests without a sign-in", "GET", "/slots", null, 401);
const office = (await expect("parking office signs in", "POST", "/auth/login",
  { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, 200)).token;
await expect("wrong password is refused", "POST", "/auth/login",
  { email: ADMIN_EMAIL, password: `not-${ADMIN_PASSWORD}` }, 401);

if (READ_ONLY) {
  const me = await expect("office reads its own account", "GET", "/auth/me", null, 200, office);
  if (me.user?.role !== "admin") {
    console.error(`✗ expected the office account to be an admin, got ${me.user?.role}`);
    process.exit(1);
  }
  await expect("forged token is refused", "GET", "/slots", null, 401, "forged.token.value");
  await expect("FR-1 office lists the slots", "GET", "/slots", null, 200, office);
  await expect("FR-8 monthly plan is available", "GET", "/subscriptions/plans", null, 200, office);
  await expect("FR-6 office opens the analytics report", "GET", "/analytics", null, 200, office);
  console.log(`All ${step} read-only smoke checks passed.`);
  process.exit(0);
}

const password = `smoke-${run}-pass`;
const signup = await expect("student signs up", "POST", "/auth/register",
  { name: `Smoke ${run}`, email: `smoke-${run.toLowerCase()}@campus.test`, password, detail: "CI" }, 201);
const userId = signup.user._id;
await expect("sign-up cannot make an admin", "POST", "/auth/register",
  { name: "X", email: `x-${run.toLowerCase()}@campus.test`, password, role: "admin" }, 400);
await expect("wrong password is refused", "POST", "/auth/login",
  { email: signup.user.email, password: "not-the-password" }, 401);
const student = (await expect("student signs in", "POST", "/auth/login",
  { email: signup.user.email, password }, 200)).token;
await expect("student reads their own account", "GET", "/auth/me", null, 200, student);
await expect("students cannot add slots", "POST", "/slots",
  { slotNumber: `X${run}`, length: 5, width: 2.5, height: 2.2 }, 403, student);
await expect("students cannot open analytics", "GET", "/analytics", null, 403, student);
await expect("students cannot read someone else's payments", "GET",
  "/payments/my/0000000000000000000000aa", null, 403, student);

const small = await expect("FR-1 office creates a slot", "POST", "/slots",
  { slotNumber: `S${run}`, length: 5, width: 2.5, height: 2.2 }, 201, office);
await expect("FR-1 office creates a large slot", "POST", "/slots",
  { slotNumber: `L${run}`, length: 20, width: 5, height: 5 }, 201, office);
const car = await expect("FR-1 register vehicle", "POST", "/vehicles",
  { vehicleNumber: `KA01${run}`, type: "CAR", length: 4.5, width: 1.8, height: 1.5 }, 201, student);
const mine = await expect("FR-1 list my vehicles", "GET", "/vehicles/mine", null, 200, student);
if (!mine.vehicles.some((v) => v.vehicleNumber === `KA01${run}`)) {
  console.error("✗ FR-1 the new vehicle is missing from my vehicles");
  process.exit(1);
}
await expect("FR-1 recommend a slot for the car", "POST", "/slots/recommend",
  { vehicleNumber: `KA01${run}` }, 200, student);
await expect("FR-1 register a truck too big for any slot", "POST", "/vehicles",
  { vehicleNumber: `KA05${run}`, type: "TRUCK", length: 30, width: 4, height: 4.5 }, 201, student);
await expect("FR-1 no suitable slot gives a clear 404", "POST", "/slots/recommend",
  { vehicleNumber: `KA05${run}` }, 404, student);

const start = Date.now() + 10 * 60000;
const booking = await expect("FR-2 reserve the slot", "POST", "/reservations", {
  userId, vehicleId: car.vehicle._id, slotId: small.slot._id,
  startTime: new Date(start).toISOString(), endTime: new Date(start + 60 * 60000).toISOString()
}, 201, student);
await expect("FR-2 overlapping booking is refused", "POST", "/reservations", {
  userId, vehicleId: car.vehicle._id, slotId: small.slot._id,
  startTime: new Date(start + 10 * 60000).toISOString(), endTime: new Date(start + 30 * 60000).toISOString()
}, 400, student);
await expect("FR-2 list my reservations", "GET", `/reservations/my/${userId}`, null, 200, student);

const reservationId = booking.reservation._id;
await expect("FR-4 check in", "POST", "/parking/check-in", { reservationId }, 201, student);
const tracking = await expect("FR-4 track vehicle", "GET", `/parking/tracking/KA01${run}`, null, 200, student);
if (tracking.currentSlot?.slotNumber !== `S${run}`) {
  console.error(`✗ FR-4 expected the car in slot S${run}, got ${tracking.currentSlot?.slotNumber}`);
  process.exit(1);
}

const payment = await expect("FR-3 pay for the reservation", "POST", `/payments/reservations/${reservationId}`,
  { paymentMethod: "UPI" }, 201, student);
if (payment.payment.amount !== 50) {
  console.error(`✗ FR-3 expected Rs 50 for one hour, got ${payment.payment.amount}`);
  process.exit(1);
}

await expect("FR-5 office runs overstay detection", "POST", "/overstays/detect", null, 200, office);
await expect("FR-5 check out", "POST", `/overstays/${reservationId}/checkout`, {}, 200, student);
await expect("FR-6 office opens the analytics report", "GET", "/analytics", null, 200, office);

console.log(`All ${step} smoke checks passed.`);
