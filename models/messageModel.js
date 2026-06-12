const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const messageSchema = new Schema(
  {
    restaurant:   { type: Types.ObjectId, ref: "Restaurant", required: true, index: true },
    conversation: { type: Types.ObjectId, ref: "Conversation", required: true, index: true },
    sender:       { type: Types.ObjectId, ref: "User", required: true },
    senderRole:   String,
    content:      { type: String, required: true },
    attachments:  [String],
    readBy:       [{ user: { type: Types.ObjectId, ref: "User" }, readAt: Date }],
    isSystem:     { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
