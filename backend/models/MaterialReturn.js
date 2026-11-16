const mongoose = require("mongoose");

const materialReturnSchema = new mongoose.Schema(
  {
    // Original material issue / challan
    materialIssue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MaterialIssue",
      required: true,
    },

    // Customer who returned the material
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    // Inventory item
    material: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: true,
    },

    // Store material name snapshot
    materialName: {
      type: String,
      required: true,
      trim: true,
    },

    // Quantity returned
    quantity: {
      type: Number,
      required: true,
      min: 0.001,
    },

    // Date on which material was returned
    returnDate: {
      type: Date,
      required: true,
    },

    rentalDays: { type: Number, min: 0, default: 0 },
    rentalRate: { type: Number, min: 0, default: 0 },
    billingQuantity: { type: Number, min: 0, default: 0 },
    rentalCharge: { type: Number, min: 0, default: 0 },

    // Return-time charges are stored on the return record as well as the linked bill.
    // These fields were previously sent by the API but missing from this schema.
    tempoRent: { type: Number, min: 0, default: 0 },
    installationCharge: { type: Number, min: 0, default: 0 },

    // Optional notes
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

materialReturnSchema.index({ materialIssue: 1, returnDate: 1 });
materialReturnSchema.index({ customer: 1, returnDate: -1 });

module.exports =
  mongoose.models.MaterialReturn ||
  mongoose.model(
    "MaterialReturn",
    materialReturnSchema
  );