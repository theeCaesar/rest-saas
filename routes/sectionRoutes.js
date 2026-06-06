const express = require("express");
const authController = require("../controllers/authController");
const sectionController = require("../controllers/sectionController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.setRestaurantScope);

router
  .route("/")
  .get(sectionController.getAllSections)
  .post(
    authController.restrictTo("owner", "manager"),
    sectionController.createSection,
  );

router
  .route("/:id")
  .get(sectionController.getSection)
  .patch(
    authController.restrictTo("owner", "manager"),
    sectionController.updateSection,
  )
  .delete(
    authController.restrictTo("owner", "manager"),
    sectionController.deleteSection,
  );

router.patch(
  "/:id/assign-employee",
  authController.restrictTo("owner", "manager"),
  sectionController.assignEmployee,
);

router.patch(
  "/:id/remove-employee",
  authController.restrictTo("owner", "manager"),
  sectionController.removeEmployee,
);

module.exports = router;
