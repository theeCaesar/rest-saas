const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    name: { type: String, required: true }, // Arabic
    nameEn: String,
    slug: { type: String, lowercase: true },
    address: { type: String, required: true },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    phones: [String],
    openingHours: { open: String, close: String, days: [String] },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

branchSchema.index({ restaurant: 1, isActive: 1 });

module.exports = mongoose.model("Branch", branchSchema);
