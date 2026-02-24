// controllers/adminController.js - Admin panel operations
const User = require("../models/User");
const Message = require("../models/Message");
const logger = require("../utils/logger");

/**
 * Get dashboard statistics
 */
const getStats = async (req, res) => {
  try {
    const [totalUsers, onlineUsers, totalMessages, recentUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isOnline: true }),
      Message.countDocuments({ isDeleted: false }),
      User.find().sort({ createdAt: -1 }).limit(5).select("userId username displayName avatar createdAt isOnline"),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const messagesToday = await Message.countDocuments({ createdAt: { $gte: today } });
    const newUsersToday = await User.countDocuments({ createdAt: { $gte: today } });

    return res.json({
      success: true,
      stats: {
        totalUsers,
        onlineUsers,
        totalMessages,
        messagesToday,
        newUsersToday,
        recentUsers: recentUsers.map((u) => u.toPublicProfile()),
      },
    });
  } catch (error) {
    logger.error("Admin stats error", { error: error.message });
    return res.status(500).json({ success: false, message: "Failed to get stats" });
  }
};

/**
 * Get all users (paginated)
 */
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { displayName: { $regex: search, $options: "i" } },
        { userId: search },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      User.countDocuments(query),
    ]);

    return res.json({
      success: true,
      users: users.map((u) => u.toPublicProfile()),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error("Admin get users error", { error: error.message });
    return res.status(500).json({ success: false, message: "Failed to get users" });
  }
};

/**
 * Delete a user and their messages
 */
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user.userId) {
      return res.status(400).json({ success: false, message: "Cannot delete your own account" });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(403).json({ success: false, message: "Cannot delete admin accounts" });
    }

    // Delete user and their messages
    await Promise.all([
      User.deleteOne({ userId }),
      Message.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] }),
    ]);

    logger.info("Admin deleted user", { adminId: req.user.userId, deletedUserId: userId });

    return res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    logger.error("Admin delete user error", { error: error.message });
    return res.status(500).json({ success: false, message: "Failed to delete user" });
  }
};

/**
 * Set user role
 */
const setUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    const user = await User.findOneAndUpdate({ userId }, { role }, { new: true });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, message: "Role updated", user: user.toPublicProfile() });
  } catch (error) {
    logger.error("Set role error", { error: error.message });
    return res.status(500).json({ success: false, message: "Failed to set role" });
  }
};

module.exports = { getStats, getAllUsers, deleteUser, setUserRole };
