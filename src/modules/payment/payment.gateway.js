const { randomUUID } = require("crypto");

async function processDigitalPayment({ amount, paymentMethod }) {
  if (process.env.PAYMENT_GATEWAY !== "demo") {
    throw new Error(
      "No payment provider is configured. Set PAYMENT_GATEWAY=demo for local testing."
    );
  }

  return {
    status: "SUCCESS",
    provider: "DEMO_GATEWAY",
    providerReference: `DEMO-${randomUUID()}`,
    amount,
    paymentMethod
  };
}

module.exports = { processDigitalPayment };