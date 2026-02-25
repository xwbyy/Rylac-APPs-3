const User = require('../models/User');
const Message = require('../models/Message');
const { verifyAccessToken, verifyRefreshToken } = require('../utils/jwt');
const logger = require('../utils/logger');

const onlineUsers = new Map(); // userId -> socketId

function parseTokenFromCookie(cookieStr, name) {
  if (!cookieStr) return null;
  const match = cookieStr.split(';').find(c => c.trim().startsWith(name + '='));
  return match ? match.trim().split('=')[1] : null;
}

function initSocket(io) {
  io.use(async (socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie || '';
      let token = parseTokenFromCookie(cookie, 'accessToken');
      let userId = null;

      if (token) {
        try {
          const decoded = verifyAccessToken(token);
          userId = decoded.userId;
        } catch (e) {
          const refreshToken = parseTokenFromCookie(cookie, 'refreshToken');
          if (refreshToken) {
            try {
              const decoded = verifyRefreshToken(refreshToken);
              const user = await User.findOne({ userId: decoded.userId, refreshToken });
              if (user) userId = user.userId;
            } catch (e2) {}
          }
        }
      }

      if (!userId) return next(new Error('Authentication required'));
      socket.userId = userId;
      next();
    } catch (err) {
      next(new Error('Socket auth failed'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    logger.info(`Socket connected: user ${userId}`);

    onlineUsers.set(userId, socket.id);
    await User.updateOne({ userId }, { isOnline: true, lastSeen: new Date() });
    io.emit('user:status', { userId, isOnline: true });

    socket.on('message:send', async (data) => {
      try {
        const { toId, type = 'text', content, mediaData, mediaMime, gifUrl, gifPreview, tempId } = data;
        if (!toId) return;

        const config = require('../config');
        if (mediaData) {
          const buf = Buffer.from(mediaData, 'base64');
          if (buf.length > config.MAX_FILE_SIZE) {
            socket.emit('error', { message: 'File too large (max 1MB)' });
            return;
          }
        }

        const message = await Message.create({
          fromId: userId,
          toId: Number(toId),
          type,
          content: content?.trim() || '',
          mediaData: mediaData || null,
          mediaMime: mediaMime || null,
          gifUrl: gifUrl || null,
          gifPreview: gifPreview || null,
        });

        const messageObj = message.toObject();
        if (tempId) messageObj.tempId = tempId;

        // Send to recipient if online
        const recipientSocketId = onlineUsers.get(Number(toId));
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('message:new', messageObj);
        }
        // Confirm to sender
        socket.emit('message:sent', messageObj);
      } catch (err) {
        logger.error('Socket message error:', err.message);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('message:read', async (data) => {
      try {
        const { fromId } = data;
        await Message.updateMany({ fromId: Number(fromId), toId: userId, read: false }, { read: true });
        const senderSocketId = onlineUsers.get(Number(fromId));
        if (senderSocketId) {
          io.to(senderSocketId).emit('message:read', { byUserId: userId, fromId: Number(fromId) });
        }
      } catch (err) {
        logger.error('Socket read error:', err.message);
      }
    });

    socket.on('typing:start', (data) => {
      const recipientSocketId = onlineUsers.get(Number(data.toId));
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('typing:start', { fromId: userId });
      }
    });

    socket.on('typing:stop', (data) => {
      const recipientSocketId = onlineUsers.get(Number(data.toId));
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('typing:stop', { fromId: userId });
      }
    });

    socket.on('disconnect', async () => {
      logger.info(`Socket disconnected: user ${userId}`);
      onlineUsers.delete(userId);
      await User.updateOne({ userId }, { isOnline: false, lastSeen: new Date() });
      io.emit('user:status', { userId, isOnline: false, lastSeen: new Date() });
    });
  });
}

module.exports = { initSocket };
