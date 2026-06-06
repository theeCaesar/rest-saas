const User = require("../models/userModel");
const AuthLog = require("../models/authLogModel");
const Order = require("../models/orderModel");
const Task = require("../models/taskModel");
const EmployeeRecord = require("../models/employeeRecordModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");

const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach((key) => {
    if (allowedFields.includes(key)) newObj[key] = obj[key];
  });
  return newObj;
};

exports.getMe = (req, res, next) => {
  req.params.id = req.user.id;
  next();
};

exports.updateMe = catchAsync(async (req, res, next) => {
  if (req.body.password || req.body.passwordConfirm) {
    return next(new AppError("This route is not for password updates.", 400));
  }
  const filteredBody = filterObj(req.body, "name", "phone", "pfp");
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true,
  })
    .populate("restaurant", "name address")
    .populate("sections", "name description");
  res.status(200).json({
    status: "success",
    data: { user: updatedUser },
  });
});

exports.getMyProfile = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id)
    .populate("restaurant", "name address")
    .populate("sections", "name description")
    .lean({ virtuals: true });

  const authLogs = await AuthLog.find({ user: req.user.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Exclude returns (RT- transactions) — stored as separate positive Order docs
  const [dailyOrders, monthlyOrders, totalOrdersAgg] = await Promise.all([
    Order.aggregate([
      { $match: { cashier: req.user._id, isReturn: { $ne: true }, createdAt: { $gte: startOfDay } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: "$finalAmount" },
          profit: { $sum: "$totalProfit" },
        },
      },
    ]),
    Order.aggregate([
      { $match: { cashier: req.user._id, isReturn: { $ne: true }, createdAt: { $gte: startOfMonth } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: "$finalAmount" },
          profit: { $sum: "$totalProfit" },
        },
      },
    ]),
    Order.aggregate([
      { $match: { cashier: req.user._id, isReturn: { $ne: true } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: "$finalAmount" },
          profit: { $sum: "$totalProfit" },
        },
      },
    ]),
  ]);

  const tasks = await Task.find({
    assignedTo: req.user.id,
    isActive: true,
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const records = await EmployeeRecord.find({ employee: req.user.id })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate("recordedBy", "name")
    .lean();

  res.status(200).json({
    status: "success",
    data: {
      user,
      authLogs,
      ordersStats: {
        daily: dailyOrders[0] || { count: 0, revenue: 0, profit: 0 },
        monthly: monthlyOrders[0] || { count: 0, revenue: 0, profit: 0 },
        total: totalOrdersAgg[0] || { count: 0, revenue: 0, profit: 0 },
      },
      tasks,
      records,
    },
  });
});

exports.getEmployeeProfile = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .populate("restaurant", "name address")
    .populate("sections", "name description")
    .lean({ virtuals: true });

  if (!user) {
    return next(new AppError("Employee not found", 404));
  }

  const authLogs = await AuthLog.find({ user: req.params.id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Exclude returns (RT- transactions) — stored as separate positive Order docs
  const ordersMatch = { cashier: user._id, isReturn: { $ne: true } };
  const [dailyOrders, monthlyOrders, totalOrdersAgg, recentOrders] = await Promise.all([
    Order.aggregate([
      { $match: { ...ordersMatch, createdAt: { $gte: startOfDay } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: "$finalAmount" },
          profit: { $sum: "$totalProfit" },
        },
      },
    ]),
    Order.aggregate([
      { $match: { ...ordersMatch, createdAt: { $gte: startOfMonth } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: "$finalAmount" },
          profit: { $sum: "$totalProfit" },
        },
      },
    ]),
    Order.aggregate([
      { $match: ordersMatch },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: "$finalAmount" },
          profit: { $sum: "$totalProfit" },
        },
      },
    ]),
    Order.find(ordersMatch)
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("client", "name phone")
      .lean(),
  ]);

  const tasks = await Task.find({ assignedTo: req.params.id })
    .sort({ createdAt: -1 })
    .lean();

  const records = await EmployeeRecord.find({ employee: req.params.id })
    .sort({ createdAt: -1 })
    .populate("recordedBy", "name")
    .lean();

  // period filter
  let periodOrders = null;
  if (req.query.startDate && req.query.endDate) {
    periodOrders = await Order.aggregate([
      {
        $match: {
          ...ordersMatch,
          createdAt: {
            $gte: new Date(req.query.startDate),
            $lte: new Date(req.query.endDate),
          },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: "$finalAmount" },
          profit: { $sum: "$totalProfit" },
        },
      },
    ]);
  }

  res.status(200).json({
    status: "success",
    data: {
      user,
      authLogs,
      ordersStats: {
        daily: dailyOrders[0] || { count: 0, revenue: 0, profit: 0 },
        monthly: monthlyOrders[0] || { count: 0, revenue: 0, profit: 0 },
        total: totalOrdersAgg[0] || { count: 0, revenue: 0, profit: 0 },
        period: periodOrders ? periodOrders[0] : null,
      },
      recentOrders,
      tasks,
      records,
    },
  });
});

exports.getAllUsers = catchAsync(async (req, res, next) => {
  const filter = {};
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q), "i");
    filter.$or = [{ name: rx }, { email: rx }];
  }
  if (req.query.role) filter.role = req.query.role;

  const users = await User.find(filter)
    .populate("restaurant", "name address")
    .populate("sections", "name description")
    .lean({ virtuals: true });

  res.status(200).json({
    status: "success",
    results: users.length,
    total: users.length,
    data: { users },
  });
});
exports.getUser = factory.getOne(User, [{ path: "restaurant", select: "name address" }, { path: "sections", select: "name description" }], "user");
exports.deleteUser = factory.deleteOne(User, "user");
exports.updateUser = factory.updateOne(User, "user");
