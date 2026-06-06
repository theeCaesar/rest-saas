const mongoose = require("mongoose");

const subscriberMealSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
      index: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true, index: true },
    mealNumber: { type: Number, default: 1 }, // 1, 2, or 3 (for multi-meal plans)
    meal: { type: mongoose.Schema.Types.ObjectId, ref: "Meal" },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    deliveryAddress: { type: mongoose.Schema.Types.ObjectId, ref: "Address" },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
    status: {
      type: String,
      enum: [
        "scheduled",
        "preparing",
        "ready",
        "dispatched",
        "delivered",
        "skipped",
        "cancelled",
      ],
      default: "scheduled",
      index: true,
    },
    scheduledTime: Date,
    preparedAt: Date,
    dispatchedAt: Date,
    deliveredAt: Date,
    customerNotes: String,
    rating: { type: Number, min: 1, max: 5 },
    reviewText: String,
  },
  { timestamps: true },
);

subscriberMealSchema.index({ restaurant: 1, date: 1, status: 1 });
subscriberMealSchema.index({ subscription: 1, date: 1 });

module.exports = mongoose.model("SubscriberMeal", subscriberMealSchema);
