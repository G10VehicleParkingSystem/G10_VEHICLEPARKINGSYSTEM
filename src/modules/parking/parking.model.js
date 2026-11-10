const mongoose = require("mongoose");

const parkingSessionSchema = new mongoose.Schema(
  {
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      default: null
    },

    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
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

    entryTime: {
      type: Date,
      required: true
    },

    exitTime: {
      type: Date,
      default: null
    },

    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED"],
      default: "ACTIVE"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ParkingSession", parkingSessionSchema);