const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cron = require("node-cron");

dotenv.config({ path: "./config.env" });

const app = require("./app");
const User = require("./models/userModel");
const {
  checkExpiryNotifications,
  checkPaymentDueNotifications,
  applyLatePenalties,
} = require("./utils/notificationChecker");

const DB = process.env.MONGODB_URI || process.env.MONGO_URI;

mongoose
  .connect(DB, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Database connection successful");
  })
  .catch((err) => {
    console.error("Database connection error:", err);
  });

// Cron jobs
// Check expiry and stock notifications every 6 hours
cron.schedule("0 */6 * * *", () => {
  console.log("Running expiry and stock notification check...");
  checkExpiryNotifications();
});

// Check payment due notifications daily at 8 AM
cron.schedule("0 8 * * *", () => {
  console.log("Running payment notification check...");
  checkPaymentDueNotifications();
});

// Apply late penalties daily at midnight
cron.schedule("0 0 * * *", () => {
  console.log("Applying late penalties...");
  applyLatePenalties();
});

// Reset dailyStars for all users every midnight
cron.schedule("0 0 * * *", async () => {
  try {
    await User.updateMany({ dailyStars: { $gt: 0 } }, { dailyStars: 0 });
    console.log("Daily stars reset.");
  } catch (err) {
    console.error("Failed to reset daily stars:", err);
  }
});

// Reset monthlyStars for all users on the 1st of every month at midnight
cron.schedule("0 0 1 * *", async () => {
  try {
    await User.updateMany({ monthlyStars: { $gt: 0 } }, { monthlyStars: 0 });
    console.log("Monthly stars reset.");
  } catch (err) {
    console.error("Failed to reset monthly stars:", err);
  }
});

const port = process.env.PORT || 5000;
const server = app.listen(port, () => {
  console.log(`App running on port ${port} in ${process.env.NODE_ENV} mode`);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
  server.close(() => {
    process.exit(1);
  });
});
