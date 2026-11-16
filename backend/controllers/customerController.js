const Customer = require("../models/Customer");

async function getCustomers(req, res) {
  try {
    const customers = await Customer.find().sort({
      name: 1,
    });

    return res.status(200).json({
      success: true,
      count: customers.length,
      customers,
    });
  } catch (error) {
    console.error("Get customers error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch customers",
      error: error.message,
    });
  }
}

async function createCustomer(req, res) {
  try {
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const address = String(req.body?.address || "").trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Customer name is required",
      });
    }

    if (name.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Customer name must contain at least 2 characters",
      });
    }

    if (phone && !/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({ success: false, message: "Phone number must contain exactly 10 digits when provided" });
    }

    const existingCustomer = phone ? await Customer.findOne({ phone }) : null;

    if (existingCustomer) {
      return res.status(409).json({
        success: false,
        message: "Customer with this phone already exists",
        customer: existingCustomer,
      });
    }

    const customer = await Customer.create({
      name,
      phone,
      address,
    });

    return res.status(201).json({
      success: true,
      message: "Customer created successfully",
      customer,
    });
  } catch (error) {
    console.error("Create customer error:", error);

    if (error.name === "ValidationError") {
      const validationMessages = Object.values(
        error.errors
      ).map((item) => item.message);

      return res.status(400).json({
        success: false,
        message: validationMessages.join(", "),
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Customer with this phone already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create customer",
      error: error.message,
    });
  }
}

module.exports = {
  getCustomers,
  createCustomer,
};