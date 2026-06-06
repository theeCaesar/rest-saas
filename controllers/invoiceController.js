const Invoice = require("../models/invoiceModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { INVOICE_STATUS } = require("../constants/subscription");

const POPULATE = [
  { path: "user", select: "name email phone" },
  { path: "plan" },
  { path: "subscription", select: "status billingCycle" },
];

function generateInvoiceNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `INV-${stamp}-${rand}`;
}

// GET /api/v1/invoices
exports.getAllInvoices = catchAsync(async (req, res, next) => {
  const filter = { restaurant: req.restaurantId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.user) filter.user = req.query.user;
  if (req.query.subscription) filter.subscription = req.query.subscription;

  // Customers only ever see their own invoices.
  if (req.user.role === "customer") filter.user = req.user._id;

  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;

  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .populate(POPULATE)
      .sort("-createdAt")
      .skip(skip)
      .limit(limit),
    Invoice.countDocuments(filter),
  ]);

  res.status(200).json({
    status: "success",
    results: invoices.length,
    total,
    data: { invoices },
  });
});

// GET /api/v1/invoices/:id
exports.getInvoice = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id, restaurant: req.restaurantId };
  if (req.user.role === "customer") filter.user = req.user._id;

  const invoice = await Invoice.findOne(filter).populate(POPULATE);
  if (!invoice) return next(new AppError("Invoice not found", 404));
  res.status(200).json({ status: "success", data: { invoice } });
});

exports.createInvoice = catchAsync(async (req, res, next) => {
  req.body.restaurant = req.restaurantId;
  if (!req.body.invoiceNumber) req.body.invoiceNumber = generateInvoiceNumber();
  const invoice = await Invoice.create(req.body);
  res.status(201).json({ status: "success", data: { invoice } });
});

// PATCH /api/v1/invoices/:id/pay  — admin/cashier mark an invoice paid
exports.markInvoicePaid = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    restaurant: req.restaurantId,
  });
  if (!invoice) return next(new AppError("Invoice not found", 404));

  invoice.status = INVOICE_STATUS.PAID;
  invoice.paidAt = new Date();
  if (req.body.paymentMethod) invoice.paymentMethod = req.body.paymentMethod;
  if (req.body.paymentReference)
    invoice.paymentReference = req.body.paymentReference;
  await invoice.save();

  res.status(200).json({ status: "success", data: { invoice } });
});
