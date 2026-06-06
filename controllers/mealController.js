const Meal = require("../models/mealModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

// Maps the ?sort= shorthand to a mongoose sort spec.
const SORT_MAP = {
  name: "name",
  "price-asc": "price",
  "price-desc": "-price",
  "calories-asc": "calories",
  "calories-desc": "-calories",
  "protein-desc": "-protein_g",
  "orders-desc": "-totalOrders",
  popular: "-totalOrders",
  newest: "-createdAt",
};

// GET /api/v1/meals  — public, tenant-scoped browse
exports.getAllMeals = catchAsync(async (req, res, next) => {
  const filter = { restaurant: req.restaurantId };

  if (req.query.category) filter.category = req.query.category;

  if (req.query.dietary_tags) {
    const tags = String(req.query.dietary_tags)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length) filter.dietary_tags = { $all: tags };
  }

  if (req.query.isAvailable !== undefined) {
    filter.isAvailable = req.query.isAvailable === "true";
  }
  if (req.query.isFeatured !== undefined) {
    filter.isFeatured = req.query.isFeatured === "true";
  }

  // Calorie range
  if (req.query.minCalories || req.query.maxCalories) {
    filter.calories = {};
    if (req.query.minCalories)
      filter.calories.$gte = Number(req.query.minCalories);
    if (req.query.maxCalories)
      filter.calories.$lte = Number(req.query.maxCalories);
  }
  // Minimum protein
  if (req.query.minProtein) {
    filter.protein_g = { $gte: Number(req.query.minProtein) };
  }

  // Text search across name / nameEn / description
  if (req.query.q) {
    filter.$text = { $search: String(req.query.q) };
  }

  const sortSpec = SORT_MAP[req.query.sort] || "sortOrder -createdAt";

  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;

  const [meals, total] = await Promise.all([
    Meal.find(filter)
      .populate("category", "name nameEn slug")
      .sort(sortSpec)
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    Meal.countDocuments(filter),
  ]);

  res.status(200).json({
    status: "success",
    results: meals.length,
    total,
    page,
    data: { meals },
  });
});

// GET /api/v1/meals/:id  — public
exports.getMeal = catchAsync(async (req, res, next) => {
  const meal = await Meal.findOne({
    _id: req.params.id,
    restaurant: req.restaurantId,
  })
    .populate("category", "name nameEn slug")
    .populate("eligibleForPlans", "name billingPeriod")
    .lean({ virtuals: true });

  if (!meal) return next(new AppError("Meal not found", 404));
  res.status(200).json({ status: "success", data: { meal } });
});

exports.createMeal = catchAsync(async (req, res, next) => {
  req.body.restaurant = req.restaurantId;
  const meal = await Meal.create(req.body);
  res.status(201).json({ status: "success", data: { meal } });
});

exports.updateMeal = catchAsync(async (req, res, next) => {
  delete req.body.restaurant;
  const meal = await Meal.findOneAndUpdate(
    { _id: req.params.id, restaurant: req.restaurantId },
    req.body,
    { new: true, runValidators: true },
  );
  if (!meal) return next(new AppError("Meal not found", 404));
  res.status(200).json({ status: "success", data: { meal } });
});

exports.deleteMeal = catchAsync(async (req, res, next) => {
  const meal = await Meal.findOneAndDelete({
    _id: req.params.id,
    restaurant: req.restaurantId,
  });
  if (!meal) return next(new AppError("Meal not found", 404));
  res.status(204).json({ status: "success", data: null });
});
