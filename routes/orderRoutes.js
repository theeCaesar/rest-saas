const express = require("express");
const authController = require("../controllers/authController");
const orderController = require("../controllers/orderController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.setRestaurantScope);

router
  .route("/")
  .get(orderController.getAllOrders)
  .post(orderController.createOrder);

router.get("/my-orders", orderController.getMyOrders);

router
  .route("/:id")
  .get(orderController.getOrder)
  .delete(
    authController.restrictTo("owner", "manager"),
    orderController.deleteOrder,
  );

router.get("/:id/returns", orderController.getOrderReturns);

router.post(
  "/:id/return",
  authController.restrictTo("owner", "manager", "employee"),
  orderController.returnOrder,
);

module.exports = router;
