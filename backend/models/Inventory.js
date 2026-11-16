const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
  {
    // ==========================================
    // MATERIAL NAME
    // ==========================================
    materialName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },

    // ==========================================
    // CATEGORY
    // ==========================================
    category: {
      type: String,
      trim: true,
      default: "Other",
      maxlength: 60,
    },

    // ==========================================
    // SIZE
    // Examples: 3 m, 2.5 m, 1 m
    // ==========================================
    size: {
      type: String,
      trim: true,
      default: "",
      maxlength: 40,
    },

    // ==========================================
    // TOTAL STOCK
    // ==========================================
    totalStock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // ==========================================
    // AVAILABLE STOCK
    // Automatically calculated
    // ==========================================
    availableStock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // ==========================================
    // RENTED / OUTGOING STOCK
    // ==========================================
    rentedStock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // ==========================================
    // UNIT
    // ==========================================
    unit: {
      type: String,
      trim: true,
      lowercase: true,
      enum: [
        "piece",
        "set",
        "pair",
        "meter",
        "kg",
        "bundle",
        "sqft",
      ],
      default: "piece",
    },

    // ==========================================
    // DEFAULT RENTAL PRICING
    // These are defaults for new challans only; existing challans save a rate snapshot.
    // ==========================================
    rentalPricingMode: {
      type: String,
      enum: ["daily", "monthly", "fixed"],
      default: "daily",
    },
    rentalRate: {
      type: Number,
      min: 0,
      default: 0,
    },

    // ==========================================
    // LOW STOCK LIMIT
    // ==========================================
    lowStockLimit: {
      type: Number,
      min: 0,
      default: 10,
    },
  },
  {
    timestamps: true,
  }
);

// ==========================================
// UNIQUE MATERIAL + SIZE
// ==========================================
// Same material can have different sizes.
// Example:
// Jack + 1 m
// Jack + 2.5 m
// Jack + 3 m
//
// Same material + same size cannot be duplicated.
// ==========================================

inventorySchema.index(
  {
    materialName: 1,
    size: 1,
  },
  {
    unique: true,
  }
);

const Inventory =
  mongoose.models.Inventory ||
  mongoose.model(
    "Inventory",
    inventorySchema
  );

module.exports = Inventory;