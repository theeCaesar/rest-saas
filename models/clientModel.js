const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "A client must have a name"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "A client must have a phone number"],
    },
    email: String,
    address: String,
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },
    medicalDescription: String,
    allergies: [String],
    chronicConditions: [String],
    currentMedications: [String],
    bloodType: String,
    emergencyContact: String,
    prescriptionImage: String,
    notes: String,
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    totalPurchases: {
      type: Number,
      default: 0,
    },
    totalSpent: {
      type: Number,
      default: 0,
    },
    totalDebt: {
      type: Number,
      default: 0,
    },
    lastVisit: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

clientSchema.index({ restaurant: 1, phone: 1 });
clientSchema.index({ restaurant: 1, name: 1 });

const Client = mongoose.model("Client", clientSchema);
module.exports = Client;
