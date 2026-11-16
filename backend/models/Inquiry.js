const mongoose = require("mongoose");

const inquirySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      match: /^[0-9]{10}$/,
    },
    material: {
      type: String,
      required: true,
      enum: [
        "Scaffolding",
        "Farma",
        "Jack",
        "Base Jack",
        "Chali",
        "Other",
      ],
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["New", "Contacted", "Closed"],
      default: "New",
    },
  },
  {
    timestamps: true,
  }
);

const Inquiry = mongoose.model("Inquiry", inquirySchema);

module.exports = Inquiry;