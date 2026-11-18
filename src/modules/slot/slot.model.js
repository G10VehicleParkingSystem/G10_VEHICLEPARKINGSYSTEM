const mongoose = require("mongoose");

const parkingSlotSchema = new mongoose.Schema(
  {
    slotNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },

    length: {
      type: Number,
      required: true,
      min: 0
    },

    width: {
      type: Number,
      required: true,
      min: 0
    },

    height: {
      type: Number,
      required: true,
      min: 0
    },

    status: {
      type: String,
      enum: ["AVAILABLE", "OCCUPIED"],
      default: "AVAILABLE"
    },

    // Short-lived lock held while a booking for this slot is checked and saved, so
    // two requests at the same moment cannot both pass the overlap check.
    bookingLock: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      select: false
    },

    bookingLockExpires: {
      type: Date,
      default: null,
      select: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ParkingSlot", parkingSlotSchema);
