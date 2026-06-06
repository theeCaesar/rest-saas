const Plan = require("../models/planModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

// GET /api/v1/plans  — public (customers browse plans before subscribing)
exports.getAllPlans = catchAsync(async (req, res, next) => {
  const filter = { restaurant: req.restaurantId };
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === "true";
  }
  if (req.query.billingPeriod) filter.billingPeriod = req.query.billingPeriod;
  if (req.query.isFeatured !== undefined) {
    filter.isFeatured = req.query.isFeatured === "true";
  }

  const plans = await Plan.find(filter).sort("sortOrder createdAt");
  res.status(200).json({
    status: "success",
    results: plans.length,
    data: { plans },
  });
});

// GET /api/v1/plans/:id  — public
exports.getPlan = catchAsync(async (req, res, next) => {
  const plan = await Plan.findOne({
    _id: req.params.id,
    restaurant: req.restaurantId,
  });
  if (!plan) return next(new AppError("Plan not found", 404));
  res.status(200).json({ status: "success", data: { plan } });
});

exports.createPlan = catchAsync(async (req, res, next) => {
  req.body.restaurant = req.restaurantId;
  const plan = await Plan.create(req.body);
  res.status(201).json({ status: "success", data: { plan } });
});

exports.updatePlan = catchAsync(async (req, res, next) => {
  // Never let the tenant be reassigned via the request body.
  delete req.body.restaurant;
  const plan = await Plan.findOneAndUpdate(
    { _id: req.params.id, restaurant: req.restaurantId },
    req.body,
    { new: true, runValidators: true },
  );
  if (!plan) return next(new AppError("Plan not found", 404));
  res.status(200).json({ status: "success", data: { plan } });
});

exports.deletePlan = catchAsync(async (req, res, next) => {
  const plan = await Plan.findOneAndDelete({
    _id: req.params.id,
    restaurant: req.restaurantId,
  });
  if (!plan) return next(new AppError("Plan not found", 404));
  res.status(204).json({ status: "success", data: null });
});
