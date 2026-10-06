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
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ParkingSlot", parkingSlotSchema);
