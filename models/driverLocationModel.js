const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const driverLocationSchema = new Schema(
  {
    restaurant: { type: Types.ObjectId, ref: "Restaurant", required: true, index: true },
    driver:     { type: Types.ObjectId, ref: "Driver",     required: true, index: true },
    location:   { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
    heading:    Number,
    speed:      Number,
    status:     { type: String, enum: ["idle", "on_delivery", "returning", "offline"], default: "idle" },
    activeDeliveries: [{ type: Types.ObjectId, ref: "SubscriberMeal" }],
    updatedAt:  { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

driverLocationSchema.index({ restaurant: 1, driver: 1 }, { unique: true });

module.exports = mongoose.model("DriverLocation", driverLocationSchema);
