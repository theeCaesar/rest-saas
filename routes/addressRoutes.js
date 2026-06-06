const express = require("express");
const authController = require("../controllers/authController");
const addressController = require("../controllers/addressController");

const router = express.Router();

router.use(authController.protect);

router
  .route("/")
  .get(addressController.getAllAddresses)
  .post(addressController.createAddress);

router
  .route("/:id")
  .get(addressController.getAddress)
  .patch(addressController.updateAddress)
  .delete(addressController.deleteAddress);

module.exports = router;
