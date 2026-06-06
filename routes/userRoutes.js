const express = require("express");
const authController = require("../controllers/authController");
const userController = require("../controllers/userController");

const router = express.Router();

router.use(authController.protect);

router.get("/me", userController.getMe, userController.getUser);
router.get("/my-profile", userController.getMyProfile);
router.patch("/updateMe", userController.updateMe);

router.use(authController.restrictTo("owner", "manager"));
router.use(authController.setRestaurantScope);

router.route("/").get(userController.getAllUsers);
router
  .route("/:id")
  .get(userController.getUser)
  .patch(userController.updateUser)
  .delete(userController.deleteUser);

router.get("/:id/profile", userController.getEmployeeProfile);

module.exports = router;
