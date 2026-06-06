const express = require("express");
const authController = require("../controllers/authController");
const employeeRecordController = require("../controllers/employeeRecordController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.restrictTo("owner", "manager"));
router.use(authController.setRestaurantScope);

router
  .route("/")
  .get(employeeRecordController.getAllRecords)
  .post(employeeRecordController.createRecord);

router.get("/employee/:employeeId", employeeRecordController.getEmployeeRecords);

router
  .route("/:id")
  .get(employeeRecordController.getRecord)
  .patch(employeeRecordController.updateRecord)
  .delete(employeeRecordController.deleteRecord);

module.exports = router;
