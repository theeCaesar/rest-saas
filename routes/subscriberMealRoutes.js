const express = require("express");
const authController = require("../controllers/authController");
const subscriberMealController = require("../controllers/subscriberMealController");

const router = express.Router();

router.use(authController.protect);

const OPS = ["admin", "manager", "kitchen", "dispatcher", "cashier"];

// Dashboard hero query — today's meals for the tenant.
router.get(
  "/today",
  authController.restrictTo(...OPS, "driver"),
  subscriberMealController.getToday,
);

router
  .route("/")
  .get(
    authController.restrictTo(...OPS, "driver"),
    subscriberMealController.getAllSubscriberMeals,
  )
  .post(
    authController.restrictTo("admin", "manager", "kitchen"),
    subscriberMealController.createSubscriberMeal,
  );

router.patch(
  "/:id/status",
  authController.restrictTo(...OPS, "driver"),
  subscriberMealController.updateStatus,
);

router
  .route("/:id")
  .get(subscriberMealController.getSubscriberMeal)
  .patch(
    authController.restrictTo(...OPS),
    subscriberMealController.updateSubscriberMeal,
  )
  .delete(
    authController.restrictTo("admin", "manager"),
    subscriberMealController.deleteSubscriberMeal,
  );

module.exports = router;
