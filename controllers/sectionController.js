const Section = require("../models/sectionModel");
const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");

exports.createSection = catchAsync(async (req, res, next) => {
  if (!req.body.restaurant) req.body.restaurant = req.restaurantScope;
  const section = await Section.create(req.body);
  res.status(201).json({
    status: "success",
    data: { section },
  });
});

const sectionPopulate = { path: "assignedEmployees", select: "name email phone" };

exports.assignEmployee = catchAsync(async (req, res, next) => {
  const section = await Section.findById(req.params.id);
  if (!section) return next(new AppError("Section not found", 404));
  const { employeeId } = req.body;
  if (!employeeId) return next(new AppError("Employee ID is required", 400));
  section.assignedEmployees.addToSet(employeeId);
  await section.save();
  await User.findByIdAndUpdate(employeeId, {
    $addToSet: { sections: section._id },
  });
  await section.populate(sectionPopulate);
  res.status(200).json({
    status: "success",
    data: { section },
  });
});

exports.removeEmployee = catchAsync(async (req, res, next) => {
  const section = await Section.findById(req.params.id);
  if (!section) return next(new AppError("Section not found", 404));
  const { employeeId } = req.body;
  section.assignedEmployees.pull(employeeId);
  await section.save();
  await User.findByIdAndUpdate(employeeId, {
    $pull: { sections: section._id },
  });
  await section.populate(sectionPopulate);
  res.status(200).json({
    status: "success",
    data: { section },
  });
});

exports.getAllSections = catchAsync(async (req, res, next) => {
  const filter = {};
  if (req.restaurantScope) filter.restaurant = req.restaurantScope;

  const sections = await Section.find(filter)
    .populate(sectionPopulate)
    .lean({ virtuals: true });

  res.status(200).json({
    status: "success",
    results: sections.length,
    total: sections.length,
    data: { sections },
  });
});

exports.getSection = factory.getOne(
  Section,
  [{ path: "assignedEmployees", select: "name email phone" }],
  "section",
);
exports.updateSection = factory.updateOne(Section, "section");
exports.deleteSection = factory.deleteOne(Section, "section");
