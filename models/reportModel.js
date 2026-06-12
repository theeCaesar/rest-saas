const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const reportSchema = new Schema(
  {
    restaurant:  { type: Types.ObjectId, ref: "Restaurant", required: true, index: true },
    title:       { type: String, required: true },
    type:        { type: String, enum: ["sales", "subscriptions", "delivery", "inventory", "employee", "financial", "custom"], required: true },
    dateRange:   { from: Date, to: Date },
    data:        { type: Schema.Types.Mixed },
    generatedBy: { type: Types.ObjectId, ref: "User" },
    notes: String,
  },
  { timestamps: true }
);

reportSchema.index({ restaurant: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model("Report", reportSchema);
