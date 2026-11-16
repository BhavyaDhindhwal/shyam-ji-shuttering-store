const express = require("express");

const protectOwnerRoute =
  require("../middleware/authMiddleware");

const {
  getInventory,
  createInventoryItem,
  updateInventoryStock,
  deleteInventoryItem,
} =
  require("../controllers/inventoryController");

const router = express.Router();

router.use(protectOwnerRoute);

router.get(
  "/",
  getInventory
);

router.post(
  "/",
  createInventoryItem
);

router.patch(
  "/:inventoryId",
  updateInventoryStock
);

router.delete(
  "/:inventoryId",
  deleteInventoryItem
);

module.exports = router;