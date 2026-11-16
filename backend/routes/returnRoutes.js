const express = require("express");
const protectOwnerRoute = require("../middleware/authMiddleware");

const {
  getReturns,
  createReturn,
} = require("../controllers/returnController");

const router = express.Router();

// ==========================================
// OWNER PROTECTION
// ==========================================
router.use(protectOwnerRoute);

// ==========================================
// GET ALL MATERIAL RETURNS
// GET /api/returns
// ==========================================
router.get("/", getReturns);

// ==========================================
// CREATE MATERIAL RETURN
// POST /api/returns
// ==========================================
router.post("/", createReturn);

module.exports = router;