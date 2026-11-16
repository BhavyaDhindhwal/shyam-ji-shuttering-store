const express = require("express");

const authController = require(
  "../controllers/authController"
);

const protectOwnerRoute = require(
  "../middleware/authMiddleware"
);

const router = express.Router();

const ownerLogin =
  authController.ownerLogin;

const requestOwnerOtp =
  authController.requestOwnerOtp;

const verifyOwnerOtp =
  authController.verifyOwnerOtp;

const getOwnerProfile =
  authController.getOwnerProfile;

const logoutOwner =
  authController.logoutOwner;

function checkHandler(name, handler) {
  if (typeof handler !== "function") {
    throw new TypeError(
      `Auth controller export "${name}" is missing or is not a function.`
    );
  }

  return handler;
}

router.post(
  "/login",
  checkHandler("ownerLogin", ownerLogin)
);

router.post(
  "/request-otp",
  checkHandler(
    "requestOwnerOtp",
    requestOwnerOtp
  )
);

router.post(
  "/verify-otp",
  checkHandler(
    "verifyOwnerOtp",
    verifyOwnerOtp
  )
);

router.get(
  "/owner/profile",
  protectOwnerRoute,
  checkHandler(
    "getOwnerProfile",
    getOwnerProfile
  )
);

router.post(
  "/owner/logout",
  protectOwnerRoute,
  checkHandler(
    "logoutOwner",
    logoutOwner
  )
);

module.exports = router;