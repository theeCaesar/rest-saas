const express = require("express");
const uploadController = require("../controllers/uploadController");
const authController = require("../controllers/authController");

const router = express.Router();

router.use(authController.protect);

router.post(
  "/image",
  authController.restrictTo("owner", "manager", "employee", "doctor"),
  uploadController.uploadImage,
);
router.delete(
  "/image/:name",
  authController.restrictTo("owner", "manager", "employee", "doctor"),
  uploadController.deleteImage,
);

router.post(
  "/images",
  authController.restrictTo("owner", "manager", "employee", "doctor"),
  uploadController.uploadImages,
);
router.delete(
  "/images",
  authController.restrictTo("owner", "manager", "employee", "doctor"),
  uploadController.deleteImages,
);

module.exports = router;
