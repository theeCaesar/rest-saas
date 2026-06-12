const express = require("express");
const authController = require("../controllers/authController");
const conversationController = require("../controllers/conversationController");

const router = express.Router();
router.use(authController.protect);

router.route("/").get(conversationController.getMyConversations).post(conversationController.startConversation);
router.get("/:id/messages",  conversationController.getMessages);
router.post("/:id/messages", conversationController.sendMessage);
router.post("/:id/read",     conversationController.markRead);

module.exports = router;
