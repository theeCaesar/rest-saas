const mongoose = require("mongoose");

const debtSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    stockOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockOrder",
      required: true,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    originalAmount: {
      type: Number,
      required: true,
    },
    currentAmount: {
      type: Number,
      required: true,
    },
    amountPaid: {
      type: Number,
      default: 0,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "partial", "paid", "overdue"],
      default: "pending",
    },
    payments: [
      {
        amount: Number,
        paidAt: { type: Date, default: Date.now },
        method: { type: String, default: "cash" },
        notes: String,
      },
    ],
    penaltyRate: {
      type: Number,
      default: 0,
    },
    totalPenalty: {
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

debtSchema.index({ restaurant: 1, status: 1 });
debtSchema.index({ restaurant: 1, supplier: 1 });
debtSchema.index({ dueDate: 1, status: 1 });

debtSchema.virtual("remainingAmount").get(function () {
  return Math.max(0, this.currentAmount - this.amountPaid);
});

debtSchema.virtual("isOverdue").get(function () {
  if (this.status === "paid") return false;
  return new Date() > this.dueDate;
});

const Debt = mongoose.model("Debt", debtSchema);
module.exports = Debt;
