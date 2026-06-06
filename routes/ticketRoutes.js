const express = require("express");
const authController = require("../controllers/authController");
const ticketController = require("../controllers/ticketController");

const router = express.Router();

router.use(authController.protect);

router
  .route("/")
  .get(ticketController.getAllTickets)
  .post(ticketController.createTicket);

router.post("/:id/messages", ticketController.addMessage);

router
  .route("/:id")
  .get(ticketController.getTicket)
  .patch(ticketController.updateTicket)
  .delete(
    authController.restrictTo("admin", "manager"),
    ticketController.deleteTicket,
  );

module.exports = router;
