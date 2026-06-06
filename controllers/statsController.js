const mongoose = require("mongoose");
const Order = require("../models/orderModel");
const Meal = require("../models/mealModel");
const Client = require("../models/clientModel");
const User = require("../models/userModel");
const Loss = require("../models/lossModel");
const Debt = require("../models/debtModel");
const StockOrder = require("../models/stockOrderModel");
const Transfer = require("../models/transferModel");
const catchAsync = require("../utils/catchAsync");

const getDateRange = (period) => {
  const now = new Date();
  const start = new Date();
  switch (period) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "week":
      start.setDate(now.getDate() - 7);
      break;
    case "month":
      start.setMonth(now.getMonth() - 1);
      break;
    case "quarter":
      start.setMonth(now.getMonth() - 3);
      break;
    case "year":
      start.setFullYear(now.getFullYear() - 1);
      break;
    default:
      start.setMonth(now.getMonth() - 1);
  }
  return { start, end: now };
};

exports.getDashboardStats = catchAsync(async (req, res, next) => {
  const restaurantId = req.restaurantScope;
  const period = req.query.period || "month";
  const { start, end } = getDateRange(period);
  const prevStart = new Date(start);
  prevStart.setTime(prevStart.getTime() - (end - start));

  const matchRestaurant = restaurantId
    ? { restaurant: new mongoose.Types.ObjectId(restaurantId) }
    : {};
  const matchOrders = { ...matchRestaurant, isReturn: { $ne: true } };

  const [
    currentOrders,
    prevOrders,
    currentLosses,
    totalDebt,
    topMeals,
    topEmployees,
    topClients,
    monthlyOrdersTrend,
    ordersByPayment,
  ] = await Promise.all([
    // current period orders
    Order.aggregate([
      { $match: { ...matchOrders, createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$finalAmount" },
          totalProfit: { $sum: "$totalProfit" },
          totalCost: { $sum: "$totalCost" },
          count: { $sum: 1 },
          avgOrderAmount: { $avg: "$finalAmount" },
        },
      },
    ]),
    // previous period orders for comparison
    Order.aggregate([
      { $match: { ...matchOrders, createdAt: { $gte: prevStart, $lt: start } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$finalAmount" },
          totalProfit: { $sum: "$totalProfit" },
          count: { $sum: 1 },
        },
      },
    ]),
    // losses
    Loss.aggregate([
      { $match: { ...matchRestaurant, createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$lossType",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
    // debt
    Debt.aggregate([
      { $match: { ...matchRestaurant, status: { $ne: "paid" } } },
      {
        $group: {
          _id: null,
          totalDebt: { $sum: "$currentAmount" },
          totalPaid: { $sum: "$amountPaid" },
          overdueCount: {
            $sum: { $cond: [{ $lt: ["$dueDate", new Date()] }, 1, 0] },
          },
        },
      },
    ]),
    // top meals
    Order.aggregate([
      { $match: { ...matchOrders, createdAt: { $gte: start, $lte: end } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.meal",
          mealName: { $first: "$items.mealName" },
          totalSold: { $sum: "$items.quantity" },
          totalRevenue: { $sum: "$items.totalPrice" },
          totalProfit: { $sum: "$items.profit" },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
    ]),
    // top employees
    Order.aggregate([
      { $match: { ...matchOrders, createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$cashier",
          ordersCount: { $sum: 1 },
          totalRevenue: { $sum: "$finalAmount" },
          totalProfit: { $sum: "$totalProfit" },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "employee",
        },
      },
      { $unwind: "$employee" },
      {
        $project: {
          employee: { name: 1, email: 1 },
          ordersCount: 1,
          totalRevenue: 1,
          totalProfit: 1,
        },
      },
    ]),
    // top clients
    Order.aggregate([
      {
        $match: {
          ...matchOrders,
          createdAt: { $gte: start, $lte: end },
          client: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$client",
          purchaseCount: { $sum: 1 },
          totalSpent: { $sum: "$finalAmount" },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "clients",
          localField: "_id",
          foreignField: "_id",
          as: "client",
        },
      },
      { $unwind: "$client" },
      {
        $project: {
          client: { name: 1, phone: 1 },
          purchaseCount: 1,
          totalSpent: 1,
        },
      },
    ]),
    // monthly trend
    Order.aggregate([
      {
        $match: {
          ...matchOrders,
          createdAt: { $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          revenue: { $sum: "$finalAmount" },
          profit: { $sum: "$totalProfit" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
    // orders by payment method
    Order.aggregate([
      { $match: { ...matchOrders, createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$paymentMethod",
          total: { $sum: "$finalAmount" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const current = currentOrders[0] || { totalRevenue: 0, totalProfit: 0, count: 0, totalCost: 0, avgOrderAmount: 0 };
  const prev = prevOrders[0] || { totalRevenue: 0, totalProfit: 0, count: 0 };

  const revenueChange = prev.totalRevenue
    ? ((current.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 100
    : 0;
  const profitChange = prev.totalProfit
    ? ((current.totalProfit - prev.totalProfit) / prev.totalProfit) * 100
    : 0;
  const ordersCountChange = prev.count
    ? ((current.count - prev.count) / prev.count) * 100
    : 0;

  const debtInfo = totalDebt[0] || { totalDebt: 0, totalPaid: 0, overdueCount: 0 };
  const totalLossAmount = currentLosses.reduce((s, l) => s + l.total, 0);

  res.status(200).json({
    status: "success",
    data: {
      overview: {
        revenue: current.totalRevenue,
        profit: current.totalProfit,
        cost: current.totalCost,
        ordersCount: current.count,
        avgOrderAmount: current.avgOrderAmount,
        revenueChange: Math.round(revenueChange * 100) / 100,
        profitChange: Math.round(profitChange * 100) / 100,
        ordersCountChange: Math.round(ordersCountChange * 100) / 100,
        totalLosses: totalLossAmount,
        netProfit: current.totalProfit - totalLossAmount,
      },
      debt: {
        totalDebt: debtInfo.totalDebt,
        totalPaid: debtInfo.totalPaid,
        remaining: debtInfo.totalDebt - debtInfo.totalPaid,
        overdueCount: debtInfo.overdueCount,
      },
      lossesByType: currentLosses,
      topMeals,
      topEmployees,
      topClients,
      monthlyOrdersTrend,
      ordersByPayment,
      period,
    },
  });
});

exports.getUrgentMeals = catchAsync(async (req, res, next) => {
  const restaurantId = req.restaurantScope;
  const days = parseInt(req.query.days) || 7;
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - days);
  const prevDate = new Date(recentDate);
  prevDate.setDate(prevDate.getDate() - days);

  const matchRestaurant = restaurantId
    ? { restaurant: new mongoose.Types.ObjectId(restaurantId) }
    : {};
  const matchOrders = { ...matchRestaurant, isReturn: { $ne: true } };

  // meals with surging orders
  const surgingMeals = await Order.aggregate([
    { $match: { ...matchOrders, createdAt: { $gte: prevDate } } },
    { $unwind: "$items" },
    {
      $group: {
        _id: {
          meal: "$items.meal",
          period: {
            $cond: [{ $gte: ["$createdAt", recentDate] }, "recent", "previous"],
          },
        },
        mealName: { $first: "$items.mealName" },
        totalSold: { $sum: "$items.quantity" },
        totalRevenue: { $sum: "$items.totalPrice" },
      },
    },
    {
      $group: {
        _id: "$_id.meal",
        mealName: { $first: "$mealName" },
        periods: {
          $push: {
            period: "$_id.period",
            sold: "$totalSold",
            revenue: "$totalRevenue",
          },
        },
      },
    },
  ]);

  const urgent = surgingMeals
    .map((p) => {
      const recent = p.periods.find((pr) => pr.period === "recent") || { sold: 0, revenue: 0 };
      const previous = p.periods.find((pr) => pr.period === "previous") || { sold: 0, revenue: 0 };
      const growthRate = previous.sold > 0
        ? ((recent.sold - previous.sold) / previous.sold) * 100
        : recent.sold > 0 ? 100 : 0;
      return {
        mealId: p._id,
        mealName: p.mealName,
        recentSold: recent.sold,
        previousSold: previous.sold,
        growthRate: Math.round(growthRate * 100) / 100,
        recentRevenue: recent.revenue,
      };
    })
    .filter((p) => p.growthRate > 30)
    .sort((a, b) => b.growthRate - a.growthRate)
    .slice(0, 20);

  res.status(200).json({
    status: "success",
    data: { urgentMeals: urgent },
  });
});

exports.getEmployeeStats = catchAsync(async (req, res, next) => {
  const restaurantId = req.restaurantScope;
  const period = req.query.period || "month";
  const { start, end } = getDateRange(period);

  const matchRestaurant = restaurantId
    ? { restaurant: new mongoose.Types.ObjectId(restaurantId) }
    : {};
  const matchOrders = { ...matchRestaurant, isReturn: { $ne: true } };

  const stats = await Order.aggregate([
    { $match: { ...matchOrders, createdAt: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: "$cashier",
        ordersCount: { $sum: 1 },
        totalRevenue: { $sum: "$finalAmount" },
        totalProfit: { $sum: "$totalProfit" },
        avgOrder: { $avg: "$finalAmount" },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "employee",
      },
    },
    { $unwind: "$employee" },
    {
      $project: {
        employee: { name: 1, email: 1, totalStars: 1, monthlyStars: 1, dailyStars: 1 },
        ordersCount: 1,
        totalRevenue: 1,
        totalProfit: 1,
        avgOrder: 1,
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 100 },
  ]);

  res.status(200).json({
    status: "success",
    data: { employeeStats: stats },
  });
});

exports.getMealStats = catchAsync(async (req, res, next) => {
  const restaurantId = req.restaurantScope;
  const period = req.query.period || "month";
  const { start, end } = getDateRange(period);

  const matchRestaurant = restaurantId
    ? { restaurant: new mongoose.Types.ObjectId(restaurantId) }
    : {};
  const matchOrders = { ...matchRestaurant, isReturn: { $ne: true } };

  const stats = await Order.aggregate([
    { $match: { ...matchOrders, createdAt: { $gte: start, $lte: end } } },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.meal",
        mealName: { $first: "$items.mealName" },
        totalSold: { $sum: "$items.quantity" },
        totalRevenue: { $sum: "$items.totalPrice" },
        totalProfit: { $sum: "$items.profit" },
        avgSellingPrice: { $avg: "$items.sellingPrice" },
        ordersCount: { $sum: 1 },
      },
    },
    { $sort: { totalSold: -1 } },
    { $limit: 50 },
  ]);

  res.status(200).json({
    status: "success",
    data: { mealStats: stats },
  });
});

exports.getProfitAnalysis = catchAsync(async (req, res, next) => {
  const restaurantId = req.restaurantScope;
  const matchRestaurant = restaurantId
    ? { restaurant: new mongoose.Types.ObjectId(restaurantId) }
    : {};
  const matchOrders = { ...matchRestaurant, isReturn: { $ne: true } };

  const [dailyProfit, weeklyProfit, monthlyProfit] = await Promise.all([
    Order.aggregate([
      { $match: { ...matchOrders, createdAt: { $gte: new Date(new Date().setDate(new Date().getDate() - 30)) } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$finalAmount" },
          profit: { $sum: "$totalProfit" },
          cost: { $sum: "$totalCost" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: { ...matchOrders, createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) } } },
      {
        $group: {
          _id: { $isoWeek: "$createdAt" },
          year: { $first: { $isoWeekYear: "$createdAt" } },
          revenue: { $sum: "$finalAmount" },
          profit: { $sum: "$totalProfit" },
          count: { $sum: 1 },
        },
      },
      { $sort: { year: 1, _id: 1 } },
    ]),
    Order.aggregate([
      { $match: { ...matchOrders, createdAt: { $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 2)) } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          revenue: { $sum: "$finalAmount" },
          profit: { $sum: "$totalProfit" },
          cost: { $sum: "$totalCost" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
  ]);

  // losses for the same periods
  const monthlyLosses = await Loss.aggregate([
    { $match: { ...matchRestaurant, createdAt: { $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) } } },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        },
        totalLoss: { $sum: "$amount" },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  res.status(200).json({
    status: "success",
    data: {
      dailyProfit,
      weeklyProfit,
      monthlyProfit,
      monthlyLosses,
    },
  });
});

exports.get24HourStats = catchAsync(async (req, res, next) => {
  const restaurantId = req.restaurantScope;
  const matchRestaurant = restaurantId
    ? { restaurant: new mongoose.Types.ObjectId(restaurantId) }
    : {};
  const matchOrders = { ...matchRestaurant, isReturn: { $ne: true } };

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [orders, losses] = await Promise.all([
    Order.aggregate([
      { $match: { ...matchOrders, createdAt: { $gte: last24h } } },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          revenue: { $sum: "$finalAmount" },
          profit: { $sum: "$totalProfit" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Loss.aggregate([
      { $match: { ...matchRestaurant, createdAt: { $gte: last24h } } },
      {
        $group: {
          _id: null,
          totalLoss: { $sum: "$amount" },
        },
      },
    ]),
  ]);

  const totalRevenue = orders.reduce((s, h) => s + h.revenue, 0);
  const totalProfit = orders.reduce((s, h) => s + h.profit, 0);
  const totalOrdersCount = orders.reduce((s, h) => s + h.count, 0);

  res.status(200).json({
    status: "success",
    data: {
      hourlyBreakdown: orders,
      summary: {
        totalRevenue,
        totalProfit,
        totalOrdersCount,
        totalLosses: losses[0]?.totalLoss || 0,
        netProfit: totalProfit - (losses[0]?.totalLoss || 0),
      },
    },
  });
});
