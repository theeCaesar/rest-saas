const express = require("express");
const authController = require("../controllers/authController");
const mealController = require("../controllers/mealController");

const router = express.Router();

// Public reads — customers browse the menu (tenant resolved by the gate).
router.get("/", mealController.getAllMeals);
router.get("/:id", mealController.getMeal);

// Management — restaurant staff only.
router.use(authController.protect);

router.post(
  "/",
  authController.restrictTo("admin", "manager"),
  mealController.createMeal,
);
router.patch(
  "/:id",
  authController.restrictTo("admin", "manager"),
  mealController.updateMeal,
);
router.delete(
  "/:id",
  authController.restrictTo("admin"),
  mealController.deleteMeal,
);

module.exports = router;
