const express = require("express");

const {
  getIssueOptions,
  createMaterialIssue,
  getMaterialIssues,
  getMaterialIssueById,
} = require("../controllers/materialIssueController");

const protectOwnerRoute =
  require("../middleware/authMiddleware");

const router = express.Router();

/* Protect all material issue routes */
router.use(protectOwnerRoute);

/* Get customers + inventory for issue form */
router.get(
  "/options",
  getIssueOptions
);

/* Get all material issues */
router.get(
  "/",
  getMaterialIssues
);

/* Get single material issue */
router.get(
  "/:issueId",
  getMaterialIssueById
);

/* Issue material */
router.post(
  "/",
  createMaterialIssue
);

module.exports = router;