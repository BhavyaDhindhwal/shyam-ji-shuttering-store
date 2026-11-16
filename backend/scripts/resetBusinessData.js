require("dotenv").config();

const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const mongoose = require("mongoose");

const CLEAR_COLLECTIONS = [
  "sales",
  "materialissues",
  "materialreturns",
  "customers",
  "expenses",
  "inquiries",
  "monthlysalessnapshots",
  "counters",
];

// These are intentionally NOT in CLEAR_COLLECTIONS:
// inventories, owners, ownerotps.

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MONGODB_URI or MONGO_URI is missing in backend/.env");
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    family: 4,
  });

  try {
    const db = mongoose.connection.db;
    const dbName = db.databaseName;
    const existing = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray())
        .map((c) => c.name)
    );

    console.log("\n=== BUSINESS RESET REVIEW ===");
    console.log("Target database:", dbName);
    console.log("Mode:", process.env.EXECUTE_BUSINESS_RESET === "YES"
      ? "EXECUTION REQUESTED"
      : "DRY RUN — NO CHANGES");

    console.log("\n=== RECORD COUNTS ===");

    for (const name of CLEAR_COLLECTIONS) {
      if (!existing.has(name)) {
        console.log(`${name}: not found; will skip`);
        continue;
      }

      console.log(`${name}: ${await db.collection(name).countDocuments()}`);
    }

    console.log("\n=== PRESERVED COLLECTIONS ===");

    for (const name of ["owners", "ownerotps"]) {
      if (existing.has(name)) {
        console.log(`${name}: ${await db.collection(name).countDocuments()} — PRESERVE`);
      } else {
        console.log(`${name}: not found`);
      }
    }

    if (!existing.has("inventories")) {
      throw new Error("Inventory collection is missing. Nothing was changed.");
    }

    const inventory = await db.collection("inventories").find({}).toArray();

    console.log("\n=== INVENTORY RESET PREVIEW ===");

    for (const item of inventory) {
      console.log({
        material: item.materialName,
        totalStock: item.totalStock,
        currentAvailable: item.availableStock,
        currentRented: item.rentedStock,
        plannedAvailable: item.totalStock,
        plannedRented: 0,
      });
    }

    console.log("\nCollections planned for clearing:", CLEAR_COLLECTIONS.join(", "));
    console.log("Inventory documents will be preserved.");
    console.log("Inventory totalStock values will not be changed.");
    console.log("Owner and OwnerOtp collections will be preserved.");

    // Safe default: report only.
    if (process.env.EXECUTE_BUSINESS_RESET !== "YES") {
      console.log("\nDRY RUN COMPLETE. No records were deleted or modified.");
      return;
    }

    // Require multiple explicit confirmations for destructive execution.
    if (
      process.env.CONFIRM_CLEAR_BUSINESS_DATA !== "YES" ||
      process.env.CONFIRM_RESET_INVENTORY !== "YES" ||
      process.env.CONFIRM_DATABASE_NAME !== dbName
    ) {
      throw new Error(
        "Safety stop: execution requires all confirmation variables, " +
        "including the exact database name. No changes were made."
      );
    }

    const session = await mongoose.startSession();

    try {
      let deletedResults = {};

      // Use a transaction so failures do not leave a partially reset database.
      await session.withTransaction(async () => {
        const results = {};

        for (const name of CLEAR_COLLECTIONS) {
          if (!existing.has(name)) {
            results[name] = "skipped — collection not found";
            continue;
          }

          const result = await db.collection(name).deleteMany({}, { session });
          results[name] = `deleted ${result.deletedCount}`;
        }

        let stockUpdated = 0;

        for (const item of inventory) {
          const result = await db.collection("inventories").updateOne(
            { _id: item._id },
            {
              $set: {
                availableStock: Number(item.totalStock),
                rentedStock: 0,
              },
            },
            { session }
          );

          stockUpdated += result.modifiedCount;
        }

        results.inventoryDocumentsPreserved = inventory.length;
        results.inventoryStockDocumentsUpdated = stockUpdated;
        deletedResults = results;
      });

      console.log("\n=== RESET COMMITTED ===");
      console.log(JSON.stringify(deletedResults, null, 2));
    } finally {
      await session.endSession();
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("\nReset stopped:", error.message);
  process.exitCode = 1;
});

