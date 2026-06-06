const mongoose = require("mongoose");
const { INVOICE_STATUS, BILLING_CYCLE } = require("../constants/subscription");

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "IQD",
    },
    status: {
      type: String,
      enum: Object.values(INVOICE_STATUS),
      default: INVOICE_STATUS.PENDING,
    },
    billingCycle: {
      type: String,
      enum: Object.values(BILLING_CYCLE),
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "zaincash", "qicard", "fib", "bank_transfer", "other"],
    },
    paymentReference: String, // transaction id from the provider
    paidAt: {
      type: Date,
      default: null,
    },
    dueDate: {
      type: Date,
    },
    periodStart: {
      type: Date,
    },
    periodEnd: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

invoiceSchema.index({ restaurant: 1, createdAt: -1 });
invoiceSchema.index({ user: 1, createdAt: -1 });
invoiceSchema.index({ subscription: 1 });

module.exports = mongoose.model("Invoice", invoiceSchema);
