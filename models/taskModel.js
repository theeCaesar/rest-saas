const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "A task must have a title"],
      trim: true,
    },
    description: String,
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    taskType: {
      type: String,
      enum: ["daily", "monthly", "one_time"],
      default: "daily",
    },
    stars: {
      type: Number,
      required: [true, "A task must have a star reward"],
      min: 1,
    },
    reward: String,
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: Date,
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    dueDate: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

taskSchema.index({ restaurant: 1, taskType: 1 });
taskSchema.index({ assignedTo: 1, isCompleted: 1 });

const Task = mongoose.model("Task", taskSchema);
module.exports = Task;
