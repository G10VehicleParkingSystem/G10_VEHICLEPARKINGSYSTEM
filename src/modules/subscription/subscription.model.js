const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true
    },
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ParkingSlot",
      required: true
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    monthlyAmount: {
      type: Number,
      required: true,
      min: 0.01
    },
    currency: {
      type: String,
      enum: ["INR"],
      default: "INR"
    },
    status: {
      type: String,
      enum: [
        "PENDING_PAYMENT",
        "ACTIVE",
        "PAYMENT_FAILED",
        "EXPIRED"
      ],
      default: "PENDING_PAYMENT",
      required: true
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false
    },
    pendingExpiresAt: {
      type: Date,
      default: null
    },
    slotLock: {
      type: mongoose.Schema.Types.ObjectId,
      default: undefined
    }
  },
  { timestamps: true }
);

// Only one pending or active subscription can hold a slot.
// Failed and expired subscriptions release the lock by unsetting slotLock.
subscriptionSchema.index(
  { slotLock: 1 },
  {
    unique: true,
    sparse: true,
    name: "one_pending_or_active_subscription_per_slot"
  }
);

subscriptionSchema.index({
  userId: 1,
  status: 1,
  endDate: -1
});

module.exports = mongoose.model("Subscription", subscriptionSchema);
