const mongoose = require("mongoose");
const {
  SUBSCRIPTION_STATUS,
  BILLING_CYCLE,
} = require("../constants/subscription");

const subscriptionSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    // The subscriber.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.PENDING,
    },
    billingCycle: {
      type: String,
      enum: Object.values(BILLING_CYCLE),
      default: BILLING_CYCLE.MONTHLY,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    nextPaymentDate: {
      type: Date,
      default: null,
    },
    autoRenew: {
      type: Boolean,
      default: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Restaurant-specific
    deliveryAddress: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
    },
    preferredBranch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
    },
    dietaryNotes: String,
    pausedAt: Date,
    pausedReason: String,
    resumeOnDate: Date,
    mealsRemaining: Number,
    mealsConsumedTotal: {
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

subscriptionSchema.virtual("invoices", {
  ref: "Invoice",
  localField: "_id",
  foreignField: "subscription",
  justOne: false,
});

subscriptionSchema.virtual("isExpired").get(function () {
  if (!this.endDate) return false;
  return new Date() > this.endDate;
});

subscriptionSchema.virtual("daysRemaining").get(function () {
  if (!this.endDate) return null;
  const diff = this.endDate - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

subscriptionSchema.methods.isCurrentlyActive = function () {
  return (
    this.status === SUBSCRIPTION_STATUS.ACTIVE &&
    this.endDate &&
    this.endDate > new Date()
  );
};

subscriptionSchema.index({ restaurant: 1, status: 1 });
subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ endDate: 1 });
subscriptionSchema.index({ nextPaymentDate: 1 });

module.exports = mongoose.model("Subscription", subscriptionSchema);
