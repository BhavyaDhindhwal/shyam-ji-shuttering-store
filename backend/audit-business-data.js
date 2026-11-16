require("dotenv").config();
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
const mongoose = require("mongoose");

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MongoDB URI missing from environment.");

  await mongoose.connect(uri);

  try {
    const db = mongoose.connection.db;
    const collections = [
      "customers",
      "sales",
      "materialissues",
      "materialreturns",
      "inventories",
      "expenses",
      "inquiries",
      "monthlysalesnapshots",
      "owners",
      "ownerotps",
      "counters"
    ];

    console.log("\n=== READ-ONLY BUSINESS DATA AUDIT ===");

    for (const name of collections) {
      const exists = await db.listCollections({ name }).hasNext();
      if (!exists) {
        console.log(`${name}: collection not found`);
        continue;
      }

      const collection = db.collection(name);
      const count = await collection.countDocuments();
      console.log(`${name}: ${count} records`);

      if (name === "materialissues") {
        const active = await collection.countDocuments({
          $or: [
            { expectedReturnDate: { $gte: new Date() } },
            { expectedReturnDate: null },
            { expectedReturnDate: { $exists: false } }
          ]
        });
        console.log(`  Issues with no/potentially future return date: ${active}`);
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error("Audit failed:", err.message);
  process.exitCode = 1;
});

