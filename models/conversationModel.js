const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const conversationSchema = new Schema(
  {
    restaurant:     { type: Types.ObjectId, ref: "Restaurant", required: true, index: true },
    type:           { type: String, enum: ["customer_support", "customer_driver", "staff", "order"], required: true },
    participants:   [{ type: Types.ObjectId, ref: "User", required: true }],
    order:          { type: Types.ObjectId, ref: "Order" },
    subscriberMeal: { type: Types.ObjectId, ref: "SubscriberMeal" },
    ticket:         { type: Types.ObjectId, ref: "Ticket" },
    lastMessage:    { text: String, sender: { type: Types.ObjectId, ref: "User" }, sentAt: Date },
    lastMessageAt:  { type: Date, index: true },
    unread: [{ user: { type: Types.ObjectId, ref: "User" }, count: { type: Number, default: 0 } }],
    isActive:       { type: Boolean, default: true },
  },
  { timestamps: true }
);

conversationSchema.index({ restaurant: 1, participants: 1, lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
