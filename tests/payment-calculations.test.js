const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateReservationCharge,
  calculateOverstayFine
} = require("../src/modules/payment/payment.calculations");

test("reservation charge bills each started hour at the configured rate", () => {
  assert.equal(
    calculateReservationCharge(
      "2026-10-04T10:00:00.000Z",
      "2026-10-04T11:01:00.000Z",
      50
    ),
    100
  );
});

test("overstay fine bills each started hour and reports overdue minutes", () => {
  assert.deepEqual(
    calculateOverstayFine(
      "2026-10-04T10:00:00.000Z",
      "2026-10-04T11:00:01.000Z",
      100
    ),
    { overdueMinutes: 61, fineAmount: 200 }
  );
});

test("no fine accrues at or before the reservation end time", () => {
  assert.deepEqual(
    calculateOverstayFine(
      "2026-10-04T10:00:00.000Z",
      "2026-10-04T10:00:00.000Z",
      100
    ),
    { overdueMinutes: 0, fineAmount: 0 }
  );
});

test("billing rejects invalid rates and time ranges", () => {
  assert.throws(
    () => calculateReservationCharge("2026-10-04T10:00:00Z", "2026-10-04T09:00:00Z", 50),
    /after start time/
  );
  assert.throws(
    () => calculateOverstayFine("2026-10-04T10:00:00Z", "2026-10-04T10:01:00Z", 0),
    /positive number/
  );
});