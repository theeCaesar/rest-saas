const express = require("express");
const authController = require("../controllers/authController");

const router = express.Router();

router.post("/signup/owner", authController.signup("owner"));
router.post("/signup/superadmin", authController.signup("superadmin"));
router.post("/signup/doctor", authController.createDoctor);
router.post("/login", authController.login);

router.use(authController.protect);
router.post("/logout", authController.logout);
router.post(
  "/create-employee",
  authController.restrictTo("owner", "manager"),
  authController.createEmployee,
);
router.post(
  "/create-owner",
  authController.restrictTo("superadmin"),
  authController.createOwner,
);

module.exports = router;
