const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    label: { type: String, required: true }, // "البيت", "العمل"
    fullAddress: { type: String, required: true },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    buildingDetails: String, // "Building 5, apt 3"
    deliveryInstructions: String,
    contactPhone: String,
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// When an address is marked default, clear the flag on the user's others.
addressSchema.pre("save", async function (next) {
  if (this.isDefault && (this.isNew || this.isModified("isDefault"))) {
    await this.constructor.updateMany(
      { user: this.user, _id: { $ne: this._id } },
      { $set: { isDefault: false } },
    );
  }
  next();
});

module.exports = mongoose.model("Address", addressSchema);
