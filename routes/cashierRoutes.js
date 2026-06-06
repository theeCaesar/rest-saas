const express = require("express");
const authController = require("../controllers/authController");
const cashierController = require("../controllers/cashierController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.setRestaurantScope);

router
  .route("/")
  .get(cashierController.getAllCashiers)
  .post(
    authController.restrictTo("owner", "manager"),
    cashierController.createCashier,
  );

router
  .route("/:id")
  .get(cashierController.getCashier)
  .patch(
    authController.restrictTo("owner", "manager"),
    cashierController.updateCashier,
  )
  .delete(
    authController.restrictTo("owner", "manager"),
    cashierController.deleteCashier,
  );

module.exports = router;
