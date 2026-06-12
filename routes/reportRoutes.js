const express = require("express");
const authController = require("../controllers/authController");
const reportController = require("../controllers/reportController");

const router = express.Router();
router.use(authController.protect);
router.use(authController.restrictTo("admin", "manager"));

router.route("/").get(reportController.getReports);
router.post("/generate", reportController.generateReport);
router.route("/:id").get(reportController.getReport).delete(reportController.deleteReport);

module.exports = router;
