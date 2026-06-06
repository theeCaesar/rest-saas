const Category = require("../models/categoryModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");

// Populates subCategories up to 3 levels deep
const deepSubCategoryPopulate = {
  path: "subCategories",
  populate: {
    path: "subCategories",
    populate: {
      path: "subCategories",
    },
  },
};

exports.createCategory = catchAsync(async (req, res, next) => {
  if (!req.body.restaurant) req.body.restaurant = req.restaurantScope;

  const category = await Category.create(req.body);

  // Auto-push this category into its parent's subCategories list
  if (category.parentCategory) {
    await Category.findByIdAndUpdate(category.parentCategory, {
      $addToSet: { subCategories: category._id },
    });
  }

  res.status(201).json({
    status: "success",
    data: { category },
  });
});

exports.getAllCategories = catchAsync(async (req, res, next) => {
  const filter = {};
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;

  // ?ids=id1,id2  →  get specific categories by their IDs
  if (req.query.ids) {
    const ids = String(req.query.ids)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    filter._id = { $in: ids };
  }

  // ?onlyRoot=true  →  only top-level categories (no parent)
  if (req.query.onlyRoot === "true") {
    filter.parentCategory = null;
  }

  const categories = await Category.find(filter)
    .populate(deepSubCategoryPopulate)
    .lean({ virtuals: true });

  res.status(200).json({
    status: "success",
    results: categories.length,
    total: categories.length,
    data: { categories },
  });
});

exports.getCategory = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;

  const category = await Category.findOne(filter)
    .populate("parentCategory", "name")
    .populate(deepSubCategoryPopulate)
    .lean({ virtuals: true });

  if (!category) return next(new AppError("Category not found", 404));

  res.status(200).json({
    status: "success",
    data: { category },
  });
});

exports.updateCategory = factory.updateOne(Category, "category");
exports.deleteCategory = factory.deleteOne(Category, "category");
