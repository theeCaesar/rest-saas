// TODO Phase 2 (post-contract): realtime push via Socket.IO. For now frontend polls.
const mongoose = require("mongoose");
const Conversation = require("../models/conversationModel");
const Message = require("../models/messageModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

// GET /api/v1/conversations — my conversations
exports.getMyConversations = catchAsync(async (req, res, next) => {
  const conversations = await Conversation.find({
    restaurant: req.restaurantId,
    participants: req.user._id,
    isActive: true,
  })
    .populate("participants", "name role pfp")
    .populate("lastMessage.sender", "name")
    .sort("-lastMessageAt");

  res.status(200).json({ status: "success", results: conversations.length, data: { conversations } });
});

// GET /api/v1/conversations/:id/messages — paginated, marks read on fetch
exports.getMessages = catchAsync(async (req, res, next) => {
  const conv = await Conversation.findOne({
    _id: req.params.id,
    restaurant: req.restaurantId,
    participants: req.user._id,
  });
  if (!conv) return next(new AppError("Conversation not found", 404));

  const page  = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

  const messages = await Message.find({ conversation: conv._id })
    .populate("sender", "name role pfp")
    .sort("-createdAt")
    .skip((page - 1) * limit)
    .limit(limit);

  // Mark all unread as read for this user
  await Message.updateMany(
    { conversation: conv._id, "readBy.user": { $ne: req.user._id } },
    { $push: { readBy: { user: req.user._id, readAt: new Date() } } },
  );
  await Conversation.updateOne(
    { _id: conv._id, "unread.user": req.user._id },
    { $set: { "unread.$.count": 0 } },
  );

  res.status(200).json({
    status: "success",
    results: messages.length,
    data: { messages: messages.reverse() },
  });
});

// POST /api/v1/conversations — start a new conversation
exports.startConversation = catchAsync(async (req, res, next) => {
  const { type, participantIds, orderId, subscriberMealId, ticketId } = req.body;
  if (!type) return next(new AppError("type is required", 400));

  const ids = [String(req.user._id), ...(participantIds || []).map(String)];
  const unique = [...new Set(ids)];

  const conv = await Conversation.create({
    restaurant:     req.restaurantId,
    type,
    participants:   unique,
    order:          orderId,
    subscriberMeal: subscriberMealId,
    ticket:         ticketId,
    lastMessageAt:  new Date(),
    unread: unique.map((u) => ({ user: u, count: 0 })),
  });
  await conv.populate("participants", "name role pfp");
  res.status(201).json({ status: "success", data: { conversation: conv } });
});

// POST /api/v1/conversations/:id/messages — send a message
exports.sendMessage = catchAsync(async (req, res, next) => {
  const { content, attachments } = req.body;
  if (!content) return next(new AppError("content is required", 400));

  const conv = await Conversation.findOne({
    _id: req.params.id,
    restaurant: req.restaurantId,
    participants: req.user._id,
  });
  if (!conv) return next(new AppError("Conversation not found", 404));

  const msg = await Message.create({
    restaurant:   req.restaurantId,
    conversation: conv._id,
    sender:       req.user._id,
    senderRole:   req.user.role,
    content,
    attachments:  attachments || [],
    readBy:       [{ user: req.user._id, readAt: new Date() }],
  });

  // Update conversation summary + increment unread for other participants
  const otherIds = conv.participants
    .map(String)
    .filter((id) => id !== String(req.user._id))
    .map((id) => new mongoose.Types.ObjectId(id));

  await Conversation.updateOne(
    { _id: conv._id },
    {
      $set: {
        lastMessage:   { text: content, sender: req.user._id, sentAt: new Date() },
        lastMessageAt: new Date(),
      },
      $inc: { "unread.$[elem].count": 1 },
    },
    { arrayFilters: [{ "elem.user": { $in: otherIds } }] },
  );

  await msg.populate("sender", "name role pfp");
  res.status(201).json({ status: "success", data: { message: msg } });
});

// POST /api/v1/conversations/:id/read — reset unread counter for caller
exports.markRead = catchAsync(async (req, res, next) => {
  const conv = await Conversation.findOne({
    _id: req.params.id,
    restaurant: req.restaurantId,
    participants: req.user._id,
  });
  if (!conv) return next(new AppError("Conversation not found", 404));

  await Conversation.updateOne(
    { _id: conv._id, "unread.user": req.user._id },
    { $set: { "unread.$.count": 0 } },
  );
  res.status(200).json({ status: "success", data: null });
});
