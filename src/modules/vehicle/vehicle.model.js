const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    vehicleNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },

    type: {
      type: String,
      required: true,
      enum: ["CAR", "BIKE", "SUV", "VAN", "TRUCK"]
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
    // Account that registered the vehicle. Older records may not have one.
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    qrToken: {
      type: String,
      required: true,
      unique: true,
      select: false
    }
    
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vehicle", vehicleSchema);
