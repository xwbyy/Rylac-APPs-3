const { verifyAccessToken, verifyRefreshToken } = require("../utils/jwt");
const User = require("../models/User");
const Message = require("../models/Message");
const { getConversationId } = require("../controllers/messageController");
const logger = require("../utils/logger");

// Map userId → Set of socket IDs (support multiple tabs)
const onlineUsers = new Map();

function socketHandler(io) {
  // Authenticate socket connections using cookie or auth token
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie || "");
      const accessToken = cookies.accessToken;
      const refreshToken = cookies.refreshToken;

      let userId = null;
      let role = "user";

      if (accessToken) {
        try {
          const decoded = verifyAccessToken(accessToken);
          userId = decoded.userId;
          role = decoded.role;
        } catch (e) {
          // Try refresh token
        }
      }

      if (!userId && refreshToken) {
        try {
          const decoded = verifyRefreshToken(refreshToken);
          // Verify it's still in DB
          const user = await User.findOne({ userId: decoded.userId, refreshToken });
          if (user) {
            userId = decoded.userId;
            role = decoded.role;
          }
        } catch (e) {
          // Invalid
        }
      }

      if (!userId) {
        return next(new Error("Authentication required"));
      }

      socket.userId = userId;
      socket.role = role;
      next();
    } catch (err) {
      next(new Error("Socket authentication failed"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;
    logger.debug(`Socket connected: ${userId} (${socket.id})`);

    // Track online users
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Update online status in DB
    await User.updateOne({ userId }, { isOnline: true, lastSeen: new Date() });

    // Notify contacts that this user is online
    broadcastStatusChange(io, userId, true);

    // Join personal room for direct messages
    socket.join(`user:${userId}`);

    // ── EVENT: Send message ──────────────────────────────────────
    socket.on("message:send", async (data, ack) => {
      try {
        const { receiverId, type = "text", content, mediaData, mediaMimeType, gifUrl } = data;

        if (!receiverId || !content) {
          if (ack) ack({ success: false, error: "receiverId and content required" });
          return;
        }

        // Validate receiver exists
        const receiver = await User.findOne({ userId: receiverId });
        if (!receiver) {
          if (ack) ack({ success: false, error: "Recipient not found" });
          return;
        }

        // Validate media size (base64)
        if (mediaData) {
          const base64Data = mediaData.replace(/^data:[^;]+;base64,/, "");
          const sizeInBytes = Math.ceil((base64Data.length * 3) / 4);
          const MAX = 1 * 1024 * 1024;
          if (sizeInBytes > MAX) {
            if (ack) ack({ success: false, error: "File too large (max 1MB)" });
            return;
          }
        }

        const conversationId = getConversationId(userId, receiverId);

        const message = await Message.create({
          conversationId,
          senderId: userId,
          receiverId,
          type,
          content: content.trim().slice(0, 50000),
          mediaData: mediaData || null,
          mediaMimeType: mediaMimeType || null,
          gifUrl: gifUrl || null,
        });

        // Emit to receiver's room
        io.to(`user:${receiverId}`).emit("message:new", message);

        // Acknowledge to sender
        if (ack) ack({ success: true, data: message });
      } catch (err) {
        logger.error("Socket message:send error:", err.message);
        if (ack) ack({ success: false, error: "Failed to send message" });
      }
    });

    // ── EVENT: Mark messages as read ─────────────────────────────
    socket.on("message:read", async ({ senderId }) => {
      try {
        const conversationId = getConversationId(userId, senderId);
        await Message.updateMany(
          { conversationId, receiverId: userId, isRead: false },
          { isRead: true }
        );
        // Notify sender that their messages were read
        io.to(`user:${senderId}`).emit("message:readReceipt", { readBy: userId });
      } catch (err) {
        logger.error("Socket message:read error:", err.message);
      }
    });

    // ── EVENT: Typing indicator ──────────────────────────────────
    socket.on("typing:start", ({ receiverId }) => {
      io.to(`user:${receiverId}`).emit("typing:start", { userId });
    });

    socket.on("typing:stop", ({ receiverId }) => {
      io.to(`user:${receiverId}`).emit("typing:stop", { userId });
    });

    // ── EVENT: Message deleted ───────────────────────────────────
    socket.on("message:delete", async ({ messageId, receiverId }, ack) => {
      try {
        const message = await Message.findById(messageId);
        if (!message || message.senderId !== userId) {
          if (ack) ack({ success: false, error: "Cannot delete this message" });
          return;
        }
        message.isDeleted = true;
        message.content = "This message was deleted";
        message.mediaData = null;
        await message.save();

        // Notify both parties
        io.to(`user:${receiverId}`).emit("message:deleted", { messageId });
        if (ack) ack({ success: true });
      } catch (err) {
        logger.error("Socket message:delete error:", err.message);
        if (ack) ack({ success: false, error: "Failed to delete message" });
      }
    });

    // ── EVENT: Disconnect ────────────────────────────────────────
    socket.on("disconnect", async () => {
      logger.debug(`Socket disconnected: ${userId} (${socket.id})`);

      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          // All tabs closed — user is offline
          await User.updateOne({ userId }, { isOnline: false, lastSeen: new Date() });
          broadcastStatusChange(io, userId, false);
        }
      }
    });
  });
}

/**
 * Broadcast online/offline status change to all relevant sockets
 */
function broadcastStatusChange(io, userId, isOnline) {
  io.emit("user:statusChange", { userId, isOnline, lastSeen: new Date() });
}

/**
 * Parse cookie string into object
 */
function parseCookies(cookieString) {
  const cookies = {};
  cookieString.split(";").forEach((part) => {
    const [key, ...val] = part.trim().split("=");
    if (key) cookies[key.trim()] = decodeURIComponent(val.join("=").trim());
  });
  return cookies;
}

module.exports = socketHandler;
