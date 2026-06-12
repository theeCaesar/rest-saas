const SubscriberMeal = require("../models/subscriberMealModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

const POPULATE = [
  { path: "user", select: "name phone" },
  { path: "meal", select: "name nameEn price calories" },
  { path: "branch", select: "name nameEn" },
  { path: "driver", select: "name phone" },
  { path: "deliveryAddress" },
];

function dayBounds(dateInput) {
  const base = dateInput ? new Date(dateInput) : new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Timestamp side-effects for each status transition.
const STATUS_TIMESTAMP = {
  preparing: "preparedAt",
  ready: null,
  dispatched: "dispatchedAt",
  delivered: "deliveredAt",
};

// GET /api/v1/subscriber-meals/today  — the operational dashboard hero query
exports.getToday = catchAsync(async (req, res, next) => {
  const { start, end } = dayBounds(req.query.date);
  const filter = {
    restaurant: req.restaurantId,
    date: { $gte: start, $lte: end },
  };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.branch) filter.branch = req.query.branch;

  const meals = await SubscriberMeal.find(filter)
    .populate(POPULATE)
    .sort("mealNumber scheduledTime");

  // Quick status breakdown for the dashboard header.
  const counts = meals.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {});

  res.status(200).json({
    status: "success",
    results: meals.length,
    counts,
    data: { subscriberMeals: meals },
  });
});

// GET /api/v1/subscriber-meals/mine — the requesting user's own meals.
// Defaults to today (for the account "وجبة اليوم" card); ?upcoming=true returns
// today onward, ?all=true returns the full history.
exports.getMine = catchAsync(async (req, res, next) => {
  const filter = { restaurant: req.restaurantId, user: req.user._id };

  if (req.query.all === "true") {
    // no date constraint
  } else if (req.query.upcoming === "true") {
    const { start } = dayBounds(new Date());
    filter.date = { $gte: start };
  } else {
    const { start, end } = dayBounds(req.query.date);
    filter.date = { $gte: start, $lte: end };
  }
  if (req.query.status) filter.status = req.query.status;

  const meals = await SubscriberMeal.find(filter)
    .populate(POPULATE)
    .sort("date mealNumber scheduledTime");

  res.status(200).json({
    status: "success",
    results: meals.length,
    data: { subscriberMeals: meals },
  });
});

exports.getAllSubscriberMeals = catchAsync(async (req, res, next) => {
  const filter = { restaurant: req.restaurantId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.branch) filter.branch = req.query.branch;
  if (req.query.subscription) filter.subscription = req.query.subscription;
  if (req.query.driver) filter.driver = req.query.driver;
  if (req.query.user) filter.user = req.query.user;
  if (req.query.date) {
    const { start, end } = dayBounds(req.query.date);
    filter.date = { $gte: start, $lte: end };
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const skip = (page - 1) * limit;

  const [subscriberMeals, total] = await Promise.all([
    SubscriberMeal.find(filter)
      .populate(POPULATE)
      .sort("-date mealNumber")
      .skip(skip)
      .limit(limit),
    SubscriberMeal.countDocuments(filter),
  ]);

  res.status(200).json({
    status: "success",
    results: subscriberMeals.length,
    total,
    data: { subscriberMeals },
  });
});

exports.getSubscriberMeal = catchAsync(async (req, res, next) => {
  const subscriberMeal = await SubscriberMeal.findOne({
    _id: req.params.id,
    restaurant: req.restaurantId,
  }).populate(POPULATE);
  if (!subscriberMeal)
    return next(new AppError("Subscriber meal not found", 404));
  res.status(200).json({ status: "success", data: { subscriberMeal } });
});

exports.createSubscriberMeal = catchAsync(async (req, res, next) => {
  req.body.restaurant = req.restaurantId;
  const subscriberMeal = await SubscriberMeal.create(req.body);
  res.status(201).json({ status: "success", data: { subscriberMeal } });
});

exports.updateSubscriberMeal = catchAsync(async (req, res, next) => {
  delete req.body.restaurant;
  const subscriberMeal = await SubscriberMeal.findOneAndUpdate(
    { _id: req.params.id, restaurant: req.restaurantId },
    req.body,
    { new: true, runValidators: true },
  );
  if (!subscriberMeal)
    return next(new AppError("Subscriber meal not found", 404));
  res.status(200).json({ status: "success", data: { subscriberMeal } });
});

exports.deleteSubscriberMeal = catchAsync(async (req, res, next) => {
  const subscriberMeal = await SubscriberMeal.findOneAndDelete({
    _id: req.params.id,
    restaurant: req.restaurantId,
  });
  if (!subscriberMeal)
    return next(new AppError("Subscriber meal not found", 404));
  res.status(204).json({ status: "success", data: null });
});

// PATCH /api/v1/subscriber-meals/:id/status — staff transition the workflow
exports.updateStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  if (!status) return next(new AppError("status is required", 400));

  const subscriberMeal = await SubscriberMeal.findOne({
    _id: req.params.id,
    restaurant: req.restaurantId,
  });
  if (!subscriberMeal)
    return next(new AppError("Subscriber meal not found", 404));

  subscriberMeal.status = status;
  const tsField = STATUS_TIMESTAMP[status];
  if (tsField && !subscriberMeal[tsField]) subscriberMeal[tsField] = new Date();
  if (req.body.driver) subscriberMeal.driver = req.body.driver;
  await subscriberMeal.save();

  res.status(200).json({ status: "success", data: { subscriberMeal } });
});
