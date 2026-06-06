const Cashier = require("../models/cashierModel");
const catchAsync = require("../utils/catchAsync");
const APIFeatures = require("../utils/APIFeatures");
const factory = require("../utils/handlerFactory");

exports.createCashier = factory.createOne(Cashier, "cashier");

exports.getAllCashiers = catchAsync(async (req, res, next) => {
  const filter = {};
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q), "i");
    filter.$or = [{ name: rx }, { phone: rx }];
    delete req.query.q;
  }

  const features = new APIFeatures(Cashier.find(filter), req.query)
    .filter()
    .sort()
    .selectFields()
    .paginate();

  const cashiers = await features.query
    .populate("supplier", "name phone")
    .lean({ virtuals: true });

  const total = await Cashier.countDocuments(filter);

  res.status(200).json({
    status: "success",
    results: cashiers.length,
    total,
    data: { cashiers },
  });
});

exports.getCashier = factory.getOne(
  Cashier,
  { path: "supplier", select: "name phone" },
  "cashier",
);
exports.updateCashier = factory.updateOne(Cashier, "cashier");
exports.deleteCashier = factory.deleteOne(Cashier, "cashier");
