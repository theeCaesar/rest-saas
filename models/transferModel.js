const mongoose = require("mongoose");

const transferItemSchema = new mongoose.Schema(
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
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    pricePerUnit: {
      type: Number,
      required: true,
    },
    totalPrice: Number,
  },
  { _id: true },
);

transferItemSchema.pre("validate", function () {
  this.totalPrice = this.pricePerUnit * this.quantity;
});

const transferSchema = new mongoose.Schema(
  {
    fromRestaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    toRestaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    items: [transferItemSchema],
    totalValue: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "in_transit", "received", "cancelled"],
      default: "pending",
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    receivedAt: Date,
    notes: String,
  },
  {
    timestamps: true,
  },
);

transferSchema.index({ fromRestaurant: 1, createdAt: -1 });
transferSchema.index({ toRestaurant: 1, createdAt: -1 });

transferSchema.pre("save", function (next) {
  this.totalValue = this.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  next();
});

const Transfer = mongoose.model("Transfer", transferSchema);
module.exports = Transfer;
