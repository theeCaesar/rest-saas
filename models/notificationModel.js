const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "expiry_warning",
        "low_stock",
        "payment_due",
        "payment_overdue",
        "task_assigned",
        "task_completed",
        "order_status",
        "transfer",
        "general",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: String,
    meal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meal",
    },
    stockOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockOrder",
    },
    relatedEntity: {
      type: mongoose.Schema.Types.ObjectId,
    },
    relatedEntityType: String,
    isRead: {
      type: Boolean,
      default: false,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    expiresAt: Date,
    daysUntilExpiry: Number,
  },
  {
    timestamps: true,
  },
);

notificationSchema.index({ restaurant: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ restaurant: 1, type: 1 });

const Notification = mongoose.model("Notification", notificationSchema);
module.exports = Notification;
