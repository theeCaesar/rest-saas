const express = require("express");
const authController = require("../controllers/authController");
const lossController = require("../controllers/lossController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.setRestaurantScope);

router
  .route("/")
  .get(lossController.getAllLosses)
  .post(lossController.createLoss);

router
  .route("/:id")
  .get(lossController.getLoss)
  .patch(
    authController.restrictTo("owner", "manager"),
    lossController.updateLoss,
  )
  .delete(
    authController.restrictTo("owner", "manager"),
    lossController.deleteLoss,
  );

module.exports = router;
