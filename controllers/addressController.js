const Address = require("../models/addressModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

const STAFF = ["admin", "manager", "dispatcher", "cashier"];

// Addresses belong to a user. Customers manage only their own; staff may look
// up any user's addresses within the tenant via ?user=.
function scopeFilter(req) {
  if (STAFF.includes(req.user.role) && req.query.user) {
    return { user: req.query.user };
  }
  return { user: req.user._id };
}

exports.getAllAddresses = catchAsync(async (req, res, next) => {
  const addresses = await Address.find(scopeFilter(req)).sort("-isDefault -createdAt");
  res.status(200).json({
    status: "success",
    results: addresses.length,
    data: { addresses },
  });
});

exports.getAddress = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (!STAFF.includes(req.user.role)) filter.user = req.user._id;
  const address = await Address.findOne(filter);
  if (!address) return next(new AppError("Address not found", 404));
  res.status(200).json({ status: "success", data: { address } });
});

exports.createAddress = catchAsync(async (req, res, next) => {
  // Customers create for themselves; staff may set a user explicitly.
  if (!STAFF.includes(req.user.role) || !req.body.user) {
    req.body.user = req.user._id;
  }
  const address = await Address.create(req.body);
  res.status(201).json({ status: "success", data: { address } });
});

exports.updateAddress = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (!STAFF.includes(req.user.role)) filter.user = req.user._id;
  delete req.body.user;

  // Use save() so the default-address pre-save hook runs.
  const address = await Address.findOne(filter);
  if (!address) return next(new AppError("Address not found", 404));
  Object.assign(address, req.body);
  await address.save();

  res.status(200).json({ status: "success", data: { address } });
});

exports.deleteAddress = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id };
  if (!STAFF.includes(req.user.role)) filter.user = req.user._id;
  const address = await Address.findOneAndDelete(filter);
  if (!address) return next(new AppError("Address not found", 404));
  res.status(204).json({ status: "success", data: null });
});
