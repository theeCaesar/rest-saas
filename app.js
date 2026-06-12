const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");

const AppError = require("./utils/appError");
const globalErrorHandler = require("./middlewares/errorMiddleware");
const {
  resolveTenant,
  scopeQueryToTenant,
} = require("./middlewares/tenantMiddleware");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const restaurantRoutes = require("./routes/restaurantRoutes");
const sectionRoutes = require("./routes/sectionRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const cashierRoutes = require("./routes/cashierRoutes");
const driverRoutes = require("./routes/driverRoutes");
const mealRoutes = require("./routes/mealRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const stockOrderRoutes = require("./routes/stockOrderRoutes");
const clientRoutes = require("./routes/clientRoutes");
const orderRoutes = require("./routes/orderRoutes");
const taskRoutes = require("./routes/taskRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const lossRoutes = require("./routes/lossRoutes");
const transferRoutes = require("./routes/transferRoutes");
const employeeRecordRoutes = require("./routes/employeeRecordRoutes");
const debtRoutes = require("./routes/debtRoutes");
const clientDebtRoutes = require("./routes/clientDebtRoutes");
const authLogRoutes = require("./routes/authLogRoutes");
const activityLogRoutes = require("./routes/activityLogRoutes");
const statsRoutes = require("./routes/statsRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const planRoutes = require("./routes/planRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const branchRoutes = require("./routes/branchRoutes");
const addressRoutes = require("./routes/addressRoutes");
const subscriberMealRoutes = require("./routes/subscriberMealRoutes");
const ticketRoutes = require("./routes/ticketRoutes");

const app = express();

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// TODO: replace `yourdomain.io` with the real platform domain once chosen.
const allowedOrigins = [
  /^https:\/\/.*\.yourdomain\.io$/, // any subdomain of your platform domain
  /^https:\/\/.*\.onrender\.com$/, // Render preview deploys
  /^https:\/\/.*\.vercel\.app$/, // Vercel deploys for frontend
  /^http:\/\/localhost:\d+$/, // any localhost port in local dev (3000/3001/5173/…)
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const ok = allowedOrigins.some((o) =>
        o instanceof RegExp ? o.test(origin) : o === origin,
      );
      callback(ok ? null : new Error("CORS blocked"), ok);
    },
    credentials: true,
    exposedHeaders: ["x-tenant"],
  }),
);

// Rate limiting — 200 requests per 15 minutes per IP
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { status: "fail", message: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
// Sanitize against NoSQL query injection (e.g. { "$gt": "" })
app.use(mongoSanitize());
// Strip HTML tags from req.body / req.query / req.params
app.use(xss());

// Health check — unauthenticated, no tenant required
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date(),
    version: "1.0.0",
  });
});

// ─── Multi-tenant gate ────────────────────────────────────────────────────
// Resolve the tenant for every /api/v1 request except the public / auth-entry
// and cross-tenant super-admin endpoints. Paths below are relative to the
// "/api/v1" mount point.
app.use("/api/v1", (req, res, next) => {
  const p = req.path;
  const exempt =
    p === "/auth/login" ||
    // /auth/register is intentionally NOT exempt: a customer registers under a
    // specific tenant, so resolveTenant must set req.restaurantId for it.
    p === "/auth/forgot-password" ||
    p === "/auth/reset-password" ||
    p === "/public" ||
    p.startsWith("/public/") ||
    p === "/super-admin" ||
    p.startsWith("/super-admin/");
  if (exempt) return next();
  return resolveTenant(req, res, (err) =>
    err ? next(err) : scopeQueryToTenant(req, res, next),
  );
});

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/restaurants", restaurantRoutes);
app.use("/api/v1/sections", sectionRoutes);
app.use("/api/v1/suppliers", supplierRoutes);
app.use("/api/v1/cashiers", cashierRoutes);
app.use("/api/v1/drivers", driverRoutes);
app.use("/api/v1/meals", mealRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/stock-orders", stockOrderRoutes);
app.use("/api/v1/clients", clientRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/tasks", taskRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/losses", lossRoutes);
app.use("/api/v1/transfers", transferRoutes);
app.use("/api/v1/employee-records", employeeRecordRoutes);
app.use("/api/v1/debts", debtRoutes);
app.use("/api/v1/client-debts", clientDebtRoutes);
app.use("/api/v1/auth-logs", authLogRoutes);
app.use("/api/v1/activity-logs", activityLogRoutes);
app.use("/api/v1/stats", statsRoutes);
app.use("/api/v1/upload", uploadRoutes);
app.use("/api/v1/plans", planRoutes);
app.use("/api/v1/subscriptions", subscriptionRoutes);
app.use("/api/v1/invoices", invoiceRoutes);
app.use("/api/v1/branches", branchRoutes);
app.use("/api/v1/addresses", addressRoutes);
app.use("/api/v1/subscriber-meals", subscriberMealRoutes);
app.use("/api/v1/tickets", ticketRoutes);

app.all("*", (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
