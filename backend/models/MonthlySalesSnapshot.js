const mongoose = require("mongoose");

const monthlySalesSnapshotSchema = new mongoose.Schema(
  {
    monthKey: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}$/ },
    timezone: { type: String, default: "Asia/Kolkata" },
    totalRentalSales: { type: Number, default: 0, min: 0 },
    totalReceivedInMonth: { type: Number, default: 0, min: 0 },
    totalTempoRent: { type: Number, default: 0, min: 0 },
    totalInstallationCharge: { type: Number, default: 0, min: 0 },
    outstandingAtMonthEnd: { type: Number, default: 0, min: 0 },
    activeRentalOrdersAtMonthEnd: { type: Number, default: 0, min: 0 },
    completedRentalOrdersInMonth: { type: Number, default: 0, min: 0 },
    customerCount: { type: Number, default: 0, min: 0 },
    transactionCount: { type: Number, default: 0, min: 0 },
    saleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Sale" }],
    materialIssueIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "MaterialIssue" }],
    returnIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "MaterialReturn" }],
    reconciledAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.MonthlySalesSnapshot ||
  mongoose.model("MonthlySalesSnapshot", monthlySalesSnapshotSchema);
