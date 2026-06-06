const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    meal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meal",
      required: true,
    },
    mealName: String,
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    originalPrice: {
      type: Number,
      required: true,
    },
    recommendedSellingPrice: Number,
    sellingPrice: {
      type: Number,
      required: [true, "A order item must have a selling price"],
    },
    quantity: {
      type: Number,
      required: [true, "A order item must have a quantity"],
      min: 1,
    },
    sellingMode: {
      type: String,
      enum: ["pack", "piece"],
      default: "pack",
    },
    totalPrice: Number,
    profit: Number,
    section: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
    },
    returnedQuantity: {
      type: Number,
      default: 0,
    },
  },
  { _id: true },
);

orderItemSchema.pre("validate", function () {
  this.totalPrice = this.sellingPrice * this.quantity;
  const costBasis = this.originalPrice * this.quantity;
  this.profit = this.totalPrice - costBasis;
});

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
    },
    cashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
    },
    deliveryAddress: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
    },
    // Snapshot of the delivery point in case the saved address is later deleted.
    deliveryLocation: {
      lat: Number,
      lng: Number,
      label: String,
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
    },
    assignedDriver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
    },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "dispatched",
        "delivered",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },
    items: [orderItemSchema],
    totalAmount: {
      type: Number,
      default: 0,
    },
    totalProfit: {
      type: Number,
      default: 0,
    },
    totalCost: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    finalAmount: {
      type: Number,
      default: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "zaincash", "qicard", "fib", "bank_transfer"],
      default: "cash",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },
    customerNotes: String,
    kitchenNotes: String,
    dispatchedAt: Date,
    deliveredAt: Date,
    estimatedDeliveryTime: Date,
    notes: String,
    isReturn: {
      type: Boolean,
      default: false,
    },
    originalOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    returnReason: String,
    refundMethod: {
      type: String,
      enum: ["cash", "card", "credit"],
    },
    returnStatus: {
      type: String,
      enum: ["none", "partial", "full"],
      default: "none",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

orderSchema.index({ restaurant: 1, createdAt: -1 });
orderSchema.index({ restaurant: 1, status: 1 });
orderSchema.index({ restaurant: 1, branch: 1 });
orderSchema.index({ restaurant: 1, customer: 1 });
orderSchema.index({ restaurant: 1, cashier: 1 });
orderSchema.index({ restaurant: 1, client: 1 });
orderSchema.index({ subscription: 1 });
orderSchema.index({ originalOrder: 1 });

orderSchema.pre("save", function (next) {
  if (!this.orderNumber) {
    this.orderNumber = `SL-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  }
  this.totalAmount = this.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  this.totalProfit = this.items.reduce((sum, item) => sum + (item.profit || 0), 0);
  this.totalCost = this.items.reduce(
    (sum, item) => sum + (item.originalPrice * item.quantity),
    0,
  );
  this.finalAmount = this.totalAmount - (this.discount || 0);
  next();
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
