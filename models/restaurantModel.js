const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "A restaurant must have a name"],
      trim: true,
    },
    nameAr: {
      type: String,
      trim: true,
    },
    tagline: {
      type: String,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9-]+$/,
      index: true,
    },
    address: String,
    phone: String,
    licenseNumber: String,
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A restaurant must have an owner"],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    branding: {
      primaryColor: String,
      secondaryColor: String,
      accentColor: String,
      logoUrl: String,
      faviconUrl: String,
    },
    contactInfo: {
      customerServicePhone: String,
      email: String,
      website: String,
    },
    defaultCurrency: {
      type: String,
      default: "IQD",
    },
    defaultLanguage: {
      type: String,
      default: "ar",
      enum: ["ar", "en"],
    },
    restaurantImage: String,
    totalRevenue: {
      type: Number,
      default: 0,
    },
    totalProfit: {
      type: Number,
      default: 0,
    },
    totalLosses: {
      type: Number,
      default: 0,
    },
    totalDebt: {
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

restaurantSchema.index({ owner: 1 });

const Restaurant = mongoose.model("Restaurant", restaurantSchema);
module.exports = Restaurant;
