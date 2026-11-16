const express = require("express");
const protectOwnerRoute = require("../middleware/authMiddleware");
const {
  createInquiry,
  getInquiries,
  clearInquiries,
} = require("../controllers/inquiryController");

const router = express.Router();

router.post("/", createInquiry);
router.get("/", getInquiries);
router.delete("/", protectOwnerRoute, clearInquiries);

module.exports = router;