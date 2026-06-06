const Subscription = require("../models/subscriptionModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { SUBSCRIPTION_STATUS } = require("../constants/subscription");

const POPULATE = [
  { path: "plan" },
  { path: "user", select: "name email phone" },
  { path: "deliveryAddress" },
  { path: "preferredBranch", select: "name nameEn" },
];

// GET /api/v1/subscriptions  — staff list, tenant-scoped
exports.getAllSubscriptions = catchAsync(async (req, res, next) => {
  const filter = { restaurant: req.restaurantId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.user) filter.user = req.query.user;
  if (req.query.plan) filter.plan = req.query.plan;

  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;

  const [subscriptions, total] = await Promise.all([
    Subscription.find(filter)
      .populate(POPULATE)
      .sort("-createdAt")
      .skip(skip)
      .limit(limit),
    Subscription.countDocuments(filter),
  ]);

  res.status(200).json({
    status: "success",
    results: subscriptions.length,
    total,
    data: { subscriptions },
  });
});

// GET /api/v1/subscriptions/me — the current user's subscriptions
exports.getMySubscription = catchAsync(async (req, res, next) => {
  const subscriptions = await Subscription.find({
    restaurant: req.restaurantId,
    user: req.user._id,
    status: { $ne: SUBSCRIPTION_STATUS.CANCELLED },
  })
    .populate(POPULATE)
    .sort("-createdAt");

  res.status(200).json({
    status: "success",
    results: subscriptions.length,
    data: { subscriptions },
  });
});

exports.getSubscription = catchAsync(async (req, res, next) => {
  const subscription = await Subscription.findOne({
    _id: req.params.id,
    restaurant: req.restaurantId,
  }).populate([...POPULATE, { path: "invoices" }]);
  if (!subscription) return next(new AppError("Subscription not found", 404));
  res.status(200).json({ status: "success", data: { subscription } });
});

exports.createSubscription = catchAsync(async (req, res, next) => {
  req.body.restaurant = req.restaurantId;
  // Customers may only create subscriptions for themselves; staff may assign.
  if (req.user.role === "customer" || !req.body.user) {
    req.body.user = req.user._id;
  }
  if (req.user.role !== "customer") req.body.assignedBy = req.user._id;

  const subscription = await Subscription.create(req.body);
  res.status(201).json({ status: "success", data: { subscription } });
});

exports.updateSubscription = catchAsync(async (req, res, next) => {
  delete req.body.restaurant;
  const subscription = await Subscription.findOneAndUpdate(
    { _id: req.params.id, restaurant: req.restaurantId },
    req.body,
    { new: true, runValidators: true },
  );
  if (!subscription) return next(new AppError("Subscription not found", 404));
  res.status(200).json({ status: "success", data: { subscription } });
});

exports.deleteSubscription = catchAsync(async (req, res, next) => {
  const subscription = await Subscription.findOneAndDelete({
    _id: req.params.id,
    restaurant: req.restaurantId,
  });
  if (!subscription) return next(new AppError("Subscription not found", 404));
  res.status(204).json({ status: "success", data: null });
});

// POST /api/v1/subscriptions/:id/pause
exports.pauseSubscription = catchAsync(async (req, res, next) => {
  const subscription = await Subscription.findOne({
    _id: req.params.id,
    restaurant: req.restaurantId,
  });
  if (!subscription) return next(new AppError("Subscription not found", 404));

  subscription.status = SUBSCRIPTION_STATUS.PAUSED;
  subscription.pausedAt = new Date();
  if (req.body.reason) subscription.pausedReason = req.body.reason;
  if (req.body.resumeOnDate)
    subscription.resumeOnDate = new Date(req.body.resumeOnDate);
  await subscription.save();

  res.status(200).json({ status: "success", data: { subscription } });
});

// POST /api/v1/subscriptions/:id/resume
exports.resumeSubscription = catchAsync(async (req, res, next) => {
  const subscription = await Subscription.findOne({
    _id: req.params.id,
    restaurant: req.restaurantId,
  });
  if (!subscription) return next(new AppError("Subscription not found", 404));

  subscription.status = SUBSCRIPTION_STATUS.ACTIVE;
  subscription.pausedAt = null;
  subscription.pausedReason = null;
  subscription.resumeOnDate = null;
  await subscription.save();

  res.status(200).json({ status: "success", data: { subscription } });
});

// POST /api/v1/subscriptions/:id/cancel
exports.cancelSubscription = catchAsync(async (req, res, next) => {
  const subscription = await Subscription.findOne({
    _id: req.params.id,
    restaurant: req.restaurantId,
  });
  if (!subscription) return next(new AppError("Subscription not found", 404));

  subscription.status = SUBSCRIPTION_STATUS.CANCELLED;
  subscription.autoRenew = false;
  await subscription.save();

  res.status(200).json({ status: "success", data: { subscription } });
});
