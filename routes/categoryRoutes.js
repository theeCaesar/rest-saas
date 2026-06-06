const express = require("express");
const authController = require("../controllers/authController");
const categoryController = require("../controllers/categoryController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.setRestaurantScope);

router
  .route("/")
  .get(categoryController.getAllCategories)
  .post(
    authController.restrictTo("owner", "manager"),
    categoryController.createCategory,
  );

router
  .route("/:id")
  .get(categoryController.getCategory)
  .patch(
    authController.restrictTo("owner", "manager"),
    categoryController.updateCategory,
  )
  .delete(
    authController.restrictTo("owner", "manager"),
    categoryController.deleteCategory,
  );

module.exports = router;
