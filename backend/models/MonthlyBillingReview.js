const mongoose = require("mongoose");

const monthlyBillingReviewSchema = new mongoose.Schema({
  challanNumber: { type: String, required: true, trim: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  status: { type: String, enum: ["skipped", "billed"], required: true },
  sale: { type: mongoose.Schema.Types.ObjectId, ref: "Sale", default: null },
  skippedAt: { type: Date, default: null },
  billedAt: { type: Date, default: null },
}, { timestamps: true });

monthlyBillingReviewSchema.index(
  { challanNumber: 1, periodStart: 1, periodEnd: 1 },
  { unique: true }
);

module.exports = mongoose.models.MonthlyBillingReview || mongoose.model("MonthlyBillingReview", monthlyBillingReviewSchema);
