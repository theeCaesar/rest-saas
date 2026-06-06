const mongoose = require("mongoose");

const lossSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    lossType: {
      type: String,
      enum: ["expired", "damaged", "return", "operational", "rent", "electricity", "salary", "other"],
      required: true,
    },
    meal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meal",
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    quantity: Number,
    amount: {
      type: Number,
      required: [true, "A loss must have an amount"],
    },
    description: {
      type: String,
      required: [true, "A loss must have a description"],
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

lossSchema.index({ restaurant: 1, lossType: 1 });
lossSchema.index({ restaurant: 1, createdAt: -1 });

const Loss = mongoose.model("Loss", lossSchema);
module.exports = Loss;
