const express = require("express");
const authController = require("../controllers/authController");
const subscriptionController = require("../controllers/subscriptionController");

const router = express.Router();

router.use(authController.protect);

// Current user's subscriptions
router.get("/me", subscriptionController.getMySubscription);

const STAFF = ["admin", "manager", "cashier", "dispatcher"];

router
  .route("/")
  .get(
    authController.restrictTo(...STAFF),
    subscriptionController.getAllSubscriptions,
  )
  .post(subscriptionController.createSubscription);

router
  .route("/:id")
  .get(subscriptionController.getSubscription)
  .patch(
    authController.restrictTo(...STAFF),
    subscriptionController.updateSubscription,
  )
  .delete(
    authController.restrictTo("admin", "manager"),
    subscriptionController.deleteSubscription,
  );

router.post("/:id/pause", subscriptionController.pauseSubscription);
router.post("/:id/resume", subscriptionController.resumeSubscription);
router.post("/:id/cancel", subscriptionController.cancelSubscription);

module.exports = router;
