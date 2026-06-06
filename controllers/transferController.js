const Transfer = require("../models/transferModel");
const Meal = require("../models/mealModel");
const Restaurant = require("../models/restaurantModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");
const { logActivity } = require("../utils/activityLogger");

exports.createTransfer = catchAsync(async (req, res, next) => {
  req.body.initiatedBy = req.user._id;

  // deduct from source restaurant meals
  for (const item of req.body.items) {
    const meal = await Meal.findOne({
      _id: item.meal,
      restaurant: req.body.fromRestaurant,
    });
    if (!meal) {
      return next(new AppError(`Meal ${item.meal} not found in source restaurant`, 404));
    }
    if (item.variantId) {
      const variant = meal.variants.id(item.variantId);
      if (!variant || variant.quantityInStock < item.quantity) {
        return next(new AppError(`Insufficient stock for ${meal.name}`, 400));
      }
      variant.quantityInStock -= item.quantity;
    } else {
      if (meal.totalQuantityInStock < item.quantity) {
        return next(new AppError(`Insufficient stock for ${meal.name}`, 400));
      }
      // deduct from first variant with stock
      let remaining = item.quantity;
      for (const v of meal.variants) {
        if (remaining <= 0) break;
        const deduct = Math.min(v.quantityInStock, remaining);
        v.quantityInStock -= deduct;
        remaining -= deduct;
      }
    }
    item.mealName = meal.name;
    item.totalPrice = item.pricePerUnit * item.quantity;
    await meal.save();
  }

  const transfer = await Transfer.create(req.body);

  await logActivity({
    user: req.user._id,
    restaurant: req.body.fromRestaurant,
    action: "transfer",
    entityType: "Transfer",
    entityId: transfer._id,
    description: `Transfer to restaurant ${req.body.toRestaurant} - Value: ${transfer.totalValue}`,
  });

  res.status(201).json({
    status: "success",
    data: { transfer },
  });
});

exports.receiveTransfer = catchAsync(async (req, res, next) => {
  const transfer = await Transfer.findById(req.params.id);
  if (!transfer) return next(new AppError("Transfer not found", 404));
  if (transfer.status !== "pending" && transfer.status !== "in_transit") {
    return next(new AppError("Transfer cannot be received in its current status", 400));
  }

  // add meals to destination restaurant
  for (const item of transfer.items) {
    let destMeal = await Meal.findOne({
      restaurant: transfer.toRestaurant,
      name: item.mealName,
    });

    if (!destMeal) {
      const srcMeal = await Meal.findById(item.meal).lean();
      destMeal = await Meal.create({
        name: item.mealName,
        restaurant: transfer.toRestaurant,
        barcode: srcMeal?.barcode,
        genericName: srcMeal?.genericName,
        category: srcMeal?.category,
        manufacturer: srcMeal?.manufacturer,
        dosageForm: srcMeal?.dosageForm,
        strength: srcMeal?.strength,
        piecesPerPack: srcMeal?.piecesPerPack || 1,
        recommendedSellingPrice: srcMeal?.recommendedSellingPrice,
        recommendedPiecePrice: srcMeal?.recommendedPiecePrice,
      });
    }

    destMeal.variants.push({
      originalPrice: item.pricePerUnit,
      recommendedSellingPrice: destMeal.recommendedSellingPrice,
      quantityInStock: item.quantity,
    });
    await destMeal.save();
  }

  transfer.status = "received";
  transfer.receivedBy = req.user._id;
  transfer.receivedAt = new Date();
  await transfer.save();

  // update restaurant stats
  await Restaurant.findByIdAndUpdate(transfer.fromRestaurant, {
    $inc: { totalRevenue: transfer.totalValue },
  });

  await logActivity({
    user: req.user._id,
    restaurant: transfer.toRestaurant,
    action: "transfer",
    entityType: "Transfer",
    entityId: transfer._id,
    description: `Received transfer from restaurant ${transfer.fromRestaurant}`,
  });

  res.status(200).json({
    status: "success",
    data: { transfer },
  });
});

exports.getAllTransfers = factory.getAll(Transfer, "transfers");
exports.getTransfer = factory.getOne(
  Transfer,
  [
    { path: "fromRestaurant", select: "name" },
    { path: "toRestaurant", select: "name" },
    { path: "initiatedBy", select: "name" },
    { path: "receivedBy", select: "name" },
    { path: "items.meal", select: "name barcode" },
  ],
  "transfer",
);
exports.updateTransfer = factory.updateOne(Transfer, "transfer");
exports.deleteTransfer = factory.deleteOne(Transfer, "transfer");
