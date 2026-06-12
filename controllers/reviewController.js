const Review = require("../models/reviewModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

const POPULATE = [
  { path: "author", select: "name role" },
  { path: "response.respondedBy", select: "name" },
];

const STAFF = ["admin", "manager"];

// GET /api/v1/reviews?targetType=&targetId=&page=&limit=
exports.getReviews = catchAsync(async (req, res, next) => {
  const filter = { restaurant: req.restaurantId, isPublished: true };
  if (req.query.targetType) filter.targetType = req.query.targetType;
  if (req.query.targetId)   filter.targetId   = req.query.targetId;

  const page  = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  const [reviews, total] = await Promise.all([
    Review.find(filter).populate(POPULATE).sort("-createdAt").skip((page - 1) * limit).limit(limit),
    Review.countDocuments(filter),
  ]);
  res.status(200).json({ status: "success", results: reviews.length, total, data: { reviews } });
});

// GET /api/v1/reviews/meal/:mealId
exports.getMealReviews = catchAsync(async (req, res, next) => {
  const reviews = await Review.find({
    restaurant: req.restaurantId,
    targetType: "meal",
    targetId: req.params.mealId,
    isPublished: true,
  }).populate(POPULATE).sort("-createdAt");
  res.status(200).json({ status: "success", results: reviews.length, data: { reviews } });
});

// GET /api/v1/reviews/driver/:driverId
exports.getDriverReviews = catchAsync(async (req, res, next) => {
  const reviews = await Review.find({
    restaurant: req.restaurantId,
    targetType: "driver",
    targetId: req.params.driverId,
    isPublished: true,
  }).populate(POPULATE).sort("-createdAt");
  res.status(200).json({ status: "success", results: reviews.length, data: { reviews } });
});

// POST /api/v1/reviews
exports.createReview = catchAsync(async (req, res, next) => {
  const { targetType, targetId, rating, comment, order, subscriberMeal } = req.body;
  if (!targetType || !targetId || !rating) {
    return next(new AppError("targetType, targetId, and rating are required", 400));
  }
  const role = req.user.role;
  const authorRole = STAFF.includes(role) ? role : role === "driver" ? "driver" : "customer";

  const review = await Review.create({
    restaurant: req.restaurantId,
    author: req.user._id,
    authorRole,
    targetType,
    targetId,
    rating,
    comment,
    order,
    subscriberMeal,
  });
  res.status(201).json({ status: "success", data: { review } });
});

// PATCH /api/v1/reviews/:id — edit own review or admin moderation
exports.updateReview = catchAsync(async (req, res, next) => {
  const review = await Review.findOne({ _id: req.params.id, restaurant: req.restaurantId });
  if (!review) return next(new AppError("Review not found", 404));

  const isAdmin  = STAFF.includes(req.user.role);
  const isAuthor = String(review.author) === String(req.user._id);
  if (!isAdmin && !isAuthor) return next(new AppError("Not authorised to update this review", 403));

  if (!isAdmin) {
    if (req.body.rating  !== undefined) review.rating  = req.body.rating;
    if (req.body.comment !== undefined) review.comment = req.body.comment;
  } else {
    ["rating", "comment", "isPublished", "isFlagged", "flagReason"].forEach((k) => {
      if (req.body[k] !== undefined) review[k] = req.body[k];
    });
  }
  await review.save();
  res.status(200).json({ status: "success", data: { review } });
});

// POST /api/v1/reviews/:id/respond — admin/manager response
exports.respondToReview = catchAsync(async (req, res, next) => {
  const { text } = req.body;
  if (!text) return next(new AppError("Response text is required", 400));

  const review = await Review.findOneAndUpdate(
    { _id: req.params.id, restaurant: req.restaurantId },
    { response: { text, respondedBy: req.user._id, respondedAt: new Date() } },
    { new: true, runValidators: true },
  );
  if (!review) return next(new AppError("Review not found", 404));
  res.status(200).json({ status: "success", data: { review } });
});

// POST /api/v1/reviews/:id/flag
exports.flagReview = catchAsync(async (req, res, next) => {
  const review = await Review.findOneAndUpdate(
    { _id: req.params.id, restaurant: req.restaurantId },
    { isFlagged: true, flagReason: req.body.reason },
    { new: true },
  );
  if (!review) return next(new AppError("Review not found", 404));
  res.status(200).json({ status: "success", data: { review } });
});

// DELETE /api/v1/reviews/:id — author or admin
exports.deleteReview = catchAsync(async (req, res, next) => {
  const isAdmin = STAFF.includes(req.user.role);
  const filter  = { _id: req.params.id, restaurant: req.restaurantId };
  if (!isAdmin) filter.author = req.user._id;

  const review = await Review.findOneAndDelete(filter);
  if (!review) return next(new AppError("Review not found or not authorised", 404));
  res.status(204).json({ status: "success", data: null });
});
