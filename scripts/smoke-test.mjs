// End-to-end smoke test used by the CI/CD pipeline.
// Walks one booking through the running API (FR-1 to FR-6) and exits non-zero on the
// first unexpected answer. Slot and vehicle numbers are unique per run, so it is safe
// to point at a database that already holds data.
//   BASE_URL=http://localhost:5000/api node scripts/smoke-test.mjs
const BASE = (process.env.BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");
const WAIT_SECONDS = Number(process.env.SMOKE_WAIT_SECONDS || 60);

const run = Date.now().toString(36).toUpperCase();
const userId = "0000000000000000000000aa";
let step = 0;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function expect(name, method, path, body, status) {
  step += 1;
  const res = await call(method, path, body);
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

const small = await expect("FR-1 create slot", "POST", "/slots",
  { slotNumber: `S${run}`, length: 5, width: 2.5, height: 2.2 }, 201);
await expect("FR-1 create large slot", "POST", "/slots",
  { slotNumber: `L${run}`, length: 20, width: 5, height: 5 }, 201);
const car = await expect("FR-1 register vehicle", "POST", "/vehicles",
  { vehicleNumber: `KA01${run}`, type: "CAR", length: 4.5, width: 1.8, height: 1.5 }, 201);
await expect("FR-1 recommend a slot for the car", "POST", "/slots/recommend",
  { vehicleNumber: `KA01${run}` }, 200);
await expect("FR-1 register a truck too big for any slot", "POST", "/vehicles",
  { vehicleNumber: `KA05${run}`, type: "TRUCK", length: 30, width: 4, height: 4.5 }, 201);
await expect("FR-1 no suitable slot gives a clear 404", "POST", "/slots/recommend",
  { vehicleNumber: `KA05${run}` }, 404);

const start = Date.now() + 10 * 60000;
const booking = await expect("FR-2 reserve the slot", "POST", "/reservations", {
  userId, vehicleId: car.vehicle._id, slotId: small.slot._id,
  startTime: new Date(start).toISOString(), endTime: new Date(start + 60 * 60000).toISOString()
}, 201);
await expect("FR-2 overlapping booking is refused", "POST", "/reservations", {
  userId, vehicleId: car.vehicle._id, slotId: small.slot._id,
  startTime: new Date(start + 10 * 60000).toISOString(), endTime: new Date(start + 30 * 60000).toISOString()
}, 400);
await expect("FR-2 list my reservations", "GET", `/reservations/my/${userId}`, null, 200);

const reservationId = booking.reservation._id;
await expect("FR-4 check in", "POST", "/parking/check-in", { reservationId, userId }, 201);
const tracking = await expect("FR-4 track vehicle", "GET", `/parking/tracking/KA01${run}`, null, 200);
if (tracking.currentSlot?.slotNumber !== `S${run}`) {
  console.error(`✗ FR-4 expected the car in slot S${run}, got ${tracking.currentSlot?.slotNumber}`);
  process.exit(1);
}

const payment = await expect("FR-3 pay for the reservation", "POST", `/payments/reservations/${reservationId}`,
  { userId, paymentMethod: "UPI" }, 201);
if (payment.payment.amount !== 50) {
  console.error(`✗ FR-3 expected Rs 50 for one hour, got ${payment.payment.amount}`);
  process.exit(1);
}

await expect("FR-5 run overstay detection", "POST", "/overstays/detect", null, 200);
await expect("FR-5 check out", "POST", `/overstays/${reservationId}/checkout`, { userId }, 200);
await expect("FR-6 analytics report", "GET", "/analytics", null, 200);

console.log(`All ${step} smoke checks passed.`);
