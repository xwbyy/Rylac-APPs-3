const User = require('../models/User');
const Message = require('../models/Message');
const logger = require('../utils/logger');

async function getStats(req, res) {
  try {
    const [totalUsers, totalMessages, onlineUsers] = await Promise.all([
      User.countDocuments(),
      Message.countDocuments(),
      User.countDocuments({ isOnline: true }),
    ]);
    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5);
    res.json({
      stats: { totalUsers, totalMessages, onlineUsers },
      recentUsers: recentUsers.map(u => u.toPublic()),
    });
  } catch (err) {
    logger.error('Admin stats error:', err.message);
    res.status(500).json({ error: 'Failed to get stats' });
  }
}

async function listUsers(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const users = await User.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit));
    const total = await User.countDocuments();
    res.json({ users: users.map(u => u.toPublic()), total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list users' });
  }
}

async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    if (Number(id) === req.user.userId) return res.status(400).json({ error: 'Cannot delete yourself' });
    const user = await User.findOneAndDelete({ userId: Number(id) });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await Message.deleteMany({ $or: [{ fromId: Number(id) }, { toId: Number(id) }] });
    logger.info(`Admin deleted user: ${id}`);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
}

async function setUserRole(req, res) {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const user = await User.findOneAndUpdate({ userId: Number(id) }, { role }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Role updated', user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role' });
  }
}

module.exports = { getStats, listUsers, deleteUser, setUserRole };
