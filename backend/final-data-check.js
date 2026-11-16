require("dotenv").config();
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
const mongoose = require("mongoose");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  try {
    const db = mongoose.connection.db;

    console.log("\n=== ACTUAL COLLECTION NAMES ===");
    console.log((await db.listCollections().toArray()).map(c => c.name));

    console.log("\n=== INVENTORY STOCK ===");
    const inventory = await db.collection("inventories").find({}).toArray();
    for (const item of inventory) {
      console.log({
        material: item.materialName,
        totalStock: item.totalStock,
        availableStock: item.availableStock,
        rentedStock: item.rentedStock
      });
    }

    console.log("\n=== ISSUE / RETURN COUNTS ===");
    console.log("Issues:", await db.collection("materialissues").countDocuments());
    console.log("Returns:", await db.collection("materialreturns").countDocuments());
    console.log("Owners:", await db.collection("owners").countDocuments());
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(e => {
  console.error("Check failed:", e.message);
  process.exitCode = 1;
});
