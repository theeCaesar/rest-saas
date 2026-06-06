const express = require("express");
const authController = require("../controllers/authController");
const driverController = require("../controllers/driverController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.setRestaurantScope);

router
  .route("/")
  .get(driverController.getAllDrivers)
  .post(
    authController.restrictTo("owner", "manager"),
    driverController.createDriver,
  );

router
  .route("/:id")
  .get(driverController.getDriver)
  .patch(
    authController.restrictTo("owner", "manager"),
    driverController.updateDriver,
  )
  .delete(
    authController.restrictTo("owner", "manager"),
    driverController.deleteDriver,
  );

module.exports = router;
