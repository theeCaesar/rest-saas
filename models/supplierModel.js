const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "A supplier must have a name"],
      trim: true,
    },
    phone: String,
    email: String,
    address: String,
    contactPerson: String,
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    totalOrders: {
      type: Number,
      default: 0,
    },
    totalDebt: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

supplierSchema.index({ restaurant: 1 });

const Supplier = mongoose.model("Supplier", supplierSchema);
module.exports = Supplier;
