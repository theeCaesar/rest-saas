const express = require("express");
const authController = require("../controllers/authController");
const authLogController = require("../controllers/authLogController");

const router = express.Router();

router.use(authController.protect);

router.get("/my-logs", authLogController.getMyAuthLogs);

router.use(authController.restrictTo("owner", "manager"));
router.use(authController.setRestaurantScope);

router.get("/", authLogController.getAllAuthLogs);
router.get("/employee/:employeeId", authLogController.getEmployeeAuthLogs);

module.exports = router;
