// controllers/messageController.js - Message management
const Message = require("../models/Message");
const User = require("../models/User");
const { bufferToDataUrl, getMediaType } = require("../middleware/upload");
const logger = require("../utils/logger");
const axios = require("axios");
const config = require("../config");

/**
 * Get messages between two users
 */
const getMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.userId;
    const { page = 1, limit = 50 } = req.query;

    // Verify target user exists
    const targetUser = await User.findOne({ userId });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const conversationId = Message.getConversationId(currentUserId, userId);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await Message.find({
      conversationId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Mark messages as read
    await Message.updateMany(
      { conversationId, receiverId: currentUserId, isRead: false },
      { $set: { isRead: true } }
    );

    return res.json({
      success: true,
      messages: messages.reverse(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: messages.length === parseInt(limit),
      },
    });
  } catch (error) {
    logger.error("Get messages error", { error: error.message });
    return res.status(500).json({ success: false, message: "Failed to get messages" });
  }
};

/**
 * Send a text or GIF message
 */
const sendMessage = async (req, res) => {
  try {
    const { receiverId, type = "text", content, gifUrl, gifTitle } = req.body;
    const senderId = req.user.userId;

    if (senderId === receiverId) {
      return res.status(400).json({ success: false, message: "Cannot send message to yourself" });
    }

    // Verify receiver exists
    const receiver = await User.findOne({ userId: receiverId });
    if (!receiver) {
      return res.status(404).json({ success: false, message: "Receiver not found" });
    }

    const conversationId = Message.getConversationId(senderId, receiverId);

    let messageData = {
      conversationId,
      senderId,
      receiverId,
      type,
    };

    if (type === "gif") {
      if (!gifUrl) {
        return res.status(400).json({ success: false, message: "GIF URL is required" });
      }
      messageData.gifUrl = gifUrl;
      messageData.gifTitle = gifTitle || "GIF";
      messageData.content = gifTitle || "GIF";
    } else {
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ success: false, message: "Message content cannot be empty" });
      }
      messageData.content = content.trim();
    }

    const message = await Message.create(messageData);

    return res.status(201).json({ success: true, message: message });
  } catch (error) {
    logger.error("Send message error", { error: error.message });
    return res.status(500).json({ success: false, message: "Failed to send message" });
  }
};

/**
 * Send media message (image/audio)
 */
const sendMediaMessage = async (req, res) => {
  try {
    const { receiverId } = req.body;
    const senderId = req.user.userId;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    if (!receiverId) {
      return res.status(400).json({ success: false, message: "Receiver ID is required" });
    }

    if (senderId === receiverId) {
      return res.status(400).json({ success: false, message: "Cannot send message to yourself" });
    }

    // Verify receiver exists
    const receiver = await User.findOne({ userId: receiverId });
    if (!receiver) {
      return res.status(404).json({ success: false, message: "Receiver not found" });
    }

    const mediaType = getMediaType(file.mimetype);
    const dataUrl = bufferToDataUrl(file);
    const conversationId = Message.getConversationId(senderId, receiverId);

    const message = await Message.create({
      conversationId,
      senderId,
      receiverId,
      type: mediaType,
      content: `[${mediaType}]`,
      mediaUrl: dataUrl,
      mediaName: file.originalname,
      mediaMimeType: file.mimetype,
      mediaSize: file.size,
    });

    return res.status(201).json({ success: true, message });
  } catch (error) {
    logger.error("Send media error", { error: error.message });
    return res.status(500).json({ success: false, message: "Failed to send media" });
  }
};

/**
 * Delete a message (soft delete)
 */
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.userId;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    if (message.senderId !== userId) {
      return res.status(403).json({ success: false, message: "Cannot delete another user's message" });
    }

    await Message.findByIdAndUpdate(messageId, {
      isDeleted: true,
      content: "This message was deleted",
      mediaUrl: "",
      gifUrl: "",
    });

    return res.json({ success: true, message: "Message deleted" });
  } catch (error) {
    logger.error("Delete message error", { error: error.message });
    return res.status(500).json({ success: false, message: "Failed to delete message" });
  }
};

/**
 * Search GIFs from Giphy
 */
const searchGifs = async (req, res) => {
  try {
    const { q, offset = 0, limit = 20 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ success: false, message: "Search query required" });
    }

    const response = await axios.get(`${config.GIPHY_BASE_URL}/search`, {
      params: {
        api_key: config.GIPHY_API_KEY,
        q: q.trim(),
        limit: Math.min(parseInt(limit), 20),
        offset: parseInt(offset),
        rating: "g",
        lang: "en",
      },
      timeout: 5000,
    });

    const gifs = response.data.data.map((gif) => ({
      id: gif.id,
      title: gif.title,
      url: gif.images.fixed_height.url,
      previewUrl: gif.images.fixed_height_small.url,
      width: gif.images.fixed_height.width,
      height: gif.images.fixed_height.height,
    }));

    return res.json({ success: true, gifs, total: response.data.pagination?.total_count || 0 });
  } catch (error) {
    logger.error("GIF search error", { error: error.message });
    return res.status(500).json({ success: false, message: "Failed to search GIFs" });
  }
};

/**
 * Get trending GIFs from Giphy
 */
const getTrendingGifs = async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const response = await axios.get(`${config.GIPHY_BASE_URL}/trending`, {
      params: {
        api_key: config.GIPHY_API_KEY,
        limit: Math.min(parseInt(limit), 20),
        rating: "g",
      },
      timeout: 5000,
    });

    const gifs = response.data.data.map((gif) => ({
      id: gif.id,
      title: gif.title,
      url: gif.images.fixed_height.url,
      previewUrl: gif.images.fixed_height_small.url,
      width: gif.images.fixed_height.width,
      height: gif.images.fixed_height.height,
    }));

    return res.json({ success: true, gifs });
  } catch (error) {
    logger.error("Trending GIFs error", { error: error.message });
    return res.status(500).json({ success: false, message: "Failed to get trending GIFs" });
  }
};

module.exports = { getMessages, sendMessage, sendMediaMessage, deleteMessage, searchGifs, getTrendingGifs };
