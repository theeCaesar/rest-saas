const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "A delivery man must have a name"],
      trim: true,
    },
    phone: String,
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    notes: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

driverSchema.index({ restaurant: 1 });

const Driver = mongoose.model("Driver", driverSchema);
module.exports = Driver;
