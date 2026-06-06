const multer = require("multer");
const path = require("path");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { uploadBuffer, deleteByKey, deleteByUrl } = require("../utils/r2");

const storage = multer.memoryStorage();

const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new AppError("Please upload only images.", 400), false);
  }
};

const upload = multer({ storage, fileFilter: imageFilter });

exports.uploadImage = [
  upload.single("image"),
  catchAsync(async (req, res, next) => {
    if (!req.file) {
      return next(new AppError("No image provided", 400));
    }
    const ext = path.extname(req.file.originalname).toLowerCase() || ".jpeg";
    const fileName = `img-${Date.now()}${ext}`;
    const key = `images/${fileName}`;
    const { url } = await uploadBuffer(req.file.buffer, key, req.file.mimetype);
    res.status(201).json({
      status: "success",
      data: {
        url,
        name: fileName,
        key,
      },
    });
  }),
];

exports.deleteImage = catchAsync(async (req, res, next) => {
  const { name } = req.params;
  if (!name) return next(new AppError("Image name is required", 400));
  const key = `images/${name}`;
  await deleteByKey(key);
  res.status(204).json({ status: "success", data: null });
});

exports.uploadImages = [
  upload.array("images", 20),
  catchAsync(async (req, res, next) => {
    if (!req.files || req.files.length === 0) {
      return next(new AppError("No images provided", 400));
    }
    const results = [];
    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpeg";
      const fileName = `img-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
      const key = `images/${fileName}`;
      const { url } = await uploadBuffer(file.buffer, key, file.mimetype);
      results.push({ url, name: fileName, key });
    }
    res.status(201).json({
      status: "success",
      data: {
        images: results,
      },
    });
  }),
];

exports.deleteImages = catchAsync(async (req, res, next) => {
  const { names } = req.body;
  if (!names || !Array.isArray(names) || names.length === 0) {
    return next(new AppError("Names array is required", 400));
  }
  await Promise.all(names.map((name) => deleteByKey(`images/${name}`)));
  res.status(204).json({ status: "success", data: null });
});
