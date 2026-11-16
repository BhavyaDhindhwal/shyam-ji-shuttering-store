const jwt = require("jsonwebtoken");

function protectOwnerRoute(req, res, next) {
  try {
    const authorization =
      req.get("authorization");

    if (!authorization) {
      return res.status(401).json({
        success: false,
        message:
          "Owner authentication required",
      });
    }

    const [scheme, token] =
      authorization.trim().split(/\s+/);

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid authorization format. Use Bearer token.",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message:
          "JWT secret is not configured",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    if (decoded.role !== "owner") {
      return res.status(403).json({
        success: false,
        message: "Owner access required",
      });
    }

    req.owner = decoded;
    req.user = decoded;

    return next();
  } catch (error) {
    console.error(
      "Owner authentication error:",
      error.name
    );

    if (
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Owner session expired. Please login again.",
      });
    }

    return res.status(401).json({
      success: false,
      message:
        "Invalid owner authentication token",
    });
  }
}

module.exports = protectOwnerRoute;