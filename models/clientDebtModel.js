const mongoose = require("mongoose");

const clientDebtSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
    },
    status: {
      type: String,
      enum: ["pending", "partial", "paid", "overdue"],
      default: "pending",
    },
    payments: [
      {
        amount: { type: Number, required: true },
        paidAt: { type: Date, default: Date.now },
        method: { type: String, default: "cash" },
        notes: String,
        recordedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    notes: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

clientDebtSchema.index({ restaurant: 1, status: 1 });
clientDebtSchema.index({ restaurant: 1, client: 1 });
clientDebtSchema.index({ dueDate: 1, status: 1 });

clientDebtSchema.virtual("remainingAmount").get(function () {
  return Math.max(0, this.currentAmount - this.amountPaid);
});

clientDebtSchema.virtual("isOverdue").get(function () {
  if (this.status === "paid") return false;
  if (!this.dueDate) return false;
  return new Date() > this.dueDate;
});

const ClientDebt = mongoose.model("ClientDebt", clientDebtSchema);
module.exports = ClientDebt;
