const express = require("express");
const authController = require("../controllers/authController");
const transferController = require("../controllers/transferController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.restrictTo("owner", "manager"));
router.use(authController.setRestaurantScope);

router
  .route("/")
  .get(transferController.getAllTransfers)
  .post(transferController.createTransfer);

router
  .route("/:id")
  .get(transferController.getTransfer)
  .patch(transferController.updateTransfer)
  .delete(transferController.deleteTransfer);

router.patch("/:id/receive", transferController.receiveTransfer);

module.exports = router;
