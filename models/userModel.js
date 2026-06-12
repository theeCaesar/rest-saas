const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "A user must have a name"],
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "A user must have a password"],
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: [
        // restaurant-saas roles
        "super_admin",
        "admin",
        "manager",
        "kitchen",
        "dispatcher",
        "cashier",
        "driver",
        "customer",
        // legacy roles kept for backward compatibility
        "superadmin",
        "owner",
        "employee",
        "doctor",
      ],
      default: "customer",
    },
    pfp: String,
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      // Required for every user except platform super-admins, who span all tenants.
      required: [
        function () {
          return this.role !== "super_admin";
        },
        "A user must belong to a restaurant",
      ],
      index: true,
    },
    restaurants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Restaurant",
      },
    ],
    sections: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Section",
      },
    ],
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Meal",
      },
    ],
    totalStars: {
      type: Number,
      default: 0,
    },
    monthlyStars: {
      type: Number,
      default: 0,
    },
    dailyStars: {
      type: Number,
      default: 0,
    },
    totalOrders: {
      type: Number,
      default: 0,
    },
    totalProfit: {
      type: Number,
      default: 0,
    },
    totalOrdersCount: {
      type: Number,
      default: 0,
    },
    isActive:      { type: Boolean, default: true },
    ratingAvg:     { type: Number, default: 0 },
    ratingCount:   { type: Number, default: 0 },
    passwordChangedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

userSchema.index({ email: 1 });
userSchema.index({ restaurant: 1, role: 1 });
userSchema.index({ phone: 1 });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.pre("save", function (next) {
  if (!this.isModified("password") || this.isNew) return next();
  this.passwordChangedAt = Date.now() - 1000;
  next();
});

userSchema.methods.correctPassword = async function (candidate, userPassword) {
  return await bcrypt.compare(candidate, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10,
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

const User = mongoose.model("User", userSchema);
module.exports = User;
