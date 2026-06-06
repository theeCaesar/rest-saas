const Supplier = require("../models/supplierModel");
const Cashier = require("../models/cashierModel");
const Driver = require("../models/driverModel");
const StockOrder = require("../models/stockOrderModel");
const Debt = require("../models/debtModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");

exports.createSupplier = factory.createOne(Supplier, "supplier");
exports.getAllSuppliers = factory.getAll(Supplier, "suppliers", ["name", "contactPerson"]);
exports.updateSupplier = factory.updateOne(Supplier, "supplier");
exports.deleteSupplier = factory.deleteOne(Supplier, "supplier");

exports.getSupplier = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;

  const supplier = await Supplier.findOne(filter).lean({ virtuals: true });
  if (!supplier) return next(new AppError("Supplier not found", 404));

  const supplierId = supplier._id;
  const restaurantFilter = req.restaurantScope ? { restaurant: req.restaurantScope } : {};

  // per-section pagination params
  const p = (key, def = 1) => Math.max(1, parseInt(req.query[key], 10) || def);
  const l = (key, def = 10) => Math.min(100, Math.max(1, parseInt(req.query[key], 10) || def));

  const ordersPage    = p("ordersPage");    const ordersLimit    = l("ordersLimit", 10);
  const cashiersPage  = p("cashiersPage");  const cashiersLimit  = l("cashiersLimit", 20);
  const deliveryPage  = p("deliveryPage");  const deliveryLimit  = l("deliveryLimit", 20);
  const debtsPage     = p("debtsPage");     const debtsLimit     = l("debtsLimit", 10);

  const [
    orders, ordersTotal,
    cashiers, cashiersTotal,
    drivers, driversTotal,
    debts, debtsTotal,
    debtSummary,
  ] = await Promise.all([
    // inventory orders
    StockOrder.find({ supplier: supplierId, ...restaurantFilter })
      .sort("-createdAt")
      .skip((ordersPage - 1) * ordersLimit)
      .limit(ordersLimit)
      .populate({ path: "cashier", select: "name phone" })
      .populate({ path: "driver", select: "name phone" })
      .populate({ path: "createdBy", select: "name" })
      .lean({ virtuals: true }),
    StockOrder.countDocuments({ supplier: supplierId, ...restaurantFilter }),

    // cashiers
    Cashier.find({ supplier: supplierId, ...restaurantFilter })
      .sort("name")
      .skip((cashiersPage - 1) * cashiersLimit)
      .limit(cashiersLimit)
      .lean(),
    Cashier.countDocuments({ supplier: supplierId, ...restaurantFilter }),

    // delivery men — linked via orders
    Driver.find({
      _id: {
        $in: await StockOrder.distinct("driver", { supplier: supplierId, ...restaurantFilter }),
      },
    })
      .sort("name")
      .skip((deliveryPage - 1) * deliveryLimit)
      .limit(deliveryLimit)
      .lean(),
    StockOrder.distinct("driver", { supplier: supplierId, ...restaurantFilter })
      .then((ids) => ids.filter(Boolean).length),

    // debts
    Debt.find({ supplier: supplierId, ...restaurantFilter })
      .sort("-dueDate")
      .skip((debtsPage - 1) * debtsLimit)
      .limit(debtsLimit)
      .populate({ path: "stockOrder", select: "orderNumber totalOrderPrice adjustedTotalPrice" })
      .lean({ virtuals: true }),
    Debt.countDocuments({ supplier: supplierId, ...restaurantFilter }),

    // debt summary aggregation
    Debt.aggregate([
      { $match: { supplier: supplierId, status: { $ne: "paid" } } },
      {
        $group: {
          _id: null,
          totalDebt: { $sum: "$currentAmount" },
          totalPaid: { $sum: "$amountPaid" },
          overdueCount: { $sum: { $cond: [{ $lt: ["$dueDate", new Date()] }, 1, 0] } },
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
    ]),
  ]);

  const summary = debtSummary[0] || {
    totalDebt: 0,
    totalPaid: 0,
    totalRemaining: 0,
    overdueCount: 0,
    overdueAmount: 0,
  };

  res.status(200).json({
    status: "success",
    data: {
      supplier,
      summary,
      orders: {
        data: orders,
        total: ordersTotal,
        page: ordersPage,
        limit: ordersLimit,
        pages: Math.ceil(ordersTotal / ordersLimit),
      },
      cashiers: {
        data: cashiers,
        total: cashiersTotal,
        page: cashiersPage,
        limit: cashiersLimit,
        pages: Math.ceil(cashiersTotal / cashiersLimit),
      },
      drivers: {
        data: drivers,
        total: driversTotal,
        page: deliveryPage,
        limit: deliveryLimit,
        pages: Math.ceil(driversTotal / deliveryLimit),
      },
      debts: {
        data: debts,
        total: debtsTotal,
        page: debtsPage,
        limit: debtsLimit,
        pages: Math.ceil(debtsTotal / debtsLimit),
      },
    },
  });
});
