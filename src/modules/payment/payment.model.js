
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      default: undefined
    },
    fineId: {
      type: mongoose.Schema.Types.ObjectId,
      default: undefined
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: undefined
    },
    subscriptionPeriodStart: {
      type: Date,
      default: undefined
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01
    },
    currency: {
      type: String,
      default: "INR",
      enum: ["INR"]
    },
    paymentMethod: {
      type: String,
      enum: ["UPI", "CARD", "NET_BANKING", "WALLET"],
      required: true
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "SUCCESS",
      required: true
    },
    provider: {
      type: String,
      default: "DEMO_GATEWAY"
    },
    transactionId: {
      type: String,
      required: true,
      unique: true
    },
    providerReference: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

paymentSchema.index(
  { reservationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      reservationId: { $exists: true },
      status: "SUCCESS"
    },
    name: "one_successful_payment_per_reservation"
  }
);

paymentSchema.index(
  { fineId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      fineId: { $exists: true },
      status: "SUCCESS"
    },
    name: "one_successful_payment_per_fine"
  }
);

// One successful payment per subscription billing period.
paymentSchema.index(
  { subscriptionId: 1, subscriptionPeriodStart: 1 },
  {
    unique: true,
    partialFilterExpression: {
      subscriptionId: { $exists: true },
      subscriptionPeriodStart: { $exists: true },
      status: "SUCCESS"
    },
    name: "one_successful_payment_per_subscription_period"
  }
);

module.exports = mongoose.model("Payment", paymentSchema);
