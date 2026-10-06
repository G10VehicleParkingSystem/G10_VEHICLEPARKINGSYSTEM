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
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vehicle", vehicleSchema);
