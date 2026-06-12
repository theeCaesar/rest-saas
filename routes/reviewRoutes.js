const express = require("express");
const authController = require("../controllers/authController");
const reviewController = require("../controllers/reviewController");

const router = express.Router();

router.use(authController.protect);

// Convenience lookups — public within tenant
router.get("/meal/:mealId",     reviewController.getMealReviews);
router.get("/driver/:driverId", reviewController.getDriverReviews);

router
  .route("/")
  .get(reviewController.getReviews)
  .post(reviewController.createReview);

router.patch("/:id", reviewController.updateReview);
router.post("/:id/respond", authController.restrictTo("admin", "manager"), reviewController.respondToReview);
router.post("/:id/flag",    reviewController.flagReview);
router.delete("/:id",       reviewController.deleteReview);

module.exports = router;
