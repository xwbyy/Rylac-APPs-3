// models/Message.js - Messages collection schema
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    senderId: {
      type: String,
      required: true,
      index: true,
    },
    receiverId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["text", "image", "audio", "gif", "file"],
      default: "text",
    },
    content: {
      type: String,
      default: "",
    },
    // For media messages
    mediaUrl: {
      type: String,
      default: "",
    },
    mediaName: {
      type: String,
      default: "",
    },
    mediaMimeType: {
      type: String,
      default: "",
    },
    mediaSize: {
      type: Number,
      default: 0,
    },
    // For GIF messages
    gifUrl: {
      type: String,
      default: "",
    },
    gifTitle: {
      type: String,
      default: "",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });

/**
 * Generate conversation ID from two user IDs (consistent regardless of order)
 */
messageSchema.statics.getConversationId = function (userId1, userId2) {
  const sorted = [userId1, userId2].sort();
  return `${sorted[0]}_${sorted[1]}`;
};

module.exports = mongoose.model("Message", messageSchema);
