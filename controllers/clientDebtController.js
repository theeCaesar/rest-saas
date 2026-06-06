const ClientDebt = require("../models/clientDebtModel");
const Client = require("../models/clientModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");
const { logActivity } = require("../utils/activityLogger");

const debtPopulate = [
  { path: "client", select: "name phone" },
  { path: "order", select: "orderNumber finalAmount createdAt" },
  { path: "createdBy", select: "name" },
];

exports.getAllClientDebts = catchAsync(async (req, res, next) => {
  const filter = {};
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;
  if (req.query.client) filter.client = req.query.client;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.overdue === "true") {
    filter.dueDate = { $lt: new Date() };
    filter.status = { $ne: "paid" };
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip = (page - 1) * limit;

  const [debts, total] = await Promise.all([
    ClientDebt.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(debtPopulate)
      .lean({ virtuals: true }),
    ClientDebt.countDocuments(filter),
  ]);

  res.status(200).json({
    status: "success",
    results: debts.length,
    total,
    pages: Math.ceil(total / limit),
    data: { debts },
  });
});

exports.getClientDebt = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;

  const debt = await ClientDebt.findOne(filter)
    .populate(debtPopulate)
    .lean({ virtuals: true });

  if (!debt) return next(new AppError("Client debt not found", 404));

  res.status(200).json({
    status: "success",
    data: { debt },
  });
});

exports.createClientDebt = catchAsync(async (req, res, next) => {
  if (!req.body.restaurant) req.body.restaurant = req.restaurantScope;
  req.body.createdBy = req.user._id;

  const { client, originalAmount } = req.body;
  if (!client) return next(new AppError("Client is required", 400));
  if (!originalAmount || originalAmount <= 0) {
    return next(new AppError("Amount must be a positive number", 400));
  }

  // Verify client belongs to this restaurant
  const clientDoc = await Client.findOne({
    _id: client,
    restaurant: req.body.restaurant,
  });
  if (!clientDoc) return next(new AppError("Client not found", 404));

  req.body.currentAmount = originalAmount;

  const debt = await ClientDebt.create(req.body);

  // Update client's outstanding debt counter
  await Client.findByIdAndUpdate(client, {
    $inc: { totalDebt: originalAmount },
  });

  await logActivity({
    user: req.user._id,
    restaurant: req.body.restaurant,
    action: "create",
    entityType: "ClientDebt",
    entityId: debt._id,
    description: `Client debt created for ${clientDoc.name} — Amount: ${originalAmount}`,
  });

  const populated = await ClientDebt.findById(debt._id)
    .populate(debtPopulate)
    .lean({ virtuals: true });

  res.status(201).json({
    status: "success",
    data: { debt: populated },
  });
});

exports.makePayment = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;

  const debt = await ClientDebt.findOne(filter);
  if (!debt) return next(new AppError("Client debt not found", 404));

  if (debt.status === "paid") {
    return next(new AppError("This debt is already fully paid", 400));
  }

  const { amount, method, notes } = req.body;
  if (!amount || amount <= 0) {
    return next(new AppError("Payment amount must be positive", 400));
  }

  const remaining = debt.currentAmount - debt.amountPaid;
  if (amount > remaining) {
    return next(
      new AppError(
        `Payment exceeds remaining balance. Remaining: ${remaining}`,
        400,
      ),
    );
  }

  debt.amountPaid += amount;
  debt.payments.push({
    amount,
    method: method || "cash",
    notes,
    paidAt: new Date(),
    recordedBy: req.user._id,
  });

  debt.status = debt.amountPaid >= debt.currentAmount ? "paid" : "partial";
  await debt.save();

  // Update client's outstanding debt counter
  await Client.findByIdAndUpdate(debt.client, {
    $inc: { totalDebt: -amount },
  });

  await logActivity({
    user: req.user._id,
    restaurant: debt.restaurant,
    action: "update",
    entityType: "ClientDebt",
    entityId: debt._id,
    description: `Payment of ${amount} recorded on client debt`,
  });

  const populated = await ClientDebt.findById(debt._id)
    .populate(debtPopulate)
    .lean({ virtuals: true });

  res.status(200).json({
    status: "success",
    data: { debt: populated },
  });
});

exports.getClientDebtSummary = catchAsync(async (req, res, next) => {
  const match = {
    restaurant: req.restaurantScope,
    status: { $ne: "paid" },
  };
  if (req.query.client) match.client = require("mongoose").Types.ObjectId.createFromHexString(req.query.client);

  const summary = await ClientDebt.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalDebt: { $sum: "$currentAmount" },
        totalPaid: { $sum: "$amountPaid" },
        totalClients: { $addToSet: "$client" },
        overdueCount: {
          $sum: {
            $cond: [{ $lt: ["$dueDate", new Date()] }, 1, 0],
          },
        },
        overdueAmount: {
          $sum: {
            $cond: [
              { $and: [{ $lt: ["$dueDate", new Date()] }, { $ne: ["$dueDate", null] }] },
              { $subtract: ["$currentAmount", "$amountPaid"] },
              0,
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
        totalClientsWithDebt: { $size: "$totalClients" },
        overdueCount: 1,
        overdueAmount: 1,
      },
    },
  ]);

  res.status(200).json({
    status: "success",
    data: summary[0] || {
      totalDebt: 0,
      totalPaid: 0,
      totalRemaining: 0,
      totalClientsWithDebt: 0,
      overdueCount: 0,
      overdueAmount: 0,
    },
  });
});

exports.deleteClientDebt = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;

  const debt = await ClientDebt.findOne(filter);
  if (!debt) return next(new AppError("Client debt not found", 404));

  if (debt.status !== "pending") {
    return next(
      new AppError(
        "Only pending debts with no payments can be deleted",
        400,
      ),
    );
  }

  // Reverse the client debt counter
  await Client.findByIdAndUpdate(debt.client, {
    $inc: { totalDebt: -debt.currentAmount },
  });

  await ClientDebt.findByIdAndDelete(debt._id);

  res.status(204).json({ status: "success", data: null });
});
