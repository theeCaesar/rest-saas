const express = require("express");
const authController = require("../controllers/authController");
const activityLogController = require("../controllers/activityLogController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.restrictTo("owner", "manager"));
router.use(authController.setRestaurantScope);

router.get("/", activityLogController.getAllActivityLogs);
router.get("/:id", activityLogController.getActivityLog);

module.exports = router;
