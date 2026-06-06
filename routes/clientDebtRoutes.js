const express = require("express");
const authController = require("../controllers/authController");
const clientDebtController = require("../controllers/clientDebtController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.setRestaurantScope);

router.get(
  "/summary",
  authController.restrictTo("owner", "manager"),
  clientDebtController.getClientDebtSummary,
);

router
  .route("/")
  .get(clientDebtController.getAllClientDebts)
  .post(
    authController.restrictTo("owner", "manager", "employee"),
    clientDebtController.createClientDebt,
  );

router
  .route("/:id")
  .get(clientDebtController.getClientDebt)
  .delete(
    authController.restrictTo("owner", "manager"),
    clientDebtController.deleteClientDebt,
  );

router.patch(
  "/:id/payment",
  authController.restrictTo("owner", "manager", "employee"),
  clientDebtController.makePayment,
);

module.exports = router;
