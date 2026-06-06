const express = require("express");
const authController = require("../controllers/authController");
const planController = require("../controllers/planController");

const router = express.Router();

// Public reads — customers browse plans before subscribing (tenant resolved
// from the x-tenant header / subdomain by the global tenant gate).
router.get("/", planController.getAllPlans);
router.get("/:id", planController.getPlan);

// Management — restaurant staff only.
router.use(authController.protect);

router.post(
  "/",
  authController.restrictTo("admin", "manager"),
  planController.createPlan,
);
router.patch(
  "/:id",
  authController.restrictTo("admin", "manager"),
  planController.updatePlan,
);
router.delete(
  "/:id",
  authController.restrictTo("admin"),
  planController.deletePlan,
);

module.exports = router;
