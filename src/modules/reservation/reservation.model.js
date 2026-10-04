const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    startTime: {
      type: Date,
      required: true
    },
    endTime: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ["CONFIRMED", "CANCELLED", "COMPLETED"],
      default: "CONFIRMED"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Reservation", reservationSchema);
