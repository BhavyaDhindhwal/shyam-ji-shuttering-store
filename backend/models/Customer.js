const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      minlength: [2, "Customer name must contain at least 2 characters"],
    },

    phone: {
      type: String,
      trim: true,
      default: "",
      validate: {
        validator: (value) => !value || /^[0-9]{10}$/.test(value),
        message: "Phone number must contain exactly 10 digits when provided",
      },
    },

    address: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

const Customer = mongoose.model("Customer", customerSchema);

customerSchema.index({ phone: 1 });
customerSchema.index({ name: 1, phone: 1 });

module.exports = Customer;