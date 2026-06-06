const mongoose = require("mongoose");

const cashierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "A cashier must have a name"],
      trim: true,
    },
    phone: String,
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    notes: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

cashierSchema.index({ restaurant: 1 });

const Cashier = mongoose.model("Cashier", cashierSchema);
module.exports = Cashier;
