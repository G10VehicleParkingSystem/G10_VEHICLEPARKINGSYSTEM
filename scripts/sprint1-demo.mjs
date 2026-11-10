// Sprint 1 demo: run from the VS Code terminal with `npm run demo` while screen recording.
// Starts the backend on a throwaway database, walks through FR-1 to FR-7 with real
// requests, opens each feature's code in the editor, then deletes the demo database.
import { execSync, spawn } from "node:child_process";
import mongoose from "mongoose";

const PORT = Number(process.env.DEMO_PORT || 5050);
const URI = process.env.DEMO_MONGO_URI || "mongodb://127.0.0.1:27017/g10_sprint1_demo";
const BASE = `http://localhost:${PORT}`;
const PACE = Number(process.env.DEMO_PACE || 1.35);

const c = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;
const blue = c("36"), green = c("32"), red = c("31"), yellow = c("33"), dim = c("2"), bold = c("1");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * PACE));

function openInEditor(file, line) {
  if (process.env.DEMO_NO_EDITOR) return;
  try {
    execSync(`code -r -g ${file}:${line}`, { stdio: "ignore" });
  } catch {
    // Not running inside VS Code: carry on without opening the file.
  }
}

async function heading(fr, title, file, line) {
  console.log(`\n${bold(blue(`━━ ${fr} · ${title} `))}${blue("━".repeat(Math.max(0, 60 - fr.length - title.length)))}`);
  if (file) openInEditor(file, line);
  await sleep(900);
}

async function call(method, path, body, show) {
  const data = body ? ` -d '${JSON.stringify(body)}'` : "";
  console.log(`${dim("$")} curl -X ${method} ${BASE}${path}${data}`);
  await sleep(350);
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json();
  const colour = res.ok ? green : red;
  console.log(`  ${colour(`${res.status} ${res.statusText}`)}  ${JSON.stringify(show ? show(json) : json)}`);
  await sleep(1100);
  return json;
}

const now = Date.now();
const at = (minutes) => new Date(now + minutes * 60000).toISOString();

await mongoose.connect(URI);
await mongoose.connection.dropDatabase();

console.log(bold("G10 Vehicle Parking System · Sprint 1 demo"));
console.log(dim(`Backend on port ${PORT}, demo database ${URI.split("/").pop()}`));
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(PORT), MONGO_URI: URI, PAYMENT_GATEWAY: "demo", OVERSTAY_CHECK_INTERVAL_MS: "1500" },
  stdio: ["ignore", "pipe", "pipe"]
});
let showServerLog = true;
server.stdout.on("data", (d) => showServerLog && process.stdout.write(dim(d.toString())));
server.stderr.on("data", (d) => process.stdout.write(red(d.toString())));
await sleep(2000);
showServerLog = false;

try {
  const user = "000000000000000000000001";

  await heading("FR-1", "Smart slot recommendation", "src/modules/slot/slot.service.js", 55);
  await call("POST", "/api/slots", { slotNumber: "A1", length: 5, width: 2.5, height: 2.2 }, (j) => ({ slot: j.slot.slotNumber, status: j.slot.status }));
  await call("POST", "/api/slots", { slotNumber: "B1", length: 10, width: 4, height: 4 }, (j) => ({ slot: j.slot.slotNumber, status: j.slot.status }));
  const car = await call("POST", "/api/vehicles", { vehicleNumber: "KA01AB1234", type: "CAR", length: 4.5, width: 1.8, height: 1.5 }, (j) => ({ vehicle: j.vehicle.vehicleNumber, type: j.vehicle.type }));
  const rec = await call("POST", "/api/slots/recommend", { vehicleNumber: "KA01AB1234" }, (j) => ({ message: j.message, slot: j.slot.slotNumber }));
  await call("POST", "/api/vehicles", { vehicleNumber: "KA05TR0001", type: "TRUCK", length: 12, width: 4, height: 4.5 }, (j) => ({ vehicle: j.vehicle.vehicleNumber, type: j.vehicle.type }));
  await call("POST", "/api/slots/recommend", { vehicleNumber: "KA05TR0001" });

  await heading("FR-2", "Reservation and cancellation", "src/modules/reservation/reservation.service.js", 8);
  const booking = await call("POST", "/api/reservations", { userId: user, vehicleId: car.vehicle._id, slotId: rec.slot._id, startTime: at(10), endTime: at(70) }, (j) => ({ message: j.message, status: j.reservation.status }));
  await call("POST", "/api/reservations", { userId: user, vehicleId: car.vehicle._id, slotId: rec.slot._id, startTime: at(20), endTime: at(40) });
  await call("GET", `/api/reservations/my/${user}`, null, (j) => ({ reservations: j.reservations.length, status: j.reservations[0].status }));

  await heading("FR-4", "Vehicle tracking", "src/modules/parking/parking.service.js", 74);
  await call("POST", "/api/parking/check-in", { reservationId: booking.reservation._id, userId: user }, (j) => ({ message: j.message, session: j.session.status }));
  await call("GET", "/api/parking/tracking/KA01AB1234", null, (j) => ({ vehicle: j.vehicle.vehicleNumber, currentSlot: j.currentSlot.slotNumber }));

  await heading("FR-3", "Digital payment", "src/modules/payment/payment.service.js", 66);
  await call("POST", `/api/payments/reservations/${booking.reservation._id}`, { userId: user, paymentMethod: "UPI" }, (j) => ({ status: j.payment.status, amount: j.payment.amount, method: j.payment.paymentMethod }));
  await call("GET", `/api/payments/my/${user}`, null, (j) => ({ transactions: j.transactions.length }));

  await heading("FR-5", "Overstay detection and fines", "src/modules/overstay/overstay.service.js", 52);
  const lateUser = "000000000000000000000002";
  const late = await mongoose.connection.collection("reservations").insertOne({
    userId: new mongoose.Types.ObjectId(lateUser),
    vehicleId: new mongoose.Types.ObjectId(car.vehicle._id),
    slotId: new mongoose.Types.ObjectId(rec.slot._id),
    startTime: new Date(Date.now() - 3 * 3600e3),
    endTime: new Date(Date.now() - 90 * 60e3),
    status: "CONFIRMED",
    upcomingNotifiedAt: null,
    expiryNotifiedAt: null
  });
  console.log(yellow("# test data: another user's booking that ended 90 minutes ago"));
  await sleep(900);
  await call("POST", "/api/overstays/detect", null, (j) => ({ detected: j.detected }));
  const fines = await call("GET", `/api/overstays/my/${lateUser}`, null, (j) => ({ overdueMinutes: j.fines[0].overdueMinutes, fineAmount: j.fines[0].fineAmount, status: j.fines[0].status }));
  await call("POST", `/api/overstays/${late.insertedId}/checkout`, { userId: lateUser }, (j) => ({ reservation: j.reservation.status, fineAmount: j.fine.fineAmount }));
  await call("POST", `/api/payments/fines/${fines.fines[0]._id}`, { userId: lateUser, paymentMethod: "CARD" }, (j) => ({ status: j.payment.status, amount: j.payment.amount }));

  await heading("FR-7", "Notifications and alerts", "src/modules/notification/notification.reminders.js", 46);
  await call("GET", `/api/notifications/${user}`, null, (j) => j.notifications.map((n) => n.type));
  await call("GET", `/api/notifications/${lateUser}`, null, (j) => j.notifications.map((n) => n.type));

  await heading("FR-6", "Admin analytics", "src/modules/analytics/analytics.service.js", 59);
  await call("GET", "/api/analytics", null, (j) => ({
    reservations: j.analytics.summary.totalReservations,
    occupancyRate: j.analytics.occupancy.current.occupancyRate,
    vehicleTypes: j.analytics.vehicleTypeBreakdown,
    revenue: { total: j.analytics.revenue.totalRevenue, parking: j.analytics.revenue.parkingRevenue, fines: j.analytics.revenue.fineRevenue }
  }));

  await heading("Known gap", "planned for Sprint 2", "docs/DEVIATIONS.md", 9);
  console.log(yellow("# calling an admin-only endpoint without logging in"));
  await sleep(700);
  await call("GET", "/api/analytics", null, (j) => ({ success: j.success }));
  console.log(yellow("# this should be 401 Unauthorized: login and admin roles come in Sprint 2 (deviation D-1)"));
  await sleep(1800);

  console.log(`\n${bold(green("All 7 FRs working together on one backend."))}`);
} finally {
  server.kill();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
