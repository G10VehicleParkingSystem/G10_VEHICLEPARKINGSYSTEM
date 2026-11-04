const test = require("node:test");
const assert = require("node:assert/strict");

const Subscription = require("../src/modules/subscription/subscription.model");

const {
  addOneCalendarMonth,
  getMonthlyPlan,
  expireSubscriptions,
  createSubscription: createSubscriptionService,
  getUserSubscriptions
} = require("../src/modules/subscription/subscription.service");

const subscriptionController = require("../src/modules/subscription/subscription.controller");

function createResponse() {
  return {
    statusCode: 200,
    body: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    }
  };
}

test("monthly period handles January month-end correctly in a leap year", () => {
  const start = new Date("2024-01-31T10:30:00.000Z");
  const result = addOneCalendarMonth(start);

  assert.equal(result.toISOString(), "2024-02-29T10:30:00.000Z");
});

test("monthly period handles December to January correctly", () => {
  const start = new Date("2025-12-31T12:00:00.000Z");
  const result = addOneCalendarMonth(start);

  assert.equal(result.toISOString(), "2026-01-31T12:00:00.000Z");
});

test("monthly period rejects an invalid date", () => {
  assert.throws(
    () => addOneCalendarMonth("not-a-date"),
    /Invalid subscription date/
  );
});

test("monthly plan uses the configured subscription rate", () => {
  const originalRate = process.env.MONTHLY_SUBSCRIPTION_RATE;

  try {
    process.env.MONTHLY_SUBSCRIPTION_RATE = "4200";

    const plan = getMonthlyPlan();

    assert.equal(plan.planId, "MONTHLY_RESERVED");
    assert.equal(plan.durationMonths, 1);
    assert.equal(plan.amount, 4200);
    assert.equal(plan.currency, "INR");
  } finally {
    if (originalRate === undefined) {
      delete process.env.MONTHLY_SUBSCRIPTION_RATE;
    } else {
      process.env.MONTHLY_SUBSCRIPTION_RATE = originalRate;
    }
  }
});

test("monthly plan rejects a non-positive configured rate", () => {
  const originalRate = process.env.MONTHLY_SUBSCRIPTION_RATE;

  try {
    process.env.MONTHLY_SUBSCRIPTION_RATE = "0";

    assert.throws(
      () => getMonthlyPlan(),
      /MONTHLY_SUBSCRIPTION_RATE must be a positive number/
    );
  } finally {
    if (originalRate === undefined) {
      delete process.env.MONTHLY_SUBSCRIPTION_RATE;
    } else {
      process.env.MONTHLY_SUBSCRIPTION_RATE = originalRate;
    }
  }
});

test("expiry marks ended subscriptions expired and clears abandoned payments", async () => {
  const originalUpdateMany = Subscription.updateMany;
  const calls = [];

  try {
    Subscription.updateMany = async (filter, update) => {
      calls.push({ filter, update });

      return {
        modifiedCount: calls.length === 1 ? 2 : 1
      };
    };

    const now = new Date("2026-10-31T12:00:00.000Z");
    const result = await expireSubscriptions(now);

    assert.deepEqual(result, {
      expired: 2,
      abandonedPayments: 1
    });

    assert.equal(calls.length, 2);

    assert.deepEqual(calls[0].filter, {
      status: "ACTIVE",
      endDate: { $lte: now }
    });

    assert.deepEqual(calls[0].update, {
      $set: { status: "EXPIRED" },
      $unset: { slotLock: 1 }
    });

    assert.deepEqual(calls[1].filter, {
      status: "PENDING_PAYMENT",
      pendingExpiresAt: {
        $ne: null,
        $lte: now
      }
    });

    assert.deepEqual(calls[1].update, {
      $set: { status: "PAYMENT_FAILED" },
      $unset: {
        slotLock: 1,
        pendingExpiresAt: 1
      }
    });
  } finally {
    Subscription.updateMany = originalUpdateMany;
  }
});

test("subscription creation controller rejects missing fields", async () => {
  const res = createResponse();

  await subscriptionController.createSubscription(
    { body: {} },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(
    res.body.message,
    "userId, vehicleId, slotId and paymentMethod are required"
  );
});

test("subscription creation service rejects invalid user IDs", async () => {
  await assert.rejects(
    () =>
      createSubscriptionService({
        userId: "invalid-id",
        vehicleId: "000000000000000000000001",
        slotId: "000000000000000000000002",
        paymentMethod: "UPI"
      }),
    /userId is not a valid id/
  );
});

test("subscription listing rejects an invalid user ID", async () => {
  const res = createResponse();

  await subscriptionController.getMySubscriptions(
    {
      params: {
        userId: "invalid-id"
      }
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /userId is not a valid id/);
});

test("subscription renewal controller rejects missing payment details", async () => {
  const res = createResponse();

  await subscriptionController.renewSubscription(
    {
      params: {
        id: "000000000000000000000001"
      },
      body: {}
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(
    res.body.message,
    "userId and paymentMethod are required"
  );
});

test("subscription cancellation controller rejects a missing user ID", async () => {
  const res = createResponse();

  await subscriptionController.cancelSubscription(
    {
      params: {
        id: "000000000000000000000001"
      },
      body: {}
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, "userId is required");
});
