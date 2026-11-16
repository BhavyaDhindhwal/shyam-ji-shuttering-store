const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const Customer = require("../models/Customer");
const MaterialIssue = require("../models/MaterialIssue");
const MaterialReturn = require("../models/MaterialReturn");
const MonthlySalesSnapshot = require("../models/MonthlySalesSnapshot");

function getSaleAmount(sale) {
  const total = Number(sale.totalAmount ?? 0);
  if (Number.isFinite(total) && total > 0) return total;
  return Number(sale.amount ?? 0);
}

function getPaidAmount(sale) {
  return Number(sale.paidAmount ?? 0);
}

function isCancelled(sale) {
  const statuses = [sale.paymentStatus, sale.status].map((value) => String(value || "").trim().toLowerCase());
  return statuses.some((status) => status === "cancelled" || status === "canceled");
}

function getPaymentStatus(total, paid) {
  if (total > 0 && paid >= total) return "Paid";
  if (paid > 0) return "Partial";
  return "Pending";
}

function syncLegacyStatus(sale) {
  const status = getPaymentStatus(getSaleAmount(sale), getPaidAmount(sale));
  sale.paymentStatus = status;
  sale.status = status.toLowerCase();
}

async function getSales(req, res) {
  try {
    const sales = await Sale.find()
      .populate("customer", "name phone address")
      .populate("challan", "challanNumber challanGroupNumber issueDate")
      .sort({ saleDate: -1, createdAt: -1 });
    const activeSales = sales.filter((sale) => !isCancelled(sale));
    return res.status(200).json({ success: true, count: activeSales.length, sales: activeSales });
  } catch (error) {
    console.error("Get sales error:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch sales", error: error.message });
  }
}

async function getSalesSummary(req, res) {
  try {
    const sales = await Sale.find().sort({ saleDate: 1, createdAt: 1 });
    let totalSales = 0;
    let totalPaid = 0;
    let pendingPayments = 0;
    const salesGraphByDate = new Map();

    for (const sale of sales) {
      if (isCancelled(sale)) continue;
      const amount = getSaleAmount(sale);
      const paid = getPaidAmount(sale);
      if (!Number.isFinite(amount) || !Number.isFinite(paid) || amount < 0 || paid < 0) continue;
      const received = Math.min(paid, amount);
      const pending = Math.max(amount - received, 0);
      totalSales += amount;
      totalPaid += received;
      pendingPayments += pending;
      const graphDate = sale.saleDate || sale.createdAt;
      if (graphDate) {
        const dateKey = new Date(graphDate).toISOString().slice(0, 10);
        salesGraphByDate.set(dateKey, (salesGraphByDate.get(dateKey) || 0) + amount);
      }
    }

    const salesGraph = Array.from(salesGraphByDate.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }));

    return res.status(200).json({
      success: true,
      totals: { totalSales, totalPaid, pendingPayments, totalRecords: sales.filter((sale) => !isCancelled(sale)).length },
      sales: salesGraph,
    });
  } catch (error) {
    console.error("Get sales summary error:", error);
    return res.status(500).json({ success: false, message: "Unable to calculate sales summary", error: error.message });
  }
}

async function createSale(req, res) {
  try {
    const {
      customer,
      customerId,
      challan,
      challanNumber,
      description,
      amount,
      totalAmount,
      paidAmount = 0,
      paymentStatus,
      saleDate,
      paymentDate,
      paymentNote,
      notes,
    } = req.body;

    const finalCustomer = customer || customerId;
    const finalAmount = Number(totalAmount ?? amount ?? 0);
    const finalPaidAmount = Number(paidAmount);

    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      return res.status(400).json({ success: false, message: "Valid sale amount is required" });
    }
    if (!Number.isFinite(finalPaidAmount) || finalPaidAmount < 0) {
      return res.status(400).json({ success: false, message: "Paid amount must be a valid non-negative number" });
    }
    if (finalPaidAmount > finalAmount) {
      return res.status(400).json({ success: false, message: "Paid amount cannot exceed the total sale amount" });
    }
    if (finalCustomer && !mongoose.Types.ObjectId.isValid(finalCustomer)) {
      return res.status(400).json({ success: false, message: "Invalid customer ID" });
    }
    if (saleDate && Number.isNaN(Date.parse(saleDate))) {
      return res.status(400).json({ success: false, message: "Invalid sale date" });
    }

    const requestedStatus = String(paymentStatus || "").trim().toLowerCase();
    const status = requestedStatus === "cancelled"
      ? "Cancelled"
      : getPaymentStatus(finalAmount, finalPaidAmount);
    const paymentHistory = finalPaidAmount > 0 ? [{
      amount: finalPaidAmount,
      date: paymentDate && !Number.isNaN(Date.parse(paymentDate)) ? new Date(paymentDate) : new Date(),
      note: String(paymentNote || "Initial payment").trim(),
      kind: "payment",
    }] : [];

    const sale = await Sale.create({
      customer: finalCustomer || null,
      challan: challan || null,
      challanNumber: String(challanNumber || "").trim(),
      description: description || "",
      amount: finalAmount,
      totalAmount: finalAmount,
      paidAmount: finalPaidAmount,
      paymentStatus: status,
      status: String(status).toLowerCase(),
      paymentHistory,
      saleDate: saleDate ? new Date(saleDate) : new Date(),
      notes: notes || "",
    });

    return res.status(201).json({ success: true, message: "Sale created successfully", sale });
  } catch (error) {
    console.error("Create sale error:", error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "A billing record already exists for this challan" });
    }
    return res.status(500).json({ success: false, message: "Unable to create sale", error: error.message });
  }
}

async function updateSale(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.saleId)) {
      return res.status(400).json({ success: false, message: "Invalid payment record ID" });
    }
    const sale = await Sale.findById(req.params.saleId);
    if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });

    const { totalAmount, paidAmount, paymentAmount, paymentStatus, description, notes, paymentDate, paymentNote } = req.body;
    const currentPaid = getPaidAmount(sale);

    if (totalAmount !== undefined) {
      const amount = Number(totalAmount);
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ success: false, message: "Total amount must be a non-negative number" });
      }
      if (amount < currentPaid) {
        return res.status(400).json({ success: false, message: "Total amount cannot be less than the amount already received" });
      }
      sale.totalAmount = amount;
      sale.amount = amount;
    }

    const nextTotal = getSaleAmount(sale);
    if (paymentAmount !== undefined) {
      const amountReceived = Number(paymentAmount);
      if (!Number.isFinite(amountReceived) || amountReceived <= 0) {
        return res.status(400).json({ success: false, message: "New payment must be greater than zero" });
      }
      if (currentPaid + amountReceived > nextTotal) {
        return res.status(400).json({ success: false, message: "New payment cannot exceed the pending balance" });
      }
      sale.paidAmount = currentPaid + amountReceived;
      sale.paymentHistory.push({
        amount: amountReceived,
        date: paymentDate && !Number.isNaN(Date.parse(paymentDate)) ? new Date(paymentDate) : new Date(),
        note: String(paymentNote || "Payment received").trim(),
        kind: "payment",
      });
    } else if (paidAmount !== undefined) {
      // Backward compatibility for older clients that send cumulative paid total.
      const newPaid = Number(paidAmount);
      if (!Number.isFinite(newPaid) || newPaid < 0) {
        return res.status(400).json({ success: false, message: "Paid amount must be a valid non-negative number" });
      }
      if (newPaid > nextTotal) {
        return res.status(400).json({ success: false, message: "Paid amount cannot exceed total amount" });
      }
      if (newPaid < currentPaid) {
        return res.status(400).json({ success: false, message: "Recorded payments cannot be reduced here; add a separate adjustment record if needed" });
      }
      if (newPaid > currentPaid) {
        sale.paymentHistory.push({
          amount: Math.round((newPaid - currentPaid) * 100) / 100,
          date: paymentDate && !Number.isNaN(Date.parse(paymentDate)) ? new Date(paymentDate) : new Date(),
          note: String(paymentNote || "Payment received").trim(),
          kind: "payment",
        });
      }
      sale.paidAmount = newPaid;
    }

    if (description !== undefined) sale.description = description;
    if (notes !== undefined) sale.notes = notes;
    syncLegacyStatus(sale);
    if (paymentStatus && !["Paid", "Pending", "Partial", "Cancelled"].includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: "Invalid payment status" });
    }
    if (paymentStatus === "Cancelled") {
      sale.paymentStatus = "Cancelled";
      sale.status = "cancelled";
    }

    await sale.save();
    return res.status(200).json({ success: true, message: "Payment record updated successfully", sale });
  } catch (error) {
    console.error("Update sale error:", error);
    return res.status(500).json({ success: false, message: "Unable to update sale", error: error.message });
  }
}


async function recordCustomerPayment(req, res) {
  const { customerId, customerIds: requestedCustomerIds, amount, paymentDate, paymentNote = "Customer payment" } = req.body || {};
  const paymentAmount = Number(amount);
  const customerIds = [...new Set((Array.isArray(requestedCustomerIds) && requestedCustomerIds.length ? requestedCustomerIds : [customerId]).map(String))];
  if (!customerIds.length || customerIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return res.status(400).json({ success: false, message: "Select a valid customer." });
  }
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return res.status(400).json({ success: false, message: "Payment amount must be greater than zero." });
  }
  if (paymentDate && Number.isNaN(Date.parse(paymentDate))) {
    return res.status(400).json({ success: false, message: "Payment date is invalid." });
  }

  const customers = await Customer.find({ _id: { $in: customerIds } });
  if (customers.length !== customerIds.length) return res.status(404).json({ success: false, message: "One or more selected customer records were not found." });
  const normalizedPhones = new Set(customers.map((entry) => String(entry.phone || "").replace(/\D/g, "")).filter(Boolean));
  const normalizedNames = new Set(customers.map((entry) => String(entry.name || "").trim().toLowerCase()));
  if (normalizedPhones.size > 1 || normalizedNames.size > 1) {
    return res.status(409).json({ success: false, message: "These customer records do not share the same verified name and phone number; record payments separately." });
  }
  const customer = customers[0];

  const sales = await Sale.find({ customer: { $in: customerIds } }).sort({ saleDate: 1, createdAt: 1, _id: 1 });
  const payableSales = sales.filter((sale) => !isCancelled(sale) && Math.max(getSaleAmount(sale) - getPaidAmount(sale), 0) > 0);
  const totalPending = payableSales.reduce((sum, sale) => sum + Math.max(getSaleAmount(sale) - getPaidAmount(sale), 0), 0);
  if (paymentAmount > totalPending + 0.005) {
    return res.status(400).json({
      success: false,
      message: `Payment exceeds this customer's total pending balance of ₹${totalPending.toFixed(2)}.`,
      totalPending,
    });
  }

  const date = paymentDate ? new Date(paymentDate) : new Date();
  const note = String(paymentNote || "Customer payment").trim();
  const snapshots = [];
  const allocations = [];
  let remaining = Math.round(paymentAmount * 100) / 100;

  try {
    for (const sale of payableSales) {
      if (remaining <= 0.005) break;
      const oldPaid = getPaidAmount(sale);
      const oldStatus = sale.paymentStatus;
      const oldLegacyStatus = sale.status;
      const oldHistory = sale.paymentHistory.map((entry) => entry.toObject ? entry.toObject() : { ...entry });
      const due = Math.max(getSaleAmount(sale) - oldPaid, 0);
      const applied = Math.round(Math.min(due, remaining) * 100) / 100;
      if (applied <= 0) continue;

      snapshots.push({ id: sale._id, oldPaid, oldStatus, oldLegacyStatus, oldHistory });
      sale.paidAmount = Math.round((oldPaid + applied) * 100) / 100;
      sale.paymentHistory.push({
        amount: applied,
        date,
        note,
        kind: "payment",
      });
      syncLegacyStatus(sale);
      await sale.save();
      allocations.push({
        saleId: sale._id,
        challanNumber: sale.challanNumber || "",
        appliedAmount: applied,
        pendingAfterPayment: Math.max(getSaleAmount(sale) - getPaidAmount(sale), 0),
      });
      remaining = Math.round((remaining - applied) * 100) / 100;
    }
  } catch (error) {
    // Best-effort rollback prevents a partial remittance from being left against only some bills.
    for (const snapshot of snapshots.reverse()) {
      await Sale.updateOne(
        { _id: snapshot.id },
        {
          $set: {
            paidAmount: snapshot.oldPaid,
            paymentStatus: snapshot.oldStatus,
            status: snapshot.oldLegacyStatus,
            paymentHistory: snapshot.oldHistory,
          },
        }
      ).catch((rollbackError) => console.error("Payment allocation rollback failed:", rollbackError));
    }
    throw error;
  }

  const refreshed = await Sale.find({ customer: { $in: customerIds } });
  const outstanding = refreshed
    .filter((sale) => !isCancelled(sale))
    .reduce((sum, sale) => sum + Math.max(getSaleAmount(sale) - getPaidAmount(sale), 0), 0);

  return res.status(200).json({
    success: true,
    message: "Payment allocated to this customer's oldest outstanding bills.",
    customer: { id: customer._id, name: customer.name, phone: customer.phone },
    amountReceived: paymentAmount,
    allocations,
    totalPending: Math.round(outstanding * 100) / 100,
  });
}

async function getMonthlySalesSummary(req, res) {
  try {
    const requestedMonth = String(req.query.month || "").trim();
    const monthKey = /^\d{4}-\d{2}$/.test(requestedMonth)
      ? requestedMonth
      : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

    const [year, month] = monthKey.split("-").map(Number);
    if (!Number.isInteger(year) || month < 1 || month > 12) {
      return res.status(400).json({ success: false, message: "Month must be in YYYY-MM format." });
    }

    // India business-month boundaries. Source transaction dates are never rewritten.
    const start = new Date(`${monthKey}-01T00:00:00+05:30`);
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonthNumber = month === 12 ? 1 : month + 1;
    const nextMonthKey = `${nextYear}-${String(nextMonthNumber).padStart(2, "0")}`;
    const nextStart = new Date(`${nextMonthKey}-01T00:00:00+05:30`);
    const end = new Date(nextStart.getTime() - 1);

    const [allSales, allIssues, allReturns] = await Promise.all([
      Sale.find({
        $or: [
          { saleDate: { $lt: nextStart } },
          { saleDate: { $exists: false }, createdAt: { $lt: nextStart } },
        ],
      }).populate("customer", "name phone").sort({ saleDate: 1, createdAt: 1 }),
      MaterialIssue.find({ issueDate: { $lt: nextStart } })
        .select("_id customer challanGroupNumber challanNumber issueDate quantity")
        .populate("customer", "name phone"),
      MaterialReturn.find({ returnDate: { $lt: nextStart } })
        .select("_id materialIssue customer returnDate quantity rentalCharge tempoRent installationCharge")
        .populate("customer", "name phone"),
    ]);

    const isInMonth = (value) => value && new Date(value) >= start && new Date(value) < nextStart;
    const issueById = new Map(allIssues.map((issue) => [String(issue._id), issue]));
    const returnAmountsByChallan = new Map();
    const returnTempoByChallan = new Map();
    const returnInstallationByChallan = new Map();
    const returnEventsByChallan = new Map();
    const returnedByIssue = new Map();
    const returnsInMonth = [];
    for (const entry of allReturns) {
      const issueId = String(entry.materialIssue);
      const issue = issueById.get(issueId);
      if (!issue) continue;
      const challanKey = String(issue.challanGroupNumber || issue.challanNumber || issue._id);
      const charge = Number(entry.rentalCharge || 0) + Number(entry.tempoRent || 0) + Number(entry.installationCharge || 0);
      returnAmountsByChallan.set(challanKey, (returnAmountsByChallan.get(challanKey) || 0) + charge);
      returnTempoByChallan.set(challanKey, (returnTempoByChallan.get(challanKey) || 0) + Number(entry.tempoRent || 0));
      returnInstallationByChallan.set(challanKey, (returnInstallationByChallan.get(challanKey) || 0) + Number(entry.installationCharge || 0));
      if (!returnEventsByChallan.has(challanKey)) returnEventsByChallan.set(challanKey, []);
      returnEventsByChallan.get(challanKey).push({ entry, issue });
      returnedByIssue.set(issueId, (returnedByIssue.get(issueId) || 0) + Number(entry.quantity || 0));
      if (isInMonth(entry.returnDate || entry.createdAt)) returnsInMonth.push(entry);
    }

    const totalReturnChargesAllTime = (challanKey) => Number(returnAmountsByChallan.get(challanKey) || 0);
    const baseAmountForSale = (sale) => {
      const key = String(sale.challanNumber || "");
      const legacyBase = Math.max(0, getSaleAmount(sale) - totalReturnChargesAllTime(key));
      const hasNewBaseFields = sale.issueTempoRent !== undefined || sale.issueInstallationCharge !== undefined;
      return hasNewBaseFields
        ? Math.max(0, Number(sale.issueTempoRent || 0) + Number(sale.issueInstallationCharge || 0))
        : legacyBase;
    };

    let totalRentalSales = 0;
    let totalReceivedInMonth = 0;
    let totalTempoRent = 0;
    let totalInstallationCharge = 0;
    const customersInMonth = new Set();
    const monthSaleIds = [];
    const monthlyTransactions = [];

    // Count customers from return activity too, including legacy returns that
    // may not have a linked Sale document.
    for (const entry of returnsInMonth) {
      if (entry.customer?._id || entry.customer) {
        customersInMonth.add(String(entry.customer?._id || entry.customer));
      }
    }

    // Customer count is a count of customers who had rental activity in the
    // selected month, including issued material even if an older/legacy sale
    // document is missing for that challan.
    for (const issue of allIssues) {
      if (isInMonth(issue.issueDate) && (issue.customer?._id || issue.customer)) {
        customersInMonth.add(String(issue.customer?._id || issue.customer));
      }
    }

    // Bill/issue charges are attributed to their issue date. Return-time charges
    // are attributed to the actual return date instead of being shifted backward.
    for (const sale of allSales) {
      if (isCancelled(sale)) continue;
      const saleDate = sale.saleDate || sale.createdAt;
      const challanKey = String(sale.challanNumber || "");
      const baseAmount = baseAmountForSale(sale);
      const legacyBaseTempo = Math.max(0, Number(sale.cartageAmount || 0) - Number(returnTempoByChallan.get(challanKey) || 0));
      const legacyBaseInstallation = Math.max(0, Number(sale.installationCharge || 0) - Number(returnInstallationByChallan.get(challanKey) || 0));
      const baseTempo = sale.issueTempoRent !== undefined ? Number(sale.issueTempoRent || 0) : legacyBaseTempo;
      const baseInstallation = sale.issueInstallationCharge !== undefined ? Number(sale.issueInstallationCharge || 0) : legacyBaseInstallation;
      if (isInMonth(saleDate)) {
        totalRentalSales += baseAmount;
        totalTempoRent += baseTempo;
        totalInstallationCharge += baseInstallation;
        monthSaleIds.push(sale._id);
        if (sale.customer?._id || sale.customer) customersInMonth.add(String(sale.customer?._id || sale.customer));
        monthlyTransactions.push({
          id: String(sale._id),
          date: saleDate,
          challanNumber: sale.challanNumber || "",
          customerName: sale.customer?.name || "",
          customerPhone: sale.customer?.phone || "",
          type: "Issue Charges",
          rentalCharge: Math.max(0, baseAmount - baseTempo - baseInstallation),
          tempoRent: baseTempo,
          installationCharge: baseInstallation,
          amount: baseAmount,
          paymentAmount: 0,
        });
      }

      const returnEvents = returnEventsByChallan.get(String(sale.challanNumber || "")) || [];
      for (const { entry, issue } of returnEvents) {
        if (isInMonth(entry.returnDate || entry.createdAt)) {
          const rental = Number(entry.rentalCharge || 0);
          const tempo = Number(entry.tempoRent || 0);
          const installation = Number(entry.installationCharge || 0);
          const returnTotal = rental + tempo + installation;
          totalRentalSales += returnTotal;
          totalTempoRent += tempo;
          totalInstallationCharge += installation;
          if (sale.customer?._id || sale.customer) customersInMonth.add(String(sale.customer?._id || sale.customer));
          monthlyTransactions.push({
            id: String(entry._id),
            date: entry.returnDate || entry.createdAt,
            challanNumber: issue.challanGroupNumber || issue.challanNumber || sale.challanNumber || "",
            customerName: sale.customer?.name || entry.customer?.name || "",
            customerPhone: sale.customer?.phone || entry.customer?.phone || "",
            type: "Return Billing",
            materialName: entry.materialName || issue.materialName || "",
            rentalCharge: rental,
            tempoRent: tempo,
            installationCharge: installation,
            amount: returnTotal,
            paymentAmount: 0,
          });
        }
      }

      const history = Array.isArray(sale.paymentHistory) ? sale.paymentHistory : [];
      if (history.length) {
        for (const payment of history) {
          if (isInMonth(payment.date)) {
            const paymentValue = Number(payment.amount || 0);
            totalReceivedInMonth += paymentValue;
            monthlyTransactions.push({
              id: String(payment._id || `${sale._id}-${payment.date}-${paymentValue}`),
              date: payment.date,
              challanNumber: sale.challanNumber || "",
              customerName: sale.customer?.name || "",
              customerPhone: sale.customer?.phone || "",
              type: "Payment Received",
              rentalCharge: 0,
              tempoRent: 0,
              installationCharge: 0,
              amount: 0,
              paymentAmount: paymentValue,
            });
          }
        }
      } else if (isInMonth(saleDate)) {
        // Legacy sales without dated payment history: use their recorded total once.
        totalReceivedInMonth += getPaidAmount(sale);
      }
    }

    // Outstanding as it stood on the selected month-end: only return charges
    // and payments dated on/before that day are included.
    let outstandingAtMonthEnd = 0;
    for (const sale of allSales) {
      if (isCancelled(sale)) continue;
      const saleDate = sale.saleDate || sale.createdAt;
      if (!saleDate || new Date(saleDate) >= nextStart) continue;
      const challanKey = String(sale.challanNumber || "");
      let amountAtEnd = baseAmountForSale(sale);
      for (const entry of allReturns) {
        const issue = issueById.get(String(entry.materialIssue));
        const matchesChallan = issue && String(issue.challanGroupNumber || issue.challanNumber || issue._id) === challanKey;
        if (matchesChallan && new Date(entry.returnDate || entry.createdAt) <= end) {
          amountAtEnd += Number(entry.rentalCharge || 0) + Number(entry.tempoRent || 0) + Number(entry.installationCharge || 0);
        }
      }
      const history = Array.isArray(sale.paymentHistory) ? sale.paymentHistory : [];
      const paidByEnd = history.length
        ? history.reduce((sum, entry) => sum + (new Date(entry.date || 0) <= end ? Number(entry.amount || 0) : 0), 0)
        : getPaidAmount(sale);
      outstandingAtMonthEnd += Math.max(amountAtEnd - paidByEnd, 0);
    }

    const activeByChallan = new Map();
    const completedByChallanInMonth = new Set();
    const lastReturnByChallan = new Map();
    for (const entry of allReturns) {
      const issue = issueById.get(String(entry.materialIssue));
      if (!issue) continue;
      const key = String(issue.challanGroupNumber || issue.challanNumber || issue._id);
      const date = entry.returnDate || entry.createdAt;
      if (isInMonth(date)) lastReturnByChallan.set(key, date);
    }
    const issueGroups = new Map();
    for (const issue of allIssues) {
      const key = String(issue.challanGroupNumber || issue.challanNumber || issue._id);
      const qty = Number(issue.quantity || 0);
      const open = Math.max(0, qty - (returnedByIssue.get(String(issue._id)) || 0));
      const group = issueGroups.get(key) || { openQty: 0, issueQty: 0 };
      group.openQty += open;
      group.issueQty += qty;
      issueGroups.set(key, group);
      if (open > 0) {
        activeByChallan.set(key, true);
        if (issue.customer?._id || issue.customer) {
          customersInMonth.add(String(issue.customer?._id || issue.customer));
        }
      }
    }
    for (const [key, group] of issueGroups.entries()) {
      if (group.issueQty > 0 && group.openQty <= 0 && lastReturnByChallan.has(key)) {
        completedByChallanInMonth.add(key);
      }
    }

    monthlyTransactions.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    const monthSales = allSales.filter((sale) => isInMonth(sale.saleDate || sale.createdAt) && !isCancelled(sale));
    const snapshot = await MonthlySalesSnapshot.findOneAndUpdate(
      { monthKey },
      {
        $set: {
          timezone: "Asia/Kolkata",
          totalRentalSales: Math.round(totalRentalSales * 100) / 100,
          totalReceivedInMonth: Math.round(totalReceivedInMonth * 100) / 100,
          totalTempoRent: Math.round(totalTempoRent * 100) / 100,
          totalInstallationCharge: Math.round(totalInstallationCharge * 100) / 100,
          outstandingAtMonthEnd: Math.round(outstandingAtMonthEnd * 100) / 100,
          activeRentalOrdersAtMonthEnd: activeByChallan.size,
          completedRentalOrdersInMonth: completedByChallanInMonth.size,
          customerCount: customersInMonth.size,
          transactionCount: monthlyTransactions.length,
          saleIds: monthSaleIds,
          materialIssueIds: allIssues.filter((issue) => isInMonth(issue.issueDate)).map((issue) => issue._id),
          returnIds: returnsInMonth.map((entry) => entry._id),
          reconciledAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      monthKey,
      timezone: "Asia/Kolkata",
      period: { start, end },
      summary: snapshot,
      sales: monthSales,
      transactions: monthlyTransactions,
    });
  } catch (error) {
    console.error("Monthly sales summary error:", error);
    return res.status(500).json({ success: false, message: "Unable to reconcile monthly sales summary.", error: error.message });
  }
}


let monthlyReconciliationRunning = false;

async function reconcileMonthlySnapshots() {
  if (monthlyReconciliationRunning) return;
  monthlyReconciliationRunning = true;
  try {
    const [firstSale, firstIssue] = await Promise.all([
      Sale.findOne({}).sort({ saleDate: 1, createdAt: 1 }).select("saleDate createdAt").lean(),
      MaterialIssue.findOne({}).sort({ issueDate: 1 }).select("issueDate").lean(),
    ]);
    const firstDates = [
      firstSale?.saleDate || firstSale?.createdAt,
      firstIssue?.issueDate,
    ].filter(Boolean).map((value) => new Date(value));
    if (!firstDates.length) return;

    const earliest = new Date(Math.min(...firstDates.map((date) => date.getTime())));
    let cursor = new Date(Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), 1));
    const currentKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit",
    }).format(new Date()).slice(0, 7);
    const [currentYear, currentMonth] = currentKey.split("-").map(Number);
    const current = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
    const previous = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
    const previousKey = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;

    while (cursor <= current) {
      const monthKey = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
      const exists = await MonthlySalesSnapshot.exists({ monthKey });
      if (!exists || monthKey === currentKey || monthKey === previousKey) {
        const mockResponse = {
          statusCode: 200,
          payload: null,
          status(code) { this.statusCode = code; return this; },
          json(data) { this.payload = data; return this; },
        };
        await getMonthlySalesSummary({ query: { month: monthKey } }, mockResponse);
        if (mockResponse.statusCode >= 400 || mockResponse.payload?.success === false) {
          throw new Error(mockResponse.payload?.message || `Monthly reconciliation failed for ${monthKey}`);
        }
      }
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
  } finally {
    monthlyReconciliationRunning = false;
  }
}

module.exports = { getSales, getSalesSummary, createSale, updateSale, recordCustomerPayment, getMonthlySalesSummary, reconcileMonthlySnapshots };
