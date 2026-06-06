const express = require("express");
const authController = require("../controllers/authController");
const invoiceController = require("../controllers/invoiceController");

const router = express.Router();

router.use(authController.protect);

router
  .route("/")
  .get(invoiceController.getAllInvoices)
  .post(
    authController.restrictTo("admin", "manager", "cashier"),
    invoiceController.createInvoice,
  );

router.get("/:id", invoiceController.getInvoice);

router.patch(
  "/:id/pay",
  authController.restrictTo("admin", "manager", "cashier"),
  invoiceController.markInvoicePaid,
);

module.exports = router;
