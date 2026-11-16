const mongoose = require("mongoose");

const ownerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    role: {
      type: String,
      default: "owner",
    },

    otpHash: {
      type: String,
      default: undefined,
    },

    otpExpiresAt: {
      type: Date,
      default: undefined,
    },

    otpAttempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.Owner ||
  mongoose.model("Owner", ownerSchema);