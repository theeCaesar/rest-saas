const Restaurant = require("../models/restaurantModel");
const catchAsync = require("../utils/catchAsync");

const IGNORED_SUBDOMAINS = new Set(["www", "api", "admin", "localhost"]);

// Pull the tenant slug from an explicit header first, then the request subdomain.
function extractSlug(req) {
  const headerSlug = req.headers["x-tenant"];
  if (headerSlug && String(headerSlug).trim()) {
    return String(headerSlug).trim().toLowerCase();
  }

  const host = req.headers.host;
  if (!host) return null;

  // Strip the port, then look at the left-most label of the hostname.
  const hostname = host.split(":")[0];
  const labels = hostname.split(".");
  if (labels.length < 2) return null; // bare host like "localhost" — no subdomain

  const candidate = labels[0].toLowerCase();
  if (IGNORED_SUBDOMAINS.has(candidate)) return null;
  return candidate;
}

// Resolves the active tenant for a request and attaches it to req.
exports.resolveTenant = catchAsync(async (req, res, next) => {
  const slug = extractSlug(req);
  if (!slug) {
    return res
      .status(400)
      .json({ status: "fail", message: "Tenant not specified" });
  }

  const restaurant = await Restaurant.findOne({
    slug: slug.toLowerCase(),
    isActive: true,
  });
  if (!restaurant) {
    return res
      .status(404)
      .json({ status: "fail", message: "Restaurant not found" });
  }

  req.restaurantId = restaurant._id;
  req.restaurant = restaurant;
  // Keep legacy scope helpers working with the resolved tenant.
  req.restaurantScope = restaurant._id;
  next();
});

// Ensures the authenticated user belongs to the resolved tenant.
// Must run after `protect` (req.user) and `resolveTenant` (req.restaurantId).
exports.requireSameTenant = (req, res, next) => {
  if (!req.user) {
    return res
      .status(401)
      .json({ status: "fail", message: "Not authenticated" });
  }

  // Platform super-admins manage every tenant.
  if (req.user.role === "super_admin" || req.user.role === "superadmin") {
    return next();
  }

  const userTenant = req.user.restaurant ? String(req.user.restaurant) : null;
  const requestTenant = req.restaurantId ? String(req.restaurantId) : null;

  if (!userTenant || userTenant !== requestTenant) {
    return res
      .status(403)
      .json({ status: "fail", message: "Access denied: wrong tenant" });
  }
  next();
};

// Exposes a ready-to-merge tenant filter for controller queries.
exports.scopeQueryToTenant = (req, res, next) => {
  req.tenantFilter = { restaurant: req.restaurantId };
  next();
};
