const mongoose = require("mongoose");
const expenseSchema = new mongoose.Schema({ title: { type: String, required: true, trim: true }, category: { type: String, default: "Other", trim: true }, amount: { type: Number, required: true, min: 0 }, date: { type: Date, default: Date.now }, note: { type: String, trim: true, default: "" } }, { timestamps: true });
module.exports = mongoose.models.Expense || mongoose.model("Expense", expenseSchema);
