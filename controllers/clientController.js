const Client = require("../models/clientModel");
const Order = require("../models/orderModel");
const ClientDebt = require("../models/clientDebtModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");

exports.createClient = factory.createOne(Client, "client");
exports.getAllClients = factory.getAll(Client, "clients", ["name", "phone"]);
exports.updateClient = factory.updateOne(Client, "client");
exports.deleteClient = factory.deleteOne(Client, "client");

exports.getClient = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;

  const client = await Client.findOne(filter).lean({ virtuals: true });
  if (!client) return next(new AppError("Client not found", 404));

  const ordersPage  = Math.max(1, parseInt(req.query.ordersPage, 10) || 1);
  const ordersLimit = Math.min(100, Math.max(1, parseInt(req.query.ordersLimit, 10) || 10));

  const ordersFilter = { client: client._id };
  if (req.restaurantScope) ordersFilter.restaurant = req.restaurantScope;

  const debtFilter = { client: client._id };
  if (req.restaurantScope) debtFilter.restaurant = req.restaurantScope;

  const [orders, ordersTotal, summary, activeDebts, debtSummary] = await Promise.all([
    Order.find(ordersFilter)
      .sort("-createdAt")
      .skip((ordersPage - 1) * ordersLimit)
      .limit(ordersLimit)
      .populate({ path: "cashier", select: "name" })
      .populate({ path: "items.meal", select: "name barcode" })
      .lean({ virtuals: true }),

    Order.countDocuments(ordersFilter),

    Order.aggregate([
      // Exclude returns (RT- transactions) — they are stored as separate
      // positive Order docs and would otherwise be counted as extra purchases.
      { $match: { ...ordersFilter, isReturn: { $ne: true } } },
      {
        $group: {
          _id: null,
          totalSpent:     { $sum: "$finalAmount" },
          totalDiscount:  { $sum: "$discount" },
          totalPurchases: { $sum: 1 },
          lastVisit:      { $max: "$createdAt" },
        },
      },
      { $project: { _id: 0, totalSpent: 1, totalDiscount: 1, totalPurchases: 1, lastVisit: 1 } },
    ]),

    ClientDebt.find({ ...debtFilter, status: { $ne: "paid" } })
      .sort({ createdAt: -1 })
      .populate({ path: "order", select: "orderNumber finalAmount createdAt" })
      .lean({ virtuals: true }),

    ClientDebt.aggregate([
      { $match: debtFilter },
      {
        $group: {
          _id: null,
          totalDebt:      { $sum: "$currentAmount" },
          totalPaid:      { $sum: "$amountPaid" },
          overdueCount: {
            $sum: {
              $cond: [
                { $and: [{ $lt: ["$dueDate", new Date()] }, { $ne: ["$status", "paid"] }] },
                1, 0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalDebt: 1,
          totalPaid: 1,
          totalRemaining: { $subtract: ["$totalDebt", "$totalPaid"] },
          overdueCount: 1,
        },
      },
    ]),
  ]);

  const stats = summary[0] || { totalSpent: 0, totalDiscount: 0, totalPurchases: 0, lastVisit: null };
  const debtStats = debtSummary[0] || { totalDebt: 0, totalPaid: 0, totalRemaining: 0, overdueCount: 0 };

  res.status(200).json({
    status: "success",
    data: {
      client,
      summary: stats,
      orders: {
        data: orders,
        total: ordersTotal,
        page: ordersPage,
        limit: ordersLimit,
        pages: Math.ceil(ordersTotal / ordersLimit),
      },
      debt: {
        summary: debtStats,
        activeDebts,
      },
    },
  });
});

exports.getClientProfile = exports.getClient;

exports.searchClientsByMeal = catchAsync(async (req, res, next) => {
  const { mealId } = req.params;
  if (!mealId) return next(new AppError("Meal ID required", 400));

  const orders = await Order.find({
    restaurant: req.restaurantScope,
    "items.meal": mealId,
    client: { $ne: null },
  })
    .populate("client", "name phone email")
    .lean();

  const clientMap = new Map();
  orders.forEach((order) => {
    if (order.client && !clientMap.has(order.client._id.toString())) {
      clientMap.set(order.client._id.toString(), order.client);
    }
  });

  res.status(200).json({
    status: "success",
    results: clientMap.size,
    data: { clients: Array.from(clientMap.values()) },
  });
});
