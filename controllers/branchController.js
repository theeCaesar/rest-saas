const Branch = require("../models/branchModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

exports.getAllBranches = catchAsync(async (req, res, next) => {
  const filter = { restaurant: req.restaurantId };
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === "true";
  }
  const branches = await Branch.find(filter).sort("name");
  res.status(200).json({
    status: "success",
    results: branches.length,
    data: { branches },
  });
});

exports.getBranch = catchAsync(async (req, res, next) => {
  const branch = await Branch.findOne({
    _id: req.params.id,
    restaurant: req.restaurantId,
  }).populate("managerId", "name email phone");
  if (!branch) return next(new AppError("Branch not found", 404));
  res.status(200).json({ status: "success", data: { branch } });
});

exports.createBranch = catchAsync(async (req, res, next) => {
  req.body.restaurant = req.restaurantId;
  const branch = await Branch.create(req.body);
  res.status(201).json({ status: "success", data: { branch } });
});

exports.updateBranch = catchAsync(async (req, res, next) => {
  delete req.body.restaurant;
  const branch = await Branch.findOneAndUpdate(
    { _id: req.params.id, restaurant: req.restaurantId },
    req.body,
    { new: true, runValidators: true },
  );
  if (!branch) return next(new AppError("Branch not found", 404));
  res.status(200).json({ status: "success", data: { branch } });
});

exports.deleteBranch = catchAsync(async (req, res, next) => {
  const branch = await Branch.findOneAndDelete({
    _id: req.params.id,
    restaurant: req.restaurantId,
  });
  if (!branch) return next(new AppError("Branch not found", 404));
  res.status(204).json({ status: "success", data: null });
});
