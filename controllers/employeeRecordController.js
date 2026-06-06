const EmployeeRecord = require("../models/employeeRecordModel");
const catchAsync = require("../utils/catchAsync");
const APIFeatures = require("../utils/APIFeatures");
const factory = require("../utils/handlerFactory");

const recordPopulate = [
  { path: "employee", select: "name email phone" },
  { path: "recordedBy", select: "name email" },
];

exports.createRecord = catchAsync(async (req, res, next) => {
  if (!req.body.restaurant) req.body.restaurant = req.restaurantScope;
  req.body.recordedBy = req.user._id;
  const record = await EmployeeRecord.create(req.body);
  const populated = await EmployeeRecord.findById(record._id)
    .populate(recordPopulate)
    .lean({ virtuals: true });
  res.status(201).json({
    status: "success",
    data: { employeeRecord: populated },
  });
});

exports.getEmployeeRecords = catchAsync(async (req, res, next) => {
  const filter = {};
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;
  if (req.params.employeeId) filter.employee = req.params.employeeId;
  if (req.query.recordType) {
    filter.recordType = req.query.recordType;
    delete req.query.recordType;
  }
  if (req.query.q) {
    filter.$or = [{ description: new RegExp(String(req.query.q), "i") }];
    delete req.query.q;
  }

  const features = new APIFeatures(EmployeeRecord.find(filter), req.query)
    .filter()
    .sort()
    .selectFields()
    .paginate();

  const employeeRecords = await features.query
    .populate(recordPopulate)
    .lean({ virtuals: true });

  const total = await EmployeeRecord.countDocuments(filter);

  res.status(200).json({
    status: "success",
    results: employeeRecords.length,
    total,
    data: { employeeRecords },
  });
});

exports.getAllRecords = catchAsync(async (req, res, next) => {
  const filter = {};
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;
  if (req.query.q) {
    filter.$or = [{ description: new RegExp(String(req.query.q), "i") }];
    delete req.query.q;
  }

  const features = new APIFeatures(EmployeeRecord.find(filter), req.query)
    .filter()
    .sort()
    .selectFields()
    .paginate();

  const employeeRecords = await features.query
    .populate(recordPopulate)
    .lean({ virtuals: true });

  const total = await EmployeeRecord.countDocuments(filter);

  res.status(200).json({
    status: "success",
    results: employeeRecords.length,
    total,
    data: { employeeRecords },
  });
});

exports.getRecord = factory.getOne(
  EmployeeRecord,
  recordPopulate,
  "employeeRecord",
);
exports.updateRecord = factory.updateOne(EmployeeRecord, "employeeRecord");
exports.deleteRecord = factory.deleteOne(EmployeeRecord, "employeeRecord");
