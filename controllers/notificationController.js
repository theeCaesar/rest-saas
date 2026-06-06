const Notification = require("../models/notificationModel");
const catchAsync = require("../utils/catchAsync");
const factory = require("../utils/handlerFactory");

exports.getNotifications = catchAsync(async (req, res, next) => {
  let filter = {};
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;
  if (req.query.type) {
    filter.type = req.query.type;
    delete req.query.type;
  }
  if (req.query.severity) {
    filter.severity = req.query.severity;
    delete req.query.severity;
  }
  if (req.query.isRead) {
    filter.isRead = req.query.isRead === "true";
    delete req.query.isRead;
  }
  req.filterObj = filter;
  return factory.getAll(Notification, "notifications", ["title"])(req, res, next);
});

exports.markAsRead = catchAsync(async (req, res, next) => {
  const notification = await Notification.findByIdAndUpdate(
    req.params.id,
    { isRead: true, $addToSet: { readBy: req.user._id } },
    { new: true },
  );
  res.status(200).json({
    status: "success",
    data: { notification },
  });
});

exports.markAllAsRead = catchAsync(async (req, res, next) => {
  const filter = { restaurant: req.restaurantScope, isRead: false };
  await Notification.updateMany(filter, {
    isRead: true,
    $addToSet: { readBy: req.user._id },
  });
  res.status(200).json({
    status: "success",
    message: "All notifications marked as read",
  });
});

exports.deleteNotification = factory.deleteOne(Notification, "notification");

exports.getUnreadCount = catchAsync(async (req, res, next) => {
  const count = await Notification.countDocuments({
    restaurant: req.restaurantScope,
    isRead: false,
  });
  res.status(200).json({
    status: "success",
    data: { unreadCount: count },
  });
});
