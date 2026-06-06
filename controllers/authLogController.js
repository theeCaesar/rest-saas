const AuthLog = require("../models/authLogModel");
const catchAsync = require("../utils/catchAsync");
const factory = require("../utils/handlerFactory");

exports.getAllAuthLogs = catchAsync(async (req, res, next) => {
  let filter = {};
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;
  if (req.query.userId) {
    filter.user = req.query.userId;
    delete req.query.userId;
  }
  if (req.query.action) {
    filter.action = req.query.action;
    delete req.query.action;
  }
  req.filterObj = filter;
  return factory.getAll(AuthLog, "authLogs", [], [
    { path: "user", select: "name email" },
  ])(req, res, next);
});

exports.getMyAuthLogs = catchAsync(async (req, res, next) => {
  const logs = await AuthLog.find({ user: req.user._id })
    .populate({ path: "user", select: "name email" })
    .sort({ createdAt: -1 })
    .limit(parseInt(req.query.limit) || 50)
    .lean();
  res.status(200).json({
    status: "success",
    results: logs.length,
    data: { authLogs: logs },
  });
});

exports.getEmployeeAuthLogs = catchAsync(async (req, res, next) => {
  const logs = await AuthLog.find({ user: req.params.employeeId })
    .populate({ path: "user", select: "name email" })
    .sort({ createdAt: -1 })
    .limit(parseInt(req.query.limit) || 100)
    .lean();
  res.status(200).json({
    status: "success",
    results: logs.length,
    data: { authLogs: logs },
  });
});
