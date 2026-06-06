const express = require("express");
const authController = require("../controllers/authController");
const branchController = require("../controllers/branchController");

const router = express.Router();

// Public reads — customers can see branch locations / hours.
router.get("/", branchController.getAllBranches);
router.get("/:id", branchController.getBranch);

router.use(authController.protect);

router.post(
  "/",
  authController.restrictTo("admin", "manager"),
  branchController.createBranch,
);
router.patch(
  "/:id",
  authController.restrictTo("admin", "manager"),
  branchController.updateBranch,
);
router.delete(
  "/:id",
  authController.restrictTo("admin"),
  branchController.deleteBranch,
);

module.exports = router;
