const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const Owner = require("../models/Owner");

const {
  sendOwnerOtpEmail,
} = require("../utils/sendEmail");

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function createOtp() {
  return String(
    Math.floor(
      100000 + Math.random() * 900000
    )
  );
}

function hashOtp(otp) {
  return crypto
    .createHash("sha256")
    .update(String(otp))
    .digest("hex");
}

function createOwnerToken(owner) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_SECRET is missing from backend/.env"
    );
  }

  return jwt.sign(
    {
      id: owner._id.toString(),
      email: owner.email,
      role: "owner",
    },
    secret,
    {
      expiresIn:
        process.env.JWT_EXPIRES_IN || "7d",
    }
  );
}

function publicOwner(owner) {
  return {
    id: owner._id,
    name: owner.name,
    email: owner.email,
    role: "owner",
  };
}

async function generateAndSendOtp(owner) {
  const otp = createOtp();

  const otpHash = hashOtp(otp);

  const expiresInMinutes = Number(
    process.env.OTP_EXPIRES_MINUTES || 5
  );

  owner.otpHash = otpHash;

  owner.otpExpiresAt = new Date(
    Date.now() +
      expiresInMinutes * 60 * 1000
  );

  owner.otpAttempts = 0;

  await owner.save();

  console.log(
    `🔐 OTP generated for ${owner.email}`
  );

  await sendOwnerOtpEmail({
    to: owner.email,
    otp,
    expiresInMinutes,
  });

  return expiresInMinutes;
}

async function ownerLogin(req, res) {
  try {
    const email = normalizeEmail(
      req.body?.email
    );

    const password = String(
      req.body?.password || ""
    );

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Owner email and password are required",
      });
    }

    const configuredEmail =
      normalizeEmail(
        process.env.OWNER_EMAIL
      );

    const configuredPassword =
      process.env.OWNER_PASSWORD;

    if (
      !configuredEmail ||
      !configuredPassword
    ) {
      return res.status(500).json({
        success: false,
        message:
          "Owner credentials are not configured",
      });
    }

    if (
      email !== configuredEmail ||
      password !== configuredPassword
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid owner email or password",
      });
    }

    let owner = await Owner.findOne({
      email,
    });

    if (!owner) {
      owner = await Owner.create({
        name:
          process.env.OWNER_NAME ||
          "Store Owner",

        email,

        role: "owner",
      });
    }

    const expiresInMinutes =
      await generateAndSendOtp(owner);

    return res.status(200).json({
      success: true,

      requiresOtp: true,

      message:
        "OTP sent successfully. Check your email.",

      ownerId: owner._id,

      email: owner.email,

      expiresInMinutes,
    });
  } catch (error) {
    console.error(
      "❌ Owner login error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to login owner",
    });
  }
}

async function requestOwnerOtp(req, res) {
  try {
    const email = normalizeEmail(
      req.body?.email
    );

    if (!email) {
      return res.status(400).json({
        success: false,
        message:
          "Owner email is required",
      });
    }

    const owner = await Owner.findOne({
      email,
    });

    if (!owner) {
      return res.status(404).json({
        success: false,
        message:
          "Owner account not found",
      });
    }

    const expiresInMinutes =
      await generateAndSendOtp(owner);

    return res.status(200).json({
      success: true,

      requiresOtp: true,

      message:
        "A new OTP has been sent to your email.",

      ownerId: owner._id,

      email: owner.email,

      expiresInMinutes,
    });
  } catch (error) {
    console.error(
      "❌ Request owner OTP error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to send owner OTP",
    });
  }
}

async function verifyOwnerOtp(req, res) {
  try {
    const email = normalizeEmail(
      req.body?.email
    );

    const ownerId =
      req.body?.ownerId;

    const otp = String(
      req.body?.otp || ""
    ).trim();

    if (!otp || !/^[0-9]{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid 6-digit OTP",
      });
    }

    const query = ownerId
      ? {
          _id: ownerId,
        }
      : {
          email,
        };

    const owner =
      await Owner.findOne(query);

    if (!owner) {
      return res.status(404).json({
        success: false,
        message:
          "Owner account not found",
      });
    }

    const maxAttempts = Number(
      process.env.OTP_MAX_ATTEMPTS || 5
    );

    if (
      Number(owner.otpAttempts || 0) >=
      maxAttempts
    ) {
      return res.status(429).json({
        success: false,
        message:
          "Maximum OTP attempts exceeded. Request a new OTP.",
      });
    }

    if (
      !owner.otpHash ||
      !owner.otpExpiresAt ||
      new Date(owner.otpExpiresAt) <
        new Date()
    ) {
      return res.status(401).json({
        success: false,
        message:
          "OTP expired. Request a new OTP.",
      });
    }

    const submittedHash =
      hashOtp(otp);

    if (
      submittedHash !==
      owner.otpHash
    ) {
      owner.otpAttempts =
        Number(
          owner.otpAttempts || 0
        ) + 1;

      await owner.save();

      return res.status(401).json({
        success: false,
        message:
          "Invalid OTP",
      });
    }

    owner.otpHash = undefined;

    owner.otpExpiresAt = undefined;

    owner.otpAttempts = 0;

    await owner.save();

    const token =
      createOwnerToken(owner);

    return res.status(200).json({
      success: true,

      message:
        "OTP verified successfully",

      token,

      owner:
        publicOwner(owner),
    });
  } catch (error) {
    console.error(
      "❌ Verify owner OTP error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to verify OTP",
    });
  }
}

async function getOwnerProfile(req, res) {
  try {
    const ownerId =
      req.owner?.id ||
      req.user?.id;

    if (!ownerId) {
      return res.status(401).json({
        success: false,
        message:
          "Owner authentication required",
      });
    }

    const owner =
      await Owner.findById(ownerId);

    if (!owner) {
      return res.status(404).json({
        success: false,
        message:
          "Owner account not found",
      });
    }

    return res.status(200).json({
      success: true,
      owner:
        publicOwner(owner),
    });
  } catch (error) {
    console.error(
      "❌ Get owner profile error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load owner profile",
    });
  }
}

async function logoutOwner(req, res) {
  return res.status(200).json({
    success: true,
    message:
      "Logout successful. Remove token on client.",
  });
}

module.exports = {
  ownerLogin,
  requestOwnerOtp,
  verifyOwnerOtp,
  getOwnerProfile,
  logoutOwner,
};