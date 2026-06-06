const mongoose = require("mongoose");

const stockOrderItemSchema = new mongoose.Schema(
  {
    meal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meal",
    },
    mealName: {
      type: String,
      required: [true, "Item must have a meal name"],
    },
    quantity: {
      type: Number,
      required: [true, "Item must have a quantity"],
    },
    freeBonus: {
      type: Number,
      default: 0,
    },
    unitPrice: {
      type: Number,
      required: [true, "Item must have a unit price"],
    },
    totalItemPrice: {
      type: Number,
    },
    calculatedOriginalPrice: {
      type: Number,
    },
    discountPercentage: {
      type: Number,
      default: 0,
    },
    expireDate: Date,
    batchNumber: String,
    piecesPerPack: {
      type: Number,
      default: 1,
    },
    recommendedSellingPrice: Number,
    recommendedPiecePrice: Number,
    // mainStatus tracks receipt of the paid quantity
    mainStatus: {
      type: String,
      enum: ["pending", "delivered", "cancelled"],
      default: "pending",
    },
    // bonusStatus tracks receipt of the free-bonus quantity independently
    // automatically set to "not_applicable" when freeBonus === 0
    bonusStatus: {
      type: String,
      enum: ["pending", "delivered", "not_applicable", "cancelled"],
      default: "pending",
    },
    deliveredAt: Date,
    bonusDeliveredAt: Date,
  },
  { _id: true },
);

stockOrderItemSchema.pre("validate", function () {
  this.totalItemPrice = this.unitPrice * this.quantity;
  const totalUnits = this.quantity + (this.freeBonus || 0);
  if (totalUnits > 0) {
    this.calculatedOriginalPrice = this.totalItemPrice / totalUnits;
    if (this.freeBonus > 0) {
      this.discountPercentage = (this.freeBonus / totalUnits) * 100;
    }
  }
  // no bonus to track when freeBonus is zero
  if (!this.freeBonus || this.freeBonus === 0) {
    this.bonusStatus = "not_applicable";
  }
});

const stockOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    cashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cashier",
    },
    cashierName: String,
    cashierPhone: String,
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
    },
    items: [stockOrderItemSchema],
    totalOrderPrice: {
      type: Number,
      default: 0,
    },
    totalDiscountPercentage: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "partial_delivery", "delivered", "bonus_delivered", "cancelled"],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
    },
    amountPaid: {
      type: Number,
      default: 0,
    },
    paymentDueDate: {
      type: Date,
    },
    paidAt: Date,
    latePenaltyPerDay: {
      type: Number,
      default: 0,
    },
    latePenaltyApplied: {
      type: Number,
      default: 0,
    },
    adjustedTotalPrice: {
      type: Number,
      default: 0,
    },
    notes: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

stockOrderSchema.index({ restaurant: 1, createdAt: -1 });
stockOrderSchema.index({ restaurant: 1, supplier: 1 });
stockOrderSchema.index({ restaurant: 1, paymentStatus: 1 });
stockOrderSchema.index({ paymentDueDate: 1 });

stockOrderSchema.pre("save", function (next) {
  if (!this.orderNumber) {
    this.orderNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  }
  const totalItemsPrice = this.items.reduce((sum, item) => sum + (item.totalItemPrice || 0), 0);
  const totalQuantity = this.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalWithBonus = this.items.reduce(
    (sum, item) => sum + item.quantity + (item.freeBonus || 0),
    0,
  );
  if (totalWithBonus > 0 && totalQuantity > 0) {
    this.totalDiscountPercentage =
      ((totalWithBonus - totalQuantity) / totalWithBonus) * 100;
  }
  if (!this.totalOrderPrice) {
    this.totalOrderPrice = totalItemsPrice;
  }
  this.adjustedTotalPrice = this.totalOrderPrice + (this.latePenaltyApplied || 0);
  next();
});

stockOrderSchema.virtual("remainingDebt").get(function () {
  return Math.max(0, this.adjustedTotalPrice - (this.amountPaid || 0));
});

stockOrderSchema.virtual("isOverdue").get(function () {
  if (!this.paymentDueDate || this.paymentStatus === "paid") return false;
  return new Date() > this.paymentDueDate;
});

stockOrderSchema.virtual("overdueDays").get(function () {
  if (!this.paymentDueDate || this.paymentStatus === "paid") return 0;
  const diff = Date.now() - this.paymentDueDate.getTime();
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
});

const StockOrder = mongoose.model("StockOrder", stockOrderSchema);
module.exports = StockOrder;
