const mongoose = require("mongoose");

const authLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
    },
    action: {
      type: String,
      enum: ["login", "logout"],
      required: true,
    },
    ipAddress: String,
    userAgent: String,
    sessionDuration: Number,
    loginAt: Date,
    logoutAt: Date,
  },
  {
    timestamps: true,
  },
);

authLogSchema.index({ user: 1, createdAt: -1 });
authLogSchema.index({ restaurant: 1, createdAt: -1 });
// Supports logout query: findOne({ user, action: 'login' }).sort({ createdAt: -1 })
authLogSchema.index({ user: 1, action: 1, createdAt: -1 });

const AuthLog = mongoose.model("AuthLog", authLogSchema);
module.exports = AuthLog;
