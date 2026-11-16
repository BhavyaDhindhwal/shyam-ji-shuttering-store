
const mongoose = require("mongoose");
const Inventory = require("../models/Inventory");
const MaterialIssue = require("../models/MaterialIssue");
const MaterialReturn = require("../models/MaterialReturn");
const { getSpecialRentalRule } = require("../utils/rentalPricing");

/* =====================================================
   ALLOWED UNITS
===================================================== */

const allowedUnits = [
  "piece",
  "set",
  "pair",
  "meter",
  "kg",
  "bundle",
  "sqft",
];

/* =====================================================
   HELPER FUNCTIONS
===================================================== */

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function validateStock(value, fieldName, unit = "piece") {
  const number = Number(value);
  const validNumber = unit === "sqft"
    ? Number.isFinite(number) && number >= 0
    : Number.isInteger(number) && number >= 0;

  if (!validNumber) {
    return {
      valid: false,
      message: unit === "sqft"
        ? `${fieldName} must be a non-negative number of square feet`
        : `${fieldName} must be a non-negative whole number`,
    };
  }

  return { valid: true, value: number };
}

// Calculate outstanding stock from challans/returns instead of trusting a possibly
// stale rentedStock counter left by older versions of the app.
async function getOutstandingQuantity(inventoryId) {
  const issues = await MaterialIssue.find({ material: inventoryId }).select("_id quantity").lean();
  if (!issues.length) return 0;
  const ids = issues.map((issue) => issue._id);
  const returned = await MaterialReturn.aggregate([
    { $match: { materialIssue: { $in: ids } } },
    { $group: { _id: "$materialIssue", quantity: { $sum: "$quantity" } } },
  ]);
  const returnedByIssue = new Map(returned.map((entry) => [String(entry._id), Number(entry.quantity || 0)]));
  return Math.max(0, issues.reduce((sum, issue) => sum + Math.max(0, Number(issue.quantity || 0) - (returnedByIssue.get(String(issue._id)) || 0)), 0));
}

/* =====================================================
   GET INVENTORY
===================================================== */

async function getInventory(req, res) {
  try {
    const inventory = await Inventory.find().sort({
      category: 1,
      materialName: 1,
      size: 1,
    });

    // Repair stale stock counters left by older issue/return flows. Open challans
    // are the source of truth, not the cached rentedStock value.
    for (const item of inventory) {
      const outstanding = await getOutstandingQuantity(item._id);
      const available = Math.max(0, Number(item.totalStock || 0) - outstanding);
      if (Number(item.rentedStock || 0) !== outstanding || Number(item.availableStock || 0) !== available) {
        item.rentedStock = outstanding;
        item.availableStock = available;
        await item.save();
      }
    }

    return res.status(200).json({
      success: true,
      count: inventory.length,
      inventory,
    });
  } catch (error) {
    console.error("Get inventory error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch inventory",
      error: error.message,
    });
  }
}

/* =====================================================
   CREATE INVENTORY ITEM
===================================================== */

async function createInventoryItem(req, res) {
  try {
    const {
      materialName,
      category = "Other",
      size = "",
      totalStock,
      rentedStock = 0,
      unit = "piece",
      rentalPricingMode = "daily",
      rentalRate = 0,
      lowStockLimit = 10,
    } = req.body;

    const cleanMaterialName = normalizeText(materialName);
    const cleanCategory = normalizeText(category) || "Other";
    const cleanSize = normalizeText(size);
    let cleanUnit = normalizeText(unit).toLowerCase();
    if (/scaffolding/i.test(cleanCategory) || /scaffolding/i.test(cleanMaterialName)) cleanUnit = "piece";
    let cleanPricingMode = normalizeText(rentalPricingMode).toLowerCase();
    let rate = Number(rentalRate);
    const specialRule = getSpecialRentalRule(cleanMaterialName);
    if (specialRule) {
      // Special material rules provide sensible defaults, not a hard lock on the rate.
      if (specialRule.stockUnit) cleanUnit = specialRule.stockUnit;
      if (!cleanPricingMode) cleanPricingMode = specialRule.pricingMode;
      if (!Number.isFinite(rate) || rate <= 0) rate = specialRule.rate;
      if (specialRule.rule === "farma" || specialRule.rule === "ghori") cleanPricingMode = "daily";
    }

    if (!cleanMaterialName) {
      return res.status(400).json({
        success: false,
        message: "Material name is required",
      });
    }

    if (totalStock === undefined || totalStock === null || totalStock === "") {
      return res.status(400).json({
        success: false,
        message: "Total stock is required",
      });
    }

    const totalResult = validateStock(totalStock, "Total stock", cleanUnit);
    if (!totalResult.valid) {
      return res.status(400).json({
        success: false,
        message: totalResult.message,
      });
    }

    const rentedResult = validateStock(rentedStock, "Rented stock", cleanUnit);
    if (!rentedResult.valid) {
      return res.status(400).json({
        success: false,
        message: rentedResult.message,
      });
    }

    const lowLimitResult = validateStock(
      lowStockLimit,
      "Low stock limit",
      cleanUnit
    );

    if (!lowLimitResult.valid) {
      return res.status(400).json({
        success: false,
        message: lowLimitResult.message,
      });
    }

    const total = totalResult.value;
    const rented = rentedResult.value;
    const lowLimit = lowLimitResult.value;

    if (rented > total) {
      return res.status(400).json({
        success: false,
        message: "Rented stock cannot be greater than total stock",
      });
    }

    if (!allowedUnits.includes(cleanUnit)) {
      return res.status(400).json({
        success: false,
        message: "Invalid unit selected",
      });
    }

    if (!["daily", "monthly", "fixed"].includes(cleanPricingMode)) {
      return res.status(400).json({
        success: false,
        message: "Pricing mode must be daily, monthly or fixed",
      });
    }

    if (!Number.isFinite(rate) || rate < 0) {
      return res.status(400).json({
        success: false,
        message: "Rental rate must be a valid non-negative amount",
      });
    }

    const existingItem = await Inventory.findOne({
      materialName: cleanMaterialName,
      size: cleanSize,
    });

    if (existingItem) {
      return res.status(409).json({
        success: false,
        message: cleanSize
          ? `This material with size ${cleanSize} already exists in inventory`
          : "This material already exists in inventory",
      });
    }

    const inventoryItem = await Inventory.create({
      materialName: cleanMaterialName,
      category: cleanCategory,
      size: cleanSize,
      totalStock: total,
      rentedStock: rented,
      availableStock: total - rented,
      unit: cleanUnit,
      rentalPricingMode: cleanPricingMode,
      rentalRate: rate,
      lowStockLimit: lowLimit,
    });

    return res.status(201).json({
      success: true,
      message: "Inventory item created successfully",
      inventoryItem,
    });
  } catch (error) {
    console.error("Create inventory error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This material and size combination already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create inventory item",
      error: error.message,
    });
  }
}

/* =====================================================
   UPDATE INVENTORY ITEM
===================================================== */

async function updateInventoryStock(req, res) {
  try {
    const { inventoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(inventoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid inventory item ID",
      });
    }

    const item = await Inventory.findById(inventoryId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Inventory item not found",
      });
    }

    const {
      materialName,
      category,
      size,
      totalStock,
      rentedStock,
      unit,
      rentalPricingMode,
      rentalRate,
      lowStockLimit,
    } = req.body;

    const nextMaterialName =
      materialName === undefined
        ? item.materialName
        : normalizeText(materialName);

    const nextCategory =
      category === undefined
        ? item.category
        : normalizeText(category) || "Other";

    const nextSize =
      size === undefined
        ? item.size
        : normalizeText(size);

    let nextUnit =
      unit === undefined
        ? item.unit
        : normalizeText(unit).toLowerCase();
    const specialRule = getSpecialRentalRule(nextMaterialName);
    if (specialRule?.stockUnit) nextUnit = specialRule.stockUnit;
    if (/scaffolding/i.test(nextCategory) || /scaffolding/i.test(nextMaterialName)) nextUnit = "piece";

    const actualOutstanding = await getOutstandingQuantity(item._id);
    // Keep the legacy counter aligned with open issue/return records.
    item.rentedStock = actualOutstanding;
    item.availableStock = Math.max(0, Number(item.totalStock || 0) - actualOutstanding);

    const nextTotalResult =
      totalStock === undefined
        ? { valid: true, value: item.totalStock }
        : validateStock(totalStock, "Total stock", nextUnit);

    const nextRentedResult =
      rentedStock === undefined
        ? { valid: true, value: actualOutstanding }
        : validateStock(rentedStock, "Rented stock", nextUnit);

    const nextLowLimitResult =
      lowStockLimit === undefined
        ? { valid: true, value: item.lowStockLimit }
        : validateStock(lowStockLimit, "Low stock limit", nextUnit);

    let nextPricingMode =
      rentalPricingMode === undefined
        ? (item.rentalPricingMode || "daily")
        : normalizeText(rentalPricingMode).toLowerCase();

    let nextRentalRate =
      rentalRate === undefined ? Number(item.rentalRate || 0) : Number(rentalRate);

    // Keep the standard billing unit/method for these material types, while
    // allowing the owner to update the default rate in Inventory.
    if (specialRule?.stockUnit) nextUnit = specialRule.stockUnit;
    if (specialRule?.rule === "farma" || specialRule?.rule === "ghori") nextPricingMode = "daily";

    if (!nextMaterialName) {
      return res.status(400).json({
        success: false,
        message: "Material name is required",
      });
    }

    if (!nextTotalResult.valid) {
      return res.status(400).json({
        success: false,
        message: nextTotalResult.message,
      });
    }

    if (!nextRentedResult.valid) {
      return res.status(400).json({
        success: false,
        message: nextRentedResult.message,
      });
    }

    if (!nextLowLimitResult.valid) {
      return res.status(400).json({
        success: false,
        message: nextLowLimitResult.message,
      });
    }

    const nextTotal = nextTotalResult.value;
    const nextRented = nextRentedResult.value;
    const nextLowStockLimit = nextLowLimitResult.value;

    if (nextRented > nextTotal) {
      return res.status(400).json({
        success: false,
        message: "Rented stock cannot be greater than total stock",
      });
    }

    if (!allowedUnits.includes(nextUnit)) {
      return res.status(400).json({
        success: false,
        message: "Invalid unit selected",
      });
    }

    if (!["daily", "monthly", "fixed"].includes(nextPricingMode)) {
      return res.status(400).json({
        success: false,
        message: "Pricing mode must be daily, monthly or fixed",
      });
    }

    if (!Number.isFinite(nextRentalRate) || nextRentalRate < 0) {
      return res.status(400).json({
        success: false,
        message: "Rental rate must be a valid non-negative amount",
      });
    }

    const duplicate = await Inventory.findOne({
      _id: { $ne: item._id },
      materialName: nextMaterialName,
      size: nextSize,
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message:
          "Another inventory item with the same material and size already exists",
      });
    }

    item.materialName = nextMaterialName;
    item.category = nextCategory;
    item.size = nextSize;
    item.totalStock = nextTotal;
    item.rentedStock = nextRented;
    item.availableStock = nextTotal - nextRented;
    item.unit = nextUnit;
    item.rentalPricingMode = nextPricingMode;
    item.rentalRate = nextRentalRate;
    item.lowStockLimit = nextLowStockLimit;

    await item.save();

    return res.status(200).json({
      success: true,
      message: "Inventory item updated successfully",
      inventoryItem: item,
    });
  } catch (error) {
    console.error("Update inventory error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Another item with the same material and size already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update inventory item",
      error: error.message,
    });
  }
}


/* =====================================================
   DELETE INVENTORY ITEM
===================================================== */
async function deleteInventoryItem(req, res) {
  try {
    const { inventoryId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(inventoryId)) {
      return res.status(400).json({ success: false, message: "Invalid inventory item ID" });
    }
    const item = await Inventory.findById(inventoryId);
    if (!item) {
      return res.status(404).json({ success: false, message: "Inventory item not found" });
    }
    const outstanding = await getOutstandingQuantity(item._id);
    if (outstanding > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete this item: ${outstanding} unit(s) are still outstanding on an issue challan. Open Return Material and record the return first.`,
      });
    }
    // If no issue has any unreturned quantity, clear a stale rentedStock counter
    // so old data cannot permanently prevent deletion.
    item.rentedStock = 0;
    item.availableStock = Number(item.totalStock || 0);
    await item.save();
    await Inventory.deleteOne({ _id: item._id });
    return res.status(200).json({ success: true, message: "Inventory item deleted successfully" });
  } catch (error) {
    console.error("Delete inventory error:", error);
    return res.status(500).json({ success: false, message: "Unable to delete inventory item", error: error.message });
  }
}

/* =====================================================
   EXPORTS
===================================================== */

module.exports = {
  getInventory,
  createInventoryItem,
  updateInventoryStock,
  deleteInventoryItem,
};
