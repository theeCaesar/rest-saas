const express = require("express");
const authController = require("../controllers/authController");
const notificationController = require("../controllers/notificationController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.setRestaurantScope);

router.get("/", notificationController.getNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.patch("/mark-all-read", notificationController.markAllAsRead);
router.patch("/:id/read", notificationController.markAsRead);
router.delete("/:id", notificationController.deleteNotification);

module.exports = router;
