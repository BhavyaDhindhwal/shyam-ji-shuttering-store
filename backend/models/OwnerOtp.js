const mongoose = require("mongoose");

const ownerOtpSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Owner",
      required: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

ownerOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OwnerOtp = mongoose.model("OwnerOtp", ownerOtpSchema);

module.exports = OwnerOtp;  