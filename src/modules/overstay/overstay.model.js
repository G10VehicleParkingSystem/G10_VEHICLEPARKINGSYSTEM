const mongoose = require("mongoose");

const overstayFineSchema = new mongoose.Schema(
  {
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    overdueMinutes: {
      type: Number,
      required: true,
      min: 1
    },
    fineAmount: {
      type: Number,
      required: true,
      min: 0.01
    },
    status: {
      type: String,
      enum: ["UNPAID", "PAID"],
      default: "UNPAID",
      required: true
    },
    paidAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("OverstayFine", overstayFineSchema);