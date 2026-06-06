const express = require("express");
const authController = require("../controllers/authController");
const statsController = require("../controllers/statsController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.setRestaurantScope);

router.get(
  "/dashboard",
  authController.restrictTo("owner", "manager"),
  statsController.getDashboardStats,
);

router.get(
  "/24h",
  authController.restrictTo("owner", "manager"),
  statsController.get24HourStats,
);

router.get(
  "/employees",
  authController.restrictTo("owner", "manager"),
  statsController.getEmployeeStats,
);

router.get(
  "/meals",
  authController.restrictTo("owner", "manager"),
  statsController.getMealStats,
);

router.get(
  "/profit",
  authController.restrictTo("owner", "manager"),
  statsController.getProfitAnalysis,
);

router.get(
  "/urgent-meals",
  statsController.getUrgentMeals,
);

module.exports = router;
