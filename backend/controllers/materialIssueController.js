const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Inventory = require("../models/Inventory");
const MaterialIssue = require("../models/MaterialIssue");
const MaterialReturn = require("../models/MaterialReturn");
const Sale = require("../models/Sale");
const {
  getSpecialRentalRule,
  calculateRentalPeriods,
  calculateBillingQuantity,
  isFarmaSetMaterial,
  allocateCombinedFarmaSets,
} = require("../utils/rentalPricing");

function getPaymentStatus(total, paid) {
  if (total > 0 && paid >= total) return "Paid";
  if (paid > 0) return "Partial";
  return "Pending";
}

const CHALLAN_PERIOD_DAYS = {
  daily: 1,
  weekly: 7,
  "15days": 15,
  "30days": 30,
};

function getSaleAmount(sale) {
  return Number(sale?.totalAmount ?? sale?.amount ?? 0);
}

function isCancelledSale(sale) {
  return [sale?.paymentStatus, sale?.status].some((value) =>
    ["cancelled", "canceled"].includes(String(value || "").trim().toLowerCase())
  );
}

function inferRentalPeriod(days) {
  if (days === 1) return "daily";
  if (days === 7) return "weekly";
  if (days === 15) return "15days";
  if (days === 30) return "30days";
  return "custom";
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function validDate(value) {
  return value && !Number.isNaN(new Date(value).getTime());
}

async function syncInventoryStockCounters(items) {
  const ids = items.map((item) => item._id);
  if (!ids.length) return;
  const issues = await MaterialIssue.find({ material: { $in: ids } }).select("_id material quantity").lean();
  const issueIds = issues.map((issue) => issue._id);
  const returned = issueIds.length ? await MaterialReturn.aggregate([
    { $match: { materialIssue: { $in: issueIds } } },
    { $group: { _id: "$materialIssue", quantity: { $sum: "$quantity" } } },
  ]) : [];
  const returnedByIssue = new Map(returned.map((entry) => [String(entry._id), Number(entry.quantity || 0)]));
  const outstandingByMaterial = new Map();
  for (const issue of issues) {
    const open = Math.max(0, Number(issue.quantity || 0) - (returnedByIssue.get(String(issue._id)) || 0));
    const key = String(issue.material);
    outstandingByMaterial.set(key, (outstandingByMaterial.get(key) || 0) + open);
  }
  for (const item of items) {
    const outstanding = outstandingByMaterial.get(String(item._id)) || 0;
    item.rentedStock = outstanding;
    item.availableStock = Math.max(0, Number(item.totalStock || 0) - outstanding);
    await item.save();
  }
}

async function getIssueOptions(req, res) {
  try {
    const [customers, inventory] = await Promise.all([
      Customer.find().sort({ name: 1 }),
      Inventory.find().sort({ materialName: 1 }),
    ]);
    await syncInventoryStockCounters(inventory);
    return res.status(200).json({ success: true, customers, inventory });
  } catch (error) {
    console.error("Get issue options error:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch issue options", error: error.message });
  }
}

async function createMaterialIssue(req, res) {
  const createdIssues = [];
  const inventorySnapshots = [];
  let createdSale = null;

  try {
    const {
      customerId,
      challanNumber: requestedChallanNumber,
      materialId,
      quantity,
      items: requestedItems,
      issueDate,
      expectedReturnDate,
      rentalPeriod: requestedRentalPeriod,
      rentalDurationDays: requestedDurationDays,
      notes = "",
      advanceAmount = 0,
      paymentDate,
      paymentNote = "",
      cartageAmount = 0,
      installationCharge = 0,
      cartageName = "",
      cartagePhone = "",
      cartageAddress = "",
      cartageDate,
      siteAddress = "",
    } = req.body;

    const itemInputs = Array.isArray(requestedItems) && requestedItems.length
      ? requestedItems
      : (materialId ? [{ materialId, quantity }] : []);

    if (!customerId || !validDate(issueDate) || itemInputs.length === 0) {
      return res.status(400).json({ success: false, message: "Customer, issue date and at least one material are required" });
    }

    const issueDay = new Date(issueDate);
    const manualChallanNumber = String(requestedChallanNumber || "").trim();
    if (!manualChallanNumber) {
      return res.status(400).json({ success: false, message: "Enter the challan number manually." });
    }
    if (manualChallanNumber.length > 40) {
      return res.status(400).json({ success: false, message: "Challan number must be 40 characters or fewer." });
    }
    if (await MaterialIssue.exists({
      $or: [
        { challanGroupNumber: manualChallanNumber },
        { challanNumber: manualChallanNumber },
      ],
    })) {
      return res.status(409).json({ success: false, message: "This challan number already exists. Enter a different challan number." });
    }
    let rentalPeriod = String(requestedRentalPeriod || "").trim().toLowerCase();
    let durationDays = CHALLAN_PERIOD_DAYS[rentalPeriod];

    // Older clients may still send only issue/return dates. Keep that flow working.
    if (!durationDays && requestedRentalPeriod === "custom" && Number.isFinite(Number(requestedDurationDays)) && Number(requestedDurationDays) >= 1) {
      durationDays = Math.floor(Number(requestedDurationDays));
      rentalPeriod = "custom";
    }
    if (!durationDays) {
      if (requestedRentalPeriod && requestedRentalPeriod !== "custom") {
        return res.status(400).json({ success: false, message: "Rental period must be daily, weekly, 15days or 30days" });
      }
      const requestedReturn = validDate(expectedReturnDate) ? new Date(expectedReturnDate) : addDays(issueDay, 7);
      durationDays = Math.max(1, Math.ceil((requestedReturn.getTime() - issueDay.getTime()) / 86400000));
      rentalPeriod = inferRentalPeriod(durationDays);
      if (rentalPeriod === "custom") rentalPeriod = "custom";
    }
    if (!Number.isFinite(durationDays) || durationDays < 1) {
      return res.status(400).json({ success: false, message: "Invalid rental duration" });
    }
    const returnDay = addDays(issueDay, durationDays);

    const seenIds = new Set();
    const normalizedInputs = itemInputs.map((input, index) => {
      const id = String(input.materialId || input.material || "");
      const count = Number(input.quantity);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw Object.assign(new Error(`Select a valid material for line ${index + 1}`), { status: 400 });
      }
      if (!Number.isFinite(count) || count <= 0) {
        throw Object.assign(new Error(`Quantity on line ${index + 1} must be greater than zero`), { status: 400 });
      }
      if (seenIds.has(id)) {
        throw Object.assign(new Error("Each material can appear only once in a challan. Combine quantities on the same line."), { status: 400 });
      }
      seenIds.add(id);
      return {
        materialId: id,
        quantity: count,
        pricingMode: String(input.rentalPricingMode || input.pricingMode || "").toLowerCase(),
        rateProvided: input.rentalRate !== undefined && input.rentalRate !== "",
        rentalRate: input.rentalRate,
      };
    });

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

    // Capture this customer's balance before the new challan is created.
    const priorBills = await Sale.find({ customer: customer._id });
    const priorPendingAmount = Math.round(priorBills.reduce((sum, bill) => {
      if (isCancelledSale(bill)) return sum;
      return sum + Math.max(getSaleAmount(bill) - Number(bill.paidAmount || 0), 0);
    }, 0) * 100) / 100;

    const materialIds = normalizedInputs.map((item) => item.materialId);
    const inventoryItems = await Inventory.find({ _id: { $in: materialIds } });
    await syncInventoryStockCounters(inventoryItems);
    const inventoryById = new Map(inventoryItems.map((item) => [String(item._id), item]));

    const preparedLines = normalizedInputs.map((input, index) => {
      const inventory = inventoryById.get(input.materialId);
      if (!inventory) throw Object.assign(new Error(`Material on line ${index + 1} was not found`), { status: 404 });
      if (Number(inventory.availableStock || 0) < input.quantity) {
        throw Object.assign(new Error(`Only ${inventory.availableStock} ${inventory.materialName} available`), { status: 400 });
      }
      const specialRule = getSpecialRentalRule(inventory.materialName);
      const isScaffoldingItem = /scaffolding/i.test(String(inventory.category || "")) || /scaffolding/i.test(String(inventory.materialName || ""));
      const stockUnit = isScaffoldingItem ? "piece" : (specialRule?.stockUnit || inventory.unit || "piece");
      if (specialRule?.stockUnit || isScaffoldingItem) inventory.unit = stockUnit;
      const permitsFraction = !isScaffoldingItem && stockUnit === "sqft";
      if (!permitsFraction && !Number.isInteger(input.quantity)) {
        throw Object.assign(new Error(`Quantity on line ${index + 1} must be a positive whole number for ${inventory.materialName}`), { status: 400 });
      }
      if (Number(inventory.availableStock || 0) < input.quantity) {
        throw Object.assign(new Error(`Only ${inventory.availableStock} ${stockUnit} of ${inventory.materialName} available`), { status: 400 });
      }
      const mode = specialRule?.pricingMode || input.pricingMode || inventory.rentalPricingMode || "daily";
      const requestedRate = input.rateProvided ? Number(input.rentalRate) : Number(inventory.rentalRate ?? 0);
      const rate = input.rateProvided && Number.isFinite(requestedRate)
        ? requestedRate
        : Number(inventory.rentalRate ?? specialRule?.rate ?? 0);
      if (!["daily", "monthly", "fixed"].includes(mode)) {
        throw Object.assign(new Error(`Pricing mode on line ${index + 1} must be daily, monthly or fixed`), { status: 400 });
      }
      if (!Number.isFinite(rate) || rate < 0) {
        throw Object.assign(new Error(`Enter a valid non-negative rental rate for ${inventory.materialName}`), { status: 400 });
      }
      const periods = calculateRentalPeriods(mode, durationDays);
      const billingQuantity = calculateBillingQuantity(inventory.materialName, input.quantity);
      const billingUnit = specialRule?.billingUnit || stockUnit;
      const estimatedRent = rate > 0 ? Math.round(rate * billingQuantity * periods * 100) / 100 : 0;
      return { input, inventory, mode, rate, periods, billingQuantity, billingUnit, estimatedRent };
    });

    // Allocate one combined set count across all 9/12/15/18-inch Farma lines.
    // This prevents each size from independently rounding its own partial set.
    const farmaSetAllocations = allocateCombinedFarmaSets(preparedLines.map((line) => ({
      materialName: line.inventory.materialName,
      quantity: line.input.quantity,
    })));
    preparedLines.forEach((line, index) => {
      if (!isFarmaSetMaterial(line.inventory.materialName)) return;
      line.billingQuantity = farmaSetAllocations[index];
      line.billingUnit = "set";
      line.estimatedRent = line.rate > 0
        ? Math.round(line.rate * line.billingQuantity * line.periods * 100) / 100
        : 0;
    });

    const materialSubtotal = Math.round(preparedLines.reduce((sum, line) => sum + line.estimatedRent, 0) * 100) / 100;
    const cartage = Number(cartageAmount);
    const installation = Number(installationCharge || 0);
    if (!Number.isFinite(installation) || installation < 0) {
      return res.status(400).json({ success: false, message: "Installation charge must be a valid non-negative amount" });
    }
    if (!Number.isFinite(cartage) || cartage < 0) {
      return res.status(400).json({ success: false, message: "Cartage / tempo rent must be a valid non-negative amount" });
    }
    const normalizedCartageName = String(cartageName || "").trim();
    const normalizedCartagePhone = String(cartagePhone || "").trim();
    const normalizedCartageAddress = String(cartageAddress || "").trim();
    if (cartage > 0 && (!normalizedCartageName || !normalizedCartagePhone || !normalizedCartageAddress || !validDate(cartageDate))) {
      return res.status(400).json({
        success: false,
        message: "For cartage / tempo rent, enter the amount, driver/tempo name, phone number, address and date.",
      });
    }
    if (cartageDate && !validDate(cartageDate)) {
      return res.status(400).json({ success: false, message: "Cartage date is invalid" });
    }
    // Material rental is finalized on actual return. Only the explicit
    // challan-time tempo and installation charges are billed at issue time.
    const estimatedTotal = Math.round((cartage + installation) * 100) / 100;
    const advance = Number(advanceAmount);
    if (!Number.isFinite(advance) || advance < 0) {
      return res.status(400).json({
        success: false,
        message: "Advance must be a valid non-negative amount",
      });
    }

    const challanGroupNumber = manualChallanNumber;

    const documents = preparedLines.map((line, index) => ({
      challanNumber: `${challanGroupNumber}-${String(index + 1).padStart(2, "0")}`,
      challanGroupNumber,
      lineNumber: index + 1,
      customer: customer._id,
      material: line.inventory._id,
      materialName: line.inventory.materialName,
      quantity: line.input.quantity,
      issueDate: issueDay,
      expectedReturnDate: returnDay,
      rentalPeriod,
      rentalDurationDays: durationDays,
      siteAddress: String(siteAddress || "").trim(),
      unit: line.inventory.unit,
      rentalPricingMode: line.mode,
      rentalRate: line.rate,
      billingQuantity: line.billingQuantity,
      billingUnit: line.billingUnit,
      rentalPeriods: line.periods,
      estimatedRent: line.estimatedRent,
      notes: String(notes || "").trim(),
    }));

    const lineIssues = await MaterialIssue.insertMany(documents, { ordered: true });
    createdIssues.push(...lineIssues);

    // Save each inventory snapshot before changing stock so failures can roll back.
    for (const line of preparedLines) {
      inventorySnapshots.push({
        item: line.inventory,
        availableStock: line.inventory.availableStock,
        rentedStock: line.inventory.rentedStock,
        unit: line.inventory.unit,
      });
      line.inventory.availableStock = Number(line.inventory.availableStock || 0) - line.input.quantity;
      line.inventory.rentedStock = Number(line.inventory.rentedStock || 0) + line.input.quantity;
      await line.inventory.save();
    }

    const paymentHistory = advance > 0 ? [{
      amount: advance,
      date: validDate(paymentDate) ? new Date(paymentDate) : new Date(),
      note: String(paymentNote || "Advance received with challan").trim(),
      kind: "advance",
    }] : [];

    createdSale = await Sale.create({
      customer: customer._id,
      challan: lineIssues[0]._id,
      challanNumber: challanGroupNumber,
      rentalPeriod,
      rentalDurationDays: durationDays,
      lineItems: lineIssues.map((issue, index) => ({
        issue: issue._id,
        materialName: issue.materialName,
        quantity: issue.quantity,
        unit: issue.unit,
        pricingMode: issue.rentalPricingMode,
        rate: issue.rentalRate,
        billingQuantity: issue.billingQuantity,
        billingUnit: issue.billingUnit,
        periods: issue.rentalPeriods,
        rentalPeriod: issue.rentalPeriod,
        rentalDurationDays: issue.rentalDurationDays,
        estimatedRent: issue.estimatedRent,
      })),
      description: `Rental challan ${challanGroupNumber}`,
      cartageAmount: cartage,
      installationCharge: installation,
      issueTempoRent: cartage,
      issueInstallationCharge: installation,
      previousOutstandingBalance: priorPendingAmount,
      cartageName: normalizedCartageName,
      cartagePhone: normalizedCartagePhone,
      cartageAddress: normalizedCartageAddress,
      cartageDate: validDate(cartageDate) ? new Date(cartageDate) : null,
      amount: estimatedTotal,
      totalAmount: estimatedTotal,
      paidAmount: advance,
      paymentStatus: getPaymentStatus(estimatedTotal, advance),
      status: getPaymentStatus(estimatedTotal, advance).toLowerCase(),
      paymentHistory,
      saleDate: issueDay,
      notes: String(notes || "").trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Rental challan created and stock updated successfully",
      challanNumber: challanGroupNumber,
      materialSubtotal,
      cartageAmount: cartage,
      installationCharge: installation,
      totalEstimatedAmount: estimatedTotal,
      issue: {
        ...lineIssues[0].toObject(),
        challanGroupNumber,
        rentalPeriod,
        rentalDurationDays: durationDays,
        items: lineIssues,
        billing: createdSale,
      },
      stock: preparedLines.map(({ inventory }) => ({
        materialName: inventory.materialName,
        availableStock: inventory.availableStock,
        rentedStock: inventory.rentedStock,
        unit: inventory.unit,
      })),
      priorPendingAmount,
      challanPendingAmount: Math.max(estimatedTotal - advance, 0),
      totalPendingAmount: Math.round((priorPendingAmount + Math.max(estimatedTotal - advance, 0)) * 100) / 100,
    });
  } catch (error) {
    console.error("Create material issue error:", error);
    // Best-effort rollback keeps stock/issues/bill aligned when any step fails.
    if (createdSale?._id) await Sale.findByIdAndDelete(createdSale._id).catch(() => {});
    if (createdIssues.length) await MaterialIssue.deleteMany({ _id: { $in: createdIssues.map((item) => item._id) } }).catch(() => {});
    for (const snapshot of inventorySnapshots.reverse()) {
      snapshot.item.availableStock = snapshot.availableStock;
      snapshot.item.rentedStock = snapshot.rentedStock;
      snapshot.item.unit = snapshot.unit;
      await snapshot.item.save().catch(() => {});
    }
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Unable to create rental challan",
      error: error.status ? undefined : error.message,
    });
  }
}

async function getMaterialIssues(req, res) {
  try {
    const issues = await MaterialIssue.find()
      .populate("customer", "name phone address")
      .populate("material", "materialName category unit rentalPricingMode rentalRate")
      .sort({ createdAt: -1 });
    const groupNumbers = [...new Set(issues.map((issue) => issue.challanGroupNumber || issue.challanNumber).filter(Boolean))];
    const issueIds = issues.map((issue) => issue._id);
    const bills = await Sale.find({ billType: { $ne: "monthly_rental" }, $or: [{ challanNumber: { $in: groupNumbers } }, { challan: { $in: issueIds } }] });
    const billByChallan = new Map();
    const billByIssue = new Map();
    for (const bill of bills) {
      if (bill.challanNumber) billByChallan.set(bill.challanNumber, bill);
      if (bill.challan) billByIssue.set(String(bill.challan), bill);
    }
    const issuesWithBilling = issues.map((issue) => {
      const plain = issue.toObject();
      const group = plain.challanGroupNumber || plain.challanNumber;
      return { ...plain, challanGroupNumber: group, billing: billByChallan.get(group) || billByIssue.get(String(issue._id)) || null };
    });
    return res.status(200).json({ success: true, count: issuesWithBilling.length, issues: issuesWithBilling });
  } catch (error) {
    console.error("Get material issues error:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch material issues", error: error.message });
  }
}

async function getMaterialIssueById(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.issueId)) {
      return res.status(400).json({ success: false, message: "Invalid material issue ID" });
    }
    const selected = await MaterialIssue.findById(req.params.issueId)
      .populate("customer", "name phone address")
      .populate("material", "materialName category unit rentalPricingMode rentalRate");
    if (!selected) return res.status(404).json({ success: false, message: "Material issue not found" });

    // Older records have no challanGroupNumber and remain one-line challans.
    const groupNumber = selected.challanGroupNumber || selected.challanNumber;
    const issues = selected.challanGroupNumber
      ? await MaterialIssue.find({ challanGroupNumber: groupNumber })
          .populate("customer", "name phone address")
          .populate("material", "materialName category unit rentalPricingMode rentalRate")
          .sort({ lineNumber: 1, createdAt: 1 })
      : [selected];
    const billing = await Sale.findOne({ challanNumber: groupNumber, billType: { $ne: "monthly_rental" } }).populate("customer", "name phone address")
      || await Sale.findOne({ challan: selected._id }).populate("customer", "name phone address");
    const first = issues[0] || selected;
    return res.status(200).json({
      success: true,
      issue: {
        ...first.toObject(),
        challanGroupNumber: groupNumber,
        items: issues,
        billing: billing || null,
      },
    });
  } catch (error) {
    console.error("Get material issue by ID error:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch material issue", error: error.message });
  }
}

module.exports = { getIssueOptions, createMaterialIssue, getMaterialIssues, getMaterialIssueById };
