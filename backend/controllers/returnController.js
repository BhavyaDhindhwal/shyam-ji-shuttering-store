const mongoose = require("mongoose");
const Inventory = require("../models/Inventory");
const MaterialIssue = require("../models/MaterialIssue");
const MaterialReturn = require("../models/MaterialReturn");
const Sale = require("../models/Sale");
const { isFarmaSetMaterial, calculateFarmaSetDelta } = require("../utils/rentalPricing");

// ==========================================
// GET ALL RETURNS
// ==========================================
async function getReturns(req, res) {
  try {
    const returns = await MaterialReturn.find()
      .populate("customer", "name phone address")
      .populate(
        "materialIssue",
        "challanNumber challanGroupNumber materialName quantity issueDate siteAddress unit"
      )
      .populate("material", "materialName category unit")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: returns.length,
      returns,
    });
  } catch (error) {
    console.error("Get returns error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch returns",
    });
  }
}

// ==========================================
// CREATE MATERIAL RETURN
// ==========================================
async function createReturn(req, res) {
  let stockRollback = null;
  let returnRecordId = null;
  let saleRollback = null;
  let newlyCreatedSaleId = null;
  try {
    const {
      materialIssueId,
      quantity,
      returnDate,
      rentalRate: requestedRentalRate,
      paymentReceived: requestedPaymentReceived = 0,
      paymentNote = "Payment received during material return",
      tempoRent: requestedTempoRent = 0,
      installationCharge: requestedInstallationCharge = 0,
      notes = "",
    } = req.body;

    // ------------------------------------------
    // VALIDATE MATERIAL ISSUE ID
    // ------------------------------------------
    if (!materialIssueId || !mongoose.Types.ObjectId.isValid(materialIssueId)) {
      return res.status(400).json({
        success: false,
        message: "Valid challan is required",
      });
    }

    // ------------------------------------------
    // VALIDATE QUANTITY
    // ------------------------------------------
    const returnQuantity = Number(quantity);

    if (!Number.isFinite(returnQuantity) || returnQuantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Return quantity must be greater than zero",
      });
    }

    const paymentReceived = Number(requestedPaymentReceived ?? 0);
    const tempoRent = Number(requestedTempoRent ?? 0);
    const installationCharge = Number(requestedInstallationCharge ?? 0);
    if (!Number.isFinite(paymentReceived) || paymentReceived < 0) {
      return res.status(400).json({ success: false, message: "Payment received must be a valid non-negative amount" });
    }
    if (!Number.isFinite(tempoRent) || tempoRent < 0) {
      return res.status(400).json({ success: false, message: "Tempo rent must be a valid non-negative amount" });
    }
    if (!Number.isFinite(installationCharge) || installationCharge < 0) {
      return res.status(400).json({ success: false, message: "Installation charge must be a valid non-negative amount" });
    }

    // ------------------------------------------
    // VALIDATE RETURN DATE
    // ------------------------------------------
    if (!returnDate || Number.isNaN(new Date(returnDate).getTime())) {
      return res.status(400).json({
        success: false,
        message: "Valid return date is required",
      });
    }

    // ------------------------------------------
    // FIND MATERIAL ISSUE / CHALLAN
    // ------------------------------------------
    const issue = await MaterialIssue.findById(materialIssueId);

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: "Material issue not found",
      });
    }

    // ------------------------------------------
    // CALCULATE ALREADY RETURNED QUANTITY
    // ------------------------------------------
    const returnedBefore = await MaterialReturn.aggregate([
      {
        $match: {
          materialIssue: issue._id,
        },
      },
      {
        $group: {
          _id: null,
          quantity: {
            $sum: "$quantity",
          },
        },
      },
    ]);

    const alreadyReturned = Number(
      returnedBefore[0]?.quantity || 0
    );

    // ------------------------------------------
    // CALCULATE REMAINING QUANTITY
    // ------------------------------------------
    const issuedQuantity = Number(issue.quantity || 0);

    const remainingQuantity = Math.max(
      0,
      issuedQuantity - alreadyReturned
    );

    // ------------------------------------------
    // CHECK RETURN LIMIT
    // ------------------------------------------
    if (returnQuantity > remainingQuantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${remainingQuantity} ${issue.materialName} can be returned for this challan`,
      });
    }

    // ------------------------------------------
    // FIND INVENTORY
    // ------------------------------------------
    const inventory = await Inventory.findById(issue.material);

    if (!inventory) {
      return res.status(404).json({
        success: false,
        message: "Inventory material not found",
      });
    }

    const isScaffoldingItem = /scaffolding/i.test(String(inventory.category || "")) || /scaffolding/i.test(String(issue.materialName || ""));
    const effectiveUnit = isScaffoldingItem ? "piece" : (issue.unit || inventory.unit || "piece");
    if (effectiveUnit !== "sqft" && !Number.isInteger(returnQuantity)) {
      return res.status(400).json({
        success: false,
        message: "Return quantity must be a whole number for this material",
      });
    }

    // Calculate rental charge before changing stock, so payment validation
    // cannot leave a saved return with an error response.
    const returnDay = new Date(returnDate);
    const issueDay = new Date(issue.issueDate);
    const dateOnly = (value) => Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    const billedThrough = issue.rentalBilledThrough ? new Date(issue.rentalBilledThrough) : issueDay;
    const chargeStart = dateOnly(billedThrough) > dateOnly(issueDay) ? billedThrough : issueDay;
    const rentalDays = Math.max(0, Math.floor((dateOnly(returnDay) - dateOnly(chargeStart)) / 86400000));
    const materialNameLower = String(issue.materialName || "").toLowerCase();
    const categoryLower = String(inventory.category || "").toLowerCase();
    const isFarmaChali = /chali/.test(materialNameLower);
    const isGhodi = /ghodi|ghori/.test(materialNameLower);
    const isFarmaSet = !isFarmaChali && !isGhodi && (
      isFarmaSetMaterial(issue.materialName) || (categoryLower.includes("farma") && !/chali|ghodi|ghori/.test(materialNameLower))
    );
    let rate = Number(requestedRentalRate);
    if (isFarmaChali) rate = 10;
    else if (isGhodi) rate = 50;
    else if (isFarmaSet) rate = 100;
    else if (!Number.isFinite(rate) || requestedRentalRate === "" || requestedRentalRate === undefined) rate = Number(issue.rentalRate || 0);
    if (!Number.isFinite(rate) || rate < 0) return res.status(400).json({ success: false, message: "Enter a valid non-negative rental rate" });

    const groupNumber = String(issue.challanGroupNumber || issue.challanNumber || "").trim();
    let billQuantity = returnQuantity;
    if (isFarmaSet) {
      // Determine the sets released by this return from the remaining plates
      // across every Farma size on the same challan. A partial return cannot
      // independently create another rounded-up set.
      const relatedIssues = await MaterialIssue.find({
        $or: [{ challanGroupNumber: groupNumber }, { challanNumber: groupNumber }],
      }).populate("material", "category").sort({ lineNumber: 1, createdAt: 1 });
      const relatedIds = relatedIssues.map((entry) => entry._id);
      const returnedRows = await MaterialReturn.aggregate([
        { $match: { materialIssue: { $in: relatedIds } } },
        { $group: { _id: "$materialIssue", quantity: { $sum: "$quantity" } } },
      ]);
      const returnedByIssue = new Map(returnedRows.map((entry) => [String(entry._id), Number(entry.quantity || 0)]));
      const isFarmaIssue = (entry) => {
        const name = String(entry.materialName || "").toLowerCase();
        const category = String(entry.material?.category || "").toLowerCase();
        return !/chali|ghodi|ghori/.test(name) && (
          isFarmaSetMaterial(entry.materialName) || (category.includes("farma") && !/chali|ghodi|ghori/.test(name))
        );
      };
      const totalOutstandingBefore = relatedIssues.filter(isFarmaIssue).reduce((sum, entry) => {
        return sum + Math.max(0, Number(entry.quantity || 0) - (returnedByIssue.get(String(entry._id)) || 0));
      }, 0);
      billQuantity = calculateFarmaSetDelta(totalOutstandingBefore, returnQuantity);
    }

    // Rental uses saved rental dates/rates; monthly-billed time is excluded.
    const rentalCharge = Math.round(billQuantity * rate * rentalDays * 100) / 100;
    let sale = await Sale.findOne({ challanNumber: groupNumber, billType: { $ne: "monthly_rental" } });
    const currentBillTotal = Number(sale?.totalAmount ?? sale?.amount ?? 0);
    const currentPaidAmount = Number(sale?.paidAmount || 0);
    const returnAdditionalCharges = Math.round((tempoRent + installationCharge) * 100) / 100;
    const billTotalAfterReturn = Math.round((currentBillTotal + rentalCharge + returnAdditionalCharges) * 100) / 100;
    if (paymentReceived > Math.max(0, billTotalAfterReturn - currentPaidAmount) + 0.005) {
      return res.status(400).json({ success: false, message: `Payment received cannot exceed the pending bill balance after this return charge (₹${Math.max(0, billTotalAfterReturn - currentPaidAmount).toFixed(2)}).` });
    }

    // ------------------------------------------
    // UPDATE STOCK
    // ------------------------------------------
    stockRollback = {
      inventoryId: inventory._id,
      availableStock: Number(inventory.availableStock || 0),
      rentedStock: Number(inventory.rentedStock || 0),
    };
    const newAvailableStock =
      Number(inventory.availableStock || 0) + returnQuantity;

    const newRentedStock =
      Math.max(
        0,
        Number(inventory.rentedStock || 0) - returnQuantity
      );

    // ------------------------------------------
    // STOCK SAFETY CHECK
    // ------------------------------------------
    if (newAvailableStock > Number(inventory.totalStock || 0)) {
      return res.status(400).json({
        success: false,
        message:
          "Return cannot be processed because inventory stock is inconsistent",
      });
    }

    inventory.availableStock = newAvailableStock;
    inventory.rentedStock = newRentedStock;

    await inventory.save();

    // ------------------------------------------
    // CREATE RETURN RECORD
    // ------------------------------------------

    const materialReturn = await MaterialReturn.create({
      materialIssue: issue._id, customer: issue.customer, material: inventory._id,
      materialName: issue.materialName, quantity: returnQuantity, returnDate: returnDay,
      rentalDays, rentalRate: rate, billingQuantity: billQuantity, rentalCharge, tempoRent, installationCharge,
      notes: String(notes || "").trim(),
    });
    returnRecordId = materialReturn._id;
    // Add this return's rental charge to the bill, then record any payment
    // collected now. The balance is always totalAmount - paidAmount.
    if (sale || rentalCharge > 0 || paymentReceived > 0 || returnAdditionalCharges > 0) {
      if (!sale) {
        sale = new Sale({
          customer: issue.customer,
          challan: issue._id,
          challanNumber: groupNumber,
          description: `Rental challan ${groupNumber}`,
          amount: 0,
          totalAmount: 0,
          paidAmount: 0,
          paymentStatus: "Pending",
          status: "pending",
          paymentHistory: [],
          saleDate: issue.issueDate || new Date(),
        });
      }

      if (sale.isNew) newlyCreatedSaleId = sale._id;
      else saleRollback = sale.toObject();

      const oldTotal = Number(sale.totalAmount ?? sale.amount ?? 0);
      const newTotal = Math.round((oldTotal + rentalCharge + returnAdditionalCharges) * 100) / 100;
      const oldPaid = Number(sale.paidAmount || 0);
      sale.cartageAmount = Math.round((Number(sale.cartageAmount || 0) + tempoRent) * 100) / 100;
      sale.installationCharge = Math.round((Number(sale.installationCharge || 0) + installationCharge) * 100) / 100;
      sale.returnTempoRent = Math.round((Number(sale.returnTempoRent || 0) + tempoRent) * 100) / 100;
      sale.returnInstallationCharge = Math.round((Number(sale.returnInstallationCharge || 0) + installationCharge) * 100) / 100;
      sale.lastBillDate = returnDay;
      const newPaid = Math.round((oldPaid + paymentReceived) * 100) / 100;

      sale.amount = newTotal;
      sale.totalAmount = newTotal;
      sale.paidAmount = newPaid;
      sale.description = `${sale.description || `Rental challan ${groupNumber}`} (return rental charge updated)`;
      if (paymentReceived > 0) {
        sale.paymentHistory.push({
          amount: paymentReceived,
          date: returnDay,
          note: String(paymentNote || "Payment received during material return").trim(),
          kind: "payment",
        });
      }
      sale.paymentStatus = newPaid >= newTotal ? "Paid" : newPaid > 0 ? "Partial" : "Pending";
      sale.status = String(sale.paymentStatus).toLowerCase();
      await sale.save();
    }

    // ------------------------------------------
    // CALCULATE REMAINING ISSUE QUANTITY
    // ------------------------------------------
    const remainingIssueQuantity =
      remainingQuantity - returnQuantity;

    // ------------------------------------------
    // RESPONSE
    // ------------------------------------------
    return res.status(201).json({
      success: true,
      message: "Material returned and bill charges updated successfully",

      return: materialReturn,

      stock: {
        materialName: inventory.materialName,
        totalStock: inventory.totalStock,
        availableStock: inventory.availableStock,
        rentedStock: inventory.rentedStock,
        unit: inventory.unit,
      },

      remainingIssueQuantity,
      rentalDays,
      rentalRate: rate,
      rentalCharge,
      tempoRent,
      installationCharge,
      returnAdditionalCharges,
      paymentReceived,
      billTotal: sale ? Number(sale.totalAmount ?? sale.amount ?? 0) : rentalCharge,
      totalPaid: sale ? Number(sale.paidAmount || 0) : paymentReceived,
      pendingBalance: sale ? Math.max(0, Number(sale.totalAmount ?? sale.amount ?? 0) - Number(sale.paidAmount || 0)) : Math.max(0, rentalCharge - paymentReceived),
    });
  } catch (error) {
    // If a later write fails, undo the stock/return/bill writes from this request.
    if (returnRecordId) {
      await MaterialReturn.deleteOne({ _id: returnRecordId }).catch((rollbackError) =>
        console.error("Return record rollback failed:", rollbackError.message)
      );
    }
    if (stockRollback) {
      await Inventory.updateOne(
        { _id: stockRollback.inventoryId },
        { $set: { availableStock: stockRollback.availableStock, rentedStock: stockRollback.rentedStock } }
      ).catch((rollbackError) => console.error("Inventory rollback failed:", rollbackError.message));
    }
    if (saleRollback) {
      await Sale.replaceOne({ _id: saleRollback._id }, saleRollback).catch((rollbackError) =>
        console.error("Sale rollback failed:", rollbackError.message)
      );
    } else if (newlyCreatedSaleId) {
      await Sale.deleteOne({ _id: newlyCreatedSaleId }).catch((rollbackError) =>
        console.error("New Sale rollback failed:", rollbackError.message)
      );
    }

    console.error("Create return error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to record material return",
      error: error.message,
    });
  }
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  getReturns,
  createReturn,
};