const express = require("express");
const authController = require("../controllers/authController");
const clientController = require("../controllers/clientController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.setRestaurantScope);

router
  .route("/")
  .get(clientController.getAllClients)
  .post(clientController.createClient);

router.get(
  "/search-by-meal/:mealId",
  clientController.searchClientsByMeal,
);

router
  .route("/:id")
  .get(clientController.getClient)
  .patch(clientController.updateClient)
  .delete(
    authController.restrictTo("owner", "manager"),
    clientController.deleteClient,
  );

router.get("/:id/profile", clientController.getClientProfile);

module.exports = router;
