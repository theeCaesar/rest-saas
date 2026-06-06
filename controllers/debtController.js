const Debt = require("../models/debtModel");
const Supplier = require("../models/supplierModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");
const APIFeatures = require("../utils/APIFeatures");

const debtPopulate = [
  { path: "supplier", select: "name phone" },
  { path: "stockOrder", select: "orderNumber totalOrderPrice" },
];

exports.getAllDebts = catchAsync(async (req, res, next) => {
  const filter = {};
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;
  if (req.query.status) { filter.status = req.query.status; delete req.query.status; }
  if (req.query.supplier) { filter.supplier = req.query.supplier; delete req.query.supplier; }
  if (req.query.overdue === "true") {
    filter.dueDate = { $lt: new Date() };
    filter.status = { $ne: "paid" };
    delete req.query.overdue;
  }

  const features = new APIFeatures(Debt.find(filter), req.query)
    .filter()
    .sort()
    .selectFields()
    .paginate();

  const debts = await features.query
    .populate(debtPopulate)
    .lean({ virtuals: true });

  const total = await Debt.countDocuments(filter);

  res.status(200).json({
    status: "success",
    results: debts.length,
    total,
    data: { debts },
  });
});

exports.getDebt = factory.getOne(
  Debt,
  [
    { path: "supplier", select: "name phone" },
    { path: "stockOrder", select: "orderNumber totalOrderPrice" },
  ],
  "debt",
);

exports.makePayment = catchAsync(async (req, res, next) => {
  const debt = await Debt.findById(req.params.id);
  if (!debt) return next(new AppError("Debt not found", 404));

  const { amount, method, notes } = req.body;
  if (!amount || amount <= 0) {
    return next(new AppError("Payment amount must be positive", 400));
  }

  debt.amountPaid = (debt.amountPaid || 0) + amount;
  debt.payments.push({ amount, method, notes, paidAt: new Date() });

  if (debt.amountPaid >= debt.currentAmount) {
    debt.status = "paid";
  } else {
    debt.status = "partial";
  }
  await debt.save();

  await Supplier.findByIdAndUpdate(debt.supplier, {
    $inc: { totalDebt: -amount },
  });

  res.status(200).json({
    status: "success",
    data: { debt },
  });
});

exports.getDebtSummary = catchAsync(async (req, res, next) => {
  const summary = await Debt.aggregate([
    {
      $match: {
        restaurant: req.restaurantScope,
        status: { $ne: "paid" },
      },
    },
    {
      $group: {
        _id: null,
        totalDebt: { $sum: "$currentAmount" },
        totalPaid: { $sum: "$amountPaid" },
        overdueCount: {
          $sum: {
            $cond: [{ $lt: ["$dueDate", new Date()] }, 1, 0],
          },
        },
        overdueAmount: {
          $sum: {
            $cond: [
              { $lt: ["$dueDate", new Date()] },
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
      overdueCount: 0,
      overdueAmount: 0,
    },
  });
});

exports.deleteDebt = factory.deleteOne(Debt, "debt");
