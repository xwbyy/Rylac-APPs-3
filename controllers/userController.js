// controllers/userController.js - User management
const User = require("../models/User");
const logger = require("../utils/logger");

/**
 * Search users by username or userId
 */
const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) {
      return res.status(400).json({ success: false, message: "Search query required" });
    }

    const query = q.trim();
    const currentUserId = req.user.userId;

    // Search by userId (exact) or username (partial)
    const users = await User.find({
      $and: [
        { userId: { $ne: currentUserId } },
        {
          $or: [
            { userId: query },
            { username: { $regex: query.toLowerCase(), $options: "i" } },
            { displayName: { $regex: query, $options: "i" } },
          ],
        },
      ],
    })
      .limit(20)
      .select("userId username displayName avatar isOnline lastSeen bio");

    return res.json({
      success: true,
      users: users.map((u) => u.toPublicProfile()),
    });
  } catch (error) {
    logger.error("Search users error", { error: error.message });
    return res.status(500).json({ success: false, message: "Search failed" });
  }
};

/**
 * Get user profile by userId or username
 */
const getProfile = async (req, res) => {
  try {
    const { identifier } = req.params;

    const user = await User.findOne({
      $or: [{ userId: identifier }, { username: identifier.toLowerCase() }],
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, user: user.toPublicProfile() });
  } catch (error) {
    logger.error("Get profile error", { error: error.message });
    return res.status(500).json({ success: false, message: "Failed to get profile" });
  }
};

/**
 * Update own profile
 */
const updateProfile = async (req, res) => {
  try {
    const { displayName, bio, avatar, theme } = req.body;
    const updates = {};

    if (displayName !== undefined) {
      const cleaned = String(displayName).trim();
      if (cleaned.length < 1 || cleaned.length > 50) {
        return res.status(400).json({ success: false, message: "Display name must be 1-50 characters" });
      }
      updates.displayName = cleaned;
    }

    if (bio !== undefined) {
      const cleaned = String(bio).trim();
      if (cleaned.length > 200) {
        return res.status(400).json({ success: false, message: "Bio must be 200 characters or less" });
      }
      updates.bio = cleaned;
    }

    if (avatar !== undefined) {
      const cleaned = String(avatar).trim();
      // Validate URL format if provided
      if (cleaned && !cleaned.startsWith("http") && !cleaned.startsWith("data:")) {
        return res.status(400).json({ success: false, message: "Avatar must be a valid URL" });
      }
      updates.avatar = cleaned;
    }

    if (theme !== undefined) {
      if (!["light", "dark"].includes(theme)) {
        return res.status(400).json({ success: false, message: "Theme must be 'light' or 'dark'" });
      }
      updates.theme = theme;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No valid fields to update" });
    }

    const user = await User.findOneAndUpdate(
      { userId: req.user.userId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({
      success: true,
      message: "Profile updated",
      user: user.toPublicProfile(),
    });
  } catch (error) {
    logger.error("Update profile error", { error: error.message });
    return res.status(500).json({ success: false, message: "Failed to update profile" });
  }
};

/**
 * Get list of users the current user has conversations with (recent chats)
 */
const getRecentContacts = async (req, res) => {
  try {
    const Message = require("../models/Message");
    const currentUserId = req.user.userId;

    // Find all unique users the current user has chatted with
    const messages = await Message.aggregate([
      {
        $match: {
          $or: [{ senderId: currentUserId }, { receiverId: currentUserId }],
        },
      },
      {
        $addFields: {
          otherUser: {
            $cond: [{ $eq: ["$senderId", currentUserId] }, "$receiverId", "$senderId"],
          },
        },
      },
      {
        $group: {
          _id: "$otherUser",
          lastMessage: { $last: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$receiverId", currentUserId] }, { $eq: ["$isRead", false] }],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { "lastMessage.createdAt": -1 } },
      { $limit: 50 },
    ]);

    const userIds = messages.map((m) => m._id);
    const users = await User.find({ userId: { $in: userIds } }).select(
      "userId username displayName avatar isOnline lastSeen"
    );

    const userMap = {};
    users.forEach((u) => (userMap[u.userId] = u.toPublicProfile()));

    const contacts = messages
      .filter((m) => userMap[m._id])
      .map((m) => ({
        user: userMap[m._id],
        lastMessage: {
          content: m.lastMessage.isDeleted ? "Message deleted" : m.lastMessage.content || `[${m.lastMessage.type}]`,
          type: m.lastMessage.type,
          createdAt: m.lastMessage.createdAt,
          isRead: m.lastMessage.isRead,
          senderId: m.lastMessage.senderId,
        },
        unreadCount: m.unreadCount,
      }));

    return res.json({ success: true, contacts });
  } catch (error) {
    logger.error("Get recent contacts error", { error: error.message });
    return res.status(500).json({ success: false, message: "Failed to get contacts" });
  }
};

module.exports = { searchUsers, getProfile, updateProfile, getRecentContacts };
