const Restaurant = require("../models/restaurantModel");
const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");

exports.createRestaurant = catchAsync(async (req, res, next) => {
  req.body.owner = req.user._id;
  const restaurant = await Restaurant.create(req.body);
  await User.findByIdAndUpdate(req.user._id, {
    $addToSet: { restaurants: restaurant._id },
  });
  if (!req.user.restaurant) {
    await User.findByIdAndUpdate(req.user._id, { restaurant: restaurant._id });
  }
  res.status(201).json({
    status: "success",
    data: { restaurant },
  });
});

exports.getMyRestaurants = catchAsync(async (req, res, next) => {
  const restaurants = await Restaurant.find({ owner: req.user._id }).lean();
  res.status(200).json({
    status: "success",
    results: restaurants.length,
    data: { restaurants },
  });
});

exports.getRestaurant = factory.getOne(Restaurant, { path: "owner", select: "name email" }, "restaurant");
exports.updateRestaurant = factory.updateOne(Restaurant, "restaurant");
exports.deleteRestaurant = factory.deleteOne(Restaurant, "restaurant");
exports.getAllRestaurants = factory.getAll(Restaurant, "restaurants");
