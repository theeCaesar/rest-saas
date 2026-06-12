const mongoose = require("mongoose");
const Order = require("../models/orderModel");
const Subscription = require("../models/subscriptionModel");
const SubscriberMeal = require("../models/subscriberMealModel");
const Meal = require("../models/mealModel");
const Driver = require("../models/driverModel");
const User = require("../models/userModel");
const Review = require("../models/reviewModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

// Default range = last 30 days
function dateRange(req) {
  const to   = req.query.to   ? new Date(req.query.to)   : new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  to.setHours(23, 59, 59, 999);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

// GET /api/v1/analytics/overview?from=&to=
exports.overview = catchAsync(async (req, res, next) => {
  const { from, to } = dateRange(req);
  const rid = req.restaurantId;

  const [revAgg, orderCount, activeSubs, newSubs, churned, statusAgg] = await Promise.all([
    Order.aggregate([
      { $match: { restaurant: rid, status: "delivered", createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, revenue: { $sum: "$finalAmount" }, delivered: { $sum: 1 } } },
    ]),
    Order.countDocuments({ restaurant: rid, createdAt: { $gte: from, $lte: to } }),
    Subscription.countDocuments({ restaurant: rid, status: "active" }),
    Subscription.countDocuments({ restaurant: rid, createdAt: { $gte: from, $lte: to } }),
    Subscription.countDocuments({ restaurant: rid, status: { $in: ["cancelled", "expired"] }, updatedAt: { $gte: from, $lte: to } }),
    SubscriberMeal.aggregate([
      { $match: { restaurant: rid, date: { $gte: from, $lte: to } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const revenue      = revAgg[0]?.revenue   || 0;
  const deliveredCnt = revAgg[0]?.delivered || 0;
  const aov          = deliveredCnt > 0 ? Math.round(revenue / deliveredCnt) : 0;

  const statusMap  = statusAgg.reduce((m, s) => ({ ...m, [s._id]: s.count }), {});
  const totalMeals = Object.values(statusMap).reduce((s, c) => s + c, 0);
  const completionRate = totalMeals > 0
    ? +((((statusMap.delivered || 0) / totalMeals) * 100).toFixed(1))
    : 0;

  res.status(200).json({
    status: "success",
    data: {
      dateRange: { from, to },
      revenue,
      orderCount,
      activeSubs,
      newSubs,
      churned,
      aov,
      deliveryCompletionRate: completionRate,
      deliveryStatusBreakdown: statusMap,
    },
  });
});

// GET /api/v1/analytics/employees?from=&to=
exports.employees = catchAsync(async (req, res, next) => {
  const { from, to } = dateRange(req);
  const rid = req.restaurantId;

  const [driverDeliveries, driverRatings, cashierOrders, kitchenMeals] = await Promise.all([
    SubscriberMeal.aggregate([
      { $match: { restaurant: rid, status: "delivered", date: { $gte: from, $lte: to }, driver: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: "$driver",
          deliveries: { $sum: 1 },
          onTimeCount: { $sum: { $cond: [{ $and: [{ $ne: ["$deliveredAt", null] }, { $ne: ["$scheduledTime", null] }, { $lte: ["$deliveredAt", "$scheduledTime"] }] }, 1, 0] } },
        },
      },
      { $lookup: { from: "drivers", localField: "_id", foreignField: "_id", as: "driverDoc" } },
      { $unwind: { path: "$driverDoc", preserveNullAndEmptyArrays: true } },
      { $project: { name: "$driverDoc.name", deliveries: 1, onTimeCount: 1 } },
    ]),
    Review.aggregate([
      { $match: { restaurant: rid, targetType: "driver", createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: "$targetId", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { restaurant: rid, createdAt: { $gte: from, $lte: to }, cashier: { $exists: true, $ne: null } } },
      { $group: { _id: "$cashier", orders: { $sum: 1 }, sales: { $sum: "$finalAmount" } } },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "userDoc" } },
      { $unwind: { path: "$userDoc", preserveNullAndEmptyArrays: true } },
      { $project: { name: "$userDoc.name", orders: 1, sales: 1 } },
    ]),
    SubscriberMeal.countDocuments({ restaurant: rid, preparedAt: { $gte: from, $lte: to } }),
  ]);

  const ratingMap = driverRatings.reduce(
    (m, r) => ({ ...m, [String(r._id)]: { avgRating: +r.avgRating.toFixed(2), count: r.count } }),
    {},
  );

  const drivers = driverDeliveries.map((d) => ({
    user: d._id,
    name: d.name,
    role: "driver",
    metrics: {
      deliveries: d.deliveries,
      onTimePct: d.deliveries > 0 ? +((d.onTimeCount / d.deliveries) * 100).toFixed(1) : 0,
      avgRating:   ratingMap[String(d._id)]?.avgRating || null,
      ratingCount: ratingMap[String(d._id)]?.count     || 0,
    },
  }));

  const cashiers = cashierOrders.map((c) => ({
    user: c._id,
    name: c.name,
    role: "cashier",
    metrics: { orders: c.orders, sales: c.sales },
  }));

  res.status(200).json({
    status: "success",
    data: { dateRange: { from, to }, drivers, cashiers, kitchen: { mealsPrepared: kitchenMeals } },
  });
});

// GET /api/v1/analytics/employees/:userId?from=&to=
exports.employeeDetail = catchAsync(async (req, res, next) => {
  const { from, to } = dateRange(req);
  const rid = req.restaurantId;

  const user = await User.findOne({ _id: req.params.userId, restaurant: rid }).select("name role email phone");
  if (!user) return next(new AppError("User not found", 404));

  let daily = [];
  let reviews = [];

  if (user.role === "driver") {
    const driver = await Driver.findOne({ restaurant: rid, name: user.name });
    if (driver) {
      [daily, reviews] = await Promise.all([
        SubscriberMeal.aggregate([
          { $match: { restaurant: rid, driver: driver._id, date: { $gte: from, $lte: to } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
              total: { $sum: 1 },
              delivered: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        Review.find({ restaurant: rid, targetType: "driver", targetId: driver._id })
          .populate("author", "name")
          .sort("-createdAt")
          .limit(20),
      ]);
    }
  } else {
    daily = await Order.aggregate([
      { $match: { restaurant: rid, cashier: user._id, createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          orders: { $sum: 1 },
          sales:  { $sum: "$finalAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  res.status(200).json({ status: "success", data: { user, daily, reviews } });
});

// GET /api/v1/analytics/meals?from=&to=
exports.meals = catchAsync(async (req, res, next) => {
  const { from, to } = dateRange(req);
  const rid = req.restaurantId;

  const [topOrdered, topRated, revenuePerMeal] = await Promise.all([
    Meal.find({ restaurant: rid })
      .sort("-totalOrders")
      .limit(10)
      .select("name averageRating totalOrders totalRatings price")
      .populate("category", "name nameEn"),
    Meal.find({ restaurant: rid, totalRatings: { $gt: 0 } })
      .sort("-averageRating -totalRatings")
      .limit(10)
      .select("name averageRating totalRatings price")
      .populate("category", "name nameEn"),
    Order.aggregate([
      { $match: { restaurant: rid, status: "delivered", createdAt: { $gte: from, $lte: to } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.meal", revenue: { $sum: "$items.totalPrice" }, quantity: { $sum: "$items.quantity" } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      { $lookup: { from: "meals", localField: "_id", foreignField: "_id", as: "meal" } },
      { $unwind: { path: "$meal", preserveNullAndEmptyArrays: true } },
      { $project: { name: "$meal.name", revenue: 1, quantity: 1 } },
    ]),
  ]);

  res.status(200).json({
    status: "success",
    data: { dateRange: { from, to }, topOrdered, topRated, revenuePerMeal },
  });
});

// GET /api/v1/analytics/subscriptions?from=&to=
exports.subscriptions = catchAsync(async (req, res, next) => {
  const { from, to } = dateRange(req);
  const rid = req.restaurantId;

  const [planDist, growth, mrrAgg] = await Promise.all([
    Subscription.aggregate([
      { $match: { restaurant: rid, status: "active" } },
      { $group: { _id: "$plan", count: { $sum: 1 } } },
      { $lookup: { from: "plans", localField: "_id", foreignField: "_id", as: "plan" } },
      { $unwind: { path: "$plan", preserveNullAndEmptyArrays: true } },
      { $project: { planName: "$plan.name.ar", count: 1, price: "$plan.discountedPrice" } },
    ]),
    Subscription.aggregate([
      { $match: { restaurant: rid, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, newSubs: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Subscription.aggregate([
      { $match: { restaurant: rid, status: "active" } },
      { $lookup: { from: "plans", localField: "plan", foreignField: "_id", as: "plan" } },
      { $unwind: { path: "$plan", preserveNullAndEmptyArrays: true } },
      { $group: { _id: null, mrr: { $sum: "$plan.discountedPrice" } } },
    ]),
  ]);

  res.status(200).json({
    status: "success",
    data: {
      dateRange: { from, to },
      planDistribution: planDist,
      growth,
      totalActive: planDist.reduce((s, p) => s + p.count, 0),
      mrr: mrrAgg[0]?.mrr || 0,
    },
  });
});

// GET /api/v1/analytics/delivery?from=&to=
exports.delivery = catchAsync(async (req, res, next) => {
  const { from, to } = dateRange(req);
  const rid = req.restaurantId;

  const [statusAgg, byBranch, byHour] = await Promise.all([
    SubscriberMeal.aggregate([
      { $match: { restaurant: rid, date: { $gte: from, $lte: to } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    SubscriberMeal.aggregate([
      { $match: { restaurant: rid, date: { $gte: from, $lte: to } } },
      { $group: { _id: "$branch", total: { $sum: 1 }, delivered: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } } } },
      { $lookup: { from: "branches", localField: "_id", foreignField: "_id", as: "branch" } },
      { $unwind: { path: "$branch", preserveNullAndEmptyArrays: true } },
      { $project: { branchName: "$branch.name", total: 1, delivered: 1 } },
    ]),
    SubscriberMeal.aggregate([
      { $match: { restaurant: rid, scheduledTime: { $gte: from, $lte: to }, status: "delivered" } },
      { $group: { _id: { $hour: "$scheduledTime" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const statusMap  = statusAgg.reduce((m, s) => ({ ...m, [s._id]: s.count }), {});
  const totalMeals = Object.values(statusMap).reduce((s, c) => s + c, 0);

  res.status(200).json({
    status: "success",
    data: {
      dateRange: { from, to },
      statusBreakdown: statusMap,
      byBranch,
      byHour,
      onTimePct: totalMeals > 0 ? +((((statusMap.delivered || 0) / totalMeals) * 100).toFixed(1)) : 0,
    },
  });
});

// GET /api/v1/analytics/revenue?from=&to=&groupBy=day|week|month
exports.revenue = catchAsync(async (req, res, next) => {
  const { from, to } = dateRange(req);
  const rid     = req.restaurantId;
  const groupBy = req.query.groupBy || "day";

  const fmt = groupBy === "month" ? "%Y-%m" : groupBy === "week" ? "%G-W%V" : "%Y-%m-%d";

  const series = await Order.aggregate([
    { $match: { restaurant: rid, status: "delivered", createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: { $dateToString: { format: fmt, date: "$createdAt" } }, revenue: { $sum: "$finalAmount" }, orders: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  res.status(200).json({ status: "success", data: { dateRange: { from, to }, groupBy, series } });
});
