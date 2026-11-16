const express = require("express");
const cors = require("cors");
const dns = require("dns");

dns.setServers([
  "8.8.8.8",
  "1.1.1.1",
]);

require("dotenv").config();

const connectDatabase = require("./config/db");

const inquiryRoutes = require("./routes/inquiryRoutes");
const authRoutes = require("./routes/authRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const customerRoutes = require("./routes/customerRoutes");
const materialIssueRoutes = require("./routes/materialIssueRoutes");
const salesRoutes = require("./routes/salesRoutes");
const returnRoutes = require("./routes/returnRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const { reconcileMonthlySnapshots } = require("./controllers/saleController");

const app = express();

const PORT = Number(process.env.PORT) || 5000;

// =====================================================
// ALLOWED FRONTEND ORIGINS
// =====================================================

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  // Optional deployed frontend origin, configured in backend/.env as FRONTEND_URL.
  ...(process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL.replace(/\/$/, "")]
    : []),
]);

// Vite may use the next port when 5173 is busy. During development, allow
// only local Vite origins on ports 5173–5180 (never a wildcard origin).
function isAllowedLocalViteOrigin(origin) {
  if (process.env.NODE_ENV === "production") return false;

  try {
    const url = new URL(origin);
    const isLocalHost =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const port = Number(url.port);

    return (
      url.protocol === "http:" &&
      isLocalHost &&
      Number.isInteger(port) &&
      port >= 5173 &&
      port <= 5180
    );
  } catch {
    return false;
  }
}

// =====================================================
// BASIC SECURITY
// =====================================================

app.disable("x-powered-by");

// =====================================================
// CORS
// =====================================================

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without an origin
      // such as Postman or server-to-server requests.
      if (
        !origin ||
        allowedOrigins.has(origin) ||
        isAllowedLocalViteOrigin(origin)
      ) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS blocked for origin: ${origin}`)
      );
    },

    methods: [
      "GET",
      "POST",
      "PATCH",
      "PUT",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],

    optionsSuccessStatus: 204,
  })
);

// =====================================================
// BODY PARSER
// =====================================================

app.use(
  express.json({
    limit: "1mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  })
);

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Shyam Ji Shuttering Store backend is running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "API is working properly",
  });
});

// =====================================================
// API ROUTES
// =====================================================

app.use("/api/auth", authRoutes);

app.use("/api/inquiries", inquiryRoutes);

app.use("/api/inventory", inventoryRoutes);

app.use("/api/customers", customerRoutes);

app.use("/api/material-issues", materialIssueRoutes);

app.use("/api/sales", salesRoutes);

app.use("/api/returns", returnRoutes);
app.use("/api/expenses", expenseRoutes);

// =====================================================
// 404 HANDLER
// =====================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use((error, req, res, next) => {
  console.error("Server error:", error);

  if (error.message?.startsWith("CORS blocked")) {
    return res.status(403).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(error.status || 500).json({
    success: false,
    message: error.message || "Internal server error",
  });
});

// =====================================================
// START SERVER
// =====================================================

async function startServer() {
  try {
    const connected = await connectDatabase();

    if (!connected) {
      console.error("MongoDB connection failed.");
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
      console.log(`Health: http://localhost:${PORT}/api/health`);
    });

    // Reconcile missing month-end summaries after startup (including after
    // downtime) and refresh the current/previous month periodically.
    const runMonthlyReconciliation = () => {
      reconcileMonthlySnapshots().catch((error) => {
        console.error("Monthly sales reconciliation failed:", error.message);
      });
    };
    runMonthlyReconciliation();
    setInterval(runMonthlyReconciliation, 6 * 60 * 60 * 1000).unref();
  } catch (error) {
    console.error("Backend startup failed:", error);
    process.exit(1);
  }
}

startServer();