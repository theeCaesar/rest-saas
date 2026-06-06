const Loss = require("../models/lossModel");
const Meal = require("../models/mealModel");
const Restaurant = require("../models/restaurantModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");
const { logActivity } = require("../utils/activityLogger");

exports.createLoss = catchAsync(async (req, res, next) => {
  if (!req.body.restaurant) req.body.restaurant = req.restaurantScope;
  req.body.recordedBy = req.user._id;

  // if expired meal loss, deactivate variant
  if (req.body.lossType === "expired" && req.body.meal && req.body.variantId) {
    const meal = await Meal.findById(req.body.meal);
    if (meal) {
      const variant = meal.variants.id(req.body.variantId);
      if (variant) {
        if (req.body.quantity) {
          variant.quantityInStock = Math.max(0, variant.quantityInStock - req.body.quantity);
        } else {
          variant.isActive = false;
        }
        await meal.save();
      }
    }
  }

  const loss = await Loss.create(req.body);

  await Restaurant.findByIdAndUpdate(req.body.restaurant, {
    $inc: { totalLosses: loss.amount },
  });

  await logActivity({
    user: req.user._id,
    restaurant: req.body.restaurant,
    action: "loss_record",
    entityType: "Loss",
    entityId: loss._id,
    description: `Loss recorded: ${loss.lossType} - ${loss.amount}`,
  });

  res.status(201).json({
    status: "success",
    data: { loss },
  });
});

exports.getAllLosses = factory.getAll(Loss, "losses", ["description"]);
exports.getLoss = factory.getOne(
  Loss,
  [
    { path: "meal", select: "name" },
    { path: "recordedBy", select: "name" },
  ],
  "loss",
);
exports.updateLoss = factory.updateOne(Loss, "loss");
exports.deleteLoss = factory.deleteOne(Loss, "loss");
