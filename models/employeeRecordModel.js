const mongoose = require("mongoose");

const employeeRecordSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    recordType: {
      type: String,
      enum: ["bonus", "deduction", "commitment", "warning", "praise", "other"],
      required: true,
    },
    amount: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
      required: [true, "A record must have a description"],
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

employeeRecordSchema.index({ employee: 1, createdAt: -1 });
employeeRecordSchema.index({ restaurant: 1, recordType: 1 });

const EmployeeRecord = mongoose.model("EmployeeRecord", employeeRecordSchema);
module.exports = EmployeeRecord;
