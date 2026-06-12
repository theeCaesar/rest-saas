// TODO Phase 2 (post-contract): driver app sends real GPS + Socket.IO broadcast.
// For now positions are set via seed/manual update and the map polls.
const Driver = require("../models/driverModel");
const DriverLocation = require("../models/driverLocationModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

// GET /api/v1/driver-locations — all current positions for the ops map
exports.getAllLocations = catchAsync(async (req, res, next) => {
  const locations = await DriverLocation.find({ restaurant: req.restaurantId })
    .populate("driver", "name phone isActive averageRating")
    .populate("activeDeliveries", "status scheduledTime user");
  res.status(200).json({ status: "success", results: locations.length, data: { locations } });
});

// GET /api/v1/driver-locations/:driverId
exports.getDriverLocation = catchAsync(async (req, res, next) => {
  const loc = await DriverLocation.findOne({
    restaurant: req.restaurantId,
    driver: req.params.driverId,
  })
    .populate("driver", "name phone averageRating")
    .populate("activeDeliveries");
  if (!loc) return next(new AppError("Driver location not found", 404));
  res.status(200).json({ status: "success", data: { location: loc } });
});

// POST /api/v1/driver-locations/update — driver app upserts its own position
exports.updateLocation = catchAsync(async (req, res, next) => {
  const { lat, lng, heading, speed, status, activeDeliveries, driverId } = req.body;
  if (lat == null || lng == null) return next(new AppError("lat and lng are required", 400));

  // Resolve Driver doc — accept explicit driverId or look up by user name
  const driverQuery = driverId
    ? { _id: driverId, restaurant: req.restaurantId }
    : { restaurant: req.restaurantId, name: req.user.name };
  const driver = await Driver.findOne(driverQuery);
  if (!driver) return next(new AppError("Driver not found", 404));

  const location = await DriverLocation.findOneAndUpdate(
    { restaurant: req.restaurantId, driver: driver._id },
    {
      location: { lat, lng },
      heading,
      speed,
      status,
      activeDeliveries: activeDeliveries || [],
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.status(200).json({ status: "success", data: { location } });
});
