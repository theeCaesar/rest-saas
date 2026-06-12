const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const reviewSchema = new Schema(
  {
    restaurant: { type: Types.ObjectId, ref: "Restaurant", required: true, index: true },
    author:     { type: Types.ObjectId, ref: "User", required: true },
    authorRole: { type: String, enum: ["customer", "driver", "admin", "manager"], required: true },
    targetType: { type: String, enum: ["meal", "driver", "customer", "order", "subscription"], required: true, index: true },
    targetId:   { type: Types.ObjectId, required: true, index: true },
    rating:     { type: Number, required: true, min: 1, max: 5 },
    comment:    { type: String, trim: true },
    isPublished:{ type: Boolean, default: true },
    isFlagged:  { type: Boolean, default: false },
    flagReason: String,
    order:          { type: Types.ObjectId, ref: "Order" },
    subscriberMeal: { type: Types.ObjectId, ref: "SubscriberMeal" },
    response: {
      text: String,
      respondedBy: { type: Types.ObjectId, ref: "User" },
      respondedAt: Date,
    },
  },
  { timestamps: true }
);

reviewSchema.index({ restaurant: 1, targetType: 1, targetId: 1 });
reviewSchema.index({ restaurant: 1, isPublished: 1, createdAt: -1 });

// Recompute denormalized averages on the target document.
reviewSchema.statics.recomputeAverage = async function (targetType, targetId) {
  const agg = await this.aggregate([
    {
      $match: {
        targetType,
        targetId: new Types.ObjectId(String(targetId)),
        isPublished: true,
      },
    },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const avg   = agg[0] ? +agg[0].avg.toFixed(2) : 0;
  const count = agg[0] ? agg[0].count : 0;

  if (targetType === "meal") {
    await require("./mealModel").findByIdAndUpdate(targetId, {
      averageRating: avg,
      totalRatings: count,
    });
  } else if (targetType === "driver") {
    await require("./driverModel").findByIdAndUpdate(targetId, {
      averageRating: avg,
      totalRatings: count,
    });
  } else if (targetType === "customer") {
    await require("./userModel").findByIdAndUpdate(targetId, {
      ratingAvg: avg,
      ratingCount: count,
    });
  }
};

reviewSchema.post("save", function () {
  this.constructor.recomputeAverage(this.targetType, this.targetId);
});

reviewSchema.post("findOneAndDelete", function (doc) {
  if (doc) doc.constructor.recomputeAverage(doc.targetType, doc.targetId);
});

module.exports = mongoose.model("Review", reviewSchema);
