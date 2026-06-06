const express = require("express");
const authController = require("../controllers/authController");
const stockOrderController = require("../controllers/stockOrderController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.setRestaurantScope);

router
  .route("/")
  .get(stockOrderController.getAllStockOrders)
  .post(
    authController.restrictTo("owner", "manager"),
    stockOrderController.createStockOrder,
  );

router
  .route("/:id")
  .get(stockOrderController.getStockOrder)
  .patch(
    authController.restrictTo("owner", "manager"),
    stockOrderController.updateStockOrder,
  )
  .delete(
    authController.restrictTo("owner", "manager"),
    stockOrderController.deleteStockOrder,
  );

router.patch(
  "/:id/receive",
  authController.restrictTo("owner", "manager"),
  stockOrderController.receiveOrder,
);

router.patch(
  "/:id/payment",
  authController.restrictTo("owner", "manager"),
  stockOrderController.makePayment,
);

module.exports = router;
