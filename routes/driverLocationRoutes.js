const express = require("express");
const authController = require("../controllers/authController");
const driverLocationController = require("../controllers/driverLocationController");

const router = express.Router();
router.use(authController.protect);

router.get(
  "/",
  authController.restrictTo("admin", "manager", "dispatcher"),
  driverLocationController.getAllLocations,
);
router.post(
  "/update",
  authController.restrictTo("driver", "admin", "manager"),
  driverLocationController.updateLocation,
);
router.get(
  "/:driverId",
  authController.restrictTo("admin", "manager", "dispatcher"),
  driverLocationController.getDriverLocation,
);

module.exports = router;
