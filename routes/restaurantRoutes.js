const express = require("express");
const authController = require("../controllers/authController");
const restaurantController = require("../controllers/restaurantController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.restrictTo("owner"));

router
  .route("/")
  .get(restaurantController.getMyRestaurants)
  .post(restaurantController.createRestaurant);

router
  .route("/:id")
  .get(restaurantController.getRestaurant)
  .patch(restaurantController.updateRestaurant)
  .delete(restaurantController.deleteRestaurant);

module.exports = router;
