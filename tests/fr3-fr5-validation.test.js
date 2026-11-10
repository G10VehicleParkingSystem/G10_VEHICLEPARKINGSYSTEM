const test = require("node:test");
const assert = require("node:assert/strict");

const {
  payForReservation
} = require("../src/modules/payment/payment.controller");

const {
  checkout
} = require("../src/modules/overstay/overstay.controller");

const {
  processDigitalPayment
} = require("../src/modules/payment/payment.gateway");

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

test("payment controller rejects missing payment fields", async () => {
  const res = createResponse();

  await payForReservation(
    {
      body: {},
      params: {
        reservationId: "000000000000000000000001"
      }
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

test("payment controller rejects a missing payment method", async () => {
  const res = createResponse();

  await payForReservation(
    {
      body: {
        userId: "000000000000000000000001"
      },
      params: {
        reservationId: "000000000000000000000001"
      }
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /paymentMethod are required/);
});

test("payment controller rejects an invalid payment method", async () => {
  const res = createResponse();

  await payForReservation(
    {
      body: {
        userId: "000000000000000000000001",
        paymentMethod: "INVALID"
      },
      params: {
        reservationId: "000000000000000000000001"
      }
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /paymentMethod must be one of/);
});

test("checkout controller rejects a missing userId", async () => {
  const res = createResponse();

  await checkout(
    {
      body: {},
      params: {
        reservationId: "000000000000000000000001"
      }
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, "userId is required");
});

test("payment gateway rejects missing configuration", async () => {
  const originalGateway = process.env.PAYMENT_GATEWAY;

  try {
    delete process.env.PAYMENT_GATEWAY;

    await assert.rejects(
      () =>
        processDigitalPayment({
          amount: 100,
          paymentMethod: "UPI"
        }),
      /No payment provider is configured/
    );
  } finally {
    if (originalGateway === undefined) {
      delete process.env.PAYMENT_GATEWAY;
    } else {
      process.env.PAYMENT_GATEWAY = originalGateway;
    }
  }
});
