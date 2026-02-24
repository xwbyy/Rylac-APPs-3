// utils/socket.js - Socket.io real-time communication handler
const { verifyAccessToken } = require("./jwt");
const User = require("../models/User");
const Message = require("../models/Message");
const logger = require("./logger");

// Track online users: userId -> Set of socketIds
const onlineUsers = new Map();

const initSocket = (io) => {
  // Authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie;
      let userId = null;

      // Try auth token first
      if (socket.handshake.auth?.token) {
        const decoded = verifyAccessToken(socket.handshake.auth.token);
        if (decoded) userId = decoded.userId;
      }

      // Try cookie parsing
      if (!userId && socket.handshake.headers?.cookie) {
        const cookies = parseCookies(socket.handshake.headers.cookie);
        if (cookies.accessToken) {
          const decoded = verifyAccessToken(cookies.accessToken);
          if (decoded) userId = decoded.userId;
        }
      }

      if (!userId) {
        return next(new Error("Authentication required"));
      }

      const user = await User.findOne({ userId });
      if (!user) return next(new Error("User not found"));

      socket.userId = userId;
      socket.user = user;
      next();
    } catch (error) {
      logger.error("Socket auth error", { error: error.message });
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;
    logger.info("Socket connected", { userId, socketId: socket.id });

    // Add to online users
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Update online status in DB
    await User.findOneAndUpdate({ userId }, { isOnline: true, lastSeen: new Date() });

    // Notify contacts that user is online
    broadcastPresence(io, userId, true);

    // Join personal room
    socket.join(`user:${userId}`);

    // Handle sending messages via socket
    socket.on("send_message", async (data, callback) => {
      try {
        const { receiverId, type = "text", content, gifUrl, gifTitle } = data;

        if (!receiverId || (!content && type === "text")) {
          return callback?.({ success: false, message: "Invalid message data" });
        }

        if (userId === receiverId) {
          return callback?.({ success: false, message: "Cannot message yourself" });
        }

        const receiver = await User.findOne({ userId: receiverId });
        if (!receiver) {
          return callback?.({ success: false, message: "User not found" });
        }

        const conversationId = Message.getConversationId(userId, receiverId);
        let messageData = { conversationId, senderId: userId, receiverId, type };

        if (type === "gif") {
          messageData.gifUrl = gifUrl;
          messageData.gifTitle = gifTitle || "GIF";
          messageData.content = gifTitle || "GIF";
        } else {
          messageData.content = String(content).trim();
          if (!messageData.content) return callback?.({ success: false, message: "Empty message" });
          if (messageData.content.length > 5000) return callback?.({ success: false, message: "Message too long" });
        }

        const message = await Message.create(messageData);

        // Emit to sender
        socket.emit("new_message", message);

        // Emit to receiver if online
        io.to(`user:${receiverId}`).emit("new_message", message);

        callback?.({ success: true, message });
      } catch (error) {
        logger.error("Socket send message error", { error: error.message });
        callback?.({ success: false, message: "Failed to send message" });
      }
    });

    // Mark messages as read
    socket.on("mark_read", async ({ senderId }) => {
      try {
        const conversationId = Message.getConversationId(userId, senderId);
        await Message.updateMany(
          { conversationId, receiverId: userId, isRead: false },
          { $set: { isRead: true } }
        );
        // Notify sender that messages were read
        io.to(`user:${senderId}`).emit("messages_read", { by: userId });
      } catch (error) {
        logger.error("Mark read error", { error: error.message });
      }
    });

    // Typing indicator
    socket.on("typing", ({ receiverId, isTyping }) => {
      io.to(`user:${receiverId}`).emit("user_typing", { userId, isTyping });
    });

    // Disconnect handler
    socket.on("disconnect", async () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          // Update DB only when no more sockets for this user
          await User.findOneAndUpdate({ userId }, { isOnline: false, lastSeen: new Date() });
          broadcastPresence(io, userId, false);
        }
      }
      logger.info("Socket disconnected", { userId, socketId: socket.id });
    });
  });
};

/**
 * Broadcast presence update to all online users
 */
const broadcastPresence = (io, userId, isOnline) => {
  io.emit("presence_update", { userId, isOnline, lastSeen: new Date() });
};

/**
 * Parse cookie string to object
 */
const parseCookies = (cookieStr) => {
  const cookies = {};
  if (!cookieStr) return cookies;
  cookieStr.split(";").forEach((cookie) => {
    const [key, ...val] = cookie.trim().split("=");
    if (key) cookies[key.trim()] = decodeURIComponent(val.join("="));
  });
  return cookies;
};

/**
 * Check if user is online
 */
const isUserOnline = (userId) => onlineUsers.has(userId);

module.exports = { initSocket, isUserOnline };
