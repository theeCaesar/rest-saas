const express = require("express");
const authController = require("../controllers/authController");
const supplierController = require("../controllers/supplierController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.setRestaurantScope);

router
  .route("/")
  .get(supplierController.getAllSuppliers)
  .post(
    authController.restrictTo("owner", "manager"),
    supplierController.createSupplier,
  );

router
  .route("/:id")
  .get(supplierController.getSupplier)
  .patch(
    authController.restrictTo("owner", "manager"),
    supplierController.updateSupplier,
  )
  .delete(
    authController.restrictTo("owner", "manager"),
    supplierController.deleteSupplier,
  );

module.exports = router;
