const Inquiry = require("../models/Inquiry");

async function createInquiry(req, res) {
  try {
    const { name, phone, material, message } = req.body;

    if (!name || !phone || !material || !message) {
      return res.status(400).json({
        success: false,
        message: "All inquiry fields are required",
      });
    }

    if (!/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone number must contain exactly 10 digits",
      });
    }

    const inquiry = await Inquiry.create({
      name,
      phone,
      material,
      message,
    });

    return res.status(201).json({
      success: true,
      message: "Inquiry submitted successfully",
      inquiry,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to submit inquiry",
      error: error.message,
    });
  }
}

async function clearInquiries(req, res) {
  try {
    const result = await Inquiry.deleteMany({});
    return res.status(200).json({ success: true, deletedCount: result.deletedCount || 0, message: "All inquiries cleared" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to clear inquiries", error: error.message });
  }
}

async function getInquiries(req, res) {
  try {
    const inquiries = await Inquiry.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: inquiries.length,
      inquiries,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch inquiries",
      error: error.message,
    });
  }
}

module.exports = {
  createInquiry,
  getInquiries,
  clearInquiries,
};