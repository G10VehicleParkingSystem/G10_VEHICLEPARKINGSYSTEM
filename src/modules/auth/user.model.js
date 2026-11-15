const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },

    // bcrypt hash; never returned by queries unless asked for explicitly.
    passwordHash: {
      type: String,
      required: true,
      select: false
    },

    role: {
      type: String,
      enum: ["student", "faculty", "admin"],
      default: "student"
    },

    // Free text shown in the app, e.g. "3rd year, CSE" or "Physics department".
    detail: {
      type: String,
      trim: true,
      maxlength: 80
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
