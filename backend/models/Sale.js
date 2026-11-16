const mongoose = require("mongoose");

const paymentEntrySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now },
    note: { type: String, trim: true, default: "" },
    kind: { type: String, enum: ["advance", "payment", "adjustment"], default: "payment" },
  },
  { _id: true }
);

const saleLineSchema = new mongoose.Schema(
  {
    issue: { type: mongoose.Schema.Types.ObjectId, ref: "MaterialIssue", default: null },
    materialName: { type: String, trim: true, default: "" },
    quantity: { type: Number, min: 0, default: 0 },
    unit: { type: String, trim: true, default: "piece" },
    pricingMode: { type: String, enum: ["daily", "monthly", "fixed"], default: "daily" },
    rate: { type: Number, min: 0, default: 0 },
    billingQuantity: { type: Number, min: 0, default: 0 },
    billingUnit: { type: String, trim: true, default: "piece" },
    periods: { type: Number, min: 0.001, default: 1 },
    rentalPeriod: {
      type: String,
      enum: ["daily", "weekly", "15days", "30days", "custom"],
      default: undefined,
    },
    rentalDurationDays: { type: Number, min: 1 },
    estimatedRent: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    // Kept for existing single-issue / manually entered sales.
    challan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MaterialIssue",
      default: null,
    },
    challanNumber: { type: String, trim: true, default: "", index: true },
    billType: { type: String, enum: ["challan_account", "monthly_rental", "manual"], default: "challan_account", index: true },
    billNumber: { type: String, trim: true, default: "" },
    sourceChallanNumber: { type: String, trim: true, default: "", index: true },
    billingPeriodStart: { type: Date, default: null },
    billingPeriodEnd: { type: Date, default: null },
    monthlyBillingKey: { type: String, trim: true, default: undefined },
    rentalPeriod: {
      type: String,
      enum: ["daily", "weekly", "15days", "30days", "custom"],
      default: undefined,
    },
    rentalDurationDays: { type: Number, min: 1 },
    lineItems: { type: [saleLineSchema], default: [] },
    // Optional cartage / tempo rent charged on the same rental challan.
    // These fields are kept on the linked bill so Rental Sales, payments and printouts share one total.
    cartageAmount: { type: Number, min: 0, default: 0 },
    installationCharge: { type: Number, min: 0, default: 0 },
    issueTempoRent: { type: Number, min: 0, default: undefined },
    issueInstallationCharge: { type: Number, min: 0, default: undefined },
    returnTempoRent: { type: Number, min: 0, default: 0 },
    returnInstallationCharge: { type: Number, min: 0, default: 0 },
    lastBillDate: { type: Date, default: null },
    // Informational carry-forward snapshot only; the previous bills remain the
    // financial source of truth, so this value is never added into totalAmount.
    previousOutstandingBalance: { type: Number, min: 0, default: 0 },
    cartageName: { type: String, trim: true, default: "" },
    cartagePhone: { type: String, trim: true, default: "" },
    cartageAddress: { type: String, trim: true, default: "" },
    cartageDate: { type: Date, default: null },
    description: { type: String, trim: true, default: "" },
    amount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0 },
    paidAmount: { type: Number, min: 0, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["Paid", "Pending", "Partial", "Cancelled"],
    },
    // Legacy status is retained so records created by older versions remain readable.
    status: {
      type: String,
      enum: ["paid", "pending", "partial", "cancelled"],
      default: "pending",
    },
    paymentHistory: { type: [paymentEntrySchema], default: [] },
    saleDate: { type: Date, default: Date.now },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

saleSchema.index({ customer: 1, saleDate: 1, createdAt: 1 });
saleSchema.index({ challanNumber: 1 });
saleSchema.index({ saleDate: -1, createdAt: -1 });
// Protects monthly bill creation from duplicate clicks and concurrent requests.
saleSchema.index(
  { monthlyBillingKey: 1 },
  { unique: true, partialFilterExpression: { billType: "monthly_rental", monthlyBillingKey: { $type: "string" } } }
);

module.exports =
  mongoose.models.Sale || mongoose.model("Sale", saleSchema);
