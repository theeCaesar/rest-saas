const express = require("express");
const authController = require("../controllers/authController");
const taskController = require("../controllers/taskController");

const router = express.Router();

router.use(authController.protect);
router.use(authController.setRestaurantScope);

router.get("/my-tasks", taskController.getMyTasks);
router.patch("/:id/complete", taskController.completeTask);

router
  .route("/")
  .get(
    authController.restrictTo("owner", "manager"),
    taskController.getAllTasks,
  )
  .post(
    authController.restrictTo("owner", "manager"),
    taskController.createTask,
  );

router
  .route("/:id")
  .get(taskController.getTask)
  .patch(
    authController.restrictTo("owner", "manager"),
    taskController.updateTask,
  )
  .delete(
    authController.restrictTo("owner", "manager"),
    taskController.deleteTask,
  );

module.exports = router;
