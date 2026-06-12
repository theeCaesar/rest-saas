const Report = require("../models/reportModel");
const analyticsCtrl = require("./analyticsController");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

const POPULATE = [{ path: "generatedBy", select: "name" }];

exports.getReports = catchAsync(async (req, res, next) => {
  const filter = { restaurant: req.restaurantId };
  if (req.query.type) filter.type = req.query.type;
  const reports = await Report.find(filter).populate(POPULATE).sort("-createdAt").limit(50);
  res.status(200).json({ status: "success", results: reports.length, data: { reports } });
});

exports.getReport = catchAsync(async (req, res, next) => {
  const report = await Report.findOne({ _id: req.params.id, restaurant: req.restaurantId }).populate(POPULATE);
  if (!report) return next(new AppError("Report not found", 404));
  res.status(200).json({ status: "success", data: { report } });
});

// POST /api/v1/reports/generate — snapshot of the relevant analytics aggregation
exports.generateReport = catchAsync(async (req, res, next) => {
  const { type, title, from, to, notes } = req.body;
  if (!type || !title) return next(new AppError("type and title are required", 400));

  // Resolve which analytics function to call
  const handlerMap = {
    sales:         analyticsCtrl.overview,
    financial:     analyticsCtrl.overview,
    subscriptions: analyticsCtrl.subscriptions,
    delivery:      analyticsCtrl.delivery,
    employee:      analyticsCtrl.employees,
    inventory:     analyticsCtrl.overview,
    custom:        analyticsCtrl.overview,
  };
  const handler = handlerMap[type] || analyticsCtrl.overview;

  // Capture analytics output without sending an HTTP response
  let analyticsData = {};
  const fakeReq = { restaurantId: req.restaurantId, query: { from, to }, params: {}, user: req.user };
  const fakeRes = { status() { return this; }, json(body) { analyticsData = body.data || {}; } };

  await new Promise((resolve, reject) => {
    handler(fakeReq, fakeRes, (err) => (err ? reject(err) : resolve()));
  });

  const report = await Report.create({
    restaurant:  req.restaurantId,
    title,
    type,
    dateRange:   { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined },
    data:        analyticsData,
    generatedBy: req.user._id,
    notes,
  });

  res.status(201).json({ status: "success", data: { report } });
});

exports.deleteReport = catchAsync(async (req, res, next) => {
  const report = await Report.findOneAndDelete({ _id: req.params.id, restaurant: req.restaurantId });
  if (!report) return next(new AppError("Report not found", 404));
  res.status(204).json({ status: "success", data: null });
});
