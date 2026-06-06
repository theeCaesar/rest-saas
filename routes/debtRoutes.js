const express = require("express");
const authController = require("../controllers/authController");
const debtController = require("../controllers/debtController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.setRestaurantScope);

router.get("/", debtController.getAllDebts);
router.get(
  "/summary",
  authController.restrictTo("owner", "manager"),
  debtController.getDebtSummary,
);

router
  .route("/:id")
  .get(debtController.getDebt)
  .delete(
    authController.restrictTo("owner", "manager"),
    debtController.deleteDebt,
  );

router.patch(
  "/:id/payment",
  authController.restrictTo("owner", "manager"),
  debtController.makePayment,
);

module.exports = router;
