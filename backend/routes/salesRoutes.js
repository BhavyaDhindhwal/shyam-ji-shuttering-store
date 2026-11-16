const express = require("express");

const protectOwnerRoute =
  require("../middleware/authMiddleware");

const {
  getSales,
  getSalesSummary,
  createSale,
  updateSale,
  recordCustomerPayment,
  getMonthlySalesSummary,
} = require("../controllers/saleController");
const {
  getMonthlyBillRecap,
  createMonthlyBill,
  skipMonthlyBillPeriod,
} = require("../controllers/monthlyBillingController");

const router = express.Router();

router.use(protectOwnerRoute);

// Sales summary
router.get(
  "/summary",
  getSalesSummary
);

router.get("/monthly-summary", getMonthlySalesSummary);
router.get("/monthly-bill-recap", getMonthlyBillRecap);
router.post("/monthly-bill/:challanNumber/create", createMonthlyBill);
router.post("/monthly-bill/:challanNumber/skip", skipMonthlyBillPeriod);
router.post("/customer-payment", recordCustomerPayment);

// All sales
router.get(
  "/",
  getSales
);

// Create sale
router.post(
  "/",
  createSale
);

// Update sale
router.patch(
  "/:saleId",
  updateSale
);

module.exports = router;