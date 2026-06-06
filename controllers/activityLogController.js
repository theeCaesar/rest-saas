const ActivityLog = require("../models/activityLogModel");
const catchAsync = require("../utils/catchAsync");
const factory = require("../utils/handlerFactory");

exports.getAllActivityLogs = catchAsync(async (req, res, next) => {
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
  if (req.query.entityType) {
    filter.entityType = req.query.entityType;
    delete req.query.entityType;
  }
  req.filterObj = filter;
  return factory.getAll(ActivityLog, "activityLogs", ["description"], [
    { path: "user", select: "name email" },
  ])(req, res, next);
});

exports.getActivityLog = factory.getOne(
  ActivityLog,
  [{ path: "user", select: "name email" }],
  "activityLog",
);
