const Ticket = require("../models/ticketModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

const STAFF = ["admin", "manager", "dispatcher", "cashier", "kitchen"];

const POPULATE = [
  { path: "user", select: "name email phone" },
  { path: "assignedTo", select: "name email" },
  { path: "messages.author", select: "name role" },
];

function isStaff(req) {
  return STAFF.includes(req.user.role);
}

exports.getAllTickets = catchAsync(async (req, res, next) => {
  const filter = { restaurant: req.restaurantId };
  // Customers see only their own tickets.
  if (!isStaff(req)) filter.user = req.user._id;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;

  const tickets = await Ticket.find(filter)
    .populate({ path: "user", select: "name email phone" })
    .populate({ path: "assignedTo", select: "name email" })
    .sort("-createdAt");

  res.status(200).json({
    status: "success",
    results: tickets.length,
    data: { tickets },
  });
});

exports.getTicket = catchAsync(async (req, res, next) => {
  const filter = { _id: req.params.id, restaurant: req.restaurantId };
  if (!isStaff(req)) filter.user = req.user._id;
  const ticket = await Ticket.findOne(filter).populate(POPULATE);
  if (!ticket) return next(new AppError("Ticket not found", 404));
  res.status(200).json({ status: "success", data: { ticket } });
});

exports.createTicket = catchAsync(async (req, res, next) => {
  req.body.restaurant = req.restaurantId;
  // Customers always file under their own account.
  if (!isStaff(req) || !req.body.user) req.body.user = req.user._id;

  // Allow an initial message in the same request.
  if (req.body.message) {
    req.body.messages = [{ author: req.user._id, content: req.body.message }];
    delete req.body.message;
  }

  const ticket = await Ticket.create(req.body);
  res.status(201).json({ status: "success", data: { ticket } });
});

exports.updateTicket = catchAsync(async (req, res, next) => {
  // Only staff may change status/priority/assignment.
  if (!isStaff(req))
    return next(new AppError("You do not have permission to update tickets", 403));
  delete req.body.restaurant;
  delete req.body.messages;

  if (req.body.status === "resolved" && !req.body.resolvedAt) {
    req.body.resolvedAt = new Date();
  }

  const ticket = await Ticket.findOneAndUpdate(
    { _id: req.params.id, restaurant: req.restaurantId },
    req.body,
    { new: true, runValidators: true },
  );
  if (!ticket) return next(new AppError("Ticket not found", 404));
  res.status(200).json({ status: "success", data: { ticket } });
});

exports.deleteTicket = catchAsync(async (req, res, next) => {
  const ticket = await Ticket.findOneAndDelete({
    _id: req.params.id,
    restaurant: req.restaurantId,
  });
  if (!ticket) return next(new AppError("Ticket not found", 404));
  res.status(204).json({ status: "success", data: null });
});

// POST /api/v1/tickets/:id/messages — append a message to a ticket thread
exports.addMessage = catchAsync(async (req, res, next) => {
  const { content, attachments } = req.body;
  if (!content) return next(new AppError("Message content is required", 400));

  const filter = { _id: req.params.id, restaurant: req.restaurantId };
  if (!isStaff(req)) filter.user = req.user._id;

  const ticket = await Ticket.findOne(filter);
  if (!ticket) return next(new AppError("Ticket not found", 404));

  ticket.messages.push({
    author: req.user._id,
    content,
    attachments: attachments || [],
  });
  // A customer reply reopens a resolved ticket; a staff reply moves it forward.
  if (isStaff(req) && ticket.status === "open") ticket.status = "in_progress";
  await ticket.save();

  res.status(201).json({ status: "success", data: { ticket } });
});
