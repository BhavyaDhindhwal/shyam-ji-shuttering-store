const mongoose = require("mongoose");

const materialIssueSchema = new mongoose.Schema(
  {
    // challanNumber remains unique per material line for compatibility with
    // the existing MongoDB unique index. challanGroupNumber is the visible,
    // shared challan printed on a multi-material document.
    challanNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    challanGroupNumber: {
      type: String,
      trim: true,
      index: true,
      default: "",
    },
    lineNumber: { type: Number, min: 1, default: 1 },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    material: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: true,
    },
    materialName: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: { type: Number, required: true, min: 0.001 },
    issueDate: { type: Date, required: true },
    siteAddress: { type: String, trim: true, default: "" },
    expectedReturnDate: { type: Date, default: null },
    // Duration selected at challan creation. "custom" keeps compatibility with older API clients.
    rentalPeriod: {
      type: String,
      enum: ["daily", "weekly", "15days", "30days", "custom"],
      default: undefined,
    },
    rentalDurationDays: { type: Number, min: 1 },
    unit: { type: String, default: "piece" },
    rentalPricingMode: {
      type: String,
      enum: ["daily", "monthly", "fixed"],
      default: "daily",
    },
    rentalRate: { type: Number, min: 0, default: 0 },
    // Latest date through which monthly rental charges have been invoiced.
    rentalBilledThrough: { type: Date, default: null },
    // Legacy fields retained only to keep old MongoDB records readable.
    // New billing never uses square-foot or folding algorithms.
    scaffoldingBillingType: { type: String, enum: ["daily", "sqft_monthly"], default: "daily", select: true },
    scaffoldingAreaSqft: { type: Number, min: 0, default: 0 },
    billingQuantity: { type: Number, min: 0, default: 0 },
    billingUnit: { type: String, trim: true, default: "piece" },
    rentalPeriods: { type: Number, min: 0.001, default: 1 },
    estimatedRent: { type: Number, min: 0, default: 0 },
    installationCharge: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

materialIssueSchema.index({ challanGroupNumber: 1, lineNumber: 1 });

module.exports =
  mongoose.models.MaterialIssue ||
  mongoose.model("MaterialIssue", materialIssueSchema);
