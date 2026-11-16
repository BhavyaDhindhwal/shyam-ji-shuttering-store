const mongoose = require("mongoose");

async function connectDatabase() {
  const mongoUri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI;

  if (!mongoUri) {
    console.error(
      "❌ MONGODB_URI is missing from backend/.env"
    );

    return false;
  }

  try {
    console.log(
      "🔎 MongoDB URI loaded successfully"
    );

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });

    console.log(
      "✅ MongoDB connected successfully"
    );

    return true;
  } catch (error) {
    console.error(
      "❌ MongoDB connection error:",
      error.message
    );

    return false;
  }
}

mongoose.connection.on(
  "disconnected",
  () => {
    console.error(
      "⚠️ MongoDB disconnected"
    );
  }
);

mongoose.connection.on(
  "reconnected",
  () => {
    console.log(
      "✅ MongoDB reconnected"
    );
  }
);

module.exports = connectDatabase;