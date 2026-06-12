const express = require("express");
const authController = require("../controllers/authController");
const analyticsController = require("../controllers/analyticsController");

const router = express.Router();
router.use(authController.protect);
router.use(authController.restrictTo("admin", "manager"));

router.get("/overview",            analyticsController.overview);
router.get("/employees",           analyticsController.employees);
router.get("/employees/:userId",   analyticsController.employeeDetail);
router.get("/meals",               analyticsController.meals);
router.get("/subscriptions",       analyticsController.subscriptions);
router.get("/delivery",            analyticsController.delivery);
router.get("/revenue",             analyticsController.revenue);

module.exports = router;
