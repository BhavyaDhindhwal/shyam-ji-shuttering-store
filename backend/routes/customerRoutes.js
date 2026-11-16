const express = require("express");

const {
  getCustomers,
  createCustomer,
} = require("../controllers/customerController");

const protectOwnerRoute = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protectOwnerRoute);

router.get("/", getCustomers);
router.post("/", createCustomer);

module.exports = router;