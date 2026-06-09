const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const User = require("../models/userModel");
const Restaurant = require("../models/restaurantModel");
const AuthLog = require("../models/authLogModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createSendToken = async (user, statusCode, req, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(
      Date.now() +
        Number(process.env.JWT_COOKIE_EXPIRES_IN) * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
  };
  if (process.env.NODE_ENV === "production") cookieOptions.secure = true;
  res.cookie("jwt", token, cookieOptions);

  await AuthLog.create({
    user: user._id,
    restaurant: user.restaurant,
    action: "login",
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    loginAt: new Date(),
  });

  user.password = undefined;
  res.status(statusCode).json({
    status: "success",
    token,
    data: {
      user,
    },
  });
};

exports.signup = (role = "employee") => {
  return catchAsync(async (req, res, next) => {
    if (role === "owner" || role === "superadmin") {
      if (req.body.adminPassword !== process.env.ADMIN_PASSWORD) {
        return next(new AppError("Not authorised to create this user", 403));
      }
    }
    const existing = await User.findOne({ email: req.body.email });
    if (existing) {
      return next(
        new AppError("User already exists with this email", 400),
      );
    }
    const userData = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      password: req.body.password,
      role,
    };
    if (req.body.restaurant) userData.restaurant = req.body.restaurant;
    if (role === "owner") {
      userData.restaurants = req.body.restaurants || [];
    }
    const user = await User.create(userData);
    const token = signToken(user._id);
    res.status(201).json({
      status: "success",
      token,
      data: { user },
    });
  });
};

exports.createEmployee = catchAsync(async (req, res, next) => {
  const { name, email, password, phone, restaurant, role } = req.body;
  if (!email || !password) {
    return next(new AppError("Please provide email and password", 400));
  }
  const existing = await User.findOne({ email });
  if (existing) {
    return next(new AppError("User already exists with this email", 400));
  }
  const allowedRoles = ["employee", "manager"];
  const assignRole = allowedRoles.includes(role) ? role : "employee";
  const restaurantId = restaurant || req.user.restaurant;
  if (!restaurantId) {
    return next(new AppError("Restaurant is required", 400));
  }
  const user = await User.create({
    name,
    email,
    password,
    phone,
    role: assignRole,
    restaurant: restaurantId,
  });
  user.password = undefined;
  res.status(201).json({
    status: "success",
    data: { user },
  });
});

// Called by a logged-in superadmin to create a new restaurant owner
exports.createOwner = catchAsync(async (req, res, next) => {
  const { name, email, phone, password } = req.body;
  if (!email || !password) {
    return next(new AppError("Please provide email and password", 400));
  }
  const existing = await User.findOne({ email });
  if (existing) {
    return next(new AppError("User already exists with this email", 400));
  }
  const user = await User.create({ name, email, phone, password, role: "owner" });
  user.password = undefined;
  res.status(201).json({
    status: "success",
    data: { user },
  });
});

exports.createDoctor = catchAsync(async (req, res, next) => {
  const { name, phone, password, restaurant } = req.body;
  if (!phone || !password) {
    return next(new AppError("Please provide phone and password", 400));
  }
  const existing = await User.findOne({ phone, role: "doctor" });
  if (existing) {
    return next(new AppError("Doctor already exists with this phone", 400));
  }
  const user = await User.create({
    name,
    phone,
    password,
    role: "doctor",
    restaurant: restaurant || req.body.restaurant,
  });
  user.password = undefined;
  res.status(201).json({
    status: "success",
    data: { user },
  });
});

// Public customer self-registration. The tenant is resolved from the
// x-tenant header / subdomain (resolveTenant runs before this), so the new
// account is attached to the correct restaurant with the `customer` role.
exports.register = catchAsync(async (req, res, next) => {
  const { name, email, phone, password } = req.body;
  if (!name || !password || (!email && !phone)) {
    return next(
      new AppError("Please provide name, email or phone, and password", 400),
    );
  }
  if (!req.restaurantId) {
    return next(new AppError("Tenant not specified", 400));
  }
  if (email) {
    const existing = await User.findOne({ email });
    if (existing) {
      return next(new AppError("User already exists with this email", 400));
    }
  }
  const user = await User.create({
    name,
    email,
    phone,
    password,
    role: "customer",
    restaurant: req.restaurantId,
  });
  await createSendToken(user, 201, req, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password, phone } = req.body;
  if ((!email && !phone) || !password) {
    return next(new AppError("Please provide email/phone and password!", 400));
  }
  const query = email ? { email } : { phone };
  const user = await User.findOne(query).select("+password");
  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError("Incorrect credentials", 401));
  }
  if (!user.isActive) {
    return next(new AppError("Your account has been deactivated", 401));
  }
  await createSendToken(user, 200, req, res);
});

exports.logout = catchAsync(async (req, res, next) => {
  const lastLogin = await AuthLog.findOne({
    user: req.user._id,
    action: "login",
  }).sort({ createdAt: -1 });

  const sessionDuration = lastLogin
    ? Date.now() - lastLogin.loginAt.getTime()
    : 0;

  await AuthLog.create({
    user: req.user._id,
    restaurant: req.user.restaurant,
    action: "logout",
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    logoutAt: new Date(),
    sessionDuration,
  });

  res.cookie("jwt", "loggedout", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: "success" });
});

exports.protect = catchAsync(async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  }
  if (!token) {
    return next(
      new AppError("You are not logged in! Please log in to get access.", 401),
    );
  }
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError("The user belonging to this token no longer exists.", 401),
    );
  }
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError("User recently changed password! Please log in again.", 401),
    );
  }
  req.user = currentUser;
  // Multi-tenant guard: when a tenant has been resolved for this request, the
  // authenticated user must belong to it (platform super-admins are exempt).
  const isSuperAdmin =
    currentUser.role === "super_admin" || currentUser.role === "superadmin";
  if (req.restaurantId && !isSuperAdmin) {
    if (
      !currentUser.restaurant ||
      String(currentUser.restaurant) !== String(req.restaurantId)
    ) {
      return next(new AppError("Access denied: wrong tenant", 403));
    }
  }
  next();
});

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    // superadmin has full access to everything
    if (req.user.role === "superadmin" || req.user.role === "super_admin")
      return next();
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("You do not have permission to perform this action", 403),
      );
    }
    next();
  };
};

exports.setRestaurantScope = catchAsync(async (req, res, next) => {
  if (req.user.role === "superadmin") {
    req.restaurantScope =
      req.params.restaurantId || req.query.restaurant || req.body.restaurant || null;
  } else if (req.user.role === "owner") {
    const requestedId =
      req.params.restaurantId || req.query.restaurant || req.body.restaurant;
    if (requestedId) {
      const owned = await Restaurant.exists({
        _id: requestedId,
        owner: req.user._id,
      });
      if (!owned) {
        return next(
          new AppError("You do not have access to this restaurant", 403),
        );
      }
      req.restaurantScope = requestedId;
    } else {
      req.restaurantScope = null;
    }
  } else {
    req.restaurantScope = req.user.restaurant;
  }
  next();
});
