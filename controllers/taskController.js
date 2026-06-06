const Task = require("../models/taskModel");
const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");
const APIFeatures = require("../utils/APIFeatures");
const { logActivity } = require("../utils/activityLogger");

exports.createTask = catchAsync(async (req, res, next) => {
  if (!req.body.restaurant) req.body.restaurant = req.restaurantScope;
  req.body.createdBy = req.user._id;
  const task = await Task.create(req.body);
  res.status(201).json({
    status: "success",
    data: { task },
  });
});

exports.completeTask = catchAsync(async (req, res, next) => {
  const task = await Task.findById(req.params.id);
  if (!task) return next(new AppError("Task not found", 404));
  if (task.isCompleted) {
    return next(new AppError("Task already completed", 400));
  }

  const userId = req.user._id;
  if (task.assignedTo && task.assignedTo.toString() !== userId.toString()) {
    return next(new AppError("This task is not assigned to you", 403));
  }

  task.isCompleted = true;
  task.completedAt = new Date();
  task.completedBy = userId;
  await task.save();

  // award stars
  const starUpdate = { $inc: { totalStars: task.stars } };
  if (task.taskType === "daily") starUpdate.$inc.dailyStars = task.stars;
  if (task.taskType === "monthly") starUpdate.$inc.monthlyStars = task.stars;
  await User.findByIdAndUpdate(userId, starUpdate);

  await logActivity({
    user: userId,
    restaurant: task.restaurant,
    action: "task_complete",
    entityType: "Task",
    entityId: task._id,
    description: `Completed task: ${task.title} (+${task.stars} stars)`,
  });

  res.status(200).json({
    status: "success",
    data: { task },
  });
});

exports.getMyTasks = catchAsync(async (req, res, next) => {
  let filter = {
    $or: [{ assignedTo: req.user._id }, { assignedTo: null }],
    isActive: true,
  };
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;
  if (req.query.taskType) {
    filter.taskType = req.query.taskType;
    delete req.query.taskType;
  }
  if (req.query.completed) {
    filter.isCompleted = req.query.completed === "true";
    delete req.query.completed;
  }
  const tasks = await Task.find(filter)
    .sort({ createdAt: -1 })
    .populate("createdBy", "name")
    .lean();
  res.status(200).json({
    status: "success",
    results: tasks.length,
    data: { tasks },
  });
});

exports.getAllTasks = catchAsync(async (req, res, next) => {
  const filter = {};
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;
  if (req.query.q) {
    filter.$or = [{ title: new RegExp(String(req.query.q), "i") }];
    delete req.query.q;
  }

  const features = new APIFeatures(Task.find(filter), req.query)
    .filter()
    .sort()
    .selectFields()
    .paginate();

  const tasks = await features.query
    .populate("assignedTo", "name email phone")
    .populate("createdBy", "name")
    .populate("completedBy", "name")
    .lean({ virtuals: true });

  const total = await Task.countDocuments(filter);

  res.status(200).json({
    status: "success",
    results: tasks.length,
    total,
    data: { tasks },
  });
});
exports.getTask = factory.getOne(
  Task,
  [
    { path: "createdBy", select: "name" },
    { path: "assignedTo", select: "name email" },
    { path: "completedBy", select: "name" },
  ],
  "task",
);
exports.updateTask = factory.updateOne(Task, "task");
exports.deleteTask = factory.deleteOne(Task, "task");
