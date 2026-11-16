const MaterialIssue = require("../models/MaterialIssue");
const MaterialReturn = require("../models/MaterialReturn");
const MonthlyBillingReview = require("../models/MonthlyBillingReview");
const Sale = require("../models/Sale");
const {
  BUSINESS_TIME_ZONE,
  asUtcDateOnly,
  dateKey,
  getRemainingQuantity,
  getCompletedPeriods,
  allocateOpenLines,
} = require("../utils/monthlyBilling");

function monthStartIndia(now) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-01T00:00:00+05:30`);
}

async function loadChallanState(challanNumber) {
  const issues = await MaterialIssue.find({
    $or: [{ challanGroupNumber: challanNumber }, { challanNumber }],
  }).populate("customer", "name phone address").populate("material", "category").sort({ lineNumber: 1, createdAt: 1 });
  if (!issues.length) return null;
  const issueIds = issues.map((item) => item._id);
  const [returns, reviews, monthlyBills] = await Promise.all([
    MaterialReturn.aggregate([
      { $match: { materialIssue: { $in: issueIds } } },
      { $group: { _id: "$materialIssue", quantity: { $sum: "$quantity" } } },
    ]),
    MonthlyBillingReview.find({ challanNumber }).sort({ periodEnd: 1 }),
    Sale.find({ billType: "monthly_rental", sourceChallanNumber: challanNumber }).sort({ billingPeriodEnd: 1 }),
  ]);
  const returnedByIssue = new Map(returns.map((row) => [String(row._id), Number(row.quantity || 0)]));
  const reviewByPeriod = new Map(reviews.map((row) => [`${dateKey(row.periodStart)}:${dateKey(row.periodEnd)}`, row]));
  return { issues, returnedByIssue, reviewByPeriod, monthlyBills };
}

function makeRecapRow(challanNumber, state, now) {
  const { issues, returnedByIssue, reviewByPeriod, monthlyBills } = state;
  const customer = issues[0].customer;
  const issueDate = issues.reduce((earliest, issue) => {
    const value = asUtcDateOnly(issue.issueDate);
    return !earliest || value < earliest ? value : earliest;
  }, null);
  const duePeriods = getCompletedPeriods(issueDate, now).map((period) => {
    const review = reviewByPeriod.get(`${dateKey(period.start)}:${dateKey(period.end)}`);
    const coveredBySavedBill = monthlyBills.some((bill) =>
      bill.billingPeriodStart && bill.billingPeriodEnd &&
      asUtcDateOnly(bill.billingPeriodStart) <= period.start &&
      asUtcDateOnly(bill.billingPeriodEnd) >= period.end
    );
    return {
      ...period,
      status: review?.status === "billed" || coveredBySavedBill ? "billed" : (review?.status || "pending"),
      saleId: review?.sale || null,
    };
  }).filter((period) => period.status !== "billed");

  const openLines = issues.map((issue) => ({
    ...issue.toObject(),
    quantity: getRemainingQuantity(issue.quantity, returnedByIssue.get(String(issue._id))),
  })).filter((issue) => issue.quantity > 0.0001 && (issue.rentalPricingMode || "daily") !== "fixed");
  const eligiblePeriods = duePeriods;
  if (!openLines.length || !eligiblePeriods.length) return null;

  const periodDays = eligiblePeriods.reduce((sum, period) => sum + period.days, 0);
  const lines = allocateOpenLines(openLines, periodDays);
  const estimatedAmount = Math.round(lines.reduce((sum, line) => sum + line.estimatedRent, 0) * 100) / 100;
  const latestPeriod = eligiblePeriods.at(-1);
  const earliestPeriod = eligiblePeriods[0];
  const billedHistory = monthlyBills.map((bill) => ({
    billNumber: bill.billNumber || bill.challanNumber,
    start: bill.billingPeriodStart,
    end: bill.billingPeriodEnd,
    amount: Number(bill.totalAmount ?? bill.amount ?? 0),
  }));
  return {
    challanNumber,
    customer: customer || null,
    customerName: customer?.name || "Unknown Customer",
    customerPhone: customer?.phone || "",
    issueDate,
    activeMaterialCount: openLines.length,
    materials: openLines.map((line) => ({ materialName: line.materialName, quantity: line.quantity, unit: line.unit })),
    pendingPeriods: eligiblePeriods.map((period) => ({
      start: period.start,
      end: period.end,
      days: period.days,
      status: period.status,
    })),
    billingPeriodStart: earliestPeriod.start,
    billingPeriodEnd: latestPeriod.end,
    billingDays: periodDays,
    estimatedAmount,
    previousBills: billedHistory,
    latestPeriodStatus: latestPeriod.status,
    rentalStatus: "Active",
    skippedPeriods: eligiblePeriods.filter((period) => period.status === "skipped").length,
  };
}

async function getMonthlyBillRecap(req, res) {
  try {
    const now = new Date();
    const issues = await MaterialIssue.find().select("_id customer material materialName quantity issueDate challanNumber challanGroupNumber lineNumber unit rentalPricingMode rentalRate rentalBilledThrough").populate("customer", "name phone address").populate("material", "category").sort({ issueDate: 1, lineNumber: 1 });
    const groups = new Map();
    for (const issue of issues) {
      const number = String(issue.challanGroupNumber || issue.challanNumber || "").trim();
      if (!number) continue;
      if (!groups.has(number)) groups.set(number, []);
      groups.get(number).push(issue);
    }
    const rows = [];
    for (const [number] of groups.entries()) {
      const state = await loadChallanState(number);
      if (!state) continue;
      const row = makeRecapRow(number, state, now);
      if (row) rows.push(row);
    }
    rows.sort((a, b) => new Date(a.billingPeriodEnd) - new Date(b.billingPeriodEnd));
    const thisMonthBills = await Sale.find({ billType: "monthly_rental", saleDate: { $gte: monthStartIndia(now) } }).select("totalAmount amount").lean();
    return res.status(200).json({
      success: true,
      timezone: BUSINESS_TIME_ZONE,
      rule: "Completed month from issue date; unbilled skipped periods roll forward into the next bill.",
      summary: {
        activeRentals: rows.length,
        eligibleRentals: rows.length,
        pendingReviewAmount: Math.round(rows.reduce((sum, row) => sum + row.estimatedAmount, 0) * 100) / 100,
        billsCreatedThisMonth: thisMonthBills.length,
        actualBillAmountThisMonth: Math.round(thisMonthBills.reduce((sum, bill) => sum + Number(bill.totalAmount ?? bill.amount ?? 0), 0) * 100) / 100,
      },
      recap: rows,
    });
  } catch (error) {
    console.error("Monthly bill recap error:", error);
    return res.status(500).json({ success: false, message: "Unable to load monthly bill recap", error: error.message });
  }
}

async function skipMonthlyBillPeriod(req, res) {
  try {
    const challanNumber = decodeURIComponent(String(req.params.challanNumber || "")).trim();
    const periodStart = asUtcDateOnly(req.body?.periodStart);
    const periodEnd = asUtcDateOnly(req.body?.periodEnd);
    if (!challanNumber || !periodStart || !periodEnd || periodEnd <= periodStart) {
      return res.status(400).json({ success: false, message: "A valid challan number and billing period are required." });
    }
    const state = await loadChallanState(challanNumber);
    if (!state) return res.status(404).json({ success: false, message: "Challan not found." });
    const anchor = state.issues.reduce((earliest, issue) => {
      const value = asUtcDateOnly(issue.issueDate);
      return !earliest || value < earliest ? value : earliest;
    }, null);
    const isCompletedPeriod = getCompletedPeriods(anchor, new Date()).some((period) => period.start.getTime() === periodStart.getTime() && period.end.getTime() === periodEnd.getTime());
    if (!isCompletedPeriod) return res.status(400).json({ success: false, message: "Only a completed monthly billing period can be skipped." });
    const existing = await MonthlyBillingReview.findOne({ challanNumber, periodStart, periodEnd });
    if (existing?.status === "billed") return res.status(409).json({ success: false, message: "This billing period has already been billed." });
    if (existing) {
      existing.status = "skipped";
      existing.skippedAt = new Date();
      existing.sale = null;
      await existing.save();
    } else {
      await MonthlyBillingReview.create({ challanNumber, periodStart, periodEnd, status: "skipped", skippedAt: new Date() });
    }
    return res.status(200).json({ success: true, message: "This period was skipped for now. Its charges remain eligible for a future catch-up bill." });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "The billing period was updated in another request. Refresh the recap." });
    console.error("Skip monthly bill period error:", error);
    return res.status(500).json({ success: false, message: "Unable to skip this billing period", error: error.message });
  }
}

async function createMonthlyBill(req, res) {
  let createdSale = null;
  const previousIssueDates = [];
  const previousReviewStates = [];
  try {
    const challanNumber = decodeURIComponent(String(req.params.challanNumber || "")).trim();
    const throughPeriodEnd = asUtcDateOnly(req.body?.throughPeriodEnd);
    if (!challanNumber || !throughPeriodEnd) return res.status(400).json({ success: false, message: "A valid challan number and billing period are required." });
    const state = await loadChallanState(challanNumber);
    if (!state) return res.status(404).json({ success: false, message: "Challan not found." });

    const anchor = state.issues.reduce((earliest, issue) => {
      const value = asUtcDateOnly(issue.issueDate);
      return !earliest || value < earliest ? value : earliest;
    }, null);
    const periodReviews = await MonthlyBillingReview.find({ challanNumber }).sort({ periodEnd: 1 });
    const reviewByPeriod = new Map(periodReviews.map((row) => [`${dateKey(row.periodStart)}:${dateKey(row.periodEnd)}`, row]));
    const selectedPeriods = getCompletedPeriods(anchor, new Date())
      .filter((period) => period.end <= throughPeriodEnd)
      .filter((period) => reviewByPeriod.get(`${dateKey(period.start)}:${dateKey(period.end)}`)?.status !== "billed")
      .filter((period) => !state.monthlyBills.some((bill) =>
        bill.billingPeriodStart && bill.billingPeriodEnd &&
        asUtcDateOnly(bill.billingPeriodStart) <= period.start &&
        asUtcDateOnly(bill.billingPeriodEnd) >= period.end
      ));
    if (!selectedPeriods.length) return res.status(409).json({ success: false, message: "There are no unbilled completed months up to this date. Refresh the recap." });

    const openLines = state.issues.map((issue) => ({
      ...issue.toObject(),
      quantity: getRemainingQuantity(issue.quantity, state.returnedByIssue.get(String(issue._id))),
    })).filter((issue) => issue.quantity > 0.0001 && (issue.rentalPricingMode || "daily") !== "fixed");
    if (!openLines.length) return res.status(409).json({ success: false, message: "All material on this challan has been returned. The existing return billing already covers the rental." });

    const periodDays = selectedPeriods.reduce((sum, period) => sum + period.days, 0);
    const lineItems = allocateOpenLines(openLines, periodDays).filter((line) => line.billingQuantity > 0 || line.estimatedRent > 0);
    const totalAmount = Math.round(lineItems.reduce((sum, line) => sum + line.estimatedRent, 0) * 100) / 100;
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ success: false, message: "No billable rental amount was found. Check the saved rental rates for this challan." });
    }

    const customerId = state.issues[0].customer?._id || state.issues[0].customer;
    const allCustomerSales = await Sale.find({ customer: customerId });
    const previousOutstandingBalance = Math.round(allCustomerSales.reduce((sum, sale) => {
      if ([sale.paymentStatus, sale.status].some((v) => String(v || "").toLowerCase() === "cancelled")) return sum;
      return sum + Math.max(0, Number(sale.totalAmount ?? sale.amount ?? 0) - Number(sale.paidAmount || 0));
    }, 0) * 100) / 100;
    const start = selectedPeriods[0].start;
    const end = selectedPeriods[selectedPeriods.length - 1].end;
    const billKey = `${challanNumber}::${dateKey(start)}::${dateKey(end)}`;
    const billNumber = `MB-${challanNumber}-${dateKey(end).replace(/-/g, "")}`.slice(0, 60);

    createdSale = await Sale.create({
      customer: customerId,
      challan: state.issues[0]._id,
      challanNumber: billNumber,
      sourceChallanNumber: challanNumber,
      billType: "monthly_rental",
      billNumber,
      monthlyBillingKey: billKey,
      billingPeriodStart: start,
      billingPeriodEnd: end,
      lineItems,
      description: `Monthly rental bill for challan ${challanNumber}`,
      amount: totalAmount,
      totalAmount,
      paidAmount: 0,
      previousOutstandingBalance,
      paymentStatus: "Pending",
      status: "pending",
      paymentHistory: [],
      saleDate: new Date(),
      notes: `Rental periods: ${dateKey(start)} to ${dateKey(end)} (${periodDays} days).`,
    });

    // Every unbilled/previously skipped period up to the selected date is
    // recorded against this one catch-up bill, making repeat submissions safe.
    for (const period of selectedPeriods) {
      const prior = reviewByPeriod.get(`${dateKey(period.start)}:${dateKey(period.end)}`);
      previousReviewStates.push({
        periodStart: period.start,
        periodEnd: period.end,
        existed: Boolean(prior),
        status: prior?.status || "pending",
        sale: prior?.sale || null,
        skippedAt: prior?.skippedAt || null,
        billedAt: prior?.billedAt || null,
      });
      await MonthlyBillingReview.updateOne(
        { challanNumber, periodStart: period.start, periodEnd: period.end },
        { $set: { status: "billed", sale: createdSale._id, billedAt: new Date(), skippedAt: null } },
        { upsert: true }
      );
    }
    for (const issue of openLines) {
      previousIssueDates.push({ id: issue._id, date: issue.rentalBilledThrough || null });
      await MaterialIssue.updateOne({ _id: issue._id }, { $set: { rentalBilledThrough: end } });
    }

    return res.status(201).json({ success: true, message: "Monthly rental bill created successfully.", sale: createdSale, billNumber, periodStart: start, periodEnd: end });
  } catch (error) {
    if (createdSale?._id) {
      await Sale.deleteOne({ _id: createdSale._id }).catch(() => {});
      for (const review of previousReviewStates) {
        if (review.existed) {
          await MonthlyBillingReview.updateOne(
            { challanNumber, periodStart: review.periodStart, periodEnd: review.periodEnd },
            { $set: { status: review.status, sale: review.sale, skippedAt: review.skippedAt, billedAt: review.billedAt } }
          ).catch(() => {});
        } else {
          await MonthlyBillingReview.deleteOne({ challanNumber, periodStart: review.periodStart, periodEnd: review.periodEnd }).catch(() => {});
        }
      }
    }
    for (const snapshot of previousIssueDates) {
      await MaterialIssue.updateOne({ _id: snapshot.id }, { $set: { rentalBilledThrough: snapshot.date } }).catch(() => {});
    }
    if (error.code === 11000) return res.status(409).json({ success: false, message: "A bill for this billing period already exists. Refresh the recap before trying again." });
    console.error("Create monthly bill error:", error);
    return res.status(500).json({ success: false, message: "Unable to create monthly rental bill", error: error.message });
  }
}

module.exports = {
  getMonthlyBillRecap,
  createMonthlyBill,
  skipMonthlyBillPeriod,
};
