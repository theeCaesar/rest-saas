const mongoose = require("mongoose");
const { BILLING_CYCLE } = require("../constants/subscription");

const planSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    // Localized names/descriptions, keyed by language code (ar / en).
    name: {
      type: Map,
      of: String,
      required: true,
    },
    description: {
      type: Map,
      of: String,
      default: {},
    },

    // Restaurant-specific plan attributes
    mealCount: {
      type: Number,
      required: true, // meals per day: 1, 2, or 3
    },
    includesBreakfast: {
      type: Boolean,
      default: false,
    },
    includesFriday: {
      type: Boolean,
      default: true, // Iraq weekend is Friday
    },
    billingPeriod: {
      type: String,
      enum: Object.values(BILLING_CYCLE),
      required: true,
    },
    originalPrice: Number, // pre-discount
    discountedPrice: Number, // post-discount
    discountPercentage: {
      type: Number,
      default: 0,
    },
    // Convenience price field (kept from the loya plan model).
    priceMonthly: Number,
    dietaryFocus: [
      {
        type: String,
        enum: [
          "standard",
          "keto",
          "low-carb",
          "high-protein",
          "vegetarian",
          "vegan",
        ],
      },
    ],

    currency: {
      type: String,
      default: "IQD",
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

planSchema.index({ restaurant: 1, isActive: 1, sortOrder: 1 });

module.exports = mongoose.model("Plan", planSchema);
